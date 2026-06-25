package pipeline

import (
	"context"
	"fmt"

	"github.com/LingByte/CinyuVerse/pkg/story/agent"
	"github.com/LingByte/CinyuVerse/pkg/story/agents"
	"github.com/LingByte/CinyuVerse/pkg/story/hooks"
	"github.com/LingByte/CinyuVerse/pkg/story/models"
	"github.com/LingByte/CinyuVerse/pkg/story/state"
)

// RejectChapterWithRollback marks a chapter rejected and restores pre-chapter runtime state.
func (r *Runner) RejectChapterWithRollback(bookID string, chapterNumber int) error {
	if err := r.st.RestoreChapterSnapshot(bookID, chapterNumber); err != nil {
		return err
	}
	if err := r.st.DeleteChapter(bookID, chapterNumber); err != nil {
		return err
	}
	snap, err := r.st.LoadRuntimeSnapshot(bookID, models.LanguageZH)
	if err == nil {
		snap.Manifest.LastAppliedChapter = chapterNumber - 1
		if snap.Manifest.LastAppliedChapter < 0 {
			snap.Manifest.LastAppliedChapter = 0
		}
		_ = r.st.SaveRuntimeSnapshot(bookID, snap)
	}
	return nil
}

// RewriteChapter rolls back chapter N and re-runs the full pipeline for that chapter number.
func (r *Runner) RewriteChapter(ctx context.Context, bookID string, chapterNumber int, guidance string, wordCount int) (ChapterPipelineResult, error) {
	if chapterNumber <= 0 {
		return ChapterPipelineResult{}, fmt.Errorf("chapter number required")
	}
	index, err := r.st.LoadChapterIndex(bookID)
	if err != nil {
		return ChapterPipelineResult{}, err
	}
	found := false
	for _, ch := range index {
		if ch.Number == chapterNumber {
			found = true
			break
		}
	}
	if found {
		if err := r.st.RestoreChapterSnapshot(bookID, chapterNumber); err != nil {
			return ChapterPipelineResult{}, err
		}
		if err := r.st.DeleteChapter(bookID, chapterNumber); err != nil {
			return ChapterPipelineResult{}, err
		}
	}
	return r.writeChapterNumber(ctx, bookID, chapterNumber, wordCount, guidance)
}

// RepairChapterState re-runs chapter analyzer for one chapter and updates runtime state.
func (r *Runner) RepairChapterState(ctx context.Context, bookID string, chapterNumber int) error {
	book, content, meta, err := r.loadChapterContent(bookID, chapterNumber)
	if err != nil {
		return err
	}
	ctxAgent, err := r.cfg.Router.ContextFor(agent.NameChapterAnalyzer, r.cfg.ProjectRoot, bookID)
	if err != nil {
		return err
	}
	analyzer := agents.NewChapterAnalyzerAgent(ctxAgent, r.st)
	return analyzer.ReplayImportedChapter(ctx, bookID, book.Language, agents.AnalyzeChapterInput{
		Book: book, ChapterNumber: meta.Number, Title: meta.Title, Content: content,
	})
}

// HookHealth returns hook governance report for the current book state.
func (r *Runner) HookHealth(bookID string, chapterNumber int) hooks.HealthReport {
	snap, err := r.st.LoadRuntimeSnapshot(bookID, models.LanguageZH)
	if err != nil {
		return hooks.HealthReport{}
	}
	return hooks.EvaluateHooks(snap.Hooks, chapterNumber)
}

// writeChapterNumber runs the governed pipeline for a specific chapter number (used by rewrite).
func (r *Runner) writeChapterNumber(ctx context.Context, bookID string, chNum int, wordCount int, guidance string) (ChapterPipelineResult, error) {
	book, err := r.st.LoadBookConfig(bookID)
	if err != nil {
		return ChapterPipelineResult{}, err
	}
	if err := r.st.SaveChapterSnapshot(bookID, chNum); err != nil {
		return ChapterPipelineResult{}, err
	}
	ext := guidance
	if ext == "" {
		ext = r.cfg.ExternalContext
	}
	plan, composed, err := r.prepareGovernedInput(ctx, book, chNum, ext)
	if err != nil {
		return ChapterPipelineResult{}, err
	}
	writerCtx, err := r.cfg.Router.ContextFor(agent.NameWriter, r.cfg.ProjectRoot, bookID)
	if err != nil {
		return ChapterPipelineResult{}, err
	}
	writer := agents.NewWriterAgent(writerCtx, r.st)
	writer.SetRouter(r.cfg.Router)
	writeOut, err := writer.WriteChapter(ctx, agents.WriteChapterInput{
		Book: book, ChapterNumber: chNum, Plan: plan, Composed: composed,
		ExternalContext: ext, TargetWords: wordCount,
	})
	if err != nil {
		return ChapterPipelineResult{}, err
	}
	content, title, revised := writeOut.Content, writeOut.Title, false
	audit := agents.AuditResult{Passed: true, Summary: "manual mode: not audited"}
	if r.cfg.ChapterReviewMode != "manual" {
		content, title, revised, audit, err = r.runReviewCycle(ctx, book, chNum, title, content, composed, plan.Memo)
		if err != nil {
			return ChapterPipelineResult{}, err
		}
	}
	status := models.ChapterStatusReadyForReview
	if !audit.Passed && !audit.ParseFailed {
		status = models.ChapterStatusAuditFailed
	}
	meta := models.ChapterMeta{
		Number: chNum, Title: title,
		WordCount: agents.CountLength(content, book.Language),
		Status:    status,
	}
	if err := r.st.SaveChapter(bookID, meta, content); err != nil {
		return ChapterPipelineResult{}, err
	}
	return ChapterPipelineResult{
		ChapterNumber: chNum, Title: title, WordCount: meta.WordCount,
		Revised: revised, Status: status, Audit: audit, ChapterMeta: meta,
	}, nil
}

// ReprojectState refreshes markdown projections from JSON authority.
func (r *Runner) ReprojectState(bookID string) error {
	snap, err := r.st.LoadRuntimeSnapshot(bookID, models.LanguageZH)
	if err != nil {
		return err
	}
	return state.PersistSnapshot(
		func(rel string, v any) error { return r.st.WriteJSON(bookID, rel, v) },
		func(rel, content string) error { return r.st.WriteText(bookID, rel, content) },
		snap,
	)
}
