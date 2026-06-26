package agents

import (
	"context"
	"fmt"
	"strings"

	"github.com/LingByte/CinyuVerse/pkg/protocol"
	"github.com/LingByte/CinyuVerse/pkg/story/agent"
	"github.com/LingByte/CinyuVerse/pkg/story/models"
)

// LengthNormalizerAgent compresses or expands chapter length in one pass.
type LengthNormalizerAgent struct {
	ctx agent.Context
}

func NewLengthNormalizerAgent(ctx agent.Context) *LengthNormalizerAgent {
	return &LengthNormalizerAgent{ctx: ctx}
}

type NormalizeLengthInput struct {
	Content       string
	LengthSpec    LengthSpec
	ChapterIntent string
	Language      models.Language
}

type NormalizeLengthOutput struct {
	Content   string
	WordCount int
	Applied   bool
	Mode      string
}

func lengthNormalizerSystem(lang models.Language) string {
	if lang == models.LanguageEN {
		return "You are the Length Normalizer. Compress or expand prose to hit the target band. Output ONLY the revised chapter body."
	}
	return "你是字数归一化器。压缩或扩展正文以落入目标区间。只输出修订后的正文。"
}

// NormalizeChapter performs a single corrective pass when outside hard range.
func (n *LengthNormalizerAgent) NormalizeChapter(ctx context.Context, in NormalizeLengthInput) (NormalizeLengthOutput, error) {
	lang := in.Language
	if lang == "" {
		lang = models.LanguageZH
	}
	length := countWithSpec(in.Content, in.LengthSpec, lang)
	if !IsOutsideHardRange(length, in.LengthSpec) {
		return NormalizeLengthOutput{Content: in.Content, WordCount: length, Applied: false}, nil
	}
	mode := ChooseNormalizeMode(length, in.LengthSpec)
	if mode == "" {
		mode = "compress"
	}
	var b strings.Builder
	if lang == models.LanguageEN {
		fmt.Fprintf(&b, "Mode: %s\nTarget: %d (hard %d-%d)\nCurrent: %d\n\nIntent:\n%s\n\n---\n%s",
			mode, in.LengthSpec.Target, in.LengthSpec.HardMin, in.LengthSpec.HardMax, length, in.ChapterIntent, in.Content)
	} else {
		fmt.Fprintf(&b, "模式：%s\n目标：%d（硬区间 %d-%d）\n当前：%d\n\n意图：\n%s\n\n---\n%s",
			mode, in.LengthSpec.Target, in.LengthSpec.HardMin, in.LengthSpec.HardMax, length, in.ChapterIntent, in.Content)
	}
	resp, err := n.ctx.Chat(ctx, []protocol.Message{
		protocol.SystemMessage(lengthNormalizerSystem(lang)),
		protocol.UserMessage(b.String()),
	}, 0.2)
	if err != nil {
		return NormalizeLengthOutput{}, err
	}
	out := strings.TrimSpace(resp.FirstContent())
	if out == "" {
		return NormalizeLengthOutput{Content: in.Content, WordCount: length, Applied: false}, nil
	}
	// Safety: reject destructive normalization (>75% loss)
	newLen := countWithSpec(out, in.LengthSpec, lang)
	if float64(newLen) < float64(length)*0.25 {
		return NormalizeLengthOutput{Content: in.Content, WordCount: length, Applied: false}, nil
	}
	return NormalizeLengthOutput{
		Content: out, WordCount: newLen, Applied: true, Mode: mode,
	}, nil
}
