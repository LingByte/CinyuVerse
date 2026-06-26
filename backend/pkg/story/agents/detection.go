package agents

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/LingByte/CinyuVerse/pkg/story/models"
)

// AITellIssue is one detected AI-style pattern.
type AITellIssue struct {
	Severity    string
	Category    string
	Description string
	Suggestion  string
}

// AITellResult aggregates deterministic AI-tell detection.
type AITellResult struct {
	Score  int
	Issues []AITellIssue
}

var aiTellPatternsZH = []*regexp.Regexp{
	regexp.MustCompile(`值得注意的是`),
	regexp.MustCompile(`不得不说`),
	regexp.MustCompile(`毋庸置疑`),
	regexp.MustCompile(`显而易见`),
	regexp.MustCompile(`总而言之`),
	regexp.MustCompile(`与此同时`),
	regexp.MustCompile(`随着.{0,20}的发展`),
	regexp.MustCompile(`在这个.{0,20}的时代`),
	regexp.MustCompile(`仿佛[^。]{0,12}一般`),
	regexp.MustCompile(`心中暗道`),
	regexp.MustCompile(`眼中闪过一丝`),
	regexp.MustCompile(`不禁`),
	regexp.MustCompile(`倒吸.{0,2}凉气`),
	regexp.MustCompile(`全场震惊`),
	regexp.MustCompile(`空气凝固`),
	regexp.MustCompile(`不是[^。]{0,20}而是`),
}

var aiTellPatternsEN = []*regexp.Regexp{
	regexp.MustCompile(`(?i)\bdelve\b`),
	regexp.MustCompile(`(?i)\btapestry\b`),
	regexp.MustCompile(`(?i)\btestament to\b`),
	regexp.MustCompile(`(?i)\bin conclusion\b`),
	regexp.MustCompile(`(?i)\bit'?s worth noting\b`),
	regexp.MustCompile(`(?i)\bmoreover\b`),
	regexp.MustCompile(`(?i)\bfurthermore\b`),
	regexp.MustCompile(`(?i)\bintricate\b`),
	regexp.MustCompile(`(?i)\bpivotal\b`),
}

var transitionWordsZH = []string{"仿佛", "忽然", "竟然", "不禁", "宛如", "猛地", "骤然", "霎时", "顿时"}

// AnalyzeAITells runs zero-LLM AI tell heuristics (InkOS dim 20-23 subset).
func AnalyzeAITells(content string, lang models.Language) AITellResult {
	patterns := aiTellPatternsZH
	if lang == models.LanguageEN {
		patterns = aiTellPatternsEN
	}
	var issues []AITellIssue
	seen := map[string]bool{}
	for _, re := range patterns {
		if loc := re.FindStringIndex(content); loc != nil {
			key := re.String()
			if seen[key] {
				continue
			}
			seen[key] = true
			issues = append(issues, AITellIssue{
				Severity: "warning", Category: "AI Tell",
				Description: "matched pattern: " + content[loc[0]:loc[1]],
				Suggestion:  "Rewrite with concrete scene detail; remove template phrasing.",
			})
		}
	}
	if lang == models.LanguageZH || lang == "" {
		issues = append(issues, checkTransitionDensityZH(content)...)
	}
	issues = append(issues, checkParagraphUniformity(content, lang)...)
	issues = append(issues, checkLeSentenceRun(content, lang)...)

	score := 100 - len(issues)*6
	if score < 0 {
		score = 0
	}
	return AITellResult{Score: score, Issues: issues}
}

func checkTransitionDensityZH(content string) []AITellIssue {
	var issues []AITellIssue
	chars := len([]rune(content))
	if chars == 0 {
		return nil
	}
	budget := chars/3000 + 1
	for _, w := range transitionWordsZH {
		count := strings.Count(content, w)
		if count > budget {
			issues = append(issues, AITellIssue{
				Severity: "warning", Category: "AI Tell",
				Description: w + " 出现 " + itoa(count) + " 次（每3000字建议≤" + itoa(budget) + "）",
				Suggestion:  "减少转折词，改用具体动作或对话推进。",
			})
		}
	}
	return issues
}

func checkParagraphUniformity(content string, lang models.Language) []AITellIssue {
	paras := splitParagraphs(content)
	if len(paras) < 5 {
		return nil
	}
	lengths := make([]int, len(paras))
	for i, p := range paras {
		lengths[i] = countRunes(p)
	}
	// consecutive similar-length paragraphs
	streak := 1
	for i := 1; i < len(lengths); i++ {
		if abs(lengths[i]-lengths[i-1]) < 30 && lengths[i] > 80 {
			streak++
		} else {
			streak = 1
		}
		if streak >= 5 {
			desc := "5+ consecutive paragraphs of similar length"
			if lang != models.LanguageEN {
				desc = "连续5段以上段落长度相近（朱雀/AIGC 高风险）"
			}
			return []AITellIssue{{
				Severity: "warning", Category: "AI Tell",
				Description: desc,
				Suggestion:  "Merge or split paragraphs for irregular rhythm.",
			}}
		}
	}
	long := 0
	for _, l := range lengths {
		if l > 280 {
			long++
		}
	}
	if long >= 2 {
		desc := "2+ paragraphs exceed 280 chars without break"
		if lang != models.LanguageEN {
			desc = "2个以上段落超过280字未换段"
		}
		return []AITellIssue{{
			Severity: "warning", Category: "AI Tell",
			Description: desc,
			Suggestion:  "Split long paragraphs for mobile pacing.",
		}}
	}
	return nil
}

func checkLeSentenceRun(content string, lang models.Language) []AITellIssue {
	if lang == models.LanguageEN {
		return nil
	}
	sents := splitSentences(content)
	run, maxRun := 0, 0
	for _, s := range sents {
		if strings.Contains(s, "了") {
			run++
			if run > maxRun {
				maxRun = run
			}
		} else {
			run = 0
		}
	}
	if maxRun >= 6 {
		return []AITellIssue{{
			Severity: "warning", Category: "AI Tell",
			Description: "连续" + itoa(maxRun) + "句含「了」",
			Suggestion:  "变换句式，避免「了」字连击。",
		}}
	}
	return nil
}

// ValidatePostWrite runs hard post-write checks (InkOS 11-rule subset).
func ValidatePostWrite(content string, lang models.Language) []PostWriteViolation {
	var out []PostWriteViolation
	if strings.TrimSpace(content) == "" {
		out = append(out, PostWriteViolation{
			Rule: "empty-body", Severity: "error",
			Description: "chapter body is empty", Suggestion: "regenerate draft",
		})
		return out
	}
	if CountLength(content, lang) < 200 {
		out = append(out, PostWriteViolation{
			Rule: "too-short", Severity: "warning",
			Description: "chapter unusually short", Suggestion: "expand scenes",
		})
	}
	if strings.Contains(content, "——") {
		out = append(out, PostWriteViolation{
			Rule: "em-dash", Severity: "warning",
			Description: "contains em-dash 「——」", Suggestion: "replace with comma or rephrase",
		})
	}
	if not, erShi := countNotErShiPattern(content); not > 0 && erShi > 0 && not+erShi > 3 {
		out = append(out, PostWriteViolation{
			Rule: "not-but-pattern", Severity: "warning",
			Description: fmt.Sprintf("「不是…而是…」句式过多（不是×%d，而是×%d）", not, erShi),
			Suggestion:  "rewrite with direct statements; avoid 不是/而是 antithesis pairs",
		})
	}
	metaPatterns := []string{"显然", "不言而喻", "读者", "本章", "值得一提的是"}
	for _, p := range metaPatterns {
		if strings.Contains(content, p) {
			out = append(out, PostWriteViolation{
				Rule: "meta-narrator", Severity: "warning",
				Description: "meta phrasing: " + p, Suggestion: "remove authorial commentary",
			})
			break
		}
	}
	return out
}

// ChooseReviseMode picks reviser mode from audit issues (InkOS: spot-fix default, anti-detect for AI tells).
func ChooseReviseMode(issues []AuditIssue) ReviseMode {
	aiCount := 0
	for _, i := range issues {
		if i.Category == "AI Tell" || strings.Contains(strings.ToLower(i.Category), "ai") {
			aiCount++
		}
	}
	if aiCount >= 2 {
		return ReviseModeAntiDetect
	}
	if aiCount == 1 {
		return ReviseModeSpotFix
	}
	return ReviseModeSpotFix
}

// AITellScore returns 0-100 score from AnalyzeAITells.
func AITellScore(content string, lang models.Language) int {
	return AnalyzeAITells(content, lang).Score
}

func splitParagraphs(content string) []string {
	parts := strings.Split(content, "\n\n")
	var out []string
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" && !strings.HasPrefix(p, "#") {
			out = append(out, p)
		}
	}
	return out
}

func splitSentences(content string) []string {
	var sents []string
	var b strings.Builder
	for _, r := range content {
		b.WriteRune(r)
		if r == '。' || r == '！' || r == '？' || r == '.' || r == '!' || r == '?' {
			s := strings.TrimSpace(b.String())
			if s != "" {
				sents = append(sents, s)
			}
			b.Reset()
		}
	}
	if tail := strings.TrimSpace(b.String()); tail != "" {
		sents = append(sents, tail)
	}
	return sents
}

func countRunes(s string) int {
	n := 0
	for range s {
		n++
	}
	return n
}

func abs(n int) int {
	if n < 0 {
		return -n
	}
	return n
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b [20]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	return string(b[i:])
}

// SensitiveWordMatch is one sensitive word hit.
type SensitiveWordMatch struct {
	Word     string
	Severity string // block | warn
}

// SensitiveWordResult aggregates sensitive word scan.
type SensitiveWordResult struct {
	Found  []SensitiveWordMatch
	Issues []AuditIssue
}

var defaultBlocked = []string{"违禁示例"}

// AnalyzeSensitiveWords scans for blocked terms.
func AnalyzeSensitiveWords(content string, custom []string, lang models.Language) SensitiveWordResult {
	words := append([]string{}, defaultBlocked...)
	words = append(words, custom...)
	var found []SensitiveWordMatch
	var issues []AuditIssue
	for _, w := range words {
		if w == "" {
			continue
		}
		if strings.Contains(content, w) {
			found = append(found, SensitiveWordMatch{Word: w, Severity: "block"})
			issues = append(issues, AuditIssue{
				Severity: "critical", Category: "Sensitive Word",
				Description: "blocked term: " + w, Suggestion: "Remove or replace.",
			})
		}
	}
	_ = lang
	return SensitiveWordResult{Found: found, Issues: issues}
}

// PostWriteViolation is a deterministic post-write rule failure.
type PostWriteViolation struct {
	Rule        string
	Severity    string // error | warning
	Description string
	Suggestion  string
}

// DetectChapterResult aggregates deterministic detection for one chapter.
type DetectChapterResult struct {
	ChapterNumber int                  `json:"chapterNumber"`
	Title         string               `json:"title"`
	AITells       AITellResult         `json:"aiTells"`
	Sensitive     SensitiveWordResult  `json:"sensitive"`
	PostWrite     []PostWriteViolation `json:"postWrite"`
}

// DetectChapter runs all deterministic detectors on chapter content.
func DetectChapter(book models.BookConfig, chapterNumber int, title, content string) DetectChapterResult {
	lang := book.Language
	return DetectChapterResult{
		ChapterNumber: chapterNumber,
		Title:         title,
		AITells:       AnalyzeAITells(content, lang),
		Sensitive:     AnalyzeSensitiveWords(content, nil, lang),
		PostWrite:     ValidatePostWrite(content, lang),
	}
}

// countNotErShiPattern counts 不是/而是 without false positives from 并非、并不是, etc.
func countNotErShiPattern(content string) (not, erShi int) {
	scrubbed := content
	for _, ph := range []string{"并非", "并不是", "不必", "不用", "不会", "不能", "不要", "不可", "不如"} {
		scrubbed = strings.ReplaceAll(scrubbed, ph, "")
	}
	not = strings.Count(scrubbed, "不是")
	erShi = strings.Count(content, "而是")
	return not, erShi
}

// IssuesFromDetect converts detect API output into reviser-facing audit issues.
func IssuesFromDetect(d DetectChapterResult) []AuditIssue {
	var issues []AuditIssue
	for _, i := range d.AITells.Issues {
		issues = append(issues, AuditIssue{
			Severity: i.Severity, Category: i.Category,
			Description: i.Description, Suggestion: i.Suggestion,
		})
	}
	issues = append(issues, d.Sensitive.Issues...)
	issues = append(issues, ViolationsToAuditIssues(d.PostWrite)...)
	return issues
}

func ViolationsToAuditIssues(vs []PostWriteViolation) []AuditIssue {
	var issues []AuditIssue
	for _, v := range vs {
		sev := "warning"
		if v.Severity == "error" {
			sev = "critical"
		}
		cat := v.Rule
		switch v.Rule {
		case "em-dash", "not-but-pattern", "meta-narrator":
			cat = "AI Tell"
		}
		issues = append(issues, AuditIssue{
			Severity: sev, Category: cat,
			Description: v.Description, Suggestion: v.Suggestion,
		})
	}
	return issues
}