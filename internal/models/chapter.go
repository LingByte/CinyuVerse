package models

import (
	"gorm.io/gorm"
)

// ChapterStatus 章节生命周期。
type ChapterStatus string

const (
	ChapterStatusDraft     ChapterStatus = "draft"
	ChapterStatusReviewing ChapterStatus = "reviewing"
	ChapterStatusPublished ChapterStatus = "published"
)

// Chapter 卷下的章，正文可分段落在 Scene。
type Chapter struct {
	gorm.Model
	VolumeID uint          `gorm:"not null;uniqueIndex:uidx_chapter_volume_idx,priority:1"`
	Title    string        `gorm:"size:512;not null"`
	Index    int           `gorm:"not null;uniqueIndex:uidx_chapter_volume_idx,priority:2"`
	Status   ChapterStatus `gorm:"size:32;not null;default:draft"`
	Summary  string        `gorm:"type:text"`
}
