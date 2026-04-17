package models

import "gorm.io/gorm"

const TABLE_CHARACTER = "ci_characters"

// Character 小说角色模型
type Character struct {
	BaseModel
	NovelID      uint   `json:"novelId" gorm:"index;comment:所属小说ID"`
	Name         string `json:"name" gorm:"size:120;not null;comment:角色名"`
	RoleType     string `json:"roleType" gorm:"size:60;comment:角色类型(主角/反派/配角等)"`
	Gender       string `json:"gender" gorm:"size:20;comment:性别"`
	Age          string `json:"age" gorm:"size:30;comment:年龄描述"`
	Personality  string `json:"personality" gorm:"type:text;comment:性格特征"`
	Background   string `json:"background" gorm:"type:text;comment:背景设定"`
	Goal         string `json:"goal" gorm:"type:text;comment:核心目标"`
	Relationship string `json:"relationship" gorm:"type:text;comment:关系网"`
	Appearance   string `json:"appearance" gorm:"type:text;comment:外貌特征"`
	Abilities    string `json:"abilities" gorm:"type:text;comment:能力技能"`
	Notes        string `json:"notes" gorm:"type:text;comment:补充备注"`
}

func (Character) TableName() string {
	return TABLE_CHARACTER
}

func CreateCharacter(db *gorm.DB, character *Character) error {
	return db.Create(character).Error
}

func GetCharacterByID(db *gorm.DB, id uint) (*Character, error) {
	var c Character
	err := db.Where("id = ? AND is_deleted = ?", id, SoftDeleteStatusActive).First(&c).Error
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func UpdateCharacter(db *gorm.DB, character *Character) error {
	return db.Save(character).Error
}

func DeleteCharacter(db *gorm.DB, id uint, operator string) error {
	return db.Model(&Character{}).Where("id = ?", id).Updates(map[string]interface{}{
		"is_deleted": SoftDeleteStatusDeleted,
		"update_by":  operator,
	}).Error
}

func RestoreCharacter(db *gorm.DB, id uint, operator string) error {
	return db.Model(&Character{}).Where("id = ?", id).Updates(map[string]interface{}{
		"is_deleted": SoftDeleteStatusActive,
		"update_by":  operator,
	}).Error
}

func GetAllCharacters(db *gorm.DB, novelID uint, page, pageSize int) ([]*Character, int64, error) {
	var rows []*Character
	var total int64
	offset := (page - 1) * pageSize
	q := db.Model(&Character{}).Where("is_deleted = ?", SoftDeleteStatusActive)
	if novelID > 0 {
		q = q.Where("novel_id = ?", novelID)
	}
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err := q.Offset(offset).Limit(pageSize).Order("created_at DESC").Find(&rows).Error
	return rows, total, err
}
