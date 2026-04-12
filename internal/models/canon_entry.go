package models

import (
	"gorm.io/gorm"
)

// CanonEntry 硬设定（世界观/规则），版本化防吃书。
type CanonEntry struct {
	gorm.Model
	WorkID    uint   `gorm:"not null;index"`
	Namespace string `gorm:"size:64;not null;index"`
	Key       string `gorm:"size:256;not null"`
	Value     string `gorm:"type:text;not null"`
	Version   int    `gorm:"not null;default:1"`
}
