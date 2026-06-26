package agents_test

import (
	"strings"
	"testing"

	"github.com/LingByte/CinyuVerse/pkg/story/agents"
	"github.com/LingByte/CinyuVerse/pkg/story/models"
)

func TestAgentRegistryComplete(t *testing.T) {
	all := agents.All()
	if len(all) < 35 {
		t.Fatalf("expected >=35 agents, got %d", len(all))
	}
	names := map[string]bool{}
	for _, d := range all {
		if d.Name == "" {
			t.Fatal("empty agent name")
		}
		names[string(d.Name)] = true
	}
	for _, required := range []string{
		"architect", "planner", "writer", "auditor", "reviser",
		"short-fiction-outline-reviewer", "short-fiction-draft-reviewer",
		"play-world-mutator", "short-fiction-writer", "conversation",
	} {
		if !names[required] {
			t.Fatalf("missing agent %s", required)
		}
	}
}

func TestAnalyzeAITells(t *testing.T) {
	r := agents.AnalyzeAITells("值得注意的是，他 delve 进了房间。", models.LanguageZH)
	if len(r.Issues) == 0 {
		t.Fatal("expected ai tell issues")
	}
}

func TestBuildLengthSpec(t *testing.T) {
	spec := agents.BuildLengthSpec(3000, models.LanguageZH)
	if spec.HardMin >= spec.SoftMin || spec.SoftMax >= spec.HardMax {
		t.Fatalf("bad bands: %+v", spec)
	}
}

func TestSplitChaptersByHeading(t *testing.T) {
	text := "第1章 开端\n\n内容一。\n\n第2章 转折\n\n内容二。"
	chs := agents.SplitChaptersByHeading(text)
	if len(chs) != 2 {
		t.Fatalf("expected 2 chapters, got %d", len(chs))
	}
}

func TestParseShortFictionOutline(t *testing.T) {
	raw := "# 雨夜追凶\n\n## 第1章\n发现尸体"
	out := agents.ParseShortFictionOutline(raw)
	if out.StoryTitle != "雨夜追凶" {
		t.Fatalf("title=%q", out.StoryTitle)
	}
}

func TestParseShortFictionBatchDraft(t *testing.T) {
	draft := agents.ParseShortFictionBatchDraft("SHORT_FICTION_TITLE: 测试\n\n## 第1章 开端\n\n正文。", 1)
	if draft.StoryTitle != "测试" || len(draft.Chapters) != 1 {
		t.Fatalf("draft: %+v", draft)
	}
	if !strings.Contains(draft.Chapters[0].Content, "正文") {
		t.Fatalf("content=%q", draft.Chapters[0].Content)
	}
}
