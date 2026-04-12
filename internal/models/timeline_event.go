package models

import (
	"gorm.io/gorm"
)

// TimelineEvent 叙事时间线上的事件节点。
type TimelineEvent struct {
	gorm.Model
	WorkID    uint   `gorm:"not null;index"`
	ChapterID *uint  `gorm:"index"`
	Label     string `gorm:"size:256;not null"` // 叙事内时间标签
	Summary   string `gorm:"type:text;not null"`
	SortOrder int    `gorm:"not null;index"`
}
