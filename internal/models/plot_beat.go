package models

import (
	"gorm.io/gorm"
)

// PlotBeatState 节拍完成度（驱动生成与复盘）。
type PlotBeatState string

const (
	PlotBeatStatePlanned    PlotBeatState = "planned"
	PlotBeatStateInProgress PlotBeatState = "in_progress"
	PlotBeatStateDone       PlotBeatState = "done"
	PlotBeatStateSkipped    PlotBeatState = "skipped"
)

// PlotBeat 情节线上的节拍节点；可选挂到章，表示在本章落实或收尾。
type PlotBeat struct {
	gorm.Model
	PlotlineID uint          `gorm:"not null;uniqueIndex:uidx_plotbeat_line_order,priority:1;index"`
	WorkID     uint          `gorm:"not null;index"`
	BeatIndex  int           `gorm:"not null;uniqueIndex:uidx_plotbeat_line_order,priority:2"`
	Title      string        `gorm:"size:512;not null"`
	Summary    string        `gorm:"type:text"`
	State      PlotBeatState `gorm:"size:32;not null;default:planned;index"`
	ChapterID  *uint         `gorm:"index"`
	Notes      string        `gorm:"type:text"` // 给模型的写作提示/约束，短句为宜
}
