package models

import (
	"gorm.io/gorm"
)

const TABLE_NOVEL = "ci_novels"

// Novel 小说模型
type Novel struct {
	BaseModel
	Title          string `json:"title" gorm:"size:255;not null;comment:小说标题"`
	AuthorID       uint   `json:"authorId" gorm:"comment:作者ID"`
	Status         string `json:"status" gorm:"size:50;comment:小说状态"`
	Genre          string `json:"genre" gorm:"size:100;comment:小说类型(玄幻/都市/科幻/武侠等)"`
	Audience       string `json:"audience" gorm:"size:50;comment:小说受众(male/female)"`
	Theme          string `json:"theme" gorm:"size:255;comment:小说主题"`
	Description    string `json:"description" gorm:"type:text;comment:小说简介"`
	WorldSetting   string `json:"worldSetting" gorm:"type:text;comment:世界观设定"`
	Tags           string `json:"tags" gorm:"size:500;comment:标签(逗号分隔)"`
	CoverImage     string `json:"coverImage" gorm:"size:500;comment:封面图片URL"`
	StyleGuide     string `json:"styleGuide" gorm:"type:text;comment:写作风格指南"`
	ReferenceNovel string `json:"referenceNovel" gorm:"type:text;comment:参考小说内容"`
}

func (Novel) TableName() string {
	return TABLE_NOVEL
}

// CreateNovel 创建小说
func CreateNovel(db *gorm.DB, novel *Novel) error {
	return db.Create(novel).Error
}

// GetNovelByID 根据ID获取小说
func GetNovelByID(db *gorm.DB, id uint) (*Novel, error) {
	var novel Novel
	err := db.Where("id = ? AND is_deleted = ?", id, SoftDeleteStatusActive).First(&novel).Error
	if err != nil {
		return nil, err
	}
	return &novel, nil
}

// UpdateNovel 更新小说
func UpdateNovel(db *gorm.DB, novel *Novel) error {
	return db.Save(novel).Error
}

// DeleteNovel 软删除小说
func DeleteNovel(db *gorm.DB, id uint, operator string) error {
	return db.Model(&Novel{}).Where("id = ?", id).Updates(map[string]interface{}{
		"is_deleted": SoftDeleteStatusDeleted,
		"update_by":  operator,
	}).Error
}

// GetNovelsByAuthorID 根据作者ID获取小说列表
func GetNovelsByAuthorID(db *gorm.DB, authorID uint) ([]*Novel, error) {
	var novels []*Novel
	err := db.Where("author_id = ? AND is_deleted = ?", authorID, SoftDeleteStatusActive).Find(&novels).Error
	return novels, err
}

// GetNovelsByGenre 根据类型获取小说列表
func GetNovelsByGenre(db *gorm.DB, genre string) ([]*Novel, error) {
	var novels []*Novel
	err := db.Where("genre = ? AND is_deleted = ?", genre, SoftDeleteStatusActive).Find(&novels).Error
	return novels, err
}

// GetNovelsByStatus 根据状态获取小说列表
func GetNovelsByStatus(db *gorm.DB, status string) ([]*Novel, error) {
	var novels []*Novel
	err := db.Where("status = ? AND is_deleted = ?", status, SoftDeleteStatusActive).Find(&novels).Error
	return novels, err
}

// GetAllNovels 获取所有小说（分页）
func GetAllNovels(db *gorm.DB, page, pageSize int) ([]*Novel, int64, error) {
	var novels []*Novel
	var total int64
	offset := (page - 1) * pageSize
	if err := db.Model(&Novel{}).Where("is_deleted = ?", SoftDeleteStatusActive).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err := db.Where("is_deleted = ?", SoftDeleteStatusActive).
		Offset(offset).
		Limit(pageSize).
		Order("created_at DESC").
		Find(&novels).Error
	return novels, total, err
}

// SearchNovels 搜索小说（按标题和描述）
func SearchNovels(db *gorm.DB, keyword string, page, pageSize int) ([]*Novel, int64, error) {
	var novels []*Novel
	var total int64
	offset := (page - 1) * pageSize
	searchPattern := "%" + keyword + "%"
	if err := db.Model(&Novel{}).
		Where("(title LIKE ? OR description LIKE ?) AND is_deleted = ?", searchPattern, searchPattern, SoftDeleteStatusActive).
		Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err := db.Where("(title LIKE ? OR description LIKE ?) AND is_deleted = ?", searchPattern, searchPattern, SoftDeleteStatusActive).
		Offset(offset).
		Limit(pageSize).
		Order("created_at DESC").
		Find(&novels).Error
	return novels, total, err
}

// RestoreNovel 恢复已删除的小说
func RestoreNovel(db *gorm.DB, id uint, operator string) error {
	return db.Model(&Novel{}).Where("id = ?", id).Updates(map[string]interface{}{
		"is_deleted": SoftDeleteStatusActive,
		"update_by":  operator,
	}).Error
}
