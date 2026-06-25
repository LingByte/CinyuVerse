package agents

import "strings"

// StripChapterBody removes the leading markdown H1 title from stored chapter files.
func StripChapterBody(content string) string {
	content = strings.TrimSpace(content)
	if !strings.HasPrefix(content, "#") {
		return content
	}
	lines := strings.Split(content, "\n")
	start := 0
	for i, line := range lines {
		trim := strings.TrimSpace(line)
		if trim == "" {
			continue
		}
		if strings.HasPrefix(trim, "# ") {
			start = i + 1
			break
		}
		return content
	}
	for start < len(lines) && strings.TrimSpace(lines[start]) == "" {
		start++
	}
	if start >= len(lines) {
		return ""
	}
	return strings.TrimSpace(strings.Join(lines[start:], "\n"))
}
