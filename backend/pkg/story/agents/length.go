package agents

import "github.com/LingByte/CinyuVerse/pkg/story/models"

// LengthSpec defines soft/hard word-count bands for a chapter.
type LengthSpec struct {
	Target      int
	SoftMin     int
	SoftMax     int
	HardMin     int
	HardMax     int
	CountingMode string // zh_chars | en_words
}

// BuildLengthSpec derives InkOS-style conservative length bands.
func BuildLengthSpec(target int, lang models.Language) LengthSpec {
	if target <= 0 {
		if lang == models.LanguageEN {
			target = models.DefaultChapterWordCountEN
		} else {
			target = models.DefaultChapterWordCountZH
		}
	}
	mode := "zh_chars"
	if lang == models.LanguageEN {
		mode = "en_words"
	}
	softMin := int(float64(target) * 0.85)
	softMax := int(float64(target) * 1.15)
	hardMin := int(float64(target) * 0.70)
	hardMax := int(float64(target) * 1.35)
	return LengthSpec{
		Target: target, SoftMin: softMin, SoftMax: softMax,
		HardMin: hardMin, HardMax: hardMax, CountingMode: mode,
	}
}

func countWithSpec(text string, spec LengthSpec, lang models.Language) int {
	if spec.CountingMode == "en_words" || lang == models.LanguageEN {
		return CountLength(text, models.LanguageEN)
	}
	return CountLength(text, models.LanguageZH)
}

// IsOutsideHardRange reports whether length is outside the hard band.
func IsOutsideHardRange(length int, spec LengthSpec) bool {
	return length < spec.HardMin || length > spec.HardMax
}

// IsOutsideSoftRange reports whether length is outside the soft band.
func IsOutsideSoftRange(length int, spec LengthSpec) bool {
	return length < spec.SoftMin || length > spec.SoftMax
}

// ChooseNormalizeMode picks compress vs expand.
func ChooseNormalizeMode(length int, spec LengthSpec) string {
	if length > spec.SoftMax {
		return "compress"
	}
	if length < spec.SoftMin {
		return "expand"
	}
	return ""
}
