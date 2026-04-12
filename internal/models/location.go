package models

import (
	"gorm.io/gorm"
)

// Location 地点/场景设定。
type Location struct {
	gorm.Model
	WorkID      uint   `gorm:"not null;index"`
	Name        string `gorm:"size:256;not null"`
	Description string `gorm:"type:text"`
	ParentID    *uint  `gorm:"index"`
}
