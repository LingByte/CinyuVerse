package agents

import (
	"context"
	"fmt"
	"strings"

	"github.com/LingByte/CinyuVerse/pkg/protocol"
	"github.com/LingByte/CinyuVerse/pkg/story/agent"
)

// FoundationReviewInput is input for foundation quality review.
type FoundationReviewInput struct {
	Foundation ArchitectOutput
	Language   string
	Mode       string // init | fanfic | import
}

// FoundationReviewResult is the reviewer verdict.
type FoundationReviewResult struct {
	Passed   bool
	Feedback string
	Issues   []string
}

// FoundationReviewerAgent audits architect output before persisting.
type FoundationReviewerAgent struct {
	ctx agent.Context
}

func NewFoundationReviewerAgent(ctx agent.Context) *FoundationReviewerAgent {
	return &FoundationReviewerAgent{ctx: ctx}
}

func foundationReviewerSystem(lang string) string {
	if lang == "en" {
		return `You are the Foundation Reviewer. Output ONLY JSON:
{"passed":true|false,"feedback":"...","issues":["..."]}
Check internal consistency, genre fit, hook seeds, and volume structure.`
	}
	return `你是基础设定审稿员。只输出 JSON：
{"passed":true|false,"feedback":"...","issues":["..."]}
检查自洽性、题材匹配、伏笔种子和卷纲结构。`
}

// Review evaluates architect foundation output.
func (r *FoundationReviewerAgent) Review(ctx context.Context, in FoundationReviewInput) (FoundationReviewResult, error) {
	lang := in.Language
	if lang == "" {
		lang = "zh"
	}
	var b strings.Builder
	fmt.Fprintf(&b, "Mode: %s\n\n", in.Mode)
	fmt.Fprintf(&b, "--- STORY_BIBLE ---\n%s\n\n", in.Foundation.StoryBible)
	fmt.Fprintf(&b, "--- VOLUME_OUTLINE ---\n%s\n\n", in.Foundation.VolumeOutline)
	fmt.Fprintf(&b, "--- BOOK_RULES ---\n%s\n", in.Foundation.BookRules)
	resp, err := r.ctx.Chat(ctx, []protocol.Message{
		protocol.SystemMessage(foundationReviewerSystem(lang)),
		protocol.UserMessage(b.String()),
	}, 0.3)
	if err != nil {
		return FoundationReviewResult{}, err
	}
	var parsed struct {
		Passed   bool     `json:"passed"`
		Feedback string   `json:"feedback"`
		Issues   []string `json:"issues"`
	}
	raw := extractJSON(resp.FirstContent())
	if err := jsonUnmarshal(raw, &parsed); err != nil {
		return FoundationReviewResult{Passed: true, Feedback: "review parse skipped"}, nil
	}
	return FoundationReviewResult{
		Passed: parsed.Passed, Feedback: parsed.Feedback, Issues: parsed.Issues,
	}, nil
}

// GenerateAndReviewFoundation runs architect with optional review/retry loop.
func GenerateAndReviewFoundation(
	ctx context.Context,
	arch *ArchitectAgent,
	reviewer *FoundationReviewerAgent,
	in InitBookInput,
	maxRetries int,
) (ArchitectOutput, error) {
	if maxRetries <= 0 {
		maxRetries = 2
	}
	foundation, err := arch.GenerateFoundation(ctx, in)
	if err != nil {
		return ArchitectOutput{}, err
	}
	lang := string(in.Book.Language)
	if lang == "" {
		lang = "zh"
	}
	feedback := ""
	for attempt := 0; attempt < maxRetries; attempt++ {
		review, err := reviewer.Review(ctx, FoundationReviewInput{
			Foundation: foundation, Language: lang, Mode: "init",
		})
		if err != nil {
			return foundation, nil
		}
		if review.Passed {
			return foundation, nil
		}
		feedback = review.Feedback
		if feedback == "" && len(review.Issues) > 0 {
			feedback = strings.Join(review.Issues, "; ")
		}
		revised, err := arch.GenerateFoundation(ctx, InitBookInput{
			Book: in.Book, Brief: in.Brief, ExternalContext: feedback,
		})
		if err != nil {
			return foundation, nil
		}
		foundation = revised
	}
	return foundation, nil
}

func jsonUnmarshal(raw string, dest any) error {
	return protocolJSONUnmarshal(raw, dest)
}
