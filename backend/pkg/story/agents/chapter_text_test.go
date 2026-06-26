package agents

import (
	"strings"
	"testing"

	"github.com/LingByte/CinyuVerse/pkg/story/models"
)

func TestStripChapterBody(t *testing.T) {
	raw := "# 第一章 漏洞\n\n正文第一段。\n\n第二段。"
	got := StripChapterBody(raw)
	if got != "正文第一段。\n\n第二段。" {
		t.Fatalf("got %q", got)
	}
}

func TestCountNotErShiPattern(t *testing.T) {
	s := "这种压力并非来自物理重量，而是阶级碾压。并不是均匀流动，而是乱窜。测灵石不是白色，而是灰紫。"
	not, er := countNotErShiPattern(s)
	if not != 1 || er != 3 {
		t.Fatalf("not=%d er=%d", not, er)
	}
}

func TestIssuesFromDetectEmpty(t *testing.T) {
	d := DetectChapter(models.BookConfig{Language: models.LanguageZH}, 1, "t", strings.Repeat("正常正文，没有套话。", 30))
	if issues := IssuesFromDetect(d); len(issues) != 0 {
		t.Fatalf("expected no issues, got %v", issues)
	}
}

func TestValidateRevisedLength(t *testing.T) {
	orig := "这是一段足够长的中文正文，用于测试修订后的长度校验逻辑是否正常工作。"
	if err := validateRevisedLength(orig, orig, ReviseModeSpotFix); err != nil {
		t.Fatal(err)
	}
	short := orig[:len(orig)/2]
	if err := validateRevisedLength(orig, short, ReviseModeSpotFix); err == nil {
		t.Fatal("expected truncation error")
	}
}
