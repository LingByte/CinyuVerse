package agents

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"

	"github.com/LingByte/CinyuVerse/pkg/story/models"
)

var sectionHeader = regexp.MustCompile(`(?m)^---([A-Z_]+)---\s*$`)

// ParseArchitectSections splits architect LLM output into named sections.
func ParseArchitectSections(raw string) map[string]string {
	matches := sectionHeader.FindAllStringSubmatchIndex(raw, -1)
	out := make(map[string]string)
	if len(matches) == 0 {
		out["STORY_BIBLE"] = strings.TrimSpace(raw)
		return out
	}
	for i, m := range matches {
		name := raw[m[2]:m[3]]
		start := m[1]
		end := len(raw)
		if i+1 < len(matches) {
			end = matches[i+1][0]
		}
		body := strings.TrimSpace(raw[start:end])
		out[name] = body
	}
	return out
}

var memoSectionHeaders = map[models.Language][]struct {
	key     string
	headers []string
}{
	models.LanguageZH: {
		{"goal", []string{"## 当前任务", "## Current Task"}},
		{"mustKeep", []string{"## 必须保留", "## Must Keep"}},
		{"mustAvoid", []string{"## 必须避免", "## Must Avoid"}},
		{"hookAgenda", []string{"## 伏笔议程", "## Hook Agenda"}},
		{"scenePlan", []string{"## 场景计划", "## Scene Plan"}},
		{"endingChange", []string{"## 章尾必须发生的改变", "## Ending Change Required"}},
		{"styleNotes", []string{"## 风格注意", "## Style Notes"}},
	},
	models.LanguageEN: {
		{"goal", []string{"## Current Task", "## 当前任务"}},
		{"mustKeep", []string{"## Must Keep", "## 必须保留"}},
		{"mustAvoid", []string{"## Must Avoid", "## 必须避免"}},
		{"hookAgenda", []string{"## Hook Agenda", "## 伏笔议程"}},
		{"scenePlan", []string{"## Scene Plan", "## 场景计划"}},
		{"endingChange", []string{"## Ending Change Required", "## 章尾必须发生的改变"}},
		{"styleNotes", []string{"## Style Notes", "## 风格注意"}},
	},
}

// ParseChapterMemo extracts structured memo fields from planner markdown.
func ParseChapterMemo(raw string, lang models.Language) (models.ChapterMemo, error) {
	sections := memoSectionHeaders[lang]
	if sections == nil {
		sections = memoSectionHeaders[models.LanguageZH]
	}
	values := extractMemoSections(raw, sections)
	memo := models.ChapterMemo{
		Goal:         values["goal"],
		MustKeep:     bulletLines(values["mustKeep"]),
		MustAvoid:    bulletLines(values["mustAvoid"]),
		HookAgenda:   values["hookAgenda"],
		ScenePlan:    values["scenePlan"],
		EndingChange: values["endingChange"],
		StyleNotes:   values["styleNotes"],
		RawMarkdown:  raw,
	}
	if strings.TrimSpace(memo.Goal) == "" {
		return memo, fmt.Errorf("planner memo missing goal section")
	}
	return memo, nil
}

func extractMemoSections(raw string, defs []struct {
	key     string
	headers []string
}) map[string]string {
	out := make(map[string]string)
	lines := strings.Split(raw, "\n")
	for _, def := range defs {
		out[def.key] = extractSection(lines, def.headers)
	}
	return out
}

func extractSection(lines []string, headers []string) string {
	start := -1
	for i, line := range lines {
		trim := strings.TrimSpace(line)
		for _, h := range headers {
			if trim == h {
				start = i + 1
				break
			}
		}
		if start >= 0 {
			break
		}
	}
	if start < 0 {
		return ""
	}
	var b strings.Builder
	for i := start; i < len(lines); i++ {
		if strings.HasPrefix(strings.TrimSpace(lines[i]), "## ") {
			break
		}
		b.WriteString(lines[i])
		b.WriteByte('\n')
	}
	return strings.TrimSpace(b.String())
}

func bulletLines(block string) []string {
	var items []string
	for _, line := range strings.Split(block, "\n") {
		line = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(line), "-"))
		line = strings.TrimSpace(strings.TrimPrefix(line, "*"))
		if line != "" {
			items = append(items, line)
		}
	}
	return items
}

// MemoToIntent derives simplified intent from memo.
func MemoToIntent(memo models.ChapterMemo) models.ChapterIntent {
	return models.ChapterIntent{
		Goal:      firstLine(memo.Goal),
		MustKeep:  memo.MustKeep,
		MustAvoid: memo.MustAvoid,
	}
}

func firstLine(s string) string {
	s = strings.TrimSpace(s)
	if idx := strings.IndexByte(s, '\n'); idx >= 0 {
		return strings.TrimSpace(s[:idx])
	}
	return s
}

var titleLine = regexp.MustCompile(`(?m)^TITLE:\s*(.+)\s*$`)

// ParseWriterOutput extracts title and body from writer response.
func ParseWriterOutput(raw string) (title, body string, err error) {
	loc := titleLine.FindStringSubmatch(raw)
	if len(loc) >= 2 {
		title = strings.TrimSpace(loc[1])
		body = strings.TrimSpace(titleLine.ReplaceAllString(raw, ""))
		return title, body, nil
	}
	// Fallback: first non-empty line as title
	lines := strings.Split(strings.TrimSpace(raw), "\n")
	for i, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		title = strings.TrimPrefix(strings.TrimPrefix(line, "# "), "")
		if i+1 < len(lines) {
			body = strings.TrimSpace(strings.Join(lines[i+1:], "\n"))
		}
		return title, body, nil
	}
	return "", "", fmt.Errorf("writer output empty")
}

// ParseRuntimeStateDelta parses reflector JSON.
func ParseRuntimeStateDelta(raw string) (models.RuntimeStateDelta, error) {
	raw = extractJSON(raw)
	var delta models.RuntimeStateDelta
	if err := json.Unmarshal([]byte(raw), &delta); err != nil {
		return delta, err
	}
	return delta, nil
}

// AuditResult is the parsed auditor output.
type AuditResult struct {
	Passed       bool         `json:"passed"`
	OverallScore int          `json:"overallScore"`
	Summary      string       `json:"summary"`
	Issues       []AuditIssue `json:"issues"`
	ParseFailed  bool         `json:"-"`
}

type AuditIssue struct {
	Severity    string `json:"severity"`
	Category    string `json:"category"`
	Description string `json:"description"`
	Suggestion  string `json:"suggestion"`
}

// ParseAuditResult parses auditor JSON output.
func ParseAuditResult(raw string) (AuditResult, error) {
	raw = extractJSON(raw)
	var result AuditResult
	if err := json.Unmarshal([]byte(raw), &result); err != nil {
		return AuditResult{ParseFailed: true, Summary: raw}, err
	}
	return result, nil
}

func extractJSON(raw string) string {
	raw = strings.TrimSpace(raw)
	if strings.HasPrefix(raw, "```") {
		raw = strings.TrimPrefix(raw, "```json")
		raw = strings.TrimPrefix(raw, "```")
		if idx := strings.LastIndex(raw, "```"); idx >= 0 {
			raw = raw[:idx]
		}
	}
	start := strings.Index(raw, "{")
	end := strings.LastIndex(raw, "}")
	if start >= 0 && end > start {
		return raw[start : end+1]
	}
	return raw
}

// CountLength returns character count for zh, word count for en.
func CountLength(text string, lang models.Language) int {
	text = strings.TrimSpace(text)
	if lang == models.LanguageEN {
		return len(strings.Fields(text))
	}
	// Count CJK + other runes excluding whitespace
	n := 0
	for _, r := range text {
		if !isSpace(r) {
			n++
		}
	}
	return n
}

func isSpace(r rune) bool {
	return r == ' ' || r == '\n' || r == '\r' || r == '\t'
}
