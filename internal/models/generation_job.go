package models

import (
	"gorm.io/gorm"
)

// GenerationJobType 异步任务类型。
type GenerationJobType string

const (
	JobTypeChapterGenerate GenerationJobType = "chapter_generate"
	JobTypeSummarize       GenerationJobType = "summarize"
	JobTypeExtractMemory   GenerationJobType = "extract_memory"
)

// GenerationJobStatus 任务状态。
type GenerationJobStatus string

const (
	JobStatusQueued    GenerationJobStatus = "queued"
	JobStatusRunning   GenerationJobStatus = "running"
	JobStatusSucceeded GenerationJobStatus = "succeeded"
	JobStatusFailed    GenerationJobStatus = "failed"
	JobStatusCancelled GenerationJobStatus = "cancelled"
)

// GenerationJob 模型调用与流水线编排的持久化任务。
type GenerationJob struct {
	gorm.Model
	WorkID           uint                 `gorm:"not null;index"`
	ChapterID        *uint                `gorm:"index"`
	Type             GenerationJobType    `gorm:"size:32;not null;index"`
	Status           GenerationJobStatus  `gorm:"size:32;not null;index"`
	IdempotencyKey   string               `gorm:"size:128;uniqueIndex"`
	ErrorMessage     string               `gorm:"type:text"`
	ProgressPercent  int                  `gorm:"not null;default:0"`
	PromptVersion    string               `gorm:"size:64"`
	ModelName        string               `gorm:"size:128"`
	MetaJSON         string               `gorm:"type:text"` // 请求参数快照
	ResultChapterID  *uint                `gorm:"index"`
}
