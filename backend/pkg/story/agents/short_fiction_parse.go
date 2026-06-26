package agents

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/LingByte/CinyuVerse/pkg/story/models"
)

const (
	shortFictionDefaultChapters = 12
)

// ParseShortFictionOutline extracts title and raw outline markdown.
func ParseShortFictionOutline(raw string) models.ShortFictionOutlineParsed {
	title := extractTaggedBlock(raw, "SHORT_FICTION_PLAN_TITLE")
	if title == "" {
		title = extractTaggedBlock(raw, "SHORT_FICTION_TITLE")
	}
	if title == "" {
		title = extractFirstHeading(raw)
	}
	if title == "" {
		title = "未命名短篇"
	}
	return models.ShortFictionOutlineParsed{StoryTitle: title, RawContent: strings.TrimSpace(raw)}
}

// ParseShortFictionBatchDraft parses tagged or markdown chapter structure.
func ParseShortFictionBatchDraft(raw string, expectedChapters int) models.ShortFictionDraft {
	if expectedChapters <= 0 {
		expectedChapters = shortFictionDefaultChapters
	}
	title := extractTaggedBlock(raw, "SHORT_FICTION_TITLE")
	if title == "" {
		title = extractFirstHeading(raw)
	}
	if title == "" {
		title = "未命名短篇"
	}
	hook := extractTaggedBlock(raw, "SHORT_FICTION_OPENING_HOOK")
	if hook == "" {
		hook = extractTaggedBlock(raw, "OPENING_HOOK")
	}
	chapters := make([]models.ShortFictionChapterDraft, 0, expectedChapters)
	for n := 1; n <= expectedChapters; n++ {
		chTitle := extractTaggedBlock(raw, fmt.Sprintf("CHAPTER %d TITLE", n))
		if chTitle == "" {
			chTitle = extractMarkdownChapterTitle(raw, n)
		}
		if chTitle == "" {
			chTitle = fmt.Sprintf("第%d章", n)
		}
		content := extractTaggedBlock(raw, fmt.Sprintf("CHAPTER %d CONTENT", n))
		if content == "" {
			content = extractMarkdownChapterContent(raw, n)
		}
		content = strings.TrimSpace(content)
		chapters = append(chapters, models.ShortFictionChapterDraft{
			Number: n, Title: chTitle, Content: content,
			CharCount: CountLength(content, models.LanguageZH),
		})
	}
	return models.ShortFictionDraft{
		StoryTitle: title, OpeningHook: strings.TrimSpace(hook),
		Chapters: chapters, RawContent: strings.TrimSpace(raw),
	}
}

// RenderShortFictionDraftMarkdown renders draft to markdown.
func RenderShortFictionDraftMarkdown(draft models.ShortFictionDraft) string {
	var parts []string
	parts = append(parts, "# "+draft.StoryTitle)
	if draft.OpeningHook != "" {
		parts = append(parts, "## 开篇钩子\n\n"+draft.OpeningHook)
	}
	for _, ch := range draft.Chapters {
		parts = append(parts, fmt.Sprintf("## 第%d章 %s\n\n%s", ch.Number, ch.Title, ch.Content))
	}
	return strings.Join(parts, "\n\n")
}

// FindEmptyShortFictionChapters returns chapter numbers with empty content.
func FindEmptyShortFictionChapters(draft models.ShortFictionDraft) []int {
	var empty []int
	for _, ch := range draft.Chapters {
		if strings.TrimSpace(ch.Content) == "" {
			empty = append(empty, ch.Number)
		}
	}
	return empty
}

// ParseShortFictionSalesPackage extracts marketing copy from LLM output.
func ParseShortFictionSalesPackage(raw, fallbackTitle string) models.ShortFictionSalesPackage {
	title := extractTaggedBlock(raw, "SHORT_FICTION_PACKAGE_TITLE")
	if title == "" {
		title = fallbackTitle
	}
	intro := extractTaggedBlock(raw, "SHORT_FICTION_INTRO")
	if intro == "" {
		intro = extractTaggedBlock(raw, "INTRO")
	}
	if intro == "" {
		intro = strings.TrimSpace(raw)
	}
	points := extractBulletList(extractTaggedBlock(raw, "SHORT_FICTION_SELLING_POINTS"))
	if len(points) == 0 {
		points = extractBulletList(raw)
	}
	return models.ShortFictionSalesPackage{Synopsis: intro, SellingPoints: points}
}

func extractTaggedBlock(raw, tag string) string {
	prefix := tag + ":"
	for _, line := range strings.Split(raw, "\n") {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(strings.ToUpper(trimmed), strings.ToUpper(prefix)) {
			return strings.TrimSpace(trimmed[len(prefix):])
		}
	}
	re := regexp.MustCompile(`(?is)` + regexp.QuoteMeta(tag) + `\s*[:：]?\s*\n+([^\n#].*?)(?:\n(?:[A-Z_ ]+\s*[:：]|#|\z))`)
	m := re.FindStringSubmatch(raw)
	if len(m) >= 2 {
		return strings.TrimSpace(m[1])
	}
	return ""
}

func extractFirstHeading(raw string) string {
	for _, line := range strings.Split(raw, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "# ") {
			return strings.TrimSpace(strings.TrimPrefix(line, "# "))
		}
	}
	return ""
}

func extractMarkdownChapterTitle(raw string, number int) string {
	prefixes := []string{
		fmt.Sprintf("## 第%d章", number),
		fmt.Sprintf("## Chapter %d", number),
	}
	for _, line := range strings.Split(raw, "\n") {
		line = strings.TrimSpace(line)
		for _, p := range prefixes {
			if strings.HasPrefix(line, p) {
				return strings.TrimSpace(strings.TrimPrefix(line, p))
			}
		}
	}
	return ""
}

func extractMarkdownChapterContent(raw string, number int) string {
	heading := fmt.Sprintf("## 第%d章", number)
	start := strings.Index(raw, heading)
	if start < 0 {
		heading = fmt.Sprintf("## Chapter %d", number)
		start = strings.Index(raw, heading)
	}
	if start < 0 {
		return ""
	}
	rest := raw[start+len(heading):]
	rest = strings.TrimSpace(rest)
	if nl := strings.Index(rest, "\n"); nl >= 0 {
		first := strings.TrimSpace(rest[:nl])
		second := strings.TrimSpace(rest[nl+1:])
		if second != "" && (first == "" || !strings.Contains(second, "\n")) {
			// heading line may include chapter title; body follows
			if strings.TrimSpace(second) != "" {
				rest = second
			}
		}
	}
	next := regexp.MustCompile(`(?m)^## `).FindStringIndex(rest)
	if next != nil {
		rest = rest[:next[0]]
	}
	return strings.TrimSpace(rest)
}

func extractBulletList(raw string) []string {
	var out []string
	for _, line := range strings.Split(raw, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "- ") || strings.HasPrefix(line, "* ") {
			out = append(out, strings.TrimSpace(line[2:]))
		}
	}
	return out
}

type shortFictionReviewResult struct {
	Passed   bool   `json:"passed"`
	Feedback string `json:"feedback"`
}

func parseShortFictionReview(raw string) shortFictionReviewResult {
	var r shortFictionReviewResult
	if err := jsonUnmarshal(extractJSON(raw), &r); err != nil {
		upper := strings.ToUpper(raw)
		if strings.Contains(upper, "PASS") || strings.Contains(raw, "通过") {
			return shortFictionReviewResult{Passed: true}
		}
		return shortFictionReviewResult{Passed: false, Feedback: strings.TrimSpace(raw)}
	}
	return r
}
