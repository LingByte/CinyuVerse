package interaction_test

import (
	"context"
	"encoding/json"
	"io"
	"testing"

	"github.com/LingByte/CinyuVerse/pkg/protocol"
	"github.com/LingByte/CinyuVerse/pkg/story/agent"
	"github.com/LingByte/CinyuVerse/pkg/story/interaction"
	"github.com/LingByte/CinyuVerse/pkg/story/models"
	"github.com/LingByte/CinyuVerse/pkg/story/pipeline"
	"github.com/LingByte/CinyuVerse/pkg/story/store"
)

type toolClient struct {
	turn int
}

func (c *toolClient) Name() string { return "tool-mock" }

func (c *toolClient) Chat(_ context.Context, req protocol.ChatRequest) (*protocol.ChatResponse, error) {
	if c.turn == 0 {
		c.turn++
		return &protocol.ChatResponse{Choices: []protocol.Choice{{
			Message: protocol.Message{
				Role: protocol.RoleAssistant,
				ToolCalls: []protocol.ToolCall{{
					ID: "call_1",
					Function: protocol.FunctionCall{
						Name:      "list_agents",
						Arguments: json.RawMessage(`{}`),
					},
				}},
			},
		}}}, nil
	}
	return &protocol.ChatResponse{Choices: []protocol.Choice{{
		Message: protocol.Message{Role: protocol.RoleAssistant, Content: "listed agents"},
	}}}, nil
}

func (c *toolClient) StreamChat(context.Context, protocol.ChatRequest) (protocol.ChatStream, error) {
	return nil, io.ErrUnexpectedEOF
}

func TestSessionToolLoop(t *testing.T) {
	dir := t.TempDir()
	st := store.NewProjectStore(dir)
	bookID := "demo"
	cfg := models.BookConfig{ID: bookID, Title: "测试", Language: models.LanguageZH}
	if err := st.SaveBookConfig(cfg); err != nil {
		t.Fatal(err)
	}
	client := &toolClient{}
	run := pipeline.NewRunner(pipeline.Config{
		ProjectRoot: dir,
		Router:      agent.Router{DefaultClient: client, DefaultModel: "mock"},
	}, st)
	sess := interaction.NewSession(interaction.SessionConfig{
		Router:      agent.Router{DefaultClient: client, DefaultModel: "mock"},
		ProjectRoot: dir,
		Pipeline:    run,
		BookID:      bookID,
		Language:    "zh",
	})
	out, err := sess.Run(context.Background(), "有哪些 agent？")
	if err != nil {
		t.Fatal(err)
	}
	if out != "listed agents" {
		t.Fatalf("unexpected output: %q", out)
	}
}
