package agents

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"

	"github.com/LingByte/CinyuVerse/pkg/protocol"
	"github.com/LingByte/CinyuVerse/pkg/story/agent"
	"github.com/LingByte/CinyuVerse/pkg/story/models"
	"github.com/LingByte/CinyuVerse/pkg/story/store"
)

const shortFictionReviewMaxIterations = 2

// ShortFictionRunInput configures a standalone short-fiction package.
type ShortFictionRunInput struct {
	Direction       string
	Chapters        int
	CharsPerChapter int
	StoryID         string
	Reference       string
}

// ShortFictionRunner orchestrates short-fiction agents.
type ShortFictionRunner struct {
	router      agent.Router
	st          store.BookStore
	projectRoot string
}

func NewShortFictionRunner(projectRoot string, router agent.Router) *ShortFictionRunner {
	return &ShortFictionRunner{
		router: router, st: store.NewProjectStore(projectRoot), projectRoot: projectRoot,
	}
}

func (r *ShortFictionRunner) ctx(name agent.Name) (agent.Context, error) {
	return r.router.ContextFor(name, r.projectRoot, "")
}

// Run executes outline → review → revise → draft → review → revise → packaging.
func (r *ShortFictionRunner) Run(ctx context.Context, in ShortFictionRunInput) (models.ShortFictionResult, error) {
	if in.Chapters <= 0 {
		in.Chapters = shortFictionDefaultChapters
	}
	if in.CharsPerChapter <= 0 {
		in.CharsPerChapter = 1000
	}
	storyID := in.StoryID
	if storyID == "" {
		storyID = slugify(in.Direction)
	}
	outDir := filepath.Join("shorts", storyID)
	lang := models.LanguageZH

	outlineCtx, err := r.ctx(agent.NameShortFictionOutline)
	if err != nil {
		return models.ShortFictionResult{}, err
	}
	outlineRaw, err := chatSimple(ctx, outlineCtx, shortOutlineSystem(lang),
		fmt.Sprintf("Direction: %s\nChapters: %d\nChars/chapter: %d\nReference: %s",
			in.Direction, in.Chapters, in.CharsPerChapter, in.Reference), 0.55)
	if err != nil {
		return models.ShortFictionResult{}, err
	}
	outline := ParseShortFictionOutline(outlineRaw)
	_ = r.st.WriteProjectText(filepath.Join(outDir, "outline.md"), outline.RawContent)

	if revCtx, err := r.ctx(agent.NameShortFictionOutlineReviewer); err == nil {
		reviewer := NewShortFictionOutlineReviewerAgent(revCtx)
		for i := 0; i < shortFictionReviewMaxIterations; i++ {
			review, rErr := reviewer.Review(ctx, in.Direction, outline)
			if rErr != nil || review.Passed {
				break
			}
			reviserCtx, rErr := r.ctx(agent.NameShortFictionOutlineReviser)
			if rErr != nil {
				break
			}
			outline, rErr = NewShortFictionOutlineReviserAgent(reviserCtx).Revise(ctx, in.Direction, outline, review.Feedback)
			if rErr != nil {
				break
			}
			_ = r.st.WriteProjectText(filepath.Join(outDir, "outline.md"), outline.RawContent)
		}
	}

	writerCtx, err := r.ctx(agent.NameShortFictionWriter)
	if err != nil {
		return models.ShortFictionResult{}, err
	}
	draftRaw, err := chatSimple(ctx, writerCtx, shortWriterSystem(lang),
		fmt.Sprintf("Write full short fiction from outline:\n%s", outline.RawContent), 0.58)
	if err != nil {
		return models.ShortFictionResult{}, err
	}
	draft := ParseShortFictionBatchDraft(draftRaw, in.Chapters)
	_ = r.st.WriteProjectText(filepath.Join(outDir, "draft.md"), RenderShortFictionDraftMarkdown(draft))

	if revCtx, err := r.ctx(agent.NameShortFictionDraftReviewer); err == nil {
		reviewer := NewShortFictionDraftReviewerAgent(revCtx)
		for i := 0; i < shortFictionReviewMaxIterations; i++ {
			review, rErr := reviewer.Review(ctx, in.Direction, outline.RawContent, draft)
			if rErr != nil || review.Passed {
				break
			}
			reviserCtx, rErr := r.ctx(agent.NameShortFictionDraftReviser)
			if rErr != nil {
				break
			}
			draft, rErr = NewShortFictionDraftReviserAgent(reviserCtx).Revise(ctx, in.Direction, outline.RawContent, draft, review.Feedback, in.Chapters)
			if rErr != nil {
				break
			}
			_ = r.st.WriteProjectText(filepath.Join(outDir, "draft.md"), RenderShortFictionDraftMarkdown(draft))
		}
	}

	packCtx, err := r.ctx(agent.NameShortFictionPackaging)
	if err != nil {
		return models.ShortFictionResult{}, err
	}
	salesRaw, err := chatSimple(ctx, packCtx, shortPackagingSystem(lang),
		RenderShortFictionDraftMarkdown(draft), 0.45)
	if err != nil {
		return models.ShortFictionResult{}, err
	}
	sales := ParseShortFictionSalesPackage(salesRaw, outline.StoryTitle)
	_ = r.st.WriteProjectText(filepath.Join(outDir, "sales-package.md"), salesRaw)
	finalMD := RenderShortFictionDraftMarkdown(draft)
	_ = r.st.WriteProjectText(filepath.Join(outDir, "final", "full.md"), finalMD)

	return models.ShortFictionResult{
		StoryID: storyID, Title: outline.StoryTitle, OutputDir: outDir,
		FullMarkdown: finalMD, CoverPrompt: "cover for " + storyID,
		Outline: models.ShortFictionOutline{Title: outline.StoryTitle, Synopsis: outline.RawContent},
		Draft:   draft,
		Sales:   sales,
	}, nil
}

func chatSimple(ctx context.Context, c agent.Context, system, user string, temp float32) (string, error) {
	resp, err := c.Chat(ctx, []protocol.Message{
		protocol.SystemMessage(system),
		protocol.UserMessage(user),
	}, temp)
	if err != nil {
		return "", err
	}
	return resp.FirstContent(), nil
}

func shortOutlineSystem(lang models.Language) string {
	if lang == models.LanguageEN {
		return "Create a short-fiction outline with chapter beats. Markdown only."
	}
	return "生成短篇大纲与分章节拍。只输出 Markdown。"
}

func shortWriterSystem(lang models.Language) string {
	if lang == models.LanguageEN {
		return "Write complete short fiction manuscript from outline. Markdown only."
	}
	return "根据大纲写完整短篇正文。只输出 Markdown。"
}

func shortPackagingSystem(lang models.Language) string {
	if lang == models.LanguageEN {
		return "Write synopsis (SHORT_FICTION_INTRO) and 3 selling points (SHORT_FICTION_SELLING_POINTS). Markdown."
	}
	return "写简介（SHORT_FICTION_INTRO）和 3 个卖点（SHORT_FICTION_SELLING_POINTS）。Markdown。"
}

func slugify(s string) string {
	s = strings.TrimSpace(s)
	if len(s) > 32 {
		s = s[:32]
	}
	return strings.ReplaceAll(s, " ", "-")
}
