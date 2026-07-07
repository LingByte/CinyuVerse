package analytics

import (
	"strings"

	"github.com/LingByte/CinyuVerse/pkg/story/models"
	"github.com/LingByte/CinyuVerse/pkg/story/store"
)

// BookStats summarizes chapter and word metrics for a book.
type BookStats struct {
	BookID        string `json:"bookId"`
	ChapterCount  int    `json:"chapterCount"`
	TotalWords    int    `json:"totalWords"`
	ApprovedCount int    `json:"approvedCount"`
	RejectedCount int    `json:"rejectedCount"`
	PendingCount  int    `json:"pendingCount"`
	AvgWordsPerCh int    `json:"avgWordsPerChapter"`
}

// ComputeBookStats aggregates chapter index metrics.
func ComputeBookStats(st store.BookStore, bookID string) (BookStats, error) {
	index, err := st.LoadChapterIndex(bookID)
	if err != nil {
		return BookStats{}, err
	}
	stats := BookStats{BookID: bookID, ChapterCount: len(index)}
	for _, ch := range index {
		stats.TotalWords += ch.WordCount
		switch ch.Status {
		case models.ChapterStatusApproved:
			stats.ApprovedCount++
		case models.ChapterStatusRejected:
			stats.RejectedCount++
		default:
			stats.PendingCount++
		}
	}
	if stats.ChapterCount > 0 {
		stats.AvgWordsPerCh = stats.TotalWords / stats.ChapterCount
	}
	return stats, nil
}

// EvalReport is a lightweight quality scorecard (InkOS eval subset).
type EvalReport struct {
	BookID      string   `json:"bookId"`
	Score       int      `json:"score"`
	Summary     string   `json:"summary"`
	Suggestions []string `json:"suggestions"`
}

// EvaluateBook produces a heuristic quality report from stats + hook health inputs.
func EvaluateBook(stats BookStats, openHooks int, staleHooks int) EvalReport {
	score := 70
	if stats.ChapterCount > 0 {
		score += min(10, stats.ApprovedCount*2)
	}
	if stats.RejectedCount > 0 {
		score -= stats.RejectedCount * 3
	}
	if staleHooks > 0 {
		score -= staleHooks * 2
	}
	if score > 100 {
		score = 100
	}
	if score < 0 {
		score = 0
	}
	report := EvalReport{
		BookID: stats.BookID, Score: score,
		Summary: "Heuristic eval based on chapter approval ratio and hook health.",
	}
	if stats.PendingCount > 0 {
		report.Suggestions = append(report.Suggestions, "Review pending chapters in manual mode.")
	}
	if staleHooks > 0 {
		report.Suggestions = append(report.Suggestions, "Resolve or advance stale hooks.")
	}
	if openHooks > 12 {
		report.Suggestions = append(report.Suggestions, "Reduce open hook count for tighter pacing.")
	}
	return report
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// FormatExport concatenates chapters into a single document.
func FormatExport(st store.BookStore, bookID, format string) (string, error) {
	index, err := st.LoadChapterIndex(bookID)
	if err != nil {
		return "", err
	}
	book, err := st.LoadBookConfig(bookID)
	if err != nil {
		return "", err
	}
	var b strings.Builder
	if format == "txt" {
		fmtTitle := book.Title + "\n\n"
		b.WriteString(fmtTitle)
	} else {
		b.WriteString("# ")
		b.WriteString(book.Title)
		b.WriteString("\n\n")
	}
	for _, ch := range index {
		content, err := st.ReadText(bookID, "chapters/"+ch.FileName)
		if err != nil {
			continue
		}
		if format == "txt" {
			b.WriteString(content)
		} else {
			b.WriteString(content)
		}
		b.WriteString("\n\n---\n\n")
	}
	return b.String(), nil
}
