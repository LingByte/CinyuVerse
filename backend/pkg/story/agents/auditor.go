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

// ContinuityAuditor performs LLM quality/continuity audit.
type ContinuityAuditor struct {
	ctx agent.Context
	st  *store.ProjectStore
}

func NewContinuityAuditor(ctx agent.Context, st *store.ProjectStore) *ContinuityAuditor {
	return &ContinuityAuditor{ctx: ctx, st: st}
}

type AuditChapterInput struct {
	Book          models.BookConfig
	ChapterNumber int
	Title         string
	Content       string
	Composed      models.ComposeChapterOutput
	Memo          models.ChapterMemo
}

// AuditChapter returns structured audit result with deterministic checks merged.
func (a *ContinuityAuditor) AuditChapter(ctx context.Context, in AuditChapterInput) (AuditResult, error) {
	lang := in.Book.Language
	if lang == "" {
		lang = models.LanguageZH
	}
	var b strings.Builder
	if lang == models.LanguageEN {
		fmt.Fprintf(&b, "Audit chapter %d (%s).\n\n", in.ChapterNumber, in.Title)
	} else {
		fmt.Fprintf(&b, "审计第%d章（%s）。\n\n", in.ChapterNumber, in.Title)
	}
	appendCtx := func(label, path string) {
		c := strings.TrimSpace(a.st.ReadTextOrDefault(in.Book.ID, path, ""))
		if c != "" {
			fmt.Fprintf(&b, "--- %s ---\n%s\n\n", label, c)
		}
	}
	appendCtx("current_state", "story/current_state.md")
	appendCtx("pending_hooks", "story/pending_hooks.md")
	appendCtx("book_rules", "story/book_rules.md")
	if in.Memo.RawMarkdown != "" {
		fmt.Fprintf(&b, "--- chapter_memo ---\n%s\n\n", in.Memo.RawMarkdown)
	}
	b.WriteString("--- draft ---\n")
	b.WriteString(in.Content)

	resp, err := a.ctx.Chat(ctx, []protocol.Message{
		protocol.SystemMessage(auditorSystemPrompt(lang)),
		protocol.UserMessage(b.String()),
	}, 0.3)
	if err != nil {
		return AuditResult{}, err
	}
	result, err := ParseAuditResult(resp.FirstContent())
	if err != nil {
		result.ParseFailed = true
	}
	// Merge deterministic checks (zero LLM cost)
	ai := AnalyzeAITells(in.Content, lang)
	sensitive := AnalyzeSensitiveWords(in.Content, nil, lang)
	post := ValidatePostWrite(in.Content, lang)
	for _, i := range ai.Issues {
		result.Issues = append(result.Issues, AuditIssue{
			Severity: i.Severity, Category: i.Category,
			Description: i.Description, Suggestion: i.Suggestion,
		})
	}
	result.Issues = append(result.Issues, sensitive.Issues...)
	result.Issues = append(result.Issues, ViolationsToAuditIssues(post)...)
	if len(sensitive.Found) > 0 {
		result.Passed = false
	}
	for _, v := range post {
		if v.Severity == "error" {
			result.Passed = false
		}
	}
	return result, nil
}
