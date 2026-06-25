package agents

import (
	"context"
	"fmt"
	"strings"

	"github.com/LingByte/CinyuVerse/pkg/protocol"
	"github.com/LingByte/CinyuVerse/pkg/story/agent"
	"github.com/LingByte/CinyuVerse/pkg/story/models"
)

// StateValidationIssue is one structural problem in a runtime delta.
type StateValidationIssue struct {
	Severity string
	Field    string
	Message  string
}

// StateValidatorAgent validates reflector deltas before apply.
type StateValidatorAgent struct {
	ctx            agent.Context
	SkipLLMCheck   bool
}

func NewStateValidatorAgent(ctx agent.Context) *StateValidatorAgent {
	return &StateValidatorAgent{ctx: ctx}
}

// ValidateDelta runs schema checks plus optional LLM sanity check.
func (v *StateValidatorAgent) ValidateDelta(ctx context.Context, delta models.RuntimeStateDelta, snap models.RuntimeStateSnapshot, lang models.Language) ([]StateValidationIssue, error) {
	var issues []StateValidationIssue
	if delta.ChapterNumber <= 0 {
		issues = append(issues, StateValidationIssue{Severity: "critical", Field: "chapterNumber", Message: "missing chapter number"})
	}
	for _, op := range delta.HookOps {
		if op.HookID == "" {
			issues = append(issues, StateValidationIssue{Severity: "critical", Field: "hookOps", Message: "hook missing id"})
		}
		if op.LastAdvancedChapter < 0 {
			issues = append(issues, StateValidationIssue{Severity: "critical", Field: "hookOps", Message: "negative lastAdvancedChapter"})
		}
	}
	if len(issues) > 0 {
		return issues, nil
	}
	if v.SkipLLMCheck {
		return issues, nil
	}
	// Optional LLM cross-check for egregious contradictions
	var b strings.Builder
	b.WriteString("Validate this delta against current hooks/state. Output JSON {\"ok\":true} or {\"ok\":false,\"issues\":[{\"severity\":\"critical\",\"field\":\"...\",\"message\":\"...\"}]}\n\n")
	b.WriteString(fmt.Sprintf("Delta chapter: %d\n", delta.ChapterNumber))
	for _, h := range snap.Hooks.Hooks {
		fmt.Fprintf(&b, "hook %s status=%s last=%d\n", h.HookID, h.Status, h.LastAdvancedChapter)
	}
	resp, err := v.ctx.Chat(ctx, []protocol.Message{
		protocol.SystemMessage("You are the State Validator. Output JSON only."),
		protocol.UserMessage(b.String()),
	}, 0.1)
	if err != nil {
		return nil, nil
	}
	var parsed struct {
		OK     bool                   `json:"ok"`
		Issues []StateValidationIssue `json:"issues"`
	}
	if err := jsonUnmarshal(extractJSON(resp.FirstContent()), &parsed); err != nil || parsed.OK {
		return issues, nil
	}
	return append(issues, parsed.Issues...), nil
}

// HasCritical returns true if any issue is critical.
func HasCritical(issues []StateValidationIssue) bool {
	for _, i := range issues {
		if strings.EqualFold(i.Severity, "critical") {
			return true
		}
	}
	return false
}
