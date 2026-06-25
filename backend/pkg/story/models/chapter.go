package models

import "time"

// ChapterStatus is the review lifecycle of a chapter draft.
type ChapterStatus string

const (
	ChapterStatusDraft         ChapterStatus = "draft"
	ChapterStatusReadyForReview ChapterStatus = "ready-for-review"
	ChapterStatusApproved      ChapterStatus = "approved"
	ChapterStatusRejected      ChapterStatus = "rejected"
	ChapterStatusAuditFailed   ChapterStatus = "audit-failed"
)

// ChapterMeta is index metadata for one chapter file.
type ChapterMeta struct {
	Number    int           `json:"number"`
	Title     string        `json:"title"`
	WordCount int           `json:"wordCount"`
	Status    ChapterStatus `json:"status"`
	FileName  string        `json:"fileName"`
	UpdatedAt time.Time     `json:"updatedAt"`
}
