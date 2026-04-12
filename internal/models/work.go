package models

import (
	"gorm.io/gorm"
)

// Work 表示一部小说作品（长篇载体）。
type Work struct {
	gorm.Model
	Title       string `gorm:"size:512;not null"`
	Synopsis    string `gorm:"type:text"`
	AuthorRef   string `gorm:"size:128"` // 外部用户或作者标识
	DefaultLang string `gorm:"size:16"`
}
