package pipeline

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/LingByte/CinyuVerse/pkg/story/agent"
	"github.com/LingByte/CinyuVerse/pkg/story/agents"
	"github.com/LingByte/CinyuVerse/pkg/story/events"
	"github.com/LingByte/CinyuVerse/pkg/story/hooks"
	"github.com/LingByte/CinyuVerse/pkg/story/models"
	"github.com/LingByte/CinyuVerse/pkg/story/store"
)

const (
	defaultPassScore        = 85
	defaultReviewIterations = 1
)

// Config drives the long-form chapter pipeline.
type Config struct {
	ProjectRoot             string
	Router                  agent.Router
	ReviewIterations        int
	ChapterReviewMode       string // "auto" | "manual"
	ExternalContext         string
	FoundationReviewRetries int
	Events                  *events.Hub
}

// Runner orchestrates plan → compose → write → audit → revise.
type Runner struct {
	cfg Config
	st  store.BookStore
}

func NewRunner(cfg Config, st store.BookStore) *Runner {
	if cfg.ReviewIterations <= 0 {
		cfg.ReviewIterations = defaultReviewIterations
	}
	if cfg.ChapterReviewMode == "" {
		cfg.ChapterReviewMode = "auto"
	}
	if st == nil {
		st = store.NewProjectStore(cfg.ProjectRoot)
	}
	return &Runner{
		cfg: cfg,
		st:  st,
	}
}

// InitBook creates a book with architect foundation and optional review.
func (r *Runner) InitBook(ctx context.Context, cfg models.BookConfig, brief string) error {
	return agents.InitBookWithOptions(ctx, r.st, r.cfg.Router, cfg, brief, agents.InitBookOptions{
		FoundationReviewRetries: r.cfg.FoundationReviewRetries,
	})
}

// ChapterPipelineResult is the outcome of WriteNextChapter.
type ChapterPipelineResult struct {
	ChapterNumber int                  `json:"chapterNumber"`
	Title         string               `json:"title"`
	Content       string               `json:"content"`
	WordCount     int                  `json:"wordCount"`
	Revised       bool                 `json:"revised"`
	Status        models.ChapterStatus `json:"status"`
	Audit         agents.AuditResult   `json:"audit"`
	ChapterMeta   models.ChapterMeta   `json:"chapterMeta"`
}

// WriteNextChapter executes the full governed pipeline for the next chapter.
func (r *Runner) WriteNextChapter(ctx context.Context, bookID string, wordCount int, guidance string) (ChapterPipelineResult, error) {
	r.emitWrite(bookID, 0, "start", "write-next started", nil)
	if err := r.st.EnsureControlDocuments(bookID, "", models.LanguageZH); err != nil {
		// title filled after load
	}
	book, err := r.st.LoadBookConfig(bookID)
	if err != nil {
		return ChapterPipelineResult{}, err
	}
	if err := r.st.EnsureControlDocuments(bookID, book.Title, book.Language); err != nil {
		return ChapterPipelineResult{}, err
	}
	chNum, err := r.st.NextChapterNumber(bookID)
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
		r.emitWrite(bookID, chNum, "error", err.Error(), nil)
		return ChapterPipelineResult{}, err
	}
	r.emitWrite(bookID, chNum, "plan", "plan+compose complete", nil)

	writerCtx, err := r.cfg.Router.ContextFor(agent.NameWriter, r.cfg.ProjectRoot, bookID)
	if err != nil {
		return ChapterPipelineResult{}, err
	}
	writer := agents.NewWriterAgent(writerCtx, r.st)
	writer.SetRouter(r.cfg.Router)
	writeOut, err := writer.WriteChapter(ctx, agents.WriteChapterInput{
		Book:            book,
		ChapterNumber:   chNum,
		Plan:            plan,
		Composed:        composed,
		ExternalContext: ext,
		TargetWords:     wordCount,
	})
	if err != nil {
		r.emitWrite(bookID, chNum, "error", err.Error(), nil)
		return ChapterPipelineResult{}, err
	}
	r.emitWrite(bookID, chNum, "draft", "writer draft complete", map[string]any{"title": writeOut.Title})
	content := writeOut.Content
	title := writeOut.Title
	revised := false
	audit := agents.AuditResult{
		Passed:  true,
		Summary: "manual mode: not audited",
	}

	if r.cfg.ChapterReviewMode != "manual" {
		content, title, revised, audit, err = r.runReviewCycle(ctx, book, chNum, title, content, composed, plan.Memo)
		if err != nil {
			r.emitWrite(bookID, chNum, "error", err.Error(), nil)
			return ChapterPipelineResult{}, err
		}
		r.emitWrite(bookID, chNum, "audit", "review cycle complete", map[string]any{"passed": audit.Passed, "revised": revised})
	}

	status := models.ChapterStatusReadyForReview
	if !audit.Passed && !audit.ParseFailed {
		status = models.ChapterStatusAuditFailed
	}

	meta := models.ChapterMeta{
		Number:    chNum,
		Title:     title,
		WordCount: agents.CountLength(content, book.Language),
		Status:    status,
		UpdatedAt: time.Now().UTC(),
	}
	if err := r.st.SaveChapter(bookID, meta, content); err != nil {
		return ChapterPipelineResult{}, err
	}

	if book.Status == models.BookStatusDraft {
		book.Status = models.BookStatusActive
		book.UpdatedAt = time.Now().UTC()
		_ = r.st.SaveBookConfig(book)
	}

	r.emitWrite(bookID, chNum, "complete", "chapter saved", map[string]any{
		"title": title, "status": status, "auditPassed": audit.Passed,
	})
	return ChapterPipelineResult{
		ChapterNumber: chNum,
		Title:         title,
		Content:       strings.TrimSpace(content),
		WordCount:     meta.WordCount,
		Revised:       revised,
		Status:        status,
		Audit:         audit,
		ChapterMeta:   meta,
	}, nil
}

func (r *Runner) prepareGovernedInput(ctx context.Context, book models.BookConfig, chNum int, ext string) (models.PlanChapterOutput, models.ComposeChapterOutput, error) {
	r.maybeSyncReferences(ctx)
	plannerCtx, err := r.cfg.Router.ContextFor(agent.NamePlanner, r.cfg.ProjectRoot, book.ID)
	if err != nil {
		return models.PlanChapterOutput{}, models.ComposeChapterOutput{}, err
	}
	planner := agents.NewPlannerAgent(plannerCtx, r.st)
	plan, err := planner.PlanChapter(ctx, agents.PlanChapterInput{
		Book:            book,
		ChapterNumber:   chNum,
		ExternalContext: ext + r.hookHealthContext(book, chNum),
	})
	if err != nil {
		return models.PlanChapterOutput{}, models.ComposeChapterOutput{}, err
	}
	composed, err := agents.ComposeChapterWithRouter(ctx, r.cfg.Router, r.cfg.ProjectRoot, agents.ComposeChapterInput{
		Store:           r.st,
		Book:            book,
		ChapterNumber:   chNum,
		Plan:            plan,
		ExternalContext: ext,
		Ctx:             ctx,
		Router:          r.cfg.Router,
	})
	return plan, composed, err
}

func (r *Runner) hookHealthContext(book models.BookConfig, chNum int) string {
	health := r.HookHealth(book.ID, chNum)
	w := hooks.FormatWarnings(health, book.Language)
	if w == "" {
		return ""
	}
	return "\n\n" + w
}

func (r *Runner) runReviewCycle(ctx context.Context, book models.BookConfig, chNum int, title, content string, composed models.ComposeChapterOutput, memo models.ChapterMemo) (string, string, bool, agents.AuditResult, error) {
	spec := agents.BuildLengthSpec(book.ChapterWordCount, book.Language)
	normCtx, err := r.cfg.Router.ContextFor(agent.NameLengthNormalizer, r.cfg.ProjectRoot, book.ID)
	if err == nil {
		normalizer := agents.NewLengthNormalizerAgent(normCtx)
		norm, nErr := normalizer.NormalizeChapter(ctx, agents.NormalizeLengthInput{
			Content: content, LengthSpec: spec, ChapterIntent: composed.IntentMarkdown, Language: book.Language,
		})
		if nErr == nil && norm.Applied {
			content = norm.Content
		}
	}

	auditorCtx, err := r.cfg.Router.ContextFor(agent.NameAuditor, r.cfg.ProjectRoot, book.ID)
	if err != nil {
		return content, title, false, agents.AuditResult{}, err
	}
	auditor := agents.NewContinuityAuditor(auditorCtx, r.st)
	reviserCtx, err := r.cfg.Router.ContextFor(agent.NameReviser, r.cfg.ProjectRoot, book.ID)
	if err != nil {
		return content, title, false, agents.AuditResult{}, err
	}
	reviser := agents.NewReviserAgent(reviserCtx)

	audit, err := auditor.AuditChapter(ctx, agents.AuditChapterInput{
		Book: book, ChapterNumber: chNum, Title: title, Content: content, Composed: composed, Memo: memo,
	})
	if err != nil {
		return content, title, false, agents.AuditResult{}, err
	}
	if auditPassed(audit, content, book.Language) {
		return content, title, false, audit, nil
	}
	if audit.ParseFailed {
		return content, title, false, audit, nil
	}

	revised := false
	lang := book.Language
	beforeScore := agents.AITellScore(content, lang)
	reviseMode := agents.ChooseReviseMode(audit.Issues)
	for i := 0; i < r.cfg.ReviewIterations; i++ {
		newContent, err := reviser.ReviseChapter(ctx, agents.ReviseChapterInput{
			Book: book, ChapterNumber: chNum, Content: content, Issues: audit.Issues, Memo: memo, Mode: reviseMode,
		})
		if err != nil {
			return content, title, revised, audit, err
		}
		if newContent == content {
			break
		}
		afterScore := agents.AITellScore(newContent, lang)
		if afterScore < beforeScore {
			// InkOS: discard revision if AI tells increased
			break
		}
		content = newContent
		beforeScore = afterScore
		revised = true
		audit, err = auditor.AuditChapter(ctx, agents.AuditChapterInput{
			Book: book, ChapterNumber: chNum, Title: title, Content: content, Composed: composed, Memo: memo,
		})
		if err != nil {
			return content, title, revised, audit, err
		}
		if auditPassed(audit, content, book.Language) {
			break
		}
	}
	newContent, zRev, zErr := r.maybeZhuqueAntiDetect(ctx, book, chNum, content, memo)
	if zErr == nil && zRev {
		content = newContent
		revised = true
		audit, err = auditor.AuditChapter(ctx, agents.AuditChapterInput{
			Book: book, ChapterNumber: chNum, Title: title, Content: content, Composed: composed, Memo: memo,
		})
		if err != nil {
			return content, title, revised, audit, err
		}
	}
	return content, title, revised, audit, nil
}

func auditPassed(audit agents.AuditResult, content string, lang models.Language) bool {
	if audit.ParseFailed {
		return false
	}
	if !audit.Passed {
		return false
	}
	score := audit.OverallScore
	if score <= 0 {
		score = 100
	}
	if score < defaultPassScore {
		return false
	}
	_ = agents.CountLength(content, lang)
	return true
}

// PlanChapter exposes planner only.
func (r *Runner) PlanChapter(ctx context.Context, bookID string, guidance string) (models.PlanChapterOutput, error) {
	book, err := r.st.LoadBookConfig(bookID)
	if err != nil {
		return models.PlanChapterOutput{}, err
	}
	chNum, err := r.st.NextChapterNumber(bookID)
	if err != nil {
		return models.PlanChapterOutput{}, err
	}
	plannerCtx, err := r.cfg.Router.ContextFor(agent.NamePlanner, r.cfg.ProjectRoot, bookID)
	if err != nil {
		return models.PlanChapterOutput{}, err
	}
	planner := agents.NewPlannerAgent(plannerCtx, r.st)
	return planner.PlanChapter(ctx, agents.PlanChapterInput{
		Book:            book,
		ChapterNumber:   chNum,
		ExternalContext: guidance,
	})
}

// ComposeChapter exposes composer only (requires existing plan on disk or guidance).
func (r *Runner) ComposeChapter(ctx context.Context, bookID string, guidance string) (models.ComposeChapterOutput, error) {
	book, err := r.st.LoadBookConfig(bookID)
	if err != nil {
		return models.ComposeChapterOutput{}, err
	}
	chNum, err := r.st.NextChapterNumber(bookID)
	if err != nil {
		return models.ComposeChapterOutput{}, err
	}
	plan, err := r.PlanChapter(ctx, bookID, guidance)
	if err != nil {
		return models.ComposeChapterOutput{}, fmt.Errorf("compose requires plan: %w", err)
	}
	return agents.ComposeChapterWithRouter(ctx, r.cfg.Router, r.cfg.ProjectRoot, agents.ComposeChapterInput{
		Store:           r.st,
		Book:            book,
		ChapterNumber:   chNum,
		Plan:            plan,
		ExternalContext: guidance,
		Ctx:             ctx,
		Router:          r.cfg.Router,
	})
}

// GenerateCover creates cover prompt artifacts (and image when API configured).
func (r *Runner) GenerateCover(ctx context.Context, in agents.CoverInput) (agents.CoverResult, error) {
	in.ProjectRoot = r.cfg.ProjectRoot
	return agents.GenerateCover(ctx, r.cfg.Router, in)
}

// DraftChapter writes draft only (no audit/revise).
func (r *Runner) DraftChapter(ctx context.Context, bookID string, wordCount int, guidance string) (agents.WriteChapterOutput, error) {
	book, err := r.st.LoadBookConfig(bookID)
	if err != nil {
		return agents.WriteChapterOutput{}, err
	}
	chNum, err := r.st.NextChapterNumber(bookID)
	if err != nil {
		return agents.WriteChapterOutput{}, err
	}
	plan, composed, err := r.prepareGovernedInput(ctx, book, chNum, guidance)
	if err != nil {
		return agents.WriteChapterOutput{}, err
	}
	writerCtx, err := r.cfg.Router.ContextFor(agent.NameWriter, r.cfg.ProjectRoot, bookID)
	if err != nil {
		return agents.WriteChapterOutput{}, err
	}
	writer := agents.NewWriterAgent(writerCtx, r.st)
	writer.SetRouter(r.cfg.Router)
	return writer.WriteChapter(ctx, agents.WriteChapterInput{
		Book: book, ChapterNumber: chNum, Plan: plan, Composed: composed,
		ExternalContext: guidance, TargetWords: wordCount,
	})
}

// AuditChapter audits an existing chapter by number.
func (r *Runner) AuditChapter(ctx context.Context, bookID string, chapterNumber int) (agents.AuditResult, error) {
	book, err := r.st.LoadBookConfig(bookID)
	if err != nil {
		return agents.AuditResult{}, err
	}
	if chapterNumber <= 0 {
		chapterNumber, err = r.st.NextChapterNumber(bookID)
		if err != nil || chapterNumber == 1 {
			return agents.AuditResult{}, fmt.Errorf("no chapter to audit")
		}
		chapterNumber--
	}
	index, err := r.st.LoadChapterIndex(bookID)
	if err != nil {
		return agents.AuditResult{}, err
	}
	var meta models.ChapterMeta
	for _, ch := range index {
		if ch.Number == chapterNumber {
			meta = ch
			break
		}
	}
	content, err := r.st.ReadText(bookID, "chapters/"+meta.FileName)
	if err != nil {
		return agents.AuditResult{}, err
	}
	auditorCtx, err := r.cfg.Router.ContextFor(agent.NameAuditor, r.cfg.ProjectRoot, bookID)
	if err != nil {
		return agents.AuditResult{}, err
	}
	return agents.NewContinuityAuditor(auditorCtx, r.st).AuditChapter(ctx, agents.AuditChapterInput{
		Book: book, ChapterNumber: chapterNumber, Title: meta.Title, Content: content,
	})
}

// ReviseChapterResult is the outcome of revising one chapter.
type ReviseChapterResult struct {
	ChapterNumber int                 `json:"chapterNumber"`
	Title         string              `json:"title"`
	FileName      string              `json:"fileName"`
	Saved         bool                `json:"saved"`
	Skipped       bool                `json:"skipped"`
	Message       string              `json:"message,omitempty"`
	Mode          string              `json:"mode"`
	WordCount     int                 `json:"wordCount"`
	AITellBefore  int                 `json:"aiTellBefore"`
	AITellAfter   int                 `json:"aiTellAfter"`
	IssuesBefore  []agents.AuditIssue `json:"issuesBefore"`
	IssuesAfter   []agents.AuditIssue `json:"issuesAfter"`
	StyleApplied  bool                `json:"styleApplied,omitempty"`
	Content       string              `json:"content,omitempty"`
}

// ReviseChapter revises using detect issues, or style-apply for reference imitation.
func (r *Runner) ReviseChapter(ctx context.Context, bookID string, chapterNumber int, mode agents.ReviseMode, dryRun bool, force bool) (ReviseChapterResult, error) {
	book, raw, meta, err := r.loadChapterContent(bookID, chapterNumber)
	if err != nil {
		return ReviseChapterResult{}, err
	}
	body := agents.StripChapterBody(raw)
	detectBefore := agents.DetectChapter(book, meta.Number, meta.Title, body)
	issuesBefore := agents.IssuesFromDetect(detectBefore)

	effectiveMode := mode
	styleCorpus := ""
	if mode == agents.ReviseModeStyleApply {
		corpus, err := agents.LoadCorpusForProject(r.cfg.ProjectRoot)
		if err != nil || strings.TrimSpace(corpus) == "" {
			return ReviseChapterResult{}, fmt.Errorf("style-apply: references/style_corpus.md 为空，请先 POST /api/v1/references/sync?force=true")
		}
		styleCorpus = corpus
		effectiveMode = agents.ReviseModeStyleApply
		issuesBefore = []agents.AuditIssue{{
			Severity: "warning", Category: "Style",
			Description: "正文未按 references 文笔库仿写（见 chapter-0001.rule-stack 无 reference_style 即未注入）",
			Suggestion:  "按 style_corpus 的原文摘录与句式模板重写句长、换行、对话节奏",
		}}
	} else {
		if effectiveMode == "" || effectiveMode == agents.ReviseModeAuto {
			effectiveMode = agents.ChooseReviseMode(issuesBefore)
		}
		if mode == agents.ReviseModeAntiDetect && detectBefore.AITells.Score >= 95 && len(detectBefore.AITells.Issues) == 0 {
			effectiveMode = agents.ReviseModeSpotFix
		}
	}

	wordCount := agents.CountLength(body, book.Language)
	base := ReviseChapterResult{
		ChapterNumber: chapterNumber,
		Title:         meta.Title,
		FileName:      meta.FileName,
		Mode:          string(effectiveMode),
		WordCount:     wordCount,
		AITellBefore:  detectBefore.AITells.Score,
		IssuesBefore:  issuesBefore,
		Content:       body,
		StyleApplied:  mode == agents.ReviseModeStyleApply,
	}

	if len(issuesBefore) == 0 && !force && mode != agents.ReviseModeStyleApply {
		base.Skipped = true
		base.Message = "detect 未发现需修复项，已跳过 revise（AI tell 已达标）。仿写请用 mode=style-apply"
		base.AITellAfter = detectBefore.AITells.Score
		return base, nil
	}

	memo := models.ChapterMemo{}
	intentPath := fmt.Sprintf("story/runtime/chapter-%04d.intent.md", chapterNumber)
	if planRaw, err := r.st.ReadText(bookID, intentPath); err == nil {
		if m, err := agents.ParseChapterMemo(planRaw, book.Language); err == nil {
			memo = m
		}
	}

	reviserCtx, err := r.cfg.Router.ContextFor(agent.NameReviser, r.cfg.ProjectRoot, bookID)
	if err != nil {
		return ReviseChapterResult{}, err
	}
	revised, err := agents.NewReviserAgent(reviserCtx).ReviseChapter(ctx, agents.ReviseChapterInput{
		Book: book, ChapterNumber: chapterNumber, Content: body, Issues: issuesBefore,
		Mode: effectiveMode, Memo: memo, StyleCorpus: styleCorpus,
	})
	if err != nil {
		return ReviseChapterResult{}, err
	}

	detectAfter := agents.DetectChapter(book, meta.Number, meta.Title, revised)
	issuesAfter := agents.IssuesFromDetect(detectAfter)

	result := base
	result.WordCount = agents.CountLength(revised, book.Language)
	result.AITellAfter = detectAfter.AITells.Score
	result.IssuesAfter = issuesAfter
	result.Content = revised
	if len(issuesAfter) == 0 {
		result.Message = "修订完成，detect 问题已清零"
	} else {
		result.Message = fmt.Sprintf("修订完成，仍有 %d 项 detect 问题", len(issuesAfter))
	}

	if dryRun {
		return result, nil
	}
	meta.WordCount = result.WordCount
	meta.UpdatedAt = time.Now().UTC()
	if err := r.st.SaveChapter(bookID, meta, revised); err != nil {
		return ReviseChapterResult{}, err
	}
	result.Saved = true
	return result, nil
}

// ImportChapters imports existing chapters and replays analyzer.
func (r *Runner) ImportChapters(ctx context.Context, bookID string, chapters []agents.ImportChapterMeta) (agents.ImportChaptersResult, error) {
	return agents.ImportChapters(ctx, r.st, r.cfg.Router, r.cfg.ProjectRoot, agents.ImportChaptersInput{
		BookID: bookID, Chapters: chapters,
	})
}

// InitFanficBook creates a fanfic project.
func (r *Runner) InitFanficBook(ctx context.Context, cfg models.BookConfig, sourceText, sourceName string, mode models.FanficMode) error {
	return agents.InitFanficBook(ctx, r.st, r.cfg.Router, cfg, sourceText, sourceName, mode)
}

// RunShortFiction generates a standalone short-fiction package.
func (r *Runner) RunShortFiction(ctx context.Context, in agents.ShortFictionRunInput) (models.ShortFictionResult, error) {
	return agents.NewShortFictionRunner(r.cfg.ProjectRoot, r.cfg.Router).Run(ctx, in)
}

// PlayStart starts an interactive world session.
func (r *Runner) PlayStart(ctx context.Context, in agents.PlayStartInput) (models.PlayWorld, error) {
	return agents.NewPlayRunner(r.cfg.ProjectRoot, r.cfg.Router).Start(ctx, in)
}

// PlayStep advances interactive play.
func (r *Runner) PlayStep(ctx context.Context, in agents.PlayStepInput) (models.PlayWorld, error) {
	return agents.NewPlayRunner(r.cfg.ProjectRoot, r.cfg.Router).Step(ctx, in)
}

// PlayRevise revises the last play turn.
func (r *Runner) PlayRevise(ctx context.Context, in agents.PlayReviseInput) (models.PlayWorld, error) {
	return agents.NewPlayRunner(r.cfg.ProjectRoot, r.cfg.Router).Revise(ctx, in)
}

// PlayEdit patches play world contracts.
func (r *Runner) PlayEdit(in agents.PlayEditInput) (models.PlayWorld, error) {
	return agents.NewPlayRunner(r.cfg.ProjectRoot, r.cfg.Router).Edit(in)
}

// ConsolidateSummaries merges chapter summaries.
func (r *Runner) ConsolidateSummaries(ctx context.Context, bookID string) (string, error) {
	book, err := r.st.LoadBookConfig(bookID)
	if err != nil {
		return "", err
	}
	ctxAgent, err := r.cfg.Router.ContextFor(agent.NameConsolidator, r.cfg.ProjectRoot, bookID)
	if err != nil {
		return "", err
	}
	return agents.NewConsolidatorAgent(ctxAgent, r.st).ConsolidateSummaries(ctx, bookID, book.Language)
}

// RadarScan analyzes platform context for trends.
func (r *Runner) RadarScan(ctx context.Context, platformContext string, lang models.Language) (agents.RadarResult, error) {
	ctxAgent, err := r.cfg.Router.ContextFor(agent.NameRadar, r.cfg.ProjectRoot, "")
	if err != nil {
		return agents.RadarResult{}, err
	}
	return agents.NewRadarAgent(ctxAgent).ScanTrends(ctx, platformContext, lang)
}

// PolishChapter runs polisher agent on content.
func (r *Runner) PolishChapter(ctx context.Context, bookID, content string) (string, error) {
	book, err := r.st.LoadBookConfig(bookID)
	if err != nil {
		return "", err
	}
	ctxAgent, err := r.cfg.Router.ContextFor(agent.NamePolisher, r.cfg.ProjectRoot, bookID)
	if err != nil {
		return "", err
	}
	return agents.NewPolisherAgent(ctxAgent).PolishChapter(ctx, agents.PolishChapterInput{
		Content: content, Language: book.Language,
	})
}

// ReadTruthFile reads a file under the book story directory.
func (r *Runner) ReadTruthFile(bookID, relPath string) (string, error) {
	return r.st.ReadText(bookID, relPath)
}

// UpdateCurrentFocus rewrites current_focus.md.
func (r *Runner) UpdateCurrentFocus(bookID, content string) error {
	return r.st.WriteText(bookID, "story/current_focus.md", content)
}

// UpdateAuthorIntent rewrites author_intent.md.
func (r *Runner) UpdateAuthorIntent(bookID, content string) error {
	return r.st.WriteText(bookID, "story/author_intent.md", content)
}

// ListAgents returns registered agent descriptors.
func (r *Runner) ListAgents() []agents.Descriptor {
	return agents.All()
}

// EventsHub returns the configured event hub (may be nil).
func (r *Runner) EventsHub() *events.Hub {
	return r.cfg.Events
}

func (r *Runner) emitWrite(bookID string, chapter int, stage, msg string, data map[string]any) {
	if r.cfg.Events != nil {
		r.cfg.Events.Write(stage, bookID, chapter, msg, data)
	}
}

// ReviseFoundation revises book foundation documents from feedback.
func (r *Runner) ReviseFoundation(ctx context.Context, bookID, feedback string) error {
	if r.cfg.Events != nil {
		r.cfg.Events.Agent(string(agent.NameFoundationReviser), bookID, "revise foundation", nil)
	}
	return agents.ReviseFoundationForBook(ctx, r.st, r.cfg.Router, bookID, feedback)
}

// DetectChapter runs deterministic AI-tell and sensitive word detection.
func (r *Runner) DetectChapter(ctx context.Context, bookID string, chapterNumber int) (agents.DetectChapterResult, error) {
	book, content, meta, err := r.loadChapterContent(bookID, chapterNumber)
	if err != nil {
		return agents.DetectChapterResult{}, err
	}
	body := agents.StripChapterBody(content)
	return agents.DetectChapter(book, meta.Number, meta.Title, body), nil
}

// DetectAllChapters scans all chapters for AI tells.
func (r *Runner) DetectAllChapters(ctx context.Context, bookID string) ([]agents.DetectChapterResult, error) {
	book, err := r.st.LoadBookConfig(bookID)
	if err != nil {
		return nil, err
	}
	index, err := r.st.LoadChapterIndex(bookID)
	if err != nil {
		return nil, err
	}
	var out []agents.DetectChapterResult
	for _, ch := range index {
		content, err := r.st.ReadText(bookID, "chapters/"+ch.FileName)
		if err != nil {
			continue
		}
		out = append(out, agents.DetectChapter(book, ch.Number, ch.Title, agents.StripChapterBody(content)))
	}
	return out, nil
}

// ImportStyle analyzes reference text and saves style_profile.json.
func (r *Runner) ImportStyle(ctx context.Context, bookID, referenceText, sourceName string) (agents.StyleProfile, error) {
	book, err := r.st.LoadBookConfig(bookID)
	if err != nil {
		return agents.StyleProfile{}, err
	}
	profile := agents.AnalyzeStyle(referenceText, sourceName, book.Language)
	_ = r.st.WriteJSON(bookID, "story/style_profile.json", profile)
	return profile, nil
}

// InitSpinoff creates a spinoff book from a source book.
func (r *Runner) InitSpinoff(ctx context.Context, sourceBookID string, cfg models.BookConfig, direction string) error {
	source, err := r.st.LoadBookConfig(sourceBookID)
	if err != nil {
		return err
	}
	ctxAgent, err := r.cfg.Router.ContextFor(agent.NameSpinoffArchitect, r.cfg.ProjectRoot, cfg.ID)
	if err != nil {
		return err
	}
	out, err := agents.NewSpinoffArchitectAgent(ctxAgent).GenerateSpinoffFoundation(ctx, r.st, agents.SpinoffInput{
		SourceBook: source, Direction: direction, NewTitle: cfg.Title,
	})
	if err != nil {
		return err
	}
	if err := r.st.SaveBookConfig(cfg); err != nil {
		return err
	}
	_ = r.st.EnsureControlDocuments(cfg.ID, cfg.Title, cfg.Language)
	return agents.WriteFoundationFiles(r.st, cfg.ID, out, cfg.Language)
}

// InitImitation creates a book foundation from style reference.
func (r *Runner) InitImitation(ctx context.Context, cfg models.BookConfig, referenceText string) error {
	profile := agents.AnalyzeStyle(referenceText, cfg.Title, cfg.Language)
	ctxAgent, err := r.cfg.Router.ContextFor(agent.NameImitationArchitect, r.cfg.ProjectRoot, cfg.ID)
	if err != nil {
		return err
	}
	out, err := agents.NewImitationArchitectAgent(ctxAgent).GenerateImitationFoundation(ctx, agents.ImitationInput{
		Book: cfg, Reference: referenceText, Profile: profile,
	})
	if err != nil {
		return err
	}
	if err := r.st.SaveBookConfig(cfg); err != nil {
		return err
	}
	_ = r.st.EnsureControlDocuments(cfg.ID, cfg.Title, cfg.Language)
	_ = r.st.WriteJSON(cfg.ID, "story/style_profile.json", profile)
	return agents.WriteFoundationFiles(r.st, cfg.ID, out, cfg.Language)
}

// ApproveChapter marks a chapter as approved.
func (r *Runner) ApproveChapter(bookID string, chapterNumber int) error {
	return r.setChapterStatus(bookID, chapterNumber, models.ChapterStatusApproved)
}

// RejectChapter rolls back runtime state and removes the chapter.
func (r *Runner) RejectChapter(bookID string, chapterNumber int) error {
	return r.RejectChapterWithRollback(bookID, chapterNumber)
}

func (r *Runner) setChapterStatus(bookID string, chapterNumber int, status models.ChapterStatus) error {
	index, err := r.st.LoadChapterIndex(bookID)
	if err != nil {
		return err
	}
	for i, ch := range index {
		if ch.Number == chapterNumber {
			index[i].Status = status
			index[i].UpdatedAt = time.Now().UTC()
			return r.st.SaveChapterIndex(bookID, index)
		}
	}
	return fmt.Errorf("chapter %d not found", chapterNumber)
}

func (r *Runner) loadChapterContent(bookID string, chapterNumber int) (models.BookConfig, string, models.ChapterMeta, error) {
	book, err := r.st.LoadBookConfig(bookID)
	if err != nil {
		return models.BookConfig{}, "", models.ChapterMeta{}, err
	}
	if chapterNumber <= 0 {
		chapterNumber, err = r.st.NextChapterNumber(bookID)
		if err != nil || chapterNumber == 1 {
			return book, "", models.ChapterMeta{}, fmt.Errorf("no chapter")
		}
		chapterNumber--
	}
	index, err := r.st.LoadChapterIndex(bookID)
	if err != nil {
		return book, "", models.ChapterMeta{}, err
	}
	var meta models.ChapterMeta
	for _, ch := range index {
		if ch.Number == chapterNumber {
			meta = ch
			break
		}
	}
	content, err := r.st.ReadText(bookID, "chapters/"+meta.FileName)
	return book, content, meta, err
}
