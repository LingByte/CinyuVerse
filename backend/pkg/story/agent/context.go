package agent

import (
	"context"
	"fmt"

	"github.com/LingByte/CinyuVerse/pkg/protocol"
)

// Context carries LLM client, model, and project scope for one agent invocation.
type Context struct {
	Client       protocol.ChatModel
	Model        string
	ProjectRoot  string
	BookID       string
	MaxTokens    int
	OnTextDelta  func(string)
}

// Chat calls the underlying model with temperature and optional max tokens.
func (c Context) Chat(ctx context.Context, messages []protocol.Message, temperature float32) (*protocol.ChatResponse, error) {
	return c.ChatWithMaxTokens(ctx, messages, temperature, c.MaxTokens)
}

// ChatWithMaxTokens allows overriding output token budget per call.
func (c Context) ChatWithMaxTokens(ctx context.Context, messages []protocol.Message, temperature float32, maxTokens int) (*protocol.ChatResponse, error) {
	if c.Client == nil {
		return nil, fmt.Errorf("agent context: llm client is nil")
	}
	if c.Model == "" {
		return nil, fmt.Errorf("agent context: model is required")
	}
	req := protocol.ChatRequest{
		Model:       c.Model,
		Messages:    messages,
		Temperature: temperature,
	}
	if maxTokens > 0 {
		req.MaxTokens = maxTokens
	} else if c.MaxTokens > 0 {
		req.MaxTokens = c.MaxTokens
	}
	return c.Client.Chat(ctx, req)
}

// Name identifies an agent for model routing.
type Name string

const (
	NameArchitect          Name = "architect"
	NameFoundationReviewer Name = "foundation-reviewer"
	NamePlanner            Name = "planner"
	NameComposer           Name = "composer"
	NameWriter             Name = "writer"
	NameLengthNormalizer   Name = "length-normalizer"
	NameAuditor            Name = "auditor"
	NameReviser            Name = "reviser"
	NameStateValidator     Name = "state-validator"
	NameChapterAnalyzer    Name = "chapter-analyzer"
	NameConsolidator       Name = "consolidator"
	NameRadar              Name = "radar"
	NamePolisher           Name = "polisher"
	NameFanficCanonImporter Name = "fanfic-canon-importer"
	NameShortFictionOutline Name = "short-fiction-outline"
	NameShortFictionOutlineReviewer Name = "short-fiction-outline-reviewer"
	NameShortFictionOutlineReviser  Name = "short-fiction-outline-reviser"
	NameShortFictionWriter          Name = "short-fiction-writer"
	NameShortFictionDraftReviewer   Name = "short-fiction-draft-reviewer"
	NameShortFictionDraftReviser    Name = "short-fiction-draft-reviser"
	NameShortFictionPackaging       Name = "short-fiction-packaging"
	NamePlayActionInterpreter Name = "play-action-interpreter"
	NamePlayWorldMutator      Name = "play-world-mutator"
	NamePlaySceneRenderer     Name = "play-scene-renderer"
	NamePlaySceneReconciler   Name = "play-scene-reconciler"
	NameConversation        Name = "conversation"
	NameObserver            Name = "observer"
	NameReflector           Name = "reflector"
	NameFoundationReviser   Name = "foundation-reviser"
	NameStyleAnalyzer       Name = "style-analyzer"
	NameStyleVoiceCurator   Name = "style-voice-curator"
	NameCoverGenerator      Name = "cover-generator"
	NameSpinoffArchitect    Name = "spinoff-architect"
	NameImitationArchitect  Name = "imitation-architect"
	NamePostWriteValidator  Name = "post-write-validator"
	NameAITellsDetector     Name = "ai-tells-detector"
	NameSensitiveWords      Name = "sensitive-words-detector"
)

// Override configures per-agent model routing (InkOS modelOverrides equivalent).
type Override struct {
	Model    string
	Provider protocol.ProviderType
	BaseURL  string
	APIKey   string
	Client   protocol.ChatModel
}

// Router resolves client+model for each agent name.
type Router struct {
	DefaultClient protocol.ChatModel
	DefaultModel  string
	Overrides     map[Name]Override
}

// Resolve returns the effective client and model for an agent.
func (r Router) Resolve(name Name) (protocol.ChatModel, string, error) {
	if o, ok := r.Overrides[name]; ok {
		if o.Client != nil {
			return o.Client, o.Model, nil
		}
		if o.Model != "" {
			return r.DefaultClient, o.Model, nil
		}
	}
	if r.DefaultClient == nil {
		return nil, "", fmt.Errorf("router: no default llm client configured")
	}
	if r.DefaultModel == "" {
		return nil, "", fmt.Errorf("router: no default model configured")
	}
	return r.DefaultClient, r.DefaultModel, nil
}

// ContextFor builds an AgentContext for the given agent and book.
func (r Router) ContextFor(name Name, projectRoot, bookID string) (Context, error) {
	client, model, err := r.Resolve(name)
	if err != nil {
		return Context{}, err
	}
	return Context{
		Client:      client,
		Model:       model,
		ProjectRoot: projectRoot,
		BookID:      bookID,
		MaxTokens:   8192,
	}, nil
}
