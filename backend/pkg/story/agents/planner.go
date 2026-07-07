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

const plannerMaxAttempts = 3

// PlannerAgent produces chapter intent and memo via LLM.
type PlannerAgent struct {
	ctx agent.Context
	st  store.BookStore
}

func NewPlannerAgent(ctx agent.Context, st store.BookStore) *PlannerAgent {
	return &PlannerAgent{ctx: ctx, st: st}
}

type PlanChapterInput struct {
	Book            models.BookConfig
	ChapterNumber   int
	ExternalContext string
}

// PlanChapter generates chapter memo and intent; retries on parse failure.
func (p *PlannerAgent) PlanChapter(ctx context.Context, in PlanChapterInput) (models.PlanChapterOutput, error) {
	lang := in.Book.Language
	if lang == "" {
		lang = models.LanguageZH
	}
	user := p.buildUserPrompt(in, lang)
	var lastErr error
	raw := ""
	for attempt := 0; attempt < plannerMaxAttempts; attempt++ {
		msgs := []protocol.Message{
			protocol.SystemMessage(plannerSystemPrompt(lang)),
			protocol.UserMessage(user),
		}
		if lastErr != nil && raw != "" {
			msgs = append(msgs, protocol.UserMessage(fmt.Sprintf("Parse error: %v\nFix the memo format and regenerate.", lastErr)))
		}
		resp, err := p.ctx.Chat(ctx, msgs, 0.7)
		if err != nil {
			return models.PlanChapterOutput{}, err
		}
		raw = resp.FirstContent()
		memo, err := ParseChapterMemo(raw, lang)
		if err == nil {
			intent := MemoToIntent(memo)
			intentMarkdown := renderIntentMarkdown(intent, memo, lang)
			runtimePath := fmt.Sprintf("story/runtime/chapter-%04d.intent.md", in.ChapterNumber)
			if err := p.st.WriteText(in.Book.ID, runtimePath, intentMarkdown); err != nil {
				return models.PlanChapterOutput{}, err
			}
			return models.PlanChapterOutput{
				Intent:         intent,
				Memo:           memo,
				IntentMarkdown: intentMarkdown,
				RuntimePath:    runtimePath,
			}, nil
		}
		lastErr = err
	}
	// Degraded fallback memo
	memo := degradedMemo(in, lang, raw)
	intent := MemoToIntent(memo)
	intentMarkdown := renderIntentMarkdown(intent, memo, lang)
	return models.PlanChapterOutput{
		Intent:         intent,
		Memo:           memo,
		IntentMarkdown: intentMarkdown,
	}, lastErr
}

func (p *PlannerAgent) buildUserPrompt(in PlanChapterInput, lang models.Language) string {
	bookID := in.Book.ID
	var b strings.Builder
	if lang == models.LanguageEN {
		fmt.Fprintf(&b, "Book: %s\nChapter: %d\nGenre: %s\n", in.Book.Title, in.ChapterNumber, in.Book.Genre)
	} else {
		fmt.Fprintf(&b, "书名：%s\n章节：第%d章\n题材：%s\n", in.Book.Title, in.ChapterNumber, in.Book.Genre)
	}
	appendFile := func(label, path string) {
		content := p.st.ReadTextOrDefault(bookID, path, "")
		if strings.TrimSpace(content) != "" {
			fmt.Fprintf(&b, "\n--- %s ---\n%s\n", label, content)
		}
	}
	appendFile("Author Intent", "story/author_intent.md")
	appendFile("Current Focus", "story/current_focus.md")
	appendFile("Story Bible", "story/story_bible.md")
	appendFile("Volume Outline", "story/volume_outline.md")
	appendFile("Current State", "story/current_state.md")
	appendFile("Pending Hooks", "story/pending_hooks.md")
	appendFile("Chapter Summaries", "story/chapter_summaries.md")
	if in.ExternalContext != "" {
		fmt.Fprintf(&b, "\n--- Guidance ---\n%s\n", in.ExternalContext)
	}
	return b.String()
}

func degradedMemo(in PlanChapterInput, lang models.Language, raw string) models.ChapterMemo {
	goal := in.ExternalContext
	if goal == "" {
		if lang == models.LanguageEN {
			goal = fmt.Sprintf("Advance chapter %d with coherent continuity.", in.ChapterNumber)
		} else {
			goal = fmt.Sprintf("推进第%d章，保持连续性。", in.ChapterNumber)
		}
	}
	return models.ChapterMemo{
		Goal:         goal,
		MustKeep:     []string{"Maintain established facts and character voices."},
		MustAvoid:    []string{"Contradict prior chapters."},
		HookAgenda:   "Advance at least one open hook if possible.",
		ScenePlan:    "Follow volume outline beat for this chapter.",
		EndingChange: "Leave a clear state change at chapter end.",
		StyleNotes:   "Prefer concrete scene over summary.",
		RawMarkdown:  raw,
	}
}
