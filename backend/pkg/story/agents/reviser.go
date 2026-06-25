package agents

import (
	"context"
	"fmt"
	"strings"

	"github.com/LingByte/CinyuVerse/pkg/protocol"
	"github.com/LingByte/CinyuVerse/pkg/story/agent"
	"github.com/LingByte/CinyuVerse/pkg/story/models"
	"github.com/LingByte/CinyuVerse/pkg/story/references"
)

// ReviseMode controls how aggressively the reviser edits.
type ReviseMode string

const (
	ReviseModeAuto       ReviseMode = "auto"
	ReviseModePolish     ReviseMode = "polish"
	ReviseModeSpotFix    ReviseMode = "spot-fix"
	ReviseModeRewrite    ReviseMode = "rewrite"
	ReviseModeRework     ReviseMode = "rework"
	ReviseModeAntiDetect ReviseMode = "anti-detect"
	ReviseModeStyleApply ReviseMode = "style-apply"
)

// ReviserAgent fixes issues found by the auditor.
type ReviserAgent struct {
	ctx agent.Context
}

func NewReviserAgent(ctx agent.Context) *ReviserAgent {
	return &ReviserAgent{ctx: ctx}
}

type ReviseChapterInput struct {
	Book          models.BookConfig
	ChapterNumber int
	Content       string
	Issues        []AuditIssue
	Mode          ReviseMode
	Memo          models.ChapterMemo
	StyleCorpus   string // reference style_corpus.md for style-apply mode
}

// ReviseChapter returns revised prose.
func (r *ReviserAgent) ReviseChapter(ctx context.Context, in ReviseChapterInput) (string, error) {
	lang := in.Book.Language
	if lang == "" {
		lang = models.LanguageZH
	}
	mode := in.Mode
	if mode == "" {
		mode = ReviseModeAuto
	}
	if mode == ReviseModeStyleApply && len([]rune(in.Content)) > 900 {
		return r.reviseStyleApplyChunked(ctx, in, lang)
	}
	return r.reviseChapterOnce(ctx, in, lang, mode, in.Content)
}

func (r *ReviserAgent) reviseChapterOnce(ctx context.Context, in ReviseChapterInput, lang models.Language, mode ReviseMode, body string) (string, error) {
	userPrompt := buildReviseUserPrompt(in, lang, mode, body)
	maxTokens := reviserMaxTokens(body, mode)
	sys := reviseSystemForMode(lang, mode)
	revised, err := r.chatReviseWithContinue(ctx, sys, userPrompt, body, maxTokens, reviseTemperature(mode), mode)
	if err != nil {
		return "", err
	}
	if revised == "" {
		return in.Content, nil
	}
	if mode == ReviseModeStyleApply {
		revised = NormalizeStyleParagraphs(revised)
		if err := validateStyleApplyOutput(body, revised); err != nil {
			return "", err
		}
	}
	return revised, nil
}

func (r *ReviserAgent) reviseStyleApplyChunked(ctx context.Context, in ReviseChapterInput, lang models.Language) (string, error) {
	chunks := splitRevisionChunks(in.Content, 650)
	if len(chunks) <= 1 {
		return r.reviseChapterOnce(ctx, in, lang, ReviseModeStyleApply, in.Content)
	}
	var parts []string
	for i, chunk := range chunks {
		chunkIn := in
		chunkIn.Content = chunk
		prompt := buildReviseUserPrompt(chunkIn, lang, ReviseModeStyleApply, chunk)
		if lang == models.LanguageEN {
			prompt += fmt.Sprintf("\n\n[Section %d/%d of chapter — output ONLY this section, fully revised.]\n", i+1, len(chunks))
		} else {
			prompt += fmt.Sprintf("\n\n【本章第 %d/%d 段 — 只输出这一段的仿写结果，要完整】\n", i+1, len(chunks))
		}
		part, err := r.chatReviseWithContinue(ctx, StyleApplyReviserPrompt(lang), prompt, chunk,
			reviserMaxTokens(chunk, ReviseModeStyleApply), reviseTemperature(ReviseModeStyleApply), ReviseModeStyleApply)
		if err != nil {
			return "", fmt.Errorf("style-apply chunk %d/%d: %w", i+1, len(chunks), err)
		}
		parts = append(parts, strings.TrimSpace(part))
	}
	merged := strings.Join(parts, "\n\n")
	merged = NormalizeStyleParagraphs(merged)
	if err := validateStyleApplyOutput(in.Content, merged); err != nil {
		return "", err
	}
	if err := validateRevisedLength(in.Content, merged, ReviseModeStyleApply); err != nil {
		return "", err
	}
	return merged, nil
}

func buildReviseUserPrompt(in ReviseChapterInput, lang models.Language, mode ReviseMode, body string) string {
	var b strings.Builder
	if lang == models.LanguageEN {
		fmt.Fprintf(&b, "Revise chapter %d (mode=%s).\n\nIssues:\n", in.ChapterNumber, mode)
	} else {
		fmt.Fprintf(&b, "修订第%d章（模式=%s）。\n\n问题：\n", in.ChapterNumber, mode)
	}
	for _, issue := range in.Issues {
		if issue.Severity != "critical" && issue.Severity != "warning" {
			continue
		}
		fmt.Fprintf(&b, "- [%s] %s: %s → %s\n", issue.Severity, issue.Category, issue.Description, issue.Suggestion)
	}
	if in.Memo.Goal != "" {
		fmt.Fprintf(&b, "\nMemo goal: %s\n", in.Memo.Goal)
	}
	if strings.TrimSpace(in.StyleCorpus) != "" {
		b.WriteString("\n--- Reference Style Playbook (MUST follow) ---\n")
		b.WriteString(references.FormatCorpusSection(in.StyleCorpus))
		b.WriteString("\n")
	}
	if len(in.Issues) == 0 {
		if lang == models.LanguageEN {
			b.WriteString("\nNo detect issues listed — make minimal polish only.\n")
		} else {
			b.WriteString("\n未检测到需修复项 — 仅做必要微调。\n")
		}
	} else if mode != ReviseModeStyleApply {
		if lang == models.LanguageEN {
			fmt.Fprintf(&b, "\nFix ONLY the %d listed issues below.\n", len(in.Issues))
		} else {
			fmt.Fprintf(&b, "\n只修复下列 %d 项检测问题，其余段落保持不动。\n", len(in.Issues))
		}
	}
	b.WriteString("\n--- Original ---\n")
	b.WriteString(body)
	if mode == ReviseModeStyleApply {
		b.WriteString("\n\n--- 章末锚点（修订后必须停在这里，不得往后写） ---\n")
		b.WriteString(extractPlotAnchor(body, in.Memo))
		b.WriteString("\n")
	}
	return b.String()
}

func extractPlotAnchor(body string, memo models.ChapterMemo) string {
	trim := strings.TrimSpace(body)
	runes := []rune(trim)
	if len(runes) > 280 {
		trim = string(runes[len(runes)-280:])
	}
	var b strings.Builder
	b.WriteString("原稿结尾片段：\n")
	b.WriteString(trim)
	b.WriteString("\n")
	if strings.TrimSpace(memo.EndingChange) != "" {
		b.WriteString("章尾改变（不得超越）：")
		b.WriteString(memo.EndingChange)
		b.WriteString("\n")
	}
	return b.String()
}

func (r *ReviserAgent) chatReviseWithContinue(ctx context.Context, sys, userPrompt, original string, maxTokens int, temp float32, mode ReviseMode) (string, error) {
	msgs := []protocol.Message{
		protocol.SystemMessage(sys),
		protocol.UserMessage(userPrompt),
	}
	revised := ""
	for attempt := 0; attempt < 4; attempt++ {
		resp, err := r.ctx.ChatWithMaxTokens(ctx, msgs, temp, maxTokens)
		if err != nil {
			return "", err
		}
		chunk := StripChapterBody(strings.TrimSpace(resp.FirstContent()))
		if chunk == "" {
			break
		}
		if revised == "" {
			revised = chunk
		} else {
			revised = mergeRevisionContinued(revised, chunk)
		}
		if err := validateRevisedLength(original, revised, mode); err == nil {
			if mode == ReviseModeStyleApply {
				revised = NormalizeStyleParagraphs(revised)
				if err := validateStyleApplyOutput(original, revised); err != nil {
					if attempt >= 3 {
						return "", err
					}
					continue
				}
			}
			return revised, nil
		}
		if attempt >= 3 {
			break
		}
		msgs = append(msgs,
			protocol.AssistantMessage(revised),
			protocol.UserMessage(continueRevisePrompt(original, revised)),
		)
	}
	if revised == "" {
		return "", nil
	}
	if err := validateRevisedLength(original, revised, mode); err != nil {
		return "", err
	}
	return revised, nil
}

func continueRevisePrompt(original, partial string) string {
	origRunes := []rune(original)
	partRunes := []rune(partial)
	ratio := len(partRunes) * 100 / max(len(origRunes), 1)
	return fmt.Sprintf(`输出被截断（已完成约 %d%%）。从上一段末尾无缝续写剩余正文：
- 不要重复已写内容
- 不要标题、不要解释
- 必须写到本章原稿同等进度（情节对齐原稿后半部分）
- 只输出「续写部分」`, ratio)
}

func mergeRevisionContinued(prev, cont string) string {
	cont = strings.TrimSpace(cont)
	if cont == "" {
		return prev
	}
	// Drop obvious re-start: if continuation repeats first paragraph, skip prefix overlap.
	prevTail := tailRunes(prev, 80)
	contHead := headRunes(cont, 80)
	if strings.Contains(cont, headRunes(prev, 40)) && len([]rune(cont)) > 100 {
		// full rewrite in continuation — prefer longer merge
		if len([]rune(cont)) > len([]rune(prev))/2 {
			return cont
		}
	}
	_ = prevTail
	_ = contHead
	if strings.HasSuffix(prev, cont) {
		return prev
	}
	return strings.TrimRight(prev, "\n") + "\n\n" + cont
}

func splitRevisionChunks(content string, maxRunes int) []string {
	paras := strings.Split(content, "\n\n")
	var chunks []string
	var buf strings.Builder
	flush := func() {
		if s := strings.TrimSpace(buf.String()); s != "" {
			chunks = append(chunks, s)
		}
		buf.Reset()
	}
	for _, p := range paras {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		extra := p
		if buf.Len() > 0 {
			extra = "\n\n" + p
		}
		if len([]rune(buf.String()))+len([]rune(extra)) > maxRunes && buf.Len() > 0 {
			flush()
		}
		buf.WriteString(extra)
	}
	flush()
	return chunks
}

func tailRunes(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[len(r)-n:])
}

func headRunes(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n])
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func reviserMaxTokens(content string, mode ReviseMode) int {
	n := len([]rune(content))
	budget := n*3 + 4096
	if mode == ReviseModeStyleApply {
		budget = n*4 + 4096
	}
	if budget < 8192 {
		return 8192
	}
	if budget > 32768 {
		return 32768
	}
	return budget
}

func validateRevisedLength(original, revised string, mode ReviseMode) error {
	orig := len([]rune(strings.TrimSpace(original)))
	rev := len([]rune(strings.TrimSpace(revised)))
	if orig == 0 {
		return nil
	}
	minRatio := 85
	if mode == ReviseModeStyleApply {
		// Short-sentence reference style may legitimately compress rune count.
		minRatio = 50
	}
	if rev < orig*minRatio/100 {
		return fmt.Errorf("reviser output truncated (%d/%d runes): retry or use a model with higher max output tokens", rev, orig)
	}
	return nil
}

func reviseSystemForMode(lang models.Language, mode ReviseMode) string {
	switch mode {
	case ReviseModePolish:
		if lang == models.LanguageEN {
			return "Light polish only. Output revised body."
		}
		return "轻度润色。只输出修订正文。"
	case ReviseModeAntiDetect:
		return AntiDetectReviserPrompt(lang)
	case ReviseModeStyleApply:
		return StyleApplyReviserPrompt(lang)
	case ReviseModeSpotFix:
		return SpotFixReviserPrompt(lang)
	case ReviseModeRewrite, ReviseModeRework:
		if lang == models.LanguageEN {
			return "Major rewrite while preserving plot facts. Output revised body."
		}
		return "大幅重写但保留剧情事实。只输出修订正文。"
	default:
		return reviserSystemPrompt(lang)
	}
}

func reviseTemperature(mode ReviseMode) float32 {
	switch mode {
	case ReviseModePolish:
		return 0.35
	case ReviseModeAntiDetect:
		return 0.45
	case ReviseModeStyleApply:
		return 0.38
	case ReviseModeRewrite, ReviseModeRework:
		return 0.55
	default:
		return 0.3
	}
}
