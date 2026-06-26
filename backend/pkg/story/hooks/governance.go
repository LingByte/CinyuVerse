package hooks

import (
	"fmt"
	"strings"

	"github.com/LingByte/CinyuVerse/pkg/story/models"
)

// HealthReport summarizes hook governance findings for a book at a chapter boundary.
type HealthReport struct {
	StaleHooks      []models.HookRecord `json:"staleHooks"`
	OpenCount       int                 `json:"openCount"`
	StaleDebt       int                 `json:"staleDebt"`
	Warnings        []string            `json:"warnings"`
	AdmissionIssues []string            `json:"admissionIssues"`
}

const defaultStaleAfterChapters = 5

// EvaluateHooks checks open hooks for stale debt and admission health (InkOS hook-governance subset).
func EvaluateHooks(hooks models.HooksState, currentChapter int) HealthReport {
	report := HealthReport{}
	for _, h := range hooks.Hooks {
		if h.Status == models.HookStatusResolved {
			continue
		}
		if h.Status == models.HookStatusOpen || h.Status == models.HookStatusProgressing || h.Status == models.HookStatusDeferred {
			report.OpenCount++
		}
		last := h.LastAdvancedChapter
		if last == 0 {
			last = h.StartChapter
		}
		staleAfter := defaultStaleAfterChapters
		if currentChapter-last >= staleAfter && h.Status != models.HookStatusResolved {
			report.StaleHooks = append(report.StaleHooks, h)
			report.StaleDebt++
		}
	}
	if report.StaleDebt > 0 {
		report.Warnings = append(report.Warnings,
			fmt.Sprintf("%d open hook(s) have not advanced in %d+ chapters", report.StaleDebt, defaultStaleAfterChapters))
	}
	if report.OpenCount > 12 {
		report.Warnings = append(report.Warnings,
			fmt.Sprintf("high open-hook count (%d); consider resolving or deferring threads", report.OpenCount))
	}
	return report
}

// ValidateAdmission checks a new hook op before apply.
func ValidateAdmission(op models.HookOp, hooks models.HooksState) []string {
	var issues []string
	id := strings.TrimSpace(op.HookID)
	if id == "" {
		issues = append(issues, "hookId required")
		return issues
	}
	if op.Action == "upsert" && op.Type == "" {
		issues = append(issues, fmt.Sprintf("hook %q: type required for upsert", id))
	}
	for _, h := range hooks.Hooks {
		if h.HookID == id && op.Action == "upsert" && h.Status == models.HookStatusResolved {
			issues = append(issues, fmt.Sprintf("hook %q already resolved; use mention instead of upsert", id))
		}
	}
	return issues
}

// FormatWarnings returns planner-facing hook health text.
func FormatWarnings(report HealthReport, lang models.Language) string {
	if len(report.Warnings) == 0 && len(report.StaleHooks) == 0 {
		return ""
	}
	var b strings.Builder
	if lang == models.LanguageEN {
		b.WriteString("## Hook Governance\n\n")
	} else {
		b.WriteString("## 伏笔治理\n\n")
	}
	for _, w := range report.Warnings {
		b.WriteString("- ")
		b.WriteString(w)
		b.WriteString("\n")
	}
	for _, h := range report.StaleHooks {
		fmt.Fprintf(&b, "- stale: %s (since ch.%d)\n", h.HookID, h.StartChapter)
	}
	return b.String()
}
