package models

import (
	"gorm.io/gorm"
)

const TABLE_CHAT_SESSION = "ci_chat_sessions"

const (
	ChatLLMProviderOpenAI    = "openai"
	ChatLLMProviderOllama    = "ollama"
	ChatLLMProviderAlibaba   = "alibaba"
	ChatLLMProviderAnthropic = "anthropic"
	ChatLLMProviderLMStudio  = "lmstudio"
	ChatLLMProviderCoze      = "coze"
)

const (
	ChatSessionStatusActive   = "active"
	ChatSessionStatusArchived = "archived"
	ChatSessionStatusClosed   = "closed"
)

// ChatSession 一次 LLM 对话会话（可多轮消息），可与业务实体（如小说）关联。
type ChatSession struct {
	BaseModel
	Title         string        `json:"title" gorm:"size:255;comment:会话标题或摘要"`
	Status        string        `json:"status" gorm:"size:32;default:active;index;comment:会话状态"`
	UserID        uint          `json:"userId" gorm:"index;comment:业务用户ID"`
	NovelID       uint          `json:"novelId" gorm:"index;comment:关联小说ID(可选)"`
	Provider      string        `json:"provider" gorm:"size:32;index;comment:LLM 提供方(openai/ollama/...)"`
	Model         string        `json:"model" gorm:"size:128;comment:默认或最近使用的模型名"`
	SystemPrompt  string        `json:"systemPrompt" gorm:"type:text;comment:创建时的系统提示(快照)"`
	Summary       string        `json:"summary" gorm:"type:text;comment:长对话滚动摘要(对齐 llm asyncTurnMemory)"`
	LastMessageAt int64         `json:"lastMessageAt" gorm:"index;comment:最后一条消息时间 Unix 秒"`
	Messages      []ChatMessage `json:"messages,omitempty" gorm:"foreignKey:SessionID;references:ID"`
}

func (ChatSession) TableName() string {
	return TABLE_CHAT_SESSION
}

func CreateChatSession(db *gorm.DB, s *ChatSession) error {
	return db.Create(s).Error
}

func GetChatSessionByID(db *gorm.DB, id uint) (*ChatSession, error) {
	var s ChatSession
	err := db.Where("id = ? AND is_deleted = ?", id, SoftDeleteStatusActive).First(&s).Error
	if err != nil {
		return nil, err
	}
	return &s, nil
}

func UpdateChatSession(db *gorm.DB, s *ChatSession) error {
	return db.Save(s).Error
}

func DeleteChatSession(db *gorm.DB, id uint, operator string) error {
	return db.Model(&ChatSession{}).Where("id = ?", id).Updates(map[string]interface{}{
		"is_deleted": SoftDeleteStatusDeleted,
		"update_by":  operator,
	}).Error
}

func ListChatSessionsByUserID(db *gorm.DB, userID uint, page, pageSize int) ([]*ChatSession, int64, error) {
	var rows []*ChatSession
	var total int64
	offset := (page - 1) * pageSize
	q := db.Model(&ChatSession{}).Where("user_id = ? AND is_deleted = ?", userID, SoftDeleteStatusActive)
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err := q.Order("last_message_at DESC, created_at DESC").Offset(offset).Limit(pageSize).Find(&rows).Error
	return rows, total, err
}

func ListChatSessionsByNovelID(db *gorm.DB, novelID uint, page, pageSize int) ([]*ChatSession, int64, error) {
	var rows []*ChatSession
	var total int64
	offset := (page - 1) * pageSize
	q := db.Model(&ChatSession{}).Where("novel_id = ? AND is_deleted = ?", novelID, SoftDeleteStatusActive)
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err := q.Order("last_message_at DESC, created_at DESC").Offset(offset).Limit(pageSize).Find(&rows).Error
	return rows, total, err
}
