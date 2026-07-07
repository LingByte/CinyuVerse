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

// ConsolidatorAgent merges chapter summaries to reduce long-book context pressure.
type ConsolidatorAgent struct {
	ctx agent.Context
	st  store.BookStore
}

func NewConsolidatorAgent(ctx agent.Context, st store.BookStore) *ConsolidatorAgent {
	return &ConsolidatorAgent{ctx: ctx, st: st}
}

// ConsolidateSummaries compresses chapter summaries into volume-level notes.
func (c *ConsolidatorAgent) ConsolidateSummaries(ctx context.Context, bookID string, lang models.Language) (string, error) {
	raw := c.st.ReadTextOrDefault(bookID, "story/chapter_summaries.md", "")
	if strings.TrimSpace(raw) == "" {
		return "", fmt.Errorf("no chapter summaries to consolidate")
	}
	sys := "Compress chapter summaries into volume-level notes. Preserve hook IDs and character facts."
	if lang == models.LanguageZH {
		sys = "将章节摘要压缩为卷级摘要，保留伏笔 ID 与角色事实。"
	}
	resp, err := c.ctx.Chat(ctx, []protocol.Message{
		protocol.SystemMessage(sys),
		protocol.UserMessage(raw),
	}, 0.3)
	if err != nil {
		return "", err
	}
	out := resp.FirstContent()
	_ = c.st.WriteText(bookID, "story/volume_summaries.md", out)
	return out, nil
}

// RadarRecommendation is one trend suggestion.
type RadarRecommendation struct {
	Genre     string
	Trend     string
	Rationale string
}

// RadarResult is platform trend scan output.
type RadarResult struct {
	Summary         string
	Recommendations []RadarRecommendation
}

// RadarAgent scans trends (optional web context injected by caller).
type RadarAgent struct {
	ctx agent.Context
}

func NewRadarAgent(ctx agent.Context) *RadarAgent {
	return &RadarAgent{ctx: ctx}
}

// ScanTrends analyzes provided platform context.
func (r *RadarAgent) ScanTrends(ctx context.Context, platformContext string, lang models.Language) (RadarResult, error) {
	sys := `Output JSON: {"summary":"...","recommendations":[{"genre":"...","trend":"...","rationale":"..."}]}`
	if lang == models.LanguageZH {
		sys = `只输出 JSON：{"summary":"...","recommendations":[{"genre":"...","trend":"...","rationale":"..."}]}`
	}
	resp, err := r.ctx.Chat(ctx, []protocol.Message{
		protocol.SystemMessage(sys),
		protocol.UserMessage(platformContext),
	}, 0.6)
	if err != nil {
		return RadarResult{}, err
	}
	var result RadarResult
	if err := jsonUnmarshal(extractJSON(resp.FirstContent()), &result); err != nil {
		return RadarResult{Summary: resp.FirstContent()}, nil
	}
	return result, nil
}

// PolisherAgent performs light polish passes on approved chapters.
type PolisherAgent struct {
	ctx agent.Context
}

func NewPolisherAgent(ctx agent.Context) *PolisherAgent {
	return &PolisherAgent{ctx: ctx}
}

type PolishChapterInput struct {
	Content     string
	Language    models.Language
	Temperature float32
}

// PolishChapter returns lightly polished prose.
func (p *PolisherAgent) PolishChapter(ctx context.Context, in PolishChapterInput) (string, error) {
	lang := in.Language
	temp := in.Temperature
	if temp <= 0 {
		temp = 0.4
	}
	sys := polisherSystemPrompt(lang)
	resp, err := p.ctx.Chat(ctx, []protocol.Message{
		protocol.SystemMessage(sys),
		protocol.UserMessage(in.Content),
	}, temp)
	if err != nil {
		return "", err
	}
	out := strings.TrimSpace(resp.FirstContent())
	if out == "" {
		return in.Content, nil
	}
	return out, nil
}

func polisherSystemPrompt(lang models.Language) string {
	return PolisherHumanizePrompt(lang)
}
