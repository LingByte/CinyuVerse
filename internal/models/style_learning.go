package models

import (
	"strings"
	"time"

	"gorm.io/gorm"
)

const (
	TABLE_STYLE_PROFILE = "ci_style_profiles"
	TABLE_STYLE_SAMPLE  = "ci_style_samples"
)

type StyleProfile struct {
	BaseModel
	Name           string     `json:"name" gorm:"size:128;not null;comment:风格档案名"`
	Status         string     `json:"status" gorm:"size:32;default:draft;comment:draft/active/archived"`
	Description    string     `json:"description" gorm:"type:text;comment:档案说明"`
	Constraints    string     `json:"constraints" gorm:"type:text;comment:手工约束JSON"`
	LearnedSpec    string     `json:"learnedSpec" gorm:"type:text;comment:学习结果JSON"`
	LearnedSummary string     `json:"learnedSummary" gorm:"type:text;comment:学习结果摘要"`
	LearnedAt      *time.Time `json:"learnedAt" gorm:"comment:学习完成时间"`
}

func (StyleProfile) TableName() string { return TABLE_STYLE_PROFILE }

type StyleSample struct {
	BaseModel
	ProfileID uint   `json:"profileId" gorm:"index;not null;comment:所属风格档案"`
	Title     string `json:"title" gorm:"size:255;comment:样本标题"`
	Source    string `json:"source" gorm:"size:64;comment:来源(manual/upload/chapter)"`
	Content   string `json:"content" gorm:"type:longtext;not null;comment:样本文本"`
	WordCount int    `json:"wordCount" gorm:"comment:字数"`
}

func (StyleSample) TableName() string { return TABLE_STYLE_SAMPLE }

func CreateStyleProfile(db *gorm.DB, p *StyleProfile) error {
	return db.Create(p).Error
}

func UpdateStyleProfile(db *gorm.DB, p *StyleProfile) error {
	return db.Save(p).Error
}

func GetStyleProfileByID(db *gorm.DB, id uint) (*StyleProfile, error) {
	var p StyleProfile
	if err := db.Where("id = ? AND is_deleted = ?", id, SoftDeleteStatusActive).First(&p).Error; err != nil {
		return nil, err
	}
	return &p, nil
}

func DeleteStyleProfile(db *gorm.DB, id uint, operator string) error {
	return db.Model(&StyleProfile{}).Where("id = ?", id).Updates(map[string]any{
		"is_deleted": SoftDeleteStatusDeleted,
		"update_by":  operator,
	}).Error
}

func ListStyleProfiles(db *gorm.DB, page, size int) ([]*StyleProfile, int64, error) {
	if page <= 0 {
		page = 1
	}
	if size <= 0 {
		size = 20
	}
	if size > 100 {
		size = 100
	}
	q := db.Model(&StyleProfile{}).Where("is_deleted = ?", SoftDeleteStatusActive)
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	offset := (page - 1) * size
	var out []*StyleProfile
	err := q.Order("updated_at DESC").Offset(offset).Limit(size).Find(&out).Error
	return out, total, err
}

func CreateStyleSample(db *gorm.DB, s *StyleSample) error {
	return db.Create(s).Error
}

func ListStyleSamples(db *gorm.DB, profileID uint, page, size int) ([]*StyleSample, int64, error) {
	if page <= 0 {
		page = 1
	}
	if size <= 0 {
		size = 50
	}
	if size > 200 {
		size = 200
	}
	q := db.Model(&StyleSample{}).Where("profile_id = ? AND is_deleted = ?", profileID, SoftDeleteStatusActive)
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	offset := (page - 1) * size
	var out []*StyleSample
	err := q.Order("created_at DESC").Offset(offset).Limit(size).Find(&out).Error
	return out, total, err
}

func DeleteStyleSample(db *gorm.DB, id uint, operator string) error {
	return db.Model(&StyleSample{}).Where("id = ?", id).Updates(map[string]any{
		"is_deleted": SoftDeleteStatusDeleted,
		"update_by":  operator,
	}).Error
}

func CalcWordCount(text string) int {
	return len([]rune(strings.TrimSpace(text)))
}
