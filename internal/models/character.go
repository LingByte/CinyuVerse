package models

import (
	"gorm.io/gorm"
)

// Character 角色卡，归属作品维度。
type Character struct {
	gorm.Model
	WorkID      uint   `gorm:"not null;index"`
	Name        string `gorm:"size:256;not null"`
	Aliases     string `gorm:"type:text"` // 逗号分隔或 JSON，由业务层约定
	Profile     string `gorm:"type:text"` // 结构化设定可存 JSON 字符串
	ArcStage    string `gorm:"size:64"`
	PovEligible bool   `gorm:"not null;default:true"`
}
