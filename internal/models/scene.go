package models

import (
	"gorm.io/gorm"
)

// Scene 章内场景/片段，便于检索分块与细粒度修订。
type Scene struct {
	gorm.Model
	ChapterID uint   `gorm:"not null;uniqueIndex:uidx_scene_chapter_order,priority:1"`
	Order     int    `gorm:"not null;uniqueIndex:uidx_scene_chapter_order,priority:2"`
	Title     string `gorm:"size:256"`
	Content   string `gorm:"type:text"`
}
