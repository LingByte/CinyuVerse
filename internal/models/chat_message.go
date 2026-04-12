package models

import (
	"time"

	"gorm.io/gorm"
)

const TABLE_CHAT_MESSAGE = "ci_chat_messages"

// 与 OpenAI / lingoroutine 对话 role 取值一致，便于序列化为 llm 请求中的 messages。
const (
	ChatMessageRoleSystem    = "system"
	ChatMessageRoleUser      = "user"
	ChatMessageRoleAssistant = "assistant"
	ChatMessageRoleTool      = "tool"
)

// ChatMessage 会话中的一条消息（用户/助手/系统/工具），可选记录 Token 用量（对齐 llm.TokenUsage）。
type ChatMessage struct {
	BaseModel
	SessionID    uint   `json:"sessionId" gorm:"not null;index:idx_session_seq,priority:1;comment:所属会话ID"`
	Seq          int    `json:"seq" gorm:"not null;index:idx_session_seq,priority:2;comment:会话内顺序(从1递增)"`
	Role         string `json:"role" gorm:"size:32;not null;index;comment:消息角色"`
	Content      string `json:"content" gorm:"type:text;not null;comment:消息正文"`
	FinishReason string `json:"finishReason,omitempty" gorm:"size:64;comment:助手完成原因(若有)"`
	RequestID    string `json:"requestId,omitempty" gorm:"size:128;comment:lingoroutine LLMDetails.RequestID 等链路ID"`

	PromptTokens     int `json:"promptTokens,omitempty" gorm:"comment:提示 token 数"`
	CompletionTokens int `json:"completionTokens,omitempty" gorm:"comment:生成 token 数"`
	TotalTokens      int `json:"totalTokens,omitempty" gorm:"comment:总 token 数"`
}

func (ChatMessage) TableName() string {
	return TABLE_CHAT_MESSAGE
}

// ToLLMChatPair 转为 OpenAI 兼容的单条 message（map 形状与 lingoroutine asyncTurnMemory 中一致）。
func (m *ChatMessage) ToLLMChatPair() map[string]string {
	return map[string]string{
		"role":    m.Role,
		"content": m.Content,
	}
}

// ChatMessagesToLLMMaps 将会话内消息转为 []map[string]string，供拼接历史上下文时使用。
func ChatMessagesToLLMMaps(messages []*ChatMessage) []map[string]string {
	out := make([]map[string]string, 0, len(messages))
	for _, m := range messages {
		if m == nil {
			continue
		}
		out = append(out, m.ToLLMChatPair())
	}
	return out
}

func CreateChatMessage(db *gorm.DB, m *ChatMessage) error {
	return db.Create(m).Error
}

func GetChatMessageByID(db *gorm.DB, id uint) (*ChatMessage, error) {
	var row ChatMessage
	err := db.Where("id = ? AND is_deleted = ?", id, SoftDeleteStatusActive).First(&row).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func ListChatMessagesBySessionID(db *gorm.DB, sessionID uint) ([]*ChatMessage, error) {
	var rows []*ChatMessage
	err := db.Where("session_id = ? AND is_deleted = ?", sessionID, SoftDeleteStatusActive).
		Order("seq ASC, id ASC").
		Find(&rows).Error
	return rows, err
}

func NextChatMessageSeq(db *gorm.DB, sessionID uint) (int, error) {
	var maxSeq int
	err := db.Model(&ChatMessage{}).
		Select("COALESCE(MAX(seq), 0)").
		Where("session_id = ? AND is_deleted = ?", sessionID, SoftDeleteStatusActive).
		Scan(&maxSeq).Error
	if err != nil {
		return 0, err
	}
	return maxSeq + 1, nil
}

// TouchChatSessionLastMessage 更新会话的最后消息时间与可选摘要。
func TouchChatSessionLastMessage(db *gorm.DB, sessionID uint, summary string) error {
	updates := map[string]interface{}{
		"last_message_at": time.Now().Unix(),
		"updated_at":      time.Now(),
	}
	if summary != "" {
		updates["summary"] = summary
	}
	return db.Model(&ChatSession{}).Where("id = ? AND is_deleted = ?", sessionID, SoftDeleteStatusActive).
		Updates(updates).Error
}
