package agents

import (
	"fmt"
	"strings"
)

// NormalizeStyleParagraphs merges over-fragmented one-phrase-per-line output into 2–4 sentence paragraphs.
func NormalizeStyleParagraphs(content string) string {
	lines := strings.Split(content, "\n")
	var raw []string
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line != "" {
			raw = append(raw, line)
		}
	}
	if len(raw) == 0 {
		return content
	}

	var paras []string
	var buf []string
	flush := func() {
		if len(buf) == 0 {
			return
		}
		paras = append(paras, joinStyleSentences(buf))
		buf = nil
	}

	for _, line := range raw {
		r := []rune(line)
		isDialogue := strings.HasPrefix(line, `"`) || strings.HasPrefix(line, `"`) || strings.HasPrefix(line, "「")
		isSfx := len(r) <= 8 && (strings.HasSuffix(line, "！") || strings.HasSuffix(line, "!"))

		if isDialogue || isSfx {
			flush()
			paras = append(paras, line)
			continue
		}

		if len(r) <= 28 && len(buf) < 4 {
			buf = append(buf, line)
			continue
		}
		flush()
		paras = append(paras, line)
	}
	flush()
	return strings.Join(paras, "\n\n")
}

// validateStyleApplyOutput rejects hallucinated plot extension and extreme fragmentation.
func validateStyleApplyOutput(original, revised string) error {
	if err := detectPlotDrift(original, revised); err != nil {
		return err
	}
	if fragmentationScore(revised) > 0.45 {
		return fmt.Errorf("style-apply over-fragmented (too many micro-lines); output was normalized but still too broken — retry with a stronger model")
	}
	return nil
}

func detectPlotDrift(original, revised string) error {
	origRunes := len([]rune(original))
	revRunes := len([]rune(revised))
	if revRunes <= origRunes*125/100 {
		return nil
	}
	for _, marker := range []string{"百层", "两百层", "三百层", "半个时辰", "半山腰", "外围的修士", "外围修士", "快三倍", "距离——"} {
		if strings.Contains(revised, marker) && !strings.Contains(original, marker) {
			return fmt.Errorf("style-apply added plot not in original: %q", marker)
		}
	}
	if revRunes > origRunes*150/100 {
		return fmt.Errorf("style-apply output too long (%d vs %d runes): likely added new scenes", revRunes, origRunes)
	}
	return nil
}

// fragmentationScore is the fraction of lines with ≤10 runes (excluding dialogue).
func fragmentationScore(content string) float64 {
	lines := strings.Split(content, "\n")
	var short, total int
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if strings.HasPrefix(line, `"`) || strings.HasPrefix(line, `"`) || strings.HasPrefix(line, "「") {
			continue
		}
		total++
		if len([]rune(line)) <= 10 {
			short++
		}
	}
	if total == 0 {
		return 0
	}
	return float64(short) / float64(total)
}

func joinStyleSentences(parts []string) string {
	var b strings.Builder
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		if b.Len() > 0 {
			b.WriteString("")
		}
		b.WriteString(p)
		if !hasClosingPunct(p) {
			b.WriteString("。")
		}
	}
	return b.String()
}

func hasClosingPunct(s string) bool {
	if s == "" {
		return false
	}
	r := []rune(s)
	last := r[len(r)-1]
	return last == '。' || last == '！' || last == '？' || last == '…' || last == '.' || last == '!' || last == '?'
}
