package models

import (
	"gorm.io/gorm"
)

// Volume 作品下的一卷。
type Volume struct {
	gorm.Model
	WorkID  uint   `gorm:"not null;uniqueIndex:uidx_volume_work_idx,priority:1"`
	Title   string `gorm:"size:512;not null"`
	Summary string `gorm:"type:text"`
	Index   int    `gorm:"not null;uniqueIndex:uidx_volume_work_idx,priority:2"`
}
