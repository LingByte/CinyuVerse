package story_test

import (
	"context"
	"io"
	"strings"
	"testing"

	"github.com/LingByte/CinyuVerse/pkg/protocol"
	"github.com/LingByte/CinyuVerse/pkg/story/agent"
	"github.com/LingByte/CinyuVerse/pkg/story/agents"
	"github.com/LingByte/CinyuVerse/pkg/story/models"
	"github.com/LingByte/CinyuVerse/pkg/story/pipeline"
	"github.com/LingByte/CinyuVerse/pkg/story/state"
	"github.com/LingByte/CinyuVerse/pkg/story/store"
)

type scriptedClient struct {
	script []string
	n      int
}

func (c *scriptedClient) Name() string { return "scripted" }

func (c *scriptedClient) Chat(_ context.Context, req protocol.ChatRequest) (*protocol.ChatResponse, error) {
	var content string
	if c.n < len(c.script) {
		content = c.script[c.n]
	}
	c.n++
	return &protocol.ChatResponse{
		Model: req.Model,
		Choices: []protocol.Choice{{
			Message: protocol.Message{Role: protocol.RoleAssistant, Content: content},
		}},
	}, nil
}

func (c *scriptedClient) StreamChat(context.Context, protocol.ChatRequest) (protocol.ChatStream, error) {
	return nil, io.ErrUnexpectedEOF
}

func TestApplyDeltaHookUpsert(t *testing.T) {
	snap := models.NewEmptyRuntimeSnapshot(models.LanguageZH)
	delta := models.RuntimeStateDelta{
		ChapterNumber: 1,
		HookOps: []models.HookOp{{
			Action: "upsert", HookID: "h1", Type: "mystery", Status: models.HookStatusOpen, Notes: "found letter",
		}},
		ChapterSummary: &models.ChapterSummaryRow{Chapter: 1, Title: "开端", Summary: "主角发现信件。"},
	}
	out, err := state.ApplyDelta(snap, delta)
	if err != nil {
		t.Fatal(err)
	}
	if len(out.Hooks.Hooks) != 1 || out.Hooks.Hooks[0].HookID != "h1" {
		t.Fatalf("hooks: %+v", out.Hooks)
	}
	if out.Manifest.LastAppliedChapter != 1 {
		t.Fatalf("manifest: %+v", out.Manifest)
	}
}

func TestParseChapterMemo(t *testing.T) {
	raw := `## 当前任务
推进师徒矛盾

## 必须保留
- 师父还活着

## 必须避免
- 不要突然换地图

## 伏笔议程
回收信件伏笔

## 场景计划
夜谈

## 章尾必须发生的改变
徒弟做出选择

## 风格注意
收紧节奏
`
	memo, err := agents.ParseChapterMemo(raw, models.LanguageZH)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(memo.Goal, "师徒") {
		t.Fatalf("goal=%q", memo.Goal)
	}
	if len(memo.MustKeep) != 1 {
		t.Fatalf("mustKeep=%v", memo.MustKeep)
	}
}

func TestComposeChapterLocal(t *testing.T) {
	dir := t.TempDir()
	st := store.NewProjectStore(dir)
	bookID := "demo"
	cfg := models.BookConfig{ID: bookID, Title: "测试书", Language: models.LanguageZH, Genre: "xuanhuan"}
	if err := st.SaveBookConfig(cfg); err != nil {
		t.Fatal(err)
	}
	_ = st.EnsureControlDocuments(bookID, cfg.Title, cfg.Language)
	_ = st.WriteText(bookID, "story/story_bible.md", "世界观：修仙界。")

	plan := models.PlanChapterOutput{
		Intent:         models.ChapterIntent{Goal: "写开篇"},
		Memo:           models.ChapterMemo{Goal: "写开篇", RawMarkdown: "## 当前任务\n写开篇"},
		IntentMarkdown: "# intent",
	}
	out, err := agents.ComposeChapter(agents.ComposeChapterInput{
		Store: st, Book: cfg, ChapterNumber: 1, Plan: plan,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(out.ContextPackage.SelectedContext) < 2 {
		t.Fatalf("expected context entries, got %d", len(out.ContextPackage.SelectedContext))
	}
}

func TestWriteNextChapterWithMockLLM(t *testing.T) {
	dir := t.TempDir()
	st := store.NewProjectStore(dir)
	bookID := "novel"
	cfg := models.BookConfig{
		ID: bookID, Title: "吞天", Language: models.LanguageZH, Genre: "xuanhuan",
		ChapterWordCount: 12, Status: models.BookStatusActive,
	}
	if err := st.SaveBookConfig(cfg); err != nil {
		t.Fatal(err)
	}
	_ = st.EnsureControlDocuments(bookID, cfg.Title, cfg.Language)
	_ = st.WriteText(bookID, "story/story_bible.md", "修仙世界。")
	_ = st.WriteText(bookID, "story/book_rules.md", "主角：林烬。")

	client := &scriptedClient{script: []string{
		// planner
		"## 当前任务\n开篇\n\n## 必须保留\n- 林烬\n\n## 必须避免\n- OOC\n\n## 伏笔议程\n无\n\n## 场景计划\n山门前\n\n## 章尾必须发生的改变\n入门\n\n## 风格注意\n紧凑",
		// writer
		"TITLE: 山门\n\n林烬站在山门前，风很冷。",
		// observer (ignored content)
		"## 角色\n林烬",
		// reflector
		`{"chapterNumber":1,"hookOps":[{"action":"upsert","hookId":"entry","type":"arc","status":"open","notes":"入门"}],"currentStatePatch":{"upserts":[{"key":"location","value":"山门"}]},"chapterSummary":{"chapter":1,"title":"山门","summary":"林烬到山门。"}}`,
		// state validator
		`{"ok":true}`,
		// auditor
		`{"passed":true,"overallScore":90,"summary":"ok","issues":[]}`,
	}}
	router := agent.Router{DefaultClient: client, DefaultModel: "mock"}

	run := pipeline.NewRunner(pipeline.Config{
		ProjectRoot: dir,
		Router:      router,
	})
	result, err := run.WriteNextChapter(context.Background(), bookID, 0, "")
	if err != nil {
		t.Fatal(err)
	}
	if result.ChapterNumber != 1 || result.Title != "山门" {
		t.Fatalf("result: %+v", result)
	}
	content, err := st.ReadText(bookID, "chapters/0001-山门.md")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(content, "林烬") {
		t.Fatalf("chapter content: %s", content)
	}
	snap, err := st.LoadRuntimeSnapshot(bookID, models.LanguageZH)
	if err != nil {
		t.Fatal(err)
	}
	if snap.Manifest.LastAppliedChapter != 1 {
		t.Fatalf("snapshot: %+v", snap.Manifest)
	}
}
