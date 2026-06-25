package interaction

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/LingByte/CinyuVerse/pkg/protocol"
	"github.com/LingByte/CinyuVerse/pkg/story/agent"
	"github.com/LingByte/CinyuVerse/pkg/story/agents"
	"github.com/LingByte/CinyuVerse/pkg/story/events"
	"github.com/LingByte/CinyuVerse/pkg/story/models"
	"github.com/LingByte/CinyuVerse/pkg/story/pipeline"
)

// ToolHandler executes one named tool for the conversation agent.
type ToolHandler func(ctx context.Context, args json.RawMessage) (string, error)

// SessionConfig configures the tool-use conversation loop (InkOS interact layer).
type SessionConfig struct {
	Router      agent.Router
	ProjectRoot string
	Pipeline    *pipeline.Runner
	BookID      string
	Language    string
	MaxTurns    int
	Events      *events.Hub
}

// Session runs a ReAct-style tool loop over the shared pipeline.
type Session struct {
	cfg      SessionConfig
	tools    map[string]ToolHandler
	messages []protocol.Message
}

// NewSession creates a conversation session with built-in tools.
func NewSession(cfg SessionConfig) *Session {
	if cfg.MaxTurns <= 0 {
		cfg.MaxTurns = 8
	}
	s := &Session{cfg: cfg, tools: map[string]ToolHandler{}}
	s.registerBuiltinTools()
	s.messages = []protocol.Message{protocol.SystemMessage(conversationSystemPrompt(cfg))}
	return s
}

func conversationSystemPrompt(cfg SessionConfig) string {
	if cfg.Language == "en" {
		return `You are CinyuVerse Story Agent. Use tools for real work; do not claim chapters were written without tool results.
Available tools: plan_chapter, compose_chapter, write_next_chapter, draft_chapter, audit_chapter, revise_chapter, read_truth_file, update_focus, update_author_intent, short_fiction_run, play_start, play_step, list_agents, generate_cover.`
	}
	return `你是 CinyuVerse 故事智能体。必须通过工具完成真实操作；不要在没有工具结果时声称已写完章节。
可用工具：plan_chapter、compose_chapter、write_next_chapter、draft_chapter、audit_chapter、revise_chapter、read_truth_file、update_focus、update_author_intent、short_fiction_run、play_start、play_step、list_agents、generate_cover。`
}

func (s *Session) registerBuiltinTools() {
	s.tools["plan_chapter"] = func(ctx context.Context, args json.RawMessage) (string, error) {
		var p struct{ Guidance string `json:"guidance"` }
		_ = json.Unmarshal(args, &p)
		out, err := s.cfg.Pipeline.PlanChapter(ctx, s.cfg.BookID, p.Guidance)
		if err != nil {
			return "", err
		}
		b, _ := json.Marshal(out)
		return string(b), nil
	}
	s.tools["compose_chapter"] = func(ctx context.Context, args json.RawMessage) (string, error) {
		var p struct{ Guidance string `json:"guidance"` }
		_ = json.Unmarshal(args, &p)
		out, err := s.cfg.Pipeline.ComposeChapter(ctx, s.cfg.BookID, p.Guidance)
		if err != nil {
			return "", err
		}
		b, _ := json.Marshal(out)
		return string(b), nil
	}
	s.tools["write_next_chapter"] = func(ctx context.Context, args json.RawMessage) (string, error) {
		var p struct {
			Guidance  string `json:"guidance"`
			WordCount int    `json:"wordCount"`
		}
		_ = json.Unmarshal(args, &p)
		out, err := s.cfg.Pipeline.WriteNextChapter(ctx, s.cfg.BookID, p.WordCount, p.Guidance)
		if err != nil {
			return "", err
		}
		b, _ := json.Marshal(out)
		return string(b), nil
	}
	s.tools["read_truth_file"] = func(ctx context.Context, args json.RawMessage) (string, error) {
		var p struct{ Path string `json:"path"` }
		if err := json.Unmarshal(args, &p); err != nil {
			return "", err
		}
		return s.cfg.Pipeline.ReadTruthFile(s.cfg.BookID, p.Path)
	}
	s.tools["update_focus"] = func(ctx context.Context, args json.RawMessage) (string, error) {
		var p struct{ Content string `json:"content"` }
		if err := json.Unmarshal(args, &p); err != nil {
			return "", err
		}
		return "ok", s.cfg.Pipeline.UpdateCurrentFocus(s.cfg.BookID, p.Content)
	}
	s.tools["update_author_intent"] = func(ctx context.Context, args json.RawMessage) (string, error) {
		var p struct{ Content string `json:"content"` }
		if err := json.Unmarshal(args, &p); err != nil {
			return "", err
		}
		return "ok", s.cfg.Pipeline.UpdateAuthorIntent(s.cfg.BookID, p.Content)
	}
	s.tools["draft_chapter"] = func(ctx context.Context, args json.RawMessage) (string, error) {
		var p struct {
			Guidance  string `json:"guidance"`
			WordCount int    `json:"wordCount"`
		}
		_ = json.Unmarshal(args, &p)
		out, err := s.cfg.Pipeline.DraftChapter(ctx, s.cfg.BookID, p.WordCount, p.Guidance)
		if err != nil {
			return "", err
		}
		b, _ := json.Marshal(out)
		return string(b), nil
	}
	s.tools["audit_chapter"] = func(ctx context.Context, args json.RawMessage) (string, error) {
		var p struct{ ChapterNumber int `json:"chapterNumber"` }
		_ = json.Unmarshal(args, &p)
		out, err := s.cfg.Pipeline.AuditChapter(ctx, s.cfg.BookID, p.ChapterNumber)
		if err != nil {
			return "", err
		}
		b, _ := json.Marshal(out)
		return string(b), nil
	}
	s.tools["revise_chapter"] = func(ctx context.Context, args json.RawMessage) (string, error) {
		var p struct {
			ChapterNumber int    `json:"chapterNumber"`
			Mode          string `json:"mode"`
		}
		_ = json.Unmarshal(args, &p)
		mode := agents.ReviseModeAuto
		if p.Mode != "" {
			mode = agents.ReviseMode(p.Mode)
		}
		out, err := s.cfg.Pipeline.ReviseChapter(ctx, s.cfg.BookID, p.ChapterNumber, mode, false, false)
		if err != nil {
			return "", err
		}
		data, _ := json.Marshal(out)
		return string(data), nil
	}
	s.tools["short_fiction_run"] = func(ctx context.Context, args json.RawMessage) (string, error) {
		var p struct {
			Direction       string `json:"direction"`
			Reference       string `json:"reference"`
			StoryID         string `json:"storyId"`
			Chapters        int    `json:"chapters"`
			CharsPerChapter int    `json:"charsPerChapter"`
		}
		if err := json.Unmarshal(args, &p); err != nil {
			return "", err
		}
		out, err := s.cfg.Pipeline.RunShortFiction(ctx, agents.ShortFictionRunInput{
			Direction: p.Direction, Reference: p.Reference, StoryID: p.StoryID,
			Chapters: p.Chapters, CharsPerChapter: p.CharsPerChapter,
		})
		if err != nil {
			return "", err
		}
		b, _ := json.Marshal(out)
		return string(b), nil
	}
	s.tools["play_start"] = func(ctx context.Context, args json.RawMessage) (string, error) {
		var p struct {
			SessionID      string `json:"sessionId"`
			Title          string `json:"title"`
			Premise        string `json:"premise"`
			WorldContract  string `json:"worldContract"`
			VisualContract string `json:"visualContract"`
			Mode           string `json:"mode"`
		}
		if err := json.Unmarshal(args, &p); err != nil {
			return "", err
		}
		mode := models.PlayModeOpen
		if p.Mode == "guided" {
			mode = models.PlayModeGuided
		}
		out, err := s.cfg.Pipeline.PlayStart(ctx, agents.PlayStartInput{
			SessionID: p.SessionID, Title: p.Title, Premise: p.Premise,
			WorldContract: p.WorldContract, VisualContract: p.VisualContract, Mode: mode,
		})
		if err != nil {
			return "", err
		}
		b, _ := json.Marshal(out)
		return string(b), nil
	}
	s.tools["play_step"] = func(ctx context.Context, args json.RawMessage) (string, error) {
		var p struct {
			SessionID string `json:"sessionId"`
			Action    string `json:"action"`
		}
		if err := json.Unmarshal(args, &p); err != nil {
			return "", err
		}
		out, err := s.cfg.Pipeline.PlayStep(ctx, agents.PlayStepInput{SessionID: p.SessionID, Action: p.Action})
		if err != nil {
			return "", err
		}
		b, _ := json.Marshal(out)
		return string(b), nil
	}
	s.tools["list_agents"] = func(ctx context.Context, _ json.RawMessage) (string, error) {
		b, _ := json.Marshal(s.cfg.Pipeline.ListAgents())
		return string(b), nil
	}
	s.tools["generate_cover"] = func(ctx context.Context, args json.RawMessage) (string, error) {
		var p struct {
			Title         string `json:"title"`
			Intro         string `json:"intro"`
			SellingPoints string `json:"sellingPoints"`
			CoverPrompt   string `json:"coverPrompt"`
			OutputDir     string `json:"outputDir"`
		}
		if err := json.Unmarshal(args, &p); err != nil {
			return "", err
		}
		out, err := s.cfg.Pipeline.GenerateCover(ctx, agents.CoverInput{
			Title: p.Title, Intro: p.Intro, SellingPoints: p.SellingPoints,
			CoverPrompt: p.CoverPrompt, OutputDir: p.OutputDir,
		})
		if err != nil {
			return "", err
		}
		b, _ := json.Marshal(out)
		return string(b), nil
	}
}

// Run executes one user turn with tool-use loop.
func (s *Session) Run(ctx context.Context, userMessage string) (string, error) {
	s.messages = append(s.messages, protocol.UserMessage(userMessage))
	convCtx, err := s.cfg.Router.ContextFor(agent.NameConversation, s.cfg.ProjectRoot, s.cfg.BookID)
	if err != nil {
		return "", err
	}
	tools := conversationTools()
	for turn := 0; turn < s.cfg.MaxTurns; turn++ {
		req := protocol.ChatRequest{
			Model:    convCtx.Model,
			Messages: s.messages,
			Tools:    tools,
			ToolChoice: protocol.ToolChoiceAuto,
		}
		resp, err := convCtx.Client.Chat(ctx, req)
		if err != nil {
			return "", err
		}
		msg := resp.FirstMessage()
		if msg == nil {
			return "", fmt.Errorf("empty assistant response")
		}
		s.messages = append(s.messages, *msg)
		if len(msg.ToolCalls) == 0 {
			return msg.Content, nil
		}
		for _, tc := range msg.ToolCalls {
			handler, ok := s.tools[tc.Function.Name]
			if !ok {
				s.emitTool(tc.Function.Name, "unknown tool")
				s.messages = append(s.messages, protocol.ToolMessage(
					fmt.Sprintf("unknown tool %s", tc.Function.Name), tc.ID))
				continue
			}
			result, err := handler(ctx, tc.Function.Arguments)
			if err != nil {
				s.emitTool(tc.Function.Name, "error: "+err.Error())
				s.messages = append(s.messages, protocol.ToolMessage("error: "+err.Error(), tc.ID))
				continue
			}
			s.emitTool(tc.Function.Name, "ok")
			s.messages = append(s.messages, protocol.ToolMessage(result, tc.ID))
		}
	}
	return "", fmt.Errorf("conversation exceeded max turns (%d)", s.cfg.MaxTurns)
}

func conversationTools() []protocol.Tool {
	obj := func(props map[string]interface{}, required ...string) map[string]interface{} {
		m := map[string]interface{}{"type": "object", "properties": props}
		if len(required) > 0 {
			m["required"] = required
		}
		return m
	}
	str := map[string]interface{}{"type": "string"}
	intType := map[string]interface{}{"type": "integer"}
	return []protocol.Tool{
		{Name: "plan_chapter", Description: "Generate chapter intent/memo for next chapter",
			Parameters: obj(map[string]interface{}{"guidance": str})},
		{Name: "compose_chapter", Description: "Compile context package and rule stack",
			Parameters: obj(map[string]interface{}{"guidance": str})},
		{Name: "write_next_chapter", Description: "Run full write pipeline for next chapter",
			Parameters: obj(map[string]interface{}{"guidance": str, "wordCount": intType})},
		{Name: "draft_chapter", Description: "Write draft only (no audit/revise)",
			Parameters: obj(map[string]interface{}{"guidance": str, "wordCount": intType})},
		{Name: "audit_chapter", Description: "Audit an existing chapter",
			Parameters: obj(map[string]interface{}{"chapterNumber": intType})},
		{Name: "revise_chapter", Description: "Revise chapter from audit issues",
			Parameters: obj(map[string]interface{}{"chapterNumber": intType, "mode": str})},
		{Name: "read_truth_file", Description: "Read a story file under the book",
			Parameters: obj(map[string]interface{}{"path": str}, "path")},
		{Name: "update_focus", Description: "Rewrite story/current_focus.md",
			Parameters: obj(map[string]interface{}{"content": str}, "content")},
		{Name: "update_author_intent", Description: "Rewrite story/author_intent.md",
			Parameters: obj(map[string]interface{}{"content": str}, "content")},
		{Name: "short_fiction_run", Description: "Generate standalone short-fiction package",
			Parameters: obj(map[string]interface{}{
				"direction": str, "reference": str, "storyId": str,
				"chapters": intType, "charsPerChapter": intType,
			}, "direction")},
		{Name: "play_start", Description: "Start interactive play session",
			Parameters: obj(map[string]interface{}{
				"sessionId": str, "title": str, "premise": str,
				"worldContract": str, "visualContract": str, "mode": str,
			}, "sessionId", "title")},
		{Name: "play_step", Description: "Advance play session by user action",
			Parameters: obj(map[string]interface{}{"sessionId": str, "action": str}, "sessionId", "action")},
		{Name: "list_agents", Description: "List registered pipeline agents",
			Parameters: obj(map[string]interface{}{})},
		{Name: "generate_cover", Description: "Generate cover prompt and optional cover image",
			Parameters: obj(map[string]interface{}{
				"title": str, "intro": str, "sellingPoints": str, "coverPrompt": str, "outputDir": str,
			}, "title")},
	}
}

// Messages returns a copy of session messages for persistence.
func (s *Session) Messages() []protocol.Message {
	out := make([]protocol.Message, len(s.messages))
	copy(out, s.messages)
	return out
}

// LastAssistantText returns the last assistant text content.
func (s *Session) LastAssistantText() string {
	for i := len(s.messages) - 1; i >= 0; i-- {
		if s.messages[i].Role == protocol.RoleAssistant && strings.TrimSpace(s.messages[i].Content) != "" {
			return s.messages[i].Content
		}
	}
	return ""
}

func (s *Session) emitTool(name, msg string) {
	if s.cfg.Events != nil {
		s.cfg.Events.Tool(name, s.cfg.BookID, map[string]any{"message": msg})
	}
}
