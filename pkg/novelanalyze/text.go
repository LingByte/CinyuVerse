package novelanalyze

import (
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"unicode/utf8"
)

// SplitTitleBody treats the first non-empty line as title, rest as body (from novelfetch txt).
func SplitTitleBody(raw string) (title, body string) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", ""
	}
	lines := strings.Split(strings.ReplaceAll(raw, "\r\n", "\n"), "\n")
	var nonEmpty []string
	for _, ln := range lines {
		t := strings.TrimSpace(ln)
		if t != "" {
			nonEmpty = append(nonEmpty, t)
		}
	}
	if len(nonEmpty) == 0 {
		return "", ""
	}
	if len(nonEmpty) == 1 {
		return nonEmpty[0], ""
	}
	return nonEmpty[0], strings.Join(nonEmpty[1:], "\n")
}

// TruncateUTF8 trims by rune count (for LLM context limits).
func TruncateUTF8(s string, maxRunes int) string {
	if maxRunes <= 0 {
		return s
	}
	r := []rune(s)
	if len(r) <= maxRunes {
		return s
	}
	return string(r[:maxRunes]) + "\n\n[…已截断，仅取前文用于分析…]"
}

// RuneLen returns utf8 rune count.
func RuneLen(s string) int {
	return utf8.RuneCountInString(s)
}

// ListChapterTxt returns sorted chapter id strings from dir/*.txt (numeric sort).
func ListChapterTxt(dir string) ([]string, error) {
	matches, err := filepath.Glob(filepath.Join(dir, "*.txt"))
	if err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(matches))
	for _, p := range matches {
		base := filepath.Base(p)
		id := strings.TrimSuffix(base, ".txt")
		if id == "" || id == "chapter_ids" {
			continue
		}
		if _, err := strconv.Atoi(id); err != nil {
			continue
		}
		ids = append(ids, id)
	}
	sort.Slice(ids, func(i, j int) bool {
		ai, _ := strconv.Atoi(ids[i])
		bj, _ := strconv.Atoi(ids[j])
		return ai < bj
	})
	return ids, nil
}
