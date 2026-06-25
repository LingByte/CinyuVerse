package agents

import (
	"context"
	"fmt"

	"github.com/LingByte/CinyuVerse/pkg/protocol"
	"github.com/LingByte/CinyuVerse/pkg/story/agent"
	"github.com/LingByte/CinyuVerse/pkg/story/models"
)

// ShortFictionOutlineReviewerAgent reviews short-fiction outlines.
type ShortFictionOutlineReviewerAgent struct{ ctx agent.Context }

func NewShortFictionOutlineReviewerAgent(ctx agent.Context) *ShortFictionOutlineReviewerAgent {
	return &ShortFictionOutlineReviewerAgent{ctx: ctx}
}

func (a *ShortFictionOutlineReviewerAgent) Review(ctx context.Context, direction string, outline models.ShortFictionOutlineParsed) (shortFictionReviewResult, error) {
	user := fmt.Sprintf("Direction: %s\n\nOutline:\n%s", direction, outline.RawContent)
	resp, err := a.ctx.Chat(ctx, []protocol.Message{
		protocol.SystemMessage(shortOutlineReviewSystem(models.LanguageZH)),
		protocol.UserMessage(user),
	}, 0.3)
	if err != nil {
		return shortFictionReviewResult{}, err
	}
	return parseShortFictionReview(resp.FirstContent()), nil
}

// ShortFictionOutlineReviserAgent revises outlines from reviewer feedback.
type ShortFictionOutlineReviserAgent struct{ ctx agent.Context }

func NewShortFictionOutlineReviserAgent(ctx agent.Context) *ShortFictionOutlineReviserAgent {
	return &ShortFictionOutlineReviserAgent{ctx: ctx}
}

func (a *ShortFictionOutlineReviserAgent) Revise(ctx context.Context, direction string, outline models.ShortFictionOutlineParsed, feedback string) (models.ShortFictionOutlineParsed, error) {
	user := fmt.Sprintf("Direction: %s\n\nRevise outline based on feedback:\n%s", direction, feedback)
	resp, err := a.ctx.Chat(ctx, []protocol.Message{
		protocol.SystemMessage(shortOutlineSystem(models.LanguageZH)),
		protocol.UserMessage(user),
		protocol.AssistantMessage(outline.RawContent),
		protocol.UserMessage("Apply reviewer feedback. Output revised outline markdown."),
	}, 0.45)
	if err != nil {
		return models.ShortFictionOutlineParsed{}, err
	}
	return ParseShortFictionOutline(resp.FirstContent()), nil
}

// ShortFictionDraftReviewerAgent reviews draft manuscripts.
type ShortFictionDraftReviewerAgent struct{ ctx agent.Context }

func NewShortFictionDraftReviewerAgent(ctx agent.Context) *ShortFictionDraftReviewerAgent {
	return &ShortFictionDraftReviewerAgent{ctx: ctx}
}

func (a *ShortFictionDraftReviewerAgent) Review(ctx context.Context, direction, outlineMD string, draft models.ShortFictionDraft) (shortFictionReviewResult, error) {
	user := fmt.Sprintf("Direction: %s\nOutline:\n%s\n\nDraft:\n%s", direction, outlineMD, RenderShortFictionDraftMarkdown(draft))
	resp, err := a.ctx.Chat(ctx, []protocol.Message{
		protocol.SystemMessage(shortDraftReviewSystem(models.LanguageZH)),
		protocol.UserMessage(user),
	}, 0.3)
	if err != nil {
		return shortFictionReviewResult{}, err
	}
	return parseShortFictionReview(resp.FirstContent()), nil
}

// ShortFictionDraftReviserAgent revises drafts from reviewer feedback.
type ShortFictionDraftReviserAgent struct{ ctx agent.Context }

func NewShortFictionDraftReviserAgent(ctx agent.Context) *ShortFictionDraftReviserAgent {
	return &ShortFictionDraftReviserAgent{ctx: ctx}
}

func (a *ShortFictionDraftReviserAgent) Revise(ctx context.Context, direction string, outlineMD string, draft models.ShortFictionDraft, feedback string, chapterCount int) (models.ShortFictionDraft, error) {
	user := fmt.Sprintf("Direction: %s\nChapters: %d\nFeedback:\n%s", direction, chapterCount, feedback)
	resp, err := a.ctx.Chat(ctx, []protocol.Message{
		protocol.SystemMessage(shortWriterSystem(models.LanguageZH)),
		protocol.UserMessage(fmt.Sprintf("Outline:\n%s", outlineMD)),
		protocol.AssistantMessage(draft.RawContent),
		protocol.UserMessage(user),
	}, 0.45)
	if err != nil {
		return models.ShortFictionDraft{}, err
	}
	return ParseShortFictionBatchDraft(resp.FirstContent(), chapterCount), nil
}

func shortOutlineReviewSystem(lang models.Language) string {
	if lang == models.LanguageEN {
		return `Review the short-fiction outline. Output JSON only: {"passed":true} or {"passed":false,"feedback":"..."}`
	}
	return `审查短篇大纲。只输出 JSON：{"passed":true} 或 {"passed":false,"feedback":"..."}`
}

func shortDraftReviewSystem(lang models.Language) string {
	if lang == models.LanguageEN {
		return `Review the short-fiction draft for pacing, hooks, and completeness. Output JSON only: {"passed":true} or {"passed":false,"feedback":"..."}`
	}
	return `审查短篇正文的节奏、钩子与完整性。只输出 JSON：{"passed":true} 或 {"passed":false,"feedback":"..."}`
}
