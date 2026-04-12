package models

import (
	"gorm.io/gorm"
)

// MemoryKind 记忆块类型，用于检索加权。
type MemoryKind string

const (
	MemoryKindFact         MemoryKind = "fact"
	MemoryKindRelationship MemoryKind = "relationship"
	MemoryKindForeshadow   MemoryKind = "foreshadow"
	MemoryKindStyle        MemoryKind = "style_note"
)

// MemoryChunk 可向量化的记忆单元，关联出处。
type MemoryChunk struct {
	gorm.Model
	WorkID        uint        `gorm:"not null;index"`
	ChapterID     *uint       `gorm:"index"`
	SceneID       *uint       `gorm:"index"`
	Kind          MemoryKind  `gorm:"size:32;not null;index"`
	Text          string      `gorm:"type:text;not null"`
	EntityRefs    string      `gorm:"type:text"` // 角色/地点 ID 列表 JSON
	VectorRef     string      `gorm:"size:128"` // 外部向量库 document id
	Confidence    float32     `gorm:"not null;default:1"`
	SourceOffsets string      `gorm:"size:128"` // 原文 span，业务层解析
}
