package agents

import (
	"strings"
	"testing"
)

func TestNormalizeStyleParagraphs(t *testing.T) {
	in := "考生在陆沉面前呕血。\n\n一大口。\n\n暗红色。\n\n身体瘫倒。"
	out := NormalizeStyleParagraphs(in)
	if strings.Count(out, "\n\n") > 2 {
		t.Fatalf("expected merged paragraphs, got:\n%s", out)
	}
	if fragmentationScore(out) > 0.35 {
		t.Fatalf("still too fragmented: %s", out)
	}
}

func TestDetectPlotDrift(t *testing.T) {
	orig := "陆沉踏上第一层台阶。眼神沉下去。"
	bad := orig + strings.Repeat("爬。", 200) + "百层台阶。外围修士震惊。"
	if err := detectPlotDrift(orig, bad); err == nil {
		t.Fatal("expected plot drift error")
	}
}
