package agents

import (
	"fmt"
	"math"
	"regexp"
	"sort"
	"strings"
	"unicode"

	"github.com/LingByte/CinyuVerse/pkg/story/models"
)

// StyleProfile is a statistical fingerprint of reference prose.
type StyleProfile struct {
	SourceName           string   `json:"sourceName"`
	AvgSentenceLength    float64  `json:"avgSentenceLength"`
	SentenceLengthStdDev float64  `json:"sentenceLengthStdDev"`
	AvgParagraphLength   float64  `json:"avgParagraphLength"`
	VocabularyDiversity  float64  `json:"vocabularyDiversity"`
	TopOpeningPatterns   []string `json:"topOpeningPatterns"`
	RhetoricalFeatures   []string `json:"rhetoricalFeatures"`
}

type rhetoricalPattern struct {
	name string
	re   *regexp.Regexp
}

var rhetoricalZH = []rhetoricalPattern{
	{"比喻", regexp.MustCompile(`[像如仿佛似](?:是|同|一般|一样)`)},
	{"反问", regexp.MustCompile(`难道|怎么可能|岂不是`)},
	{"短句节奏", regexp.MustCompile(`[。！？][^。！？]{1,8}[。！？]`)},
}

var rhetoricalEN = []rhetoricalPattern{
	{"simile", regexp.MustCompile(`(?i)\b(?:like a|as if|as though)\b`)},
	{"rhetorical question", regexp.MustCompile(`(?i)\b(?:how could|why would)\b[^.!?]*\?`)},
}

// AnalyzeStyle extracts a style profile from reference text (zero LLM).
func AnalyzeStyle(text, sourceName string, lang models.Language) StyleProfile {
	isEn := lang == models.LanguageEN
	splitter := regexp.MustCompile(`[。！？\n]+`)
	if isEn {
		splitter = regexp.MustCompile(`[.!?\n]+`)
	}
	sentences := filterNonEmpty(splitter.Split(text, -1))
	paragraphs := filterNonEmpty(strings.Split(text, "\n\n"))

	measure := func(s string) int {
		if isEn {
			return len(wordRe.FindAllString(s, -1))
		}
		return len([]rune(strings.ReplaceAll(s, " ", "")))
	}

	slens := mapInts(sentences, measure)
	plens := mapInts(paragraphs, measure)
	avgSent := avg(slens)
	avgPara := avg(plens)

	var vocab float64
	if isEn {
		words := wordRe.FindAllString(strings.ToLower(text), -1)
		if len(words) > 0 {
			vocab = float64(len(uniqueStrings(words))) / float64(len(words))
		}
	} else {
		chars := hanRe.ReplaceAllString(text, "")
		runes := []rune(chars)
		if len(runes) > 0 {
			vocab = float64(len(uniqueRunes(runes))) / float64(len(runes))
		}
	}

	openings := map[string]int{}
	for _, s := range sentences {
		key := ""
		if isEn {
			m := wordRe.FindString(s)
			if m != "" {
				key = strings.ToLower(m)
			}
		} else if len([]rune(s)) >= 2 {
			key = string([]rune(s)[:2])
		}
		if key != "" {
			openings[key]++
		}
	}
	top := topPatterns(openings, 5, 3)

	patterns := rhetoricalZH
	if isEn {
		patterns = rhetoricalEN
	}
	var rhet []string
	for _, p := range patterns {
		if p.re.FindStringIndex(text) != nil {
			rhet = append(rhet, p.name)
		}
	}

	return StyleProfile{
		SourceName: sourceName, AvgSentenceLength: avgSent,
		SentenceLengthStdDev: stdDev(slens, avgSent), AvgParagraphLength: avgPara,
		VocabularyDiversity: vocab, TopOpeningPatterns: top, RhetoricalFeatures: rhet,
	}
}

var wordRe = regexp.MustCompile(`[A-Za-z0-9]+(?:'[A-Za-z0-9]+)?`)
var hanRe = regexp.MustCompile(`[\s\n\r，。！？、：；""''（）【】《》\d]`)

func filterNonEmpty(ss []string) []string {
	var out []string
	for _, s := range ss {
		if strings.TrimSpace(s) != "" {
			out = append(out, strings.TrimSpace(s))
		}
	}
	return out
}

func mapInts(ss []string, fn func(string) int) []int {
	out := make([]int, len(ss))
	for i, s := range ss {
		out[i] = fn(s)
	}
	return out
}

func avg(nums []int) float64 {
	if len(nums) == 0 {
		return 0
	}
	sum := 0
	for _, n := range nums {
		sum += n
	}
	return float64(sum) / float64(len(nums))
}

func stdDev(nums []int, mean float64) float64 {
	if len(nums) < 2 {
		return 0
	}
	var sum float64
	for _, n := range nums {
		d := float64(n) - mean
		sum += d * d
	}
	return math.Sqrt(sum / float64(len(nums)))
}

func uniqueStrings(ss []string) map[string]struct{} {
	m := map[string]struct{}{}
	for _, s := range ss {
		m[s] = struct{}{}
	}
	return m
}

func uniqueRunes(rr []rune) map[rune]struct{} {
	m := map[rune]struct{}{}
	for _, r := range rr {
		if !unicode.IsSpace(r) {
			m[r] = struct{}{}
		}
	}
	return m
}

func topPatterns(counts map[string]int, limit, minCount int) []string {
	type kv struct{ k string; v int }
	var pairs []kv
	for k, v := range counts {
		if v >= minCount {
			pairs = append(pairs, kv{k, v})
		}
	}
	sort.Slice(pairs, func(i, j int) bool { return pairs[i].v > pairs[j].v })
	if len(pairs) > limit {
		pairs = pairs[:limit]
	}
	out := make([]string, len(pairs))
	for i, p := range pairs {
		out[i] = fmt.Sprintf("%s (%d)", p.k, p.v)
	}
	return out
}
