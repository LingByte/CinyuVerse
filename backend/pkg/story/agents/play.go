package agents

import (
	"context"
	"fmt"
	"strings"

	"github.com/LingByte/CinyuVerse/pkg/protocol"
	"github.com/LingByte/CinyuVerse/pkg/story/agent"
	"github.com/LingByte/CinyuVerse/pkg/story/models"
	"github.com/LingByte/CinyuVerse/pkg/story/store"
)

// PlayStartInput starts an interactive world.
type PlayStartInput struct {
	SessionID      string
	Title          string
	Premise        string
	WorldContract  string
	VisualContract string
	Mode           models.PlayMode
}

// PlayStepInput advances the world by one user action.
type PlayStepInput struct {
	SessionID string
	Action    string
}

// PlayRunner orchestrates Play agents.
type PlayRunner struct {
	router      agent.Router
	st          store.BookStore
	projectRoot string
}

func NewPlayRunner(projectRoot string, router agent.Router) *PlayRunner {
	return &PlayRunner{
		router: router, st: store.NewProjectStore(projectRoot), projectRoot: projectRoot,
	}
}

func playPath(sessionID string) string {
	return fmt.Sprintf("play/%s/world.json", sessionID)
}

// Start creates a new play world.
func (p *PlayRunner) Start(ctx context.Context, in PlayStartInput) (models.PlayWorld, error) {
	if in.Mode == "" {
		in.Mode = models.PlayModeOpen
	}
	interpCtx, err := p.router.ContextFor(agent.NamePlayActionInterpreter, p.projectRoot, in.SessionID)
	if err != nil {
		return models.PlayWorld{}, err
	}
	renderCtx, err := p.router.ContextFor(agent.NamePlaySceneRenderer, p.projectRoot, in.SessionID)
	if err != nil {
		return models.PlayWorld{}, err
	}
	action, err := interpretAction(ctx, interpCtx, in.Premise, "start")
	if err != nil {
		return models.PlayWorld{}, err
	}
	scene, err := renderScene(ctx, renderCtx, in, action)
	if err != nil {
		return models.PlayWorld{}, err
	}
	world := models.PlayWorld{
		ID: in.SessionID, Title: in.Title, Mode: in.Mode,
		Premise: in.Premise, WorldContract: in.WorldContract,
		VisualContract: in.VisualContract,
		CurrentScene:   scene, HUD: "turn 1",
		SuggestedActions: []string{"inspect surroundings", "talk to nearest character"},
		Transcript:       []models.PlayTurn{{Role: "narrator", Content: scene}},
	}
	if err := p.st.WriteProjectJSON(playPath(in.SessionID), world); err != nil {
		return models.PlayWorld{}, err
	}
	return world, nil
}

// Step advances play by one action.
func (p *PlayRunner) Step(ctx context.Context, in PlayStepInput) (models.PlayWorld, error) {
	var world models.PlayWorld
	if err := p.st.ReadProjectJSON(playPath(in.SessionID), &world); err != nil {
		return models.PlayWorld{}, err
	}
	mutatorCtx, err := p.router.ContextFor(agent.NamePlayWorldMutator, p.projectRoot, in.SessionID)
	if err != nil {
		return world, err
	}
	reconcileCtx, err := p.router.ContextFor(agent.NamePlaySceneReconciler, p.projectRoot, in.SessionID)
	if err != nil {
		return world, err
	}
	mutation, err := mutateWorld(ctx, mutatorCtx, world, in.Action)
	if err != nil {
		return world, err
	}
	world = applyPlayMutation(world, mutation)
	world.Transcript = append(world.Transcript,
		models.PlayTurn{Role: "user", Content: in.Action},
		models.PlayTurn{Role: "narrator", Content: mutation.Narration},
	)
	reconciled, err := reconcileScene(ctx, reconcileCtx, world)
	if err == nil && reconciled != "" {
		world.CurrentScene = reconciled
	}
	_ = p.st.WriteProjectJSON(playPath(in.SessionID), world)
	return world, nil
}

func interpretAction(ctx context.Context, c agent.Context, premise, action string) (string, error) {
	resp, err := c.Chat(ctx, []protocol.Message{
		protocol.SystemMessage("Interpret player action intent. Output one line JSON: {\"intent\":\"...\"}"),
		protocol.UserMessage(fmt.Sprintf("Premise: %s\nAction: %s", premise, action)),
	}, 0.4)
	if err != nil {
		return action, err
	}
	var parsed struct {
		Intent string `json:"intent"`
	}
	if err := jsonUnmarshal(extractJSON(resp.FirstContent()), &parsed); err != nil {
		return action, nil
	}
	if parsed.Intent != "" {
		return parsed.Intent, nil
	}
	return action, nil
}

func renderScene(ctx context.Context, c agent.Context, in PlayStartInput, action string) (string, error) {
	resp, err := c.Chat(ctx, []protocol.Message{
		protocol.SystemMessage("Render opening scene prose for interactive fiction."),
		protocol.UserMessage(fmt.Sprintf("Title:%s\nContract:%s\nAction:%s", in.Title, in.WorldContract, action)),
	}, 0.65)
	if err != nil {
		return "", err
	}
	return resp.FirstContent(), nil
}

func mutateWorld(ctx context.Context, c agent.Context, world models.PlayWorld, action string) (models.PlayMutation, error) {
	var b strings.Builder
	fmt.Fprintf(&b, "World: %s\nScene: %s\nAction: %s\n", world.Title, world.CurrentScene, action)
	resp, err := c.Chat(ctx, []protocol.Message{
		protocol.SystemMessage(`Output JSON: {"narration":"...","sceneUpdate":"...","hudUpdate":"...","suggestedActions":["..."],"entityUpserts":[{"id":"...","type":"...","name":"...","description":"..."}]}`),
		protocol.UserMessage(b.String()),
	}, 0.55)
	if err != nil {
		return models.PlayMutation{}, err
	}
	var m models.PlayMutation
	if err := jsonUnmarshal(extractJSON(resp.FirstContent()), &m); err != nil {
		return models.PlayMutation{Narration: resp.FirstContent()}, nil
	}
	return m, nil
}

func reconcileScene(ctx context.Context, c agent.Context, world models.PlayWorld) (string, error) {
	resp, err := c.Chat(ctx, []protocol.Message{
		protocol.SystemMessage("Reconcile scene prose with updated world state. Output scene text only."),
		protocol.UserMessage(world.CurrentScene),
	}, 0.45)
	if err != nil {
		return "", err
	}
	return resp.FirstContent(), nil
}

// PlayReviseInput revises the last play turn.
type PlayReviseInput struct {
	SessionID string
	Mode      string // regenerate_last | edit_last_input
	NewInput  string
}

// Revise regenerates or edits the last play turn.
func (p *PlayRunner) Revise(ctx context.Context, in PlayReviseInput) (models.PlayWorld, error) {
	var world models.PlayWorld
	if err := p.st.ReadProjectJSON(playPath(in.SessionID), &world); err != nil {
		return models.PlayWorld{}, err
	}
	if len(world.Transcript) == 0 {
		return world, fmt.Errorf("no transcript to revise")
	}
	switch in.Mode {
	case "edit_last_input":
		if in.NewInput == "" {
			return world, fmt.Errorf("newInput required for edit_last_input")
		}
		for i := len(world.Transcript) - 1; i >= 0; i-- {
			if world.Transcript[i].Role == "user" {
				world.Transcript[i].Content = in.NewInput
				break
			}
		}
		return p.Step(ctx, PlayStepInput{SessionID: in.SessionID, Action: in.NewInput})
	case "regenerate_last", "":
		lastAction := "continue"
		for i := len(world.Transcript) - 1; i >= 0; i-- {
			if world.Transcript[i].Role == "user" {
				lastAction = world.Transcript[i].Content
				break
			}
		}
		if len(world.Transcript) >= 2 {
			world.Transcript = world.Transcript[:len(world.Transcript)-2]
		}
		_ = p.st.WriteProjectJSON(playPath(in.SessionID), world)
		return p.Step(ctx, PlayStepInput{SessionID: in.SessionID, Action: lastAction})
	default:
		return world, fmt.Errorf("unknown revise mode %q", in.Mode)
	}
}

// PlayEditInput patches world contract fields.
type PlayEditInput struct {
	SessionID      string
	WorldContract  string
	VisualContract string
}

// Edit updates play world contracts without advancing a turn.
func (p *PlayRunner) Edit(in PlayEditInput) (models.PlayWorld, error) {
	var world models.PlayWorld
	if err := p.st.ReadProjectJSON(playPath(in.SessionID), &world); err != nil {
		return models.PlayWorld{}, err
	}
	if in.WorldContract != "" {
		world.WorldContract = in.WorldContract
	}
	if in.VisualContract != "" {
		world.VisualContract = in.VisualContract
	}
	if err := p.st.WriteProjectJSON(playPath(in.SessionID), world); err != nil {
		return models.PlayWorld{}, err
	}
	return world, nil
}

func applyPlayMutation(world models.PlayWorld, m models.PlayMutation) models.PlayWorld {
	if m.SceneUpdate != "" {
		world.CurrentScene = m.SceneUpdate
	}
	if m.HUDUpdate != "" {
		world.HUD = m.HUDUpdate
	}
	if len(m.SuggestedActions) > 0 {
		world.SuggestedActions = m.SuggestedActions
	}
	for _, e := range m.EntityUpserts {
		replaced := false
		for i, existing := range world.Entities {
			if existing.ID == e.ID {
				world.Entities[i] = e
				replaced = true
				break
			}
		}
		if !replaced {
			world.Entities = append(world.Entities, e)
		}
	}
	return world
}
