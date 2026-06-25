package agents_test

import (
	"context"
	"testing"

	"github.com/LingByte/CinyuVerse/pkg/story/agent"
	"github.com/LingByte/CinyuVerse/pkg/story/agents"
	"github.com/LingByte/CinyuVerse/pkg/story/models"
	"github.com/LingByte/CinyuVerse/pkg/story/store"
)

func TestOutlineSectionSelection(t *testing.T) {
	dir := t.TempDir()
	st := store.NewProjectStore(dir)
	bookID := "b1"
	_ = st.SaveBookConfig(models.BookConfig{ID: bookID, Title: "T", Language: models.LanguageZH})
	outline := "## 世界观\n\n修仙界。\n\n## 铁律\n\n不能飞天。\n\n## 第3章\n\n山门前。"
	_ = st.WriteText(bookID, "story/volume_outline.md", outline)

	plan := models.PlanChapterOutput{
		Intent: models.ChapterIntent{Goal: "山门前对峙", MustKeep: []string{"铁律"}},
		Memo:   models.ChapterMemo{ScenePlan: "山门"},
	}
	out, err := agents.ComposeChapter(agents.ComposeChapterInput{
		Store: st, Book: models.BookConfig{ID: bookID, Language: models.LanguageZH},
		ChapterNumber: 3, Plan: plan,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(out.ContextPackage.SelectedContext) < 2 {
		t.Fatalf("expected outline sections in context, got %d entries", len(out.ContextPackage.SelectedContext))
	}
}

func TestGenerateCoverPrompt(t *testing.T) {
	dir := t.TempDir()
	out, err := agents.GenerateCover(context.Background(), agent.Router{}, agents.CoverInput{
		ProjectRoot: dir, Title: "吞天", Intro: "修仙热血",
	})
	if err != nil {
		t.Fatal(err)
	}
	if out.PromptPath == "" || out.PromptMarkdown == "" {
		t.Fatalf("cover: %+v", out)
	}
}
