package models

import "time"

// Language is the primary prose language for a book.
type Language string

const (
	LanguageZH Language = "zh"
	LanguageEN Language = "en"
)

// BookStatus tracks lifecycle of a book project.
type BookStatus string

const (
	BookStatusDraft    BookStatus = "draft"
	BookStatusActive   BookStatus = "active"
	BookStatusComplete BookStatus = "complete"
)

// BookConfig is persisted metadata for one book under books/<id>/.
type BookConfig struct {
	ID              string     `json:"id"`
	Title           string     `json:"title"`
	Genre           string     `json:"genre"`
	Language        Language   `json:"language"`
	ChapterWordCount int       `json:"chapterWordCount"`
	TargetChapters  int        `json:"targetChapters,omitempty"`
	Status          BookStatus `json:"status"`
	CreatedAt       time.Time  `json:"createdAt"`
	UpdatedAt       time.Time  `json:"updatedAt"`
}

// DefaultChapterWordCountZH is the default target length for Chinese chapters.
const DefaultChapterWordCountZH = 3000

// DefaultChapterWordCountEN is the default target length for English chapters.
const DefaultChapterWordCountEN = 2500
