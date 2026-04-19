package models

import (
	"gorm.io/gorm"
)

const TABLE_CHAPTER = "ci_chapters"

// Chapter 章节模型
type Chapter struct {
	BaseModel
	NovelID         uint   `json:"novelId" gorm:"index;not null;comment:小说ID"`
	VolumeID        uint   `json:"volumeId" gorm:"index;comment:卷ID"`
	Title           string `json:"title" gorm:"size:255;not null;comment:章节标题"`
	Content         string `json:"content" gorm:"type:longtext;comment:章节内容"`
	OrderNo         int    `json:"orderNo" gorm:"index;default:1;comment:章节顺序(从1开始)"`
	WordCount       int    `json:"wordCount" gorm:"default:0;comment:章节字数"`
	Summary         string `json:"summary" gorm:"type:text;comment:章节摘要"`
	CharacterIDs    string `json:"characterIds" gorm:"type:text;comment:参与角色ID列表(逗号分隔)"`
	PlotPointIDs    string `json:"plotPointIds" gorm:"type:text;comment:涉及情节ID列表(逗号分隔)"`
	PreviousChapterID uint   `json:"previousChapterId" gorm:"index;default:0;comment:前序章节ID(兼容单选，取多选首项)"`
	PreviousChapterIDs string `json:"previousChapterIds" gorm:"type:text;comment:前序章节ID列表(逗号分隔)"`
	Outline         string `json:"outline" gorm:"type:text;comment:章节大纲"`
	RelatedNodeIDs  string `json:"relatedNodeIds" gorm:"type:text;comment:关联故事线节点ID(逗号分隔)"`
	PromptMemo      string `json:"promptMemo" gorm:"type:text;comment:生成提示词备注"`
	Status          string `json:"status" gorm:"size:50;index;default:draft;comment:章节状态(draft/generated/reviewed/published)"`
}

func (Chapter) TableName() string {
	return TABLE_CHAPTER
}

func CreateChapter(db *gorm.DB, row *Chapter) error {
	return db.Create(row).Error
}

func GetChapterByID(db *gorm.DB, id uint) (*Chapter, error) {
	var row Chapter
	err := db.Where("id = ? AND is_deleted = ?", id, SoftDeleteStatusActive).First(&row).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func UpdateChapter(db *gorm.DB, row *Chapter) error {
	return db.Save(row).Error
}

func DeleteChapter(db *gorm.DB, id uint, operator string) error {
	return db.Model(&Chapter{}).Where("id = ?", id).Updates(map[string]any{
		"is_deleted": SoftDeleteStatusDeleted,
		"update_by":  operator,
	}).Error
}

func RestoreChapter(db *gorm.DB, id uint, operator string) error {
	return db.Model(&Chapter{}).Where("id = ?", id).Updates(map[string]any{
		"is_deleted": SoftDeleteStatusActive,
		"update_by":  operator,
	}).Error
}

func GetAllChapters(db *gorm.DB, novelID, volumeID uint, page, pageSize int) ([]*Chapter, int64, error) {
	rows := make([]*Chapter, 0)
	var total int64
	offset := (page - 1) * pageSize
	q := db.Model(&Chapter{}).Where("is_deleted = ?", SoftDeleteStatusActive)
	if novelID > 0 {
		q = q.Where("novel_id = ?", novelID)
	}
	if volumeID > 0 {
		q = q.Where("volume_id = ?", volumeID)
	}
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err := q.Offset(offset).Limit(pageSize).Order("order_no ASC, created_at ASC").Find(&rows).Error
	return rows, total, err
}

// ListChaptersByNovelOrdered 返回某小说下全部章节（按卷、章节序），用于构建对话上下文等。
func ListChaptersByNovelOrdered(db *gorm.DB, novelID uint) ([]*Chapter, error) {
	var rows []*Chapter
	err := db.Where("novel_id = ? AND is_deleted = ?", novelID, SoftDeleteStatusActive).
		Order("volume_id ASC, order_no ASC, id ASC").
		Find(&rows).Error
	return rows, err
}

// SumWordCountByNovel 汇总章节 word_count（依赖各章保存时已更新字数；为 0 的章不计入）。
func SumWordCountByNovel(db *gorm.DB, novelID uint) (int64, error) {
	var n int64
	err := db.Model(&Chapter{}).
		Where("novel_id = ? AND is_deleted = ?", novelID, SoftDeleteStatusActive).
		Select("COALESCE(SUM(word_count), 0)").
		Scan(&n).Error
	return n, err
}

// CountChaptersByNovel 章节篇数。
func CountChaptersByNovel(db *gorm.DB, novelID uint) (int64, error) {
	var n int64
	err := db.Model(&Chapter{}).
		Where("novel_id = ? AND is_deleted = ?", novelID, SoftDeleteStatusActive).
		Count(&n).Error
	return n, err
}
