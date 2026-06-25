package pipeline

import (
	"context"

	"github.com/LingByte/CinyuVerse/pkg/story/agent"
	"github.com/LingByte/CinyuVerse/pkg/story/agents"
	"github.com/LingByte/CinyuVerse/pkg/story/detection"
	"github.com/LingByte/CinyuVerse/pkg/story/models"
	"github.com/LingByte/CinyuVerse/pkg/story/references"
)

// SyncReferenceLibrary runs StyleVoiceCurator on references/ folder.
func (r *Runner) SyncReferenceLibrary(ctx context.Context, force bool) (string, error) {
	bookLang := models.LanguageZH
	books, _ := r.st.ListBooks()
	if len(books) > 0 && books[0].Language != "" {
		bookLang = books[0].Language
	}
	ctxAgent, err := r.cfg.Router.ContextFor(agent.NameStyleVoiceCurator, r.cfg.ProjectRoot, "")
	if err != nil {
		return "", err
	}
	return agents.NewStyleVoiceCuratorAgent(ctxAgent, r.cfg.ProjectRoot).SyncReferences(ctx, bookLang, force)
}

func (r *Runner) maybeSyncReferences(ctx context.Context) {
	proj, err := r.st.LoadProjectConfig()
	if err != nil || !proj.Detection.ReferenceAutoSync {
		return
	}
	lib := references.NewLibrary(r.cfg.ProjectRoot)
	pending, err := lib.NeedsSync()
	if err != nil || len(pending) == 0 {
		return
	}
	_, _ = r.SyncReferenceLibrary(ctx, false)
}

func (r *Runner) zhuqueConfig() detection.ZhuqueConfig {
	proj, _ := r.st.LoadProjectConfig()
	d := proj.Detection
	return detection.ZhuqueConfig{
		Enabled: d.Enabled, Region: d.Region, BizType: d.BizType,
		Threshold: d.Threshold, MaxChars: d.MaxCharsPerCall,
	}
}

// DetectChapterZhuque calls Tencent TMS (朱雀) for one chapter.
func (r *Runner) DetectChapterZhuque(ctx context.Context, bookID string, chapterNumber int) (detection.ZhuqueResult, error) {
	_, content, meta, err := r.loadChapterContent(bookID, chapterNumber)
	if err != nil {
		return detection.ZhuqueResult{}, err
	}
	client, err := detection.NewZhuqueClient(r.zhuqueConfig())
	if err != nil {
		return detection.ZhuqueResult{}, err
	}
	result, err := client.Detect(ctx, content)
	if err != nil {
		return detection.ZhuqueResult{}, err
	}
	_ = meta
	return result, nil
}

func (r *Runner) maybeZhuqueAntiDetect(ctx context.Context, book models.BookConfig, chNum int, content string, memo models.ChapterMemo) (string, bool, error) {
	proj, err := r.st.LoadProjectConfig()
	if err != nil || !proj.Detection.Enabled || !proj.Detection.AutoRevise {
		return content, false, nil
	}
	client, err := detection.NewZhuqueClient(r.zhuqueConfig())
	if err != nil {
		return content, false, nil
	}
	result, err := client.Detect(ctx, content)
	if err != nil {
		return content, false, err
	}
	if !result.HighRisk {
		return content, false, nil
	}
	r.emitZhuqueNote(result)
	reviserCtx, err := r.cfg.Router.ContextFor(agent.NameReviser, r.cfg.ProjectRoot, book.ID)
	if err != nil {
		return content, false, err
	}
	reviser := agents.NewReviserAgent(reviserCtx)
	before := agents.AITellScore(content, book.Language)
	issues := []agents.AuditIssue{{
		Severity: "critical", Category: "AI Tell",
		Description: result.Summary,
		Suggestion:  "Apply anti-detect spot-fix; reduce AI probability for Zhuque/TMS detector.",
	}}
	newContent, err := reviser.ReviseChapter(ctx, agents.ReviseChapterInput{
		Book: book, ChapterNumber: chNum, Content: content, Issues: issues,
		Mode: agents.ReviseModeAntiDetect, Memo: memo,
	})
	if err != nil {
		return content, false, err
	}
	after := agents.AITellScore(newContent, book.Language)
	if after < before {
		return content, false, nil
	}
	return newContent, true, nil
}

// DetectChapterFull runs local + optional Zhuque detection.
func (r *Runner) DetectChapterFull(ctx context.Context, bookID string, chapterNumber int) (agents.DetectChapterResult, *detection.ZhuqueResult, error) {
	local, err := r.DetectChapter(ctx, bookID, chapterNumber)
	if err != nil {
		return agents.DetectChapterResult{}, nil, err
	}
	proj, _ := r.st.LoadProjectConfig()
	if !proj.Detection.Enabled {
		return local, nil, nil
	}
	zr, err := r.DetectChapterZhuque(ctx, bookID, chapterNumber)
	if err != nil {
		return local, nil, err
	}
	return local, &zr, nil
}

func (r *Runner) emitZhuqueNote(result detection.ZhuqueResult) {
	if r.cfg.Events != nil {
		r.cfg.Events.Log(result.Summary, map[string]any{
			"level": "info", "provider": result.Provider,
			"aigcScore": result.AIGCScore, "suggestion": result.Suggestion,
		})
	}
}
