package models

import (
	"encoding/json"
	"strings"

	"gorm.io/gorm"
)

const (
	TABLE_STORYLINE      = "ci_storylines"
	TABLE_STORYLINE_NODE = "ci_storyline_nodes"
	TABLE_STORYLINE_EDGE = "ci_storyline_edges"
	TABLE_STORYLINE_FACT = "ci_storyline_facts"
)

// Storyline 故事线主实体（每本小说可有多条版本）
type Storyline struct {
	BaseModel
	NovelID       uint   `json:"novelId" gorm:"index;not null;comment:小说ID"`
	Name          string `json:"name" gorm:"size:120;not null;comment:故事线名称"`
	Version       int    `json:"version" gorm:"index;default:1;comment:版本号"`
	Status        string `json:"status" gorm:"size:40;index;default:draft;comment:状态(draft/active/archived)"`
	Theme         string `json:"theme" gorm:"size:255;comment:主题"`
	Promise       string `json:"promise" gorm:"type:text;comment:读者承诺/卖点"`
	Forbidden     string `json:"forbidden" gorm:"type:text;comment:禁忌规则(JSON数组字符串)"`
	Description   string `json:"description" gorm:"type:text;comment:故事线说明"`
	CurrentNodeID string `json:"currentNodeId" gorm:"size:128;index;comment:当前推进节点ID"`
}

func (Storyline) TableName() string { return TABLE_STORYLINE }

// StorylineNode 故事图节点（事件/转折/伏笔/回收等）
type StorylineNode struct {
	BaseModel
	StorylineID uint   `json:"storylineId" gorm:"index;not null;comment:故事线ID"`
	NodeID      string `json:"nodeId" gorm:"size:128;index;not null;comment:业务节点ID"`
	NovelID     uint   `json:"novelId" gorm:"index;not null;comment:小说ID"`
	Type        string `json:"type" gorm:"size:60;index;comment:节点类型(event/twist/clue/payoff/goal/checkpoint)"`
	Title       string `json:"title" gorm:"size:255;comment:节点标题"`
	Summary     string `json:"summary" gorm:"type:text;comment:节点摘要"`
	Status      string `json:"status" gorm:"size:40;index;default:draft;comment:状态(draft/reviewed/approved/locked)"`
	ChapterNo   int    `json:"chapterNo" gorm:"index;default:0;comment:关联章节号"`
	VolumeNo    int    `json:"volumeNo" gorm:"index;default:0;comment:关联卷号"`
	Priority    int    `json:"priority" gorm:"default:0;comment:优先级(越大越重要)"`
	Props       string `json:"props" gorm:"type:text;comment:扩展属性(JSON对象字符串)"`
}

func (StorylineNode) TableName() string { return TABLE_STORYLINE_NODE }

// StorylineEdge 故事图边（因果/冲突/揭示/回收）
type StorylineEdge struct {
	BaseModel
	StorylineID uint   `json:"storylineId" gorm:"index;not null;comment:故事线ID"`
	EdgeID      string `json:"edgeId" gorm:"size:128;index;not null;comment:业务边ID"`
	NovelID     uint   `json:"novelId" gorm:"index;not null;comment:小说ID"`
	FromNodeID  string `json:"fromNodeId" gorm:"size:128;index;not null;comment:起点节点ID"`
	ToNodeID    string `json:"toNodeId" gorm:"size:128;index;not null;comment:终点节点ID"`
	Relation    string `json:"relation" gorm:"size:60;index;comment:关系(cause/conflict/reveal/payoff/depends)"`
	Weight      int    `json:"weight" gorm:"default:0;comment:边权重"`
	Status      string `json:"status" gorm:"size:40;index;default:active;comment:状态(active/disabled)"`
	Props       string `json:"props" gorm:"type:text;comment:扩展属性(JSON对象字符串)"`
}

func (StorylineEdge) TableName() string { return TABLE_STORYLINE_EDGE }

// StorylineFact 故事事实（角色设定/世界规则/时间线锚点）
type StorylineFact struct {
	BaseModel
	StorylineID   uint   `json:"storylineId" gorm:"index;not null;comment:故事线ID"`
	NovelID       uint   `json:"novelId" gorm:"index;not null;comment:小说ID"`
	FactKey       string `json:"factKey" gorm:"size:160;index;not null;comment:事实键(如 character.hero.age)"`
	FactValue     string `json:"factValue" gorm:"type:text;comment:事实值"`
	SourceNodeID  string `json:"sourceNodeId" gorm:"size:128;index;comment:来源节点ID"`
	ValidFromChap int    `json:"validFromChap" gorm:"default:0;comment:生效章节"`
	ValidToChap   int    `json:"validToChap" gorm:"default:0;comment:失效章节(0表示长期有效)"`
	Confidence    int    `json:"confidence" gorm:"default:100;comment:置信度(0-100)"`
}

func (StorylineFact) TableName() string { return TABLE_STORYLINE_FACT }

func JSONString(v any) string {
	b, err := json.Marshal(v)
	if err != nil {
		return ""
	}
	return string(b)
}

func CreateStoryline(db *gorm.DB, row *Storyline) error {
	return db.Create(row).Error
}

func GetStorylineByID(db *gorm.DB, id uint) (*Storyline, error) {
	var row Storyline
	err := db.Where("id = ? AND is_deleted = ?", id, SoftDeleteStatusActive).First(&row).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func GetStorylinesByNovelID(db *gorm.DB, novelID uint) ([]*Storyline, error) {
	rows := make([]*Storyline, 0)
	err := db.Where("novel_id = ? AND is_deleted = ?", novelID, SoftDeleteStatusActive).Order("version DESC, created_at DESC").Find(&rows).Error
	return rows, err
}

func ListStorylines(db *gorm.DB, novelID uint, page, size int) ([]*Storyline, int64, error) {
	rows := make([]*Storyline, 0)
	var total int64
	if page < 1 {
		page = 1
	}
	if size < 1 {
		size = 10
	}
	q := db.Model(&Storyline{}).Where("is_deleted = ?", SoftDeleteStatusActive)
	if novelID > 0 {
		q = q.Where("novel_id = ?", novelID)
	}
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err := q.Order("version DESC, created_at DESC").Offset((page - 1) * size).Limit(size).Find(&rows).Error
	return rows, total, err
}

func UpdateStoryline(db *gorm.DB, row *Storyline) error {
	return db.Save(row).Error
}

func DeleteStoryline(db *gorm.DB, id uint, operator string) error {
	return db.Model(&Storyline{}).Where("id = ?", id).Updates(map[string]any{
		"is_deleted": SoftDeleteStatusDeleted,
		"update_by":  operator,
	}).Error
}

func RestoreStoryline(db *gorm.DB, id uint, operator string) error {
	return db.Model(&Storyline{}).Where("id = ?", id).Updates(map[string]any{
		"is_deleted": SoftDeleteStatusActive,
		"update_by":  operator,
	}).Error
}

func CreateStorylineNode(db *gorm.DB, row *StorylineNode) error {
	return db.Create(row).Error
}

func GetStorylineNodeByID(db *gorm.DB, id uint) (*StorylineNode, error) {
	var row StorylineNode
	err := db.Where("id = ? AND is_deleted = ?", id, SoftDeleteStatusActive).First(&row).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func ListStorylineNodes(db *gorm.DB, storylineID, novelID uint, keyword, typesCSV string, page, size int) ([]*StorylineNode, int64, error) {
	rows := make([]*StorylineNode, 0)
	var total int64
	q := db.Model(&StorylineNode{}).Where("is_deleted = ?", SoftDeleteStatusActive)
	if storylineID > 0 {
		q = q.Where("storyline_id = ?", storylineID)
	} else if novelID > 0 {
		q = q.Where("novel_id = ?", novelID)
	}
	if kw := strings.TrimSpace(keyword); kw != "" {
		like := "%" + kw + "%"
		q = q.Where("(title LIKE ? OR node_id LIKE ? OR summary LIKE ?)", like, like, like)
	}
	if typesCSV != "" {
		parts := strings.Split(typesCSV, ",")
		keep := make([]string, 0, len(parts))
		for _, p := range parts {
			if t := strings.TrimSpace(p); t != "" {
				keep = append(keep, t)
			}
		}
		if len(keep) > 0 {
			q = q.Where("type IN ?", keep)
		}
	}
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err := q.Order("priority DESC, created_at DESC").Offset((page - 1) * size).Limit(size).Find(&rows).Error
	return rows, total, err
}

func UpdateStorylineNode(db *gorm.DB, row *StorylineNode) error {
	return db.Save(row).Error
}

func DeleteStorylineNode(db *gorm.DB, id uint, operator string) error {
	return db.Model(&StorylineNode{}).Where("id = ?", id).Updates(map[string]any{
		"is_deleted": SoftDeleteStatusDeleted,
		"update_by":  operator,
	}).Error
}

func RestoreStorylineNode(db *gorm.DB, id uint, operator string) error {
	return db.Model(&StorylineNode{}).Where("id = ?", id).Updates(map[string]any{
		"is_deleted": SoftDeleteStatusActive,
		"update_by":  operator,
	}).Error
}

func CreateStorylineEdge(db *gorm.DB, row *StorylineEdge) error {
	return db.Create(row).Error
}

func GetStorylineEdgeByID(db *gorm.DB, id uint) (*StorylineEdge, error) {
	var row StorylineEdge
	err := db.Where("id = ? AND is_deleted = ?", id, SoftDeleteStatusActive).First(&row).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func ListStorylineEdges(db *gorm.DB, storylineID uint, page, size int) ([]*StorylineEdge, int64, error) {
	rows := make([]*StorylineEdge, 0)
	var total int64
	q := db.Model(&StorylineEdge{}).Where("is_deleted = ?", SoftDeleteStatusActive)
	if storylineID > 0 {
		q = q.Where("storyline_id = ?", storylineID)
	}
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err := q.Order("created_at DESC").Offset((page - 1) * size).Limit(size).Find(&rows).Error
	return rows, total, err
}

func UpdateStorylineEdge(db *gorm.DB, row *StorylineEdge) error {
	return db.Save(row).Error
}

func DeleteStorylineEdge(db *gorm.DB, id uint, operator string) error {
	return db.Model(&StorylineEdge{}).Where("id = ?", id).Updates(map[string]any{
		"is_deleted": SoftDeleteStatusDeleted,
		"update_by":  operator,
	}).Error
}

func RestoreStorylineEdge(db *gorm.DB, id uint, operator string) error {
	return db.Model(&StorylineEdge{}).Where("id = ?", id).Updates(map[string]any{
		"is_deleted": SoftDeleteStatusActive,
		"update_by":  operator,
	}).Error
}

func CreateStorylineFact(db *gorm.DB, row *StorylineFact) error {
	return db.Create(row).Error
}

func GetStorylineFactByID(db *gorm.DB, id uint) (*StorylineFact, error) {
	var row StorylineFact
	err := db.Where("id = ? AND is_deleted = ?", id, SoftDeleteStatusActive).First(&row).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func ListStorylineFacts(db *gorm.DB, storylineID uint, page, size int) ([]*StorylineFact, int64, error) {
	rows := make([]*StorylineFact, 0)
	var total int64
	q := db.Model(&StorylineFact{}).Where("is_deleted = ?", SoftDeleteStatusActive)
	if storylineID > 0 {
		q = q.Where("storyline_id = ?", storylineID)
	}
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err := q.Order("created_at DESC").Offset((page - 1) * size).Limit(size).Find(&rows).Error
	return rows, total, err
}

func UpdateStorylineFact(db *gorm.DB, row *StorylineFact) error {
	return db.Save(row).Error
}

func DeleteStorylineFact(db *gorm.DB, id uint, operator string) error {
	return db.Model(&StorylineFact{}).Where("id = ?", id).Updates(map[string]any{
		"is_deleted": SoftDeleteStatusDeleted,
		"update_by":  operator,
	}).Error
}

func RestoreStorylineFact(db *gorm.DB, id uint, operator string) error {
	return db.Model(&StorylineFact{}).Where("id = ?", id).Updates(map[string]any{
		"is_deleted": SoftDeleteStatusActive,
		"update_by":  operator,
	}).Error
}
