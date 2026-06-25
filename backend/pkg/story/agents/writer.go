package agents

import (
	"context"
	"fmt"
	"strings"

	"github.com/LingByte/CinyuVerse/pkg/protocol"
	"github.com/LingByte/CinyuVerse/pkg/story/agent"
	"github.com/LingByte/CinyuVerse/pkg/story/memory"
	"github.com/LingByte/CinyuVerse/pkg/story/models"
	"github.com/LingByte/CinyuVerse/pkg/story/state"
	"github.com/LingByte/CinyuVerse/pkg/story/store"
)

// WriterAgent generates chapter prose and settles runtime state.
type WriterAgent struct {
	ctx    agent.Context
	router agent.Router
	st     *store.ProjectStore
}

func NewWriterAgent(ctx agent.Context, st *store.ProjectStore) *WriterAgent {
	return &WriterAgent{ctx: ctx, st: st}
}

// SetRouter enables per-agent routing for settlement validators.
func (w *WriterAgent) SetRouter(r agent.Router) {
	w.router = r
}

type WriteChapterInput struct {
	Book            models.BookConfig
	ChapterNumber   int
	Plan            models.PlanChapterOutput
	Composed        models.ComposeChapterOutput
	ExternalContext string
	Temperature     float32
	TargetWords     int
}

// WriteChapterOutput is the full write + settle result.
type WriteChapterOutput struct {
	ChapterNumber int
	Title         string
	Content       string
	WordCount     int
	Delta         models.RuntimeStateDelta
	Snapshot      models.RuntimeStateSnapshot
}

// WriteChapter runs creative writing then state settlement.
func (w *WriterAgent) WriteChapter(ctx context.Context, in WriteChapterInput) (WriteChapterOutput, error) {
	lang := in.Book.Language
	if lang == "" {
		lang = models.LanguageZH
	}
	temp := in.Temperature
	if temp <= 0 {
		temp = 0.7
	}
	target := in.TargetWords
	if target <= 0 {
		target = in.Book.ChapterWordCount
	}
	contextBlock := FormatContextPackageForPrompt(in.Composed.ContextPackage, in.Plan.Memo, in.Composed.RuleStack)
	userPrompt := buildWriterUserPrompt(in, lang, target, contextBlock)
	resp, err := w.ctx.Chat(ctx, []protocol.Message{
		protocol.SystemMessage(writerCreativeSystemPrompt(lang)),
		protocol.UserMessage(userPrompt),
	}, temp)
	if err != nil {
		return WriteChapterOutput{}, err
	}
	title, body, err := ParseWriterOutput(resp.FirstContent())
	if err != nil {
		return WriteChapterOutput{}, err
	}
	if strings.TrimSpace(body) == "" {
		return WriteChapterOutput{}, fmt.Errorf("writer returned empty body")
	}

	delta, snap, err := w.settleChapterState(ctx, in, lang, title, body)
	if err != nil {
		return WriteChapterOutput{}, err
	}

	return WriteChapterOutput{
		ChapterNumber: in.ChapterNumber,
		Title:         title,
		Content:       body,
		WordCount:     CountLength(body, lang),
		Delta:         delta,
		Snapshot:      snap,
	}, nil
}

func buildWriterUserPrompt(in WriteChapterInput, lang models.Language, target int, contextBlock string) string {
	var b strings.Builder
	if lang == models.LanguageEN {
		fmt.Fprintf(&b, "Write chapter %d for %q.\nTarget length: ~%d words.\n\n", in.ChapterNumber, in.Book.Title, target)
	} else {
		fmt.Fprintf(&b, "为《%s》撰写第%d章。\n目标字数：约%d字。\n\n", in.Book.Title, in.ChapterNumber, target)
	}
	b.WriteString(contextBlock)
	b.WriteString("\n\n")
	b.WriteString(FormatCraftRulesBlock(lang, in.Book.Genre))
	return b.String()
}

func (w *WriterAgent) settleChapterState(ctx context.Context, in WriteChapterInput, lang models.Language, title, body string) (models.RuntimeStateDelta, models.RuntimeStateSnapshot, error) {
	snap, err := w.st.LoadRuntimeSnapshot(in.Book.ID, lang)
	if err != nil {
		return models.RuntimeStateDelta{}, models.RuntimeStateSnapshot{}, err
	}
	observerUser := fmt.Sprintf("Chapter %d — %s\n\n%s", in.ChapterNumber, title, body)
	obsCtx := w.ctxFor(agent.NameObserver, in.Book.ID)
	obsResp, err := obsCtx.Chat(ctx, []protocol.Message{
		protocol.SystemMessage(observerSystemPrompt(lang)),
		protocol.UserMessage(observerUser),
	}, 0.5)
	if err != nil {
		return models.RuntimeStateDelta{}, models.RuntimeStateSnapshot{}, err
	}
	observerNotes := obsResp.FirstContent()

	reflectorUser := fmt.Sprintf("Observer notes:\n%s\n\nChapter %d title=%q\n\nProse excerpt (first 4000 chars):\n%s",
		observerNotes, in.ChapterNumber, title, truncate(body, 4000))
	refCtx := w.ctxFor(agent.NameReflector, in.Book.ID)
	refResp, err := refCtx.Chat(ctx, []protocol.Message{
		protocol.SystemMessage(reflectorSystemPrompt(lang)),
		protocol.UserMessage(reflectorUser),
	}, 0.3)
	if err != nil {
		return models.RuntimeStateDelta{}, models.RuntimeStateSnapshot{}, err
	}
	delta, err := ParseRuntimeStateDelta(refResp.FirstContent())
	if err != nil {
		// Minimal deterministic delta fallback
		delta = models.RuntimeStateDelta{
			ChapterNumber: in.ChapterNumber,
			ChapterSummary: &models.ChapterSummaryRow{
				Chapter: in.ChapterNumber,
				Title:   title,
				Summary: truncate(body, 280),
			},
		}
	}
	if delta.ChapterNumber == 0 {
		delta.ChapterNumber = in.ChapterNumber
	}
	if delta.ChapterSummary == nil {
		delta.ChapterSummary = &models.ChapterSummaryRow{
			Chapter: in.ChapterNumber,
			Title:   title,
			Summary: truncate(body, 280),
		}
	}
	validatorCtx := w.ctx
	if w.router.DefaultClient != nil {
		if vc, err := w.router.ContextFor(agent.NameStateValidator, w.ctx.ProjectRoot, in.Book.ID); err == nil {
			validatorCtx = vc
		}
	}
	validator := NewStateValidatorAgent(validatorCtx)
	if issues, vErr := validator.ValidateDelta(ctx, delta, snap, lang); vErr == nil && HasCritical(issues) {
		return models.RuntimeStateDelta{}, models.RuntimeStateSnapshot{}, fmt.Errorf("state validator rejected delta: %v", issues)
	}
	newSnap, err := state.ApplyDelta(snap, delta)
	if err != nil {
		return models.RuntimeStateDelta{}, models.RuntimeStateSnapshot{}, err
	}
	if err := w.st.SaveRuntimeSnapshot(in.Book.ID, newSnap); err != nil {
		return models.RuntimeStateDelta{}, models.RuntimeStateSnapshot{}, err
	}
	_ = memory.SyncFromSnapshot(w.st, in.Book.ID, newSnap)
	return delta, newSnap, nil
}

func (w *WriterAgent) ctxFor(name agent.Name, bookID string) agent.Context {
	if w.router.DefaultClient != nil {
		if c, err := w.router.ContextFor(name, w.ctx.ProjectRoot, bookID); err == nil {
			return c
		}
	}
	return w.ctx
}

func truncate(s string, n int) string {
	runes := []rune(s)
	if len(runes) <= n {
		return s
	}
	return string(runes[:n]) + "…"
}
