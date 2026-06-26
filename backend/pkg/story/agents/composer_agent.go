package agents

import (
	"context"
	"fmt"
	"strings"

	"github.com/LingByte/CinyuVerse/pkg/protocol"
	"github.com/LingByte/CinyuVerse/pkg/story/agent"
	"github.com/LingByte/CinyuVerse/pkg/story/models"
)

// ComposerAgent assembles governed context; may call LLM to compress over-budget entries.
type ComposerAgent struct {
	ctx agent.Context
}

func NewComposerAgent(ctx agent.Context) *ComposerAgent {
	return &ComposerAgent{ctx: ctx}
}

// ContextBudget limits input tokens for composition.
type ContextBudget struct {
	ContextWindowTokens  int
	ReservedOutputTokens int
}

// ComposeGovernedChapter is the full composer entry with optional LLM compression.
func (c *ComposerAgent) ComposeGovernedChapter(ctx context.Context, in ComposeChapterInput) (models.ComposeChapterOutput, error) {
	out, err := ComposeChapter(in)
	if err != nil {
		return out, err
	}
	budget := ContextBudget{ContextWindowTokens: 128000, ReservedOutputTokens: 8192}
	if c.ctx.MaxTokens > 0 {
		budget.ReservedOutputTokens = c.ctx.MaxTokens
	}
	total := estimatePackageTokens(out.ContextPackage)
	available := budget.ContextWindowTokens - budget.ReservedOutputTokens
	if total <= available {
		return out, nil
	}
	compressed, notes, err := c.compressContext(ctx, out.ContextPackage, in.Book.Language, available)
	if err != nil {
		return out, nil
	}
	out.ContextPackage = compressed
	out.Trace.ComposerNotes = append(out.Trace.ComposerNotes, notes...)
	_ = in.Store.WriteJSON(in.Book.ID, out.ContextPath, out.ContextPackage)
	return out, nil
}

func estimatePackageTokens(pkg models.ContextPackage) int {
	n := 0
	for _, e := range pkg.SelectedContext {
		if e.Tokens > 0 {
			n += e.Tokens
		} else {
			n += estimateTokens(e.Content)
		}
	}
	return n
}

func (c *ComposerAgent) compressContext(ctx context.Context, pkg models.ContextPackage, lang models.Language, budget int) (models.ContextPackage, []string, error) {
	var protected, compressible []models.ContextEntry
	for _, e := range pkg.SelectedContext {
		if models.ProtectedContextSources[e.Source] {
			protected = append(protected, e)
		} else {
			compressible = append(compressible, e)
		}
	}
	protTokens := 0
	for _, e := range protected {
		protTokens += estimateTokens(e.Content)
	}
	if protTokens > budget {
		return pkg, nil, fmt.Errorf("protected context exceeds budget (%d/%d)", protTokens, budget)
	}
	if len(compressible) == 0 {
		return pkg, []string{"over-budget-no-compressible"}, nil
	}
	var b strings.Builder
	for _, e := range compressible {
		fmt.Fprintf(&b, "### %s\n%s\n\n", e.Heading, e.Content)
	}
	sys := "Summarize the following context for chapter writing. Keep facts, hook IDs, character names. Output markdown only."
	if lang == models.LanguageZH {
		sys = "为章节写作压缩以下上下文，保留事实、伏笔 ID、角色名。只输出 Markdown。"
	}
	resp, err := c.ctx.Chat(ctx, []protocol.Message{
		protocol.SystemMessage(sys),
		protocol.UserMessage(b.String()),
	}, 0.2)
	if err != nil {
		return pkg, nil, err
	}
	compressed := models.ContextPackage{
		Chapter: pkg.Chapter,
		SelectedContext: append(protected, models.ContextEntry{
			Source: models.ContextChapterSummary, Heading: "compressed_context",
			Content: resp.FirstContent(), Tokens: estimateTokens(resp.FirstContent()),
		}),
	}
	return compressed, []string{"llm-context-compression"}, nil
}

// ComposeChapterWithRouter uses ComposerAgent when router provides composer context.
func ComposeChapterWithRouter(ctx context.Context, router agent.Router, projectRoot string, in ComposeChapterInput) (models.ComposeChapterOutput, error) {
	composerCtx, err := router.ContextFor(agent.NameComposer, projectRoot, in.Book.ID)
	if err != nil {
		return ComposeChapter(in)
	}
	return NewComposerAgent(composerCtx).ComposeGovernedChapter(ctx, in)
}
