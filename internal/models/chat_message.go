package models

import "gorm.io/gorm"

const TABLE_CHAT_MESSAGE = "ci_chat_messages"

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
	RequestID    string `json:"requestId,omitempty" gorm:"size:128;comment:请求链路ID"`

	PromptTokens     int `json:"promptTokens,omitempty" gorm:"comment:提示 token 数"`
	CompletionTokens int `json:"completionTokens,omitempty" gorm:"comment:生成 token 数"`
	TotalTokens      int `json:"totalTokens,omitempty" gorm:"comment:总 token 数"`
}

func (ChatMessage) TableName() string {
	return TABLE_CHAT_MESSAGE
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
