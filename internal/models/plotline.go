package models

import (
	"gorm.io/gorm"
)

// PlotlineKind 情节线类型（检索与 UI 分组用）。
type PlotlineKind string

const (
	PlotlineKindMain PlotlineKind = "main"
	PlotlineKindSub  PlotlineKind = "sub"
)

// PlotlineStatus 情节线生命周期。
type PlotlineStatus string

const (
	PlotlineStatusActive    PlotlineStatus = "active"
	PlotlineStatusResolved  PlotlineStatus = "resolved"
	PlotlineStatusArchived  PlotlineStatus = "archived"
	PlotlineStatusSuspended PlotlineStatus = "suspended"
)

// Plotline 作品下的一条叙事线（主线/支线），供引擎拼装「本章要推进的线」。
type Plotline struct {
	gorm.Model
	WorkID  uint           `gorm:"not null;uniqueIndex:uidx_plotline_work_idx,priority:1"`
	Index   int            `gorm:"not null;uniqueIndex:uidx_plotline_work_idx,priority:2"`
	Name    string         `gorm:"size:256;not null"`
	Summary string         `gorm:"type:text"`
	Kind    PlotlineKind   `gorm:"size:32;not null;default:main;index"`
	Status  PlotlineStatus `gorm:"size:32;not null;default:active;index"`
}
