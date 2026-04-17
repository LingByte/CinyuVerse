package models

import "gorm.io/gorm"

const TABLE_VOLUME = "ci_volumes"

// Volume 卷模型
type Volume struct {
	BaseModel
	NovelID         uint   `json:"novelId" gorm:"index;not null;comment:小说ID"`
	Title           string `json:"title" gorm:"size:255;not null;comment:卷标题"`
	Subtitle        string `json:"subtitle" gorm:"size:255;comment:卷副标题"`
	Description     string `json:"description" gorm:"type:text;comment:卷描述"`
	Theme           string `json:"theme" gorm:"size:255;comment:卷主题"`
	CoreConflict    string `json:"coreConflict" gorm:"type:text;comment:核心冲突"`
	Goal            string `json:"goal" gorm:"type:text;comment:卷目标"`
	EndingHook      string `json:"endingHook" gorm:"type:text;comment:卷末钩子"`
	Status          string `json:"status" gorm:"size:40;index;default:draft;comment:状态(draft/active/done)"`
	OrderNo         int    `json:"orderNo" gorm:"index;default:1;comment:卷序号(从1开始)"`
	TargetChapters  int    `json:"targetChapters" gorm:"default:0;comment:目标章节数"`
	TargetWords     int    `json:"targetWords" gorm:"default:0;comment:目标字数"`
	ChapterStart    int    `json:"chapterStart" gorm:"default:0;comment:起始章节号"`
	ChapterEnd      int    `json:"chapterEnd" gorm:"default:0;comment:结束章节号"`
	RelatedNodeIDs  string `json:"relatedNodeIds" gorm:"type:text;comment:关联故事线节点ID(逗号分隔)"`
	RelatedCharIDs  string `json:"relatedCharacterIds" gorm:"type:text;comment:关联角色ID(逗号分隔)"`
	WritingStrategy string `json:"writingStrategy" gorm:"type:text;comment:写作策略"`
	Tags            string `json:"tags" gorm:"size:500;comment:标签(逗号分隔)"`
}

func (Volume) TableName() string {
	return TABLE_VOLUME
}

func CreateVolume(db *gorm.DB, row *Volume) error {
	return db.Create(row).Error
}

func GetVolumeByID(db *gorm.DB, id uint) (*Volume, error) {
	var row Volume
	err := db.Where("id = ? AND is_deleted = ?", id, SoftDeleteStatusActive).First(&row).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func UpdateVolume(db *gorm.DB, row *Volume) error {
	return db.Save(row).Error
}

func DeleteVolume(db *gorm.DB, id uint, operator string) error {
	return db.Model(&Volume{}).Where("id = ?", id).Updates(map[string]any{
		"is_deleted": SoftDeleteStatusDeleted,
		"update_by":  operator,
	}).Error
}

func RestoreVolume(db *gorm.DB, id uint, operator string) error {
	return db.Model(&Volume{}).Where("id = ?", id).Updates(map[string]any{
		"is_deleted": SoftDeleteStatusActive,
		"update_by":  operator,
	}).Error
}

func GetAllVolumes(db *gorm.DB, novelID uint, page, pageSize int) ([]*Volume, int64, error) {
	rows := make([]*Volume, 0)
	var total int64
	offset := (page - 1) * pageSize
	q := db.Model(&Volume{}).Where("is_deleted = ?", SoftDeleteStatusActive)
	if novelID > 0 {
		q = q.Where("novel_id = ?", novelID)
	}
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err := q.Offset(offset).Limit(pageSize).Order("order_no ASC, created_at ASC").Find(&rows).Error
	return rows, total, err
}
