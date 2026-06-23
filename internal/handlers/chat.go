package handlers

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/LingByte/CinyuVerse/internal/models"
	"github.com/LingByte/CinyuVerse/pkg/config"
	"github.com/LingByte/CinyuVerse/pkg/lingo"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

const maxPersistedHistoryMessages = 80 // 约 40 轮 user+assistant，控制上下文体积

const maxSystemPromptContextBytes = 28000

// CreateChatSessionRequest 创建会话
type CreateChatSessionRequest struct {
	Title        string `json:"title"`
	UserID       uint   `json:"userId" binding:"required"`
	NovelID      uint   `json:"novelId"`
	WorkspaceID  string `json:"workspaceId"`
	SystemPrompt string `json:"systemPrompt"`
	Provider     string `json:"provider"`
	Model        string `json:"model"`
}

// ChatTurnRequest 在已有会话中发送一轮用户消息并生成助手回复
type ChatTurnRequest struct {
	Message     string   `json:"message" binding:"required"`
	Model       string   `json:"model"`
	Temperature *float32 `json:"temperature"`
	MaxTokens   int      `json:"maxTokens"`
}

// ChatSessionResponse 会话摘要（列表/详情）
type ChatSessionResponse struct {
	ID            uint   `json:"id"`
	Title         string `json:"title"`
	Status        string `json:"status"`
	UserID        uint   `json:"userId"`
	NovelID       uint   `json:"novelId"`
	WorkspaceID   string `json:"workspaceId,omitempty"`
	Provider      string `json:"provider"`
	Model         string `json:"model"`
	SystemPrompt  string `json:"systemPrompt,omitempty"`
	Summary       string `json:"summary,omitempty"`
	LastMessageAt int64  `json:"lastMessageAt"`
	CreatedAt     string `json:"createdAt"`
	UpdatedAt     string `json:"updatedAt"`
}

// ChatMessageResponse 单条消息
type ChatMessageResponse struct {
	ID               uint   `json:"id"`
	SessionID        uint   `json:"sessionId"`
	Seq              int    `json:"seq"`
	Role             string `json:"role"`
	Content          string `json:"content"`
	FinishReason     string `json:"finishReason,omitempty"`
	PromptTokens     int    `json:"promptTokens,omitempty"`
	CompletionTokens int    `json:"completionTokens,omitempty"`
	TotalTokens      int    `json:"totalTokens,omitempty"`
	CreatedAt        string `json:"createdAt"`
}

// ChatTurnResponse 一轮对话结果（含刚写入的两条消息 id）
type ChatTurnResponse struct {
	UserMessage      *ChatMessageResponse `json:"userMessage"`
	AssistantMessage *ChatMessageResponse `json:"assistantMessage"`
	Usage            *chatUsageResponse   `json:"usage,omitempty"`
}

type chatUsageResponse struct {
	PromptTokens     int `json:"promptTokens"`
	CompletionTokens int `json:"completionTokens"`
	TotalTokens      int `json:"totalTokens"`
}

type paginatedChatSessionsResponse struct {
	Sessions []*ChatSessionResponse `json:"sessions"`
	Total    int64                  `json:"total"`
	Page     int                    `json:"page"`
	Size     int                    `json:"size"`
}

// AppendChatMessagesRequest 追加消息（不调用 LLM，供 WebSocket 创作模式同步历史）
type AppendChatMessagesRequest struct {
	Messages []struct {
		Role    string `json:"role" binding:"required"`
		Content string `json:"content" binding:"required"`
	} `json:"messages" binding:"required,min=1,dive"`
}

// ChatCompletionRequest POST /api/ai/chat — 统一对话入口：sessionId 为 0 时先建会话再生成回复；否则在已有会话中续聊。
type ChatCompletionRequest struct {
	SessionID    uint     `json:"sessionId"`
	UserID       uint     `json:"userId" binding:"required"`
	NovelID      uint     `json:"novelId"`
	WorkspaceID  string   `json:"workspaceId"`
	Title        string   `json:"title"`
	SystemPrompt string   `json:"systemPrompt"`
	Provider     string   `json:"provider"`
	Model        string   `json:"model"`
	Message      string   `json:"message" binding:"required"`
	Temperature  *float32 `json:"temperature"`
	MaxTokens    int      `json:"maxTokens"`
}

// ChatCompletionResponse 统一对话接口返回：始终包含当前会话信息，便于前端首次创建后拿到 sessionId。
type ChatCompletionResponse struct {
	Session          *ChatSessionResponse `json:"session"`
	UserMessage      *ChatMessageResponse `json:"userMessage"`
	AssistantMessage *ChatMessageResponse `json:"assistantMessage"`
	Usage            *chatUsageResponse   `json:"usage,omitempty"`
}

func (ch *CinyuHandlers) registerChatRoutes(r *gin.RouterGroup) {
	ai := r.Group("/ai")
	ai.POST("/chat", ch.ChatCompletion)
	sessions := ai.Group("/sessions")
	{
		sessions.POST("", ch.CreateChatSession)
		sessions.GET("", ch.ListChatSessions)
		sessions.GET("/:id/messages", ch.ListChatMessages)
		sessions.POST("/:id/messages", ch.AppendChatMessages)
		sessions.POST("/:id/chat", ch.ChatTurn)
		sessions.GET("/:id", ch.GetChatSession)
		sessions.DELETE("/:id", ch.DeleteChatSession)
	}
}

func chatSessionToResponse(s *models.ChatSession) *ChatSessionResponse {
	if s == nil {
		return nil
	}
	return &ChatSessionResponse{
		ID:            s.ID,
		Title:         s.Title,
		Status:        s.Status,
		UserID:        s.UserID,
		NovelID:       s.NovelID,
		WorkspaceID:   s.WorkspaceID,
		Provider:      s.Provider,
		Model:         s.Model,
		SystemPrompt:  s.SystemPrompt,
		Summary:       s.Summary,
		LastMessageAt: s.LastMessageAt,
		CreatedAt:     s.GetCreatedAtString(),
		UpdatedAt:     s.GetUpdatedAtString(),
	}
}

func chatMessageToResponse(m *models.ChatMessage) *ChatMessageResponse {
	if m == nil {
		return nil
	}
	return &ChatMessageResponse{
		ID:               m.ID,
		SessionID:        m.SessionID,
		Seq:              m.Seq,
		Role:             m.Role,
		Content:          m.Content,
		FinishReason:     m.FinishReason,
		PromptTokens:     m.PromptTokens,
		CompletionTokens: m.CompletionTokens,
		TotalTokens:      m.TotalTokens,
		CreatedAt:        m.GetCreatedAtString(),
	}
}

// CreateChatSession POST /api/ai/sessions
func (ch *CinyuHandlers) CreateChatSession(c *gin.Context) {
	var req CreateChatSessionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		lingo.Fail(c, err.Error(), nil)
		return
	}
	provider := strings.TrimSpace(req.Provider)
	if provider == "" {
		provider = strings.TrimSpace(config.GlobalConfig.Services.LLM.Provider)
		if provider == "" {
			provider = models.ChatLLMProviderOpenAI
		}
	}
	model := strings.TrimSpace(req.Model)
	if model == "" {
		model = config.GlobalConfig.Services.LLM.Model
	}
	s := &models.ChatSession{
		Title:        strings.TrimSpace(req.Title),
		Status:       models.ChatSessionStatusActive,
		UserID:       req.UserID,
		NovelID:      req.NovelID,
		WorkspaceID:  strings.TrimSpace(req.WorkspaceID),
		Provider:     provider,
		Model:        model,
		SystemPrompt: req.SystemPrompt,
	}
	s.SetCreateInfo("system")
	if err := models.CreateChatSession(ch.db, s); err != nil {
		lingo.Fail(c, "Failed to create chat session", nil)
		return
	}
	lingo.Success(c, "Chat session created", chatSessionToResponse(s))
}

// ListChatSessions GET /api/ai/sessions?userId=&novelId=&page=&size=
func (ch *CinyuHandlers) ListChatSessions(c *gin.Context) {
	userIDStr := c.Query("userId")
	novelIDStr := c.Query("novelId")
	workspaceIDStr := strings.TrimSpace(c.Query("workspaceId"))
	pageStr := c.DefaultQuery("page", "1")
	sizeStr := c.DefaultQuery("size", "20")
	page, err := strconv.Atoi(pageStr)
	if err != nil || page < 1 {
		page = 1
	}
	size, err := strconv.Atoi(sizeStr)
	if err != nil || size < 1 {
		size = 20
	}
	if size > 100 {
		size = 100
	}

	var rows []*models.ChatSession
	var total int64
	if workspaceIDStr != "" {
		rows, total, err = models.ListChatSessionsByWorkspaceID(ch.db, workspaceIDStr, page, size)
	} else if novelIDStr != "" {
		nid, err := strconv.ParseUint(novelIDStr, 10, 32)
		if err != nil {
			lingo.Fail(c, "Invalid novelId", nil)
			return
		}
		rows, total, err = models.ListChatSessionsByNovelID(ch.db, uint(nid), page, size)
	} else if userIDStr != "" {
		uid, err := strconv.ParseUint(userIDStr, 10, 32)
		if err != nil {
			lingo.Fail(c, "Invalid userId", nil)
			return
		}
		rows, total, err = models.ListChatSessionsByUserID(ch.db, uint(uid), page, size)
	} else {
		lingo.Fail(c, "Query userId, novelId or workspaceId is required", nil)
		return
	}
	if err != nil {
		lingo.Fail(c, "Failed to list sessions", nil)
		return
	}
	out := make([]*ChatSessionResponse, 0, len(rows))
	for _, s := range rows {
		out = append(out, chatSessionToResponse(s))
	}
	lingo.Success(c, "OK", paginatedChatSessionsResponse{
		Sessions: out,
		Total:    total,
		Page:     page,
		Size:     size,
	})
}

// GetChatSession GET /api/ai/sessions/:id
func (ch *CinyuHandlers) GetChatSession(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		lingo.Fail(c, "Invalid session id", nil)
		return
	}
	s, err := models.GetChatSessionByID(ch.db, uint(id))
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			lingo.FailWithCode(c, 404, "Session not found", nil)
			return
		}
		lingo.Fail(c, "Failed to load session", nil)
		return
	}
	lingo.Success(c, "OK", chatSessionToResponse(s))
}

// DeleteChatSession DELETE /api/ai/sessions/:id
func (ch *CinyuHandlers) DeleteChatSession(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		lingo.Fail(c, "Invalid session id", nil)
		return
	}
	if err := models.DeleteChatSession(ch.db, uint(id), "system"); err != nil {
		lingo.Fail(c, "Failed to delete session", nil)
		return
	}
	lingo.Success(c, "Session deleted", gin.H{"id": id})
}

// ListChatMessages GET /api/ai/sessions/:id/messages
func (ch *CinyuHandlers) ListChatMessages(c *gin.Context) {
	sid, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		lingo.Fail(c, "Invalid session id", nil)
		return
	}
	if _, err := models.GetChatSessionByID(ch.db, uint(sid)); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			lingo.FailWithCode(c, 404, "Session not found", nil)
			return
		}
		lingo.Fail(c, "Failed to load session", nil)
		return
	}
	msgs, err := models.ListChatMessagesBySessionID(ch.db, uint(sid))
	if err != nil {
		lingo.Fail(c, "Failed to list messages", nil)
		return
	}
	out := make([]*ChatMessageResponse, 0, len(msgs))
	for _, m := range msgs {
		out = append(out, chatMessageToResponse(m))
	}
	lingo.Success(c, "OK", gin.H{"messages": out})
}

// AppendChatMessages POST /api/ai/sessions/:id/messages — 追加 user/assistant 消息（不调用 LLM）
func (ch *CinyuHandlers) AppendChatMessages(c *gin.Context) {
	sid, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		lingo.Fail(c, "Invalid session id", nil)
		return
	}
	if _, err := models.GetChatSessionByID(ch.db, uint(sid)); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			lingo.FailWithCode(c, 404, "Session not found", nil)
			return
		}
		lingo.Fail(c, "Failed to load session", nil)
		return
	}
	var req AppendChatMessagesRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		lingo.Fail(c, err.Error(), nil)
		return
	}
	rows := make([]*models.ChatMessage, 0, len(req.Messages))
	for _, m := range req.Messages {
		role := strings.ToLower(strings.TrimSpace(m.Role))
		if role != models.ChatMessageRoleUser && role != models.ChatMessageRoleAssistant {
			continue
		}
		content := strings.TrimSpace(m.Content)
		if content == "" {
			continue
		}
		rows = append(rows, &models.ChatMessage{
			Role:    role,
			Content: content,
		})
	}
	if len(rows) == 0 {
		lingo.Fail(c, "No valid messages to append", nil)
		return
	}
	if err := models.AppendChatMessages(ch.db, uint(sid), rows); err != nil {
		lingo.Fail(c, "Failed to append messages", nil)
		return
	}
	msgs, err := models.ListChatMessagesBySessionID(ch.db, uint(sid))
	if err != nil {
		lingo.Fail(c, "Failed to list messages", nil)
		return
	}
	out := make([]*ChatMessageResponse, 0, len(msgs))
	for _, m := range msgs {
		out = append(out, chatMessageToResponse(m))
	}
	lingo.Success(c, "OK", gin.H{"messages": out})
}

// ChatCompletion POST /api/ai/chat — 统一「对话」入口（含自动建会话）。
func (ch *CinyuHandlers) ChatCompletion(c *gin.Context) {
	if strings.TrimSpace(config.GlobalConfig.Services.LLM.APIKey) == "" {
		lingo.FailWithCode(c, 503, "LLM is not configured (LLM_API_KEY)", nil)
		return
	}
	var body ChatCompletionRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		lingo.Fail(c, err.Error(), nil)
		return
	}

	turn := ChatTurnRequest{
		Message:     body.Message,
		Model:       body.Model,
		Temperature: body.Temperature,
		MaxTokens:   body.MaxTokens,
	}

	var session *models.ChatSession
	if body.SessionID == 0 {
		s := &models.ChatSession{
			Title:        strings.TrimSpace(body.Title),
			Status:       models.ChatSessionStatusActive,
			UserID:       body.UserID,
			NovelID:      body.NovelID,
			WorkspaceID:  strings.TrimSpace(body.WorkspaceID),
			Provider:     pickChatProvider(body.Provider),
			Model:        pickChatModel(body.Model),
			SystemPrompt: body.SystemPrompt,
		}
		s.SetCreateInfo("system")
		if err := models.CreateChatSession(ch.db, s); err != nil {
			lingo.Fail(c, "Failed to create chat session", nil)
			return
		}
		session = s
	} else {
		s, err := models.GetChatSessionByID(ch.db, body.SessionID)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				lingo.FailWithCode(c, 404, "Session not found", nil)
				return
			}
			lingo.Fail(c, "Failed to load session", nil)
			return
		}
		if s.UserID != body.UserID {
			lingo.FailWithCode(c, 403, "Session does not belong to this user", nil)
			return
		}
		if s.Status != models.ChatSessionStatusActive {
			lingo.FailWithCode(c, 400, "Session is not active", nil)
			return
		}
		session = s
	}

	resp, err := ch.runChatTurn(c.Request.Context(), session, &turn)
	if err != nil {
		lingo.Fail(c, err.Error(), nil)
		return
	}
	fresh, err := models.GetChatSessionByID(ch.db, session.ID)
	if err != nil {
		fresh = session
	}
	lingo.Success(c, "OK", ChatCompletionResponse{
		Session:          chatSessionToResponse(fresh),
		UserMessage:      resp.UserMessage,
		AssistantMessage: resp.AssistantMessage,
		Usage:            resp.Usage,
	})
}

// ChatTurn POST /api/ai/sessions/:id/chat — 在指定会话中续聊（与 POST /api/ai/chat 逻辑相同，仅入口不同）。
func (ch *CinyuHandlers) ChatTurn(c *gin.Context) {
	if strings.TrimSpace(config.GlobalConfig.Services.LLM.APIKey) == "" {
		lingo.FailWithCode(c, 503, "LLM is not configured (LLM_API_KEY)", nil)
		return
	}
	sid, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		lingo.Fail(c, "Invalid session id", nil)
		return
	}
	var req ChatTurnRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		lingo.Fail(c, err.Error(), nil)
		return
	}

	session, err := models.GetChatSessionByID(ch.db, uint(sid))
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			lingo.FailWithCode(c, 404, "Session not found", nil)
			return
		}
		lingo.Fail(c, "Failed to load session", nil)
		return
	}
	if session.Status != models.ChatSessionStatusActive {
		lingo.FailWithCode(c, 400, "Session is not active", nil)
		return
	}

	resp, err := ch.runChatTurn(c.Request.Context(), session, &req)
	if err != nil {
		lingo.Fail(c, err.Error(), nil)
		return
	}
	lingo.Success(c, "OK", resp)
}

// runChatTurn 执行一轮持久化对话：读历史 → 调 LLM → 写入 user/assistant 消息并更新会话。
// 支持多轮 Function Call 工具调用循环（最多 5 轮）。
func (ch *CinyuHandlers) runChatTurn(ctx context.Context, session *models.ChatSession, req *ChatTurnRequest) (*ChatTurnResponse, error) {
	if session == nil || req == nil {
		return nil, errors.New("invalid session or request")
	}
	sid := session.ID

	history, err := models.ListChatMessagesBySessionID(ch.db, sid)
	if err != nil {
		return nil, errors.New("failed to load history")
	}
	if len(history) > maxPersistedHistoryMessages {
		history = history[len(history)-maxPersistedHistoryMessages:]
	}

	// 优先请求体，其次进程配置（LLM_MODEL 环境变量），最后才是会话创建时落库的 model，
	// 避免会话里仍是旧默认名时改环境变量不生效。
	modelName := strings.TrimSpace(req.Model)
	if modelName == "" {
		modelName = strings.TrimSpace(config.GlobalConfig.Services.LLM.Model)
	}
	if modelName == "" {
		modelName = strings.TrimSpace(session.Model)
	}

	maxTok := req.MaxTokens
	if maxTok <= 0 {
		maxTok = 2048
	}

	log := lingo.Lg
	if log == nil {
		log = zap.NewNop()
	}
	llmOpts := &lingo.LLMOptions{
		Provider:     strings.TrimSpace(session.Provider),
		ApiKey:       strings.TrimSpace(config.GlobalConfig.Services.LLM.APIKey),
		BaseURL:      strings.TrimSpace(config.GlobalConfig.Services.LLM.BaseURL),
		SystemPrompt: buildLingoroutineContextSystemPrompt(session, history),
		Logger:       log,
	}

	llmCtx, cancel := context.WithTimeout(ctx, 120*time.Second)
	defer cancel()

	handler, err := lingo.NewProviderHandler(llmCtx, session.Provider, llmOpts)
	if err != nil {
		return nil, fmt.Errorf("llm handler: %w", err)
	}
	handler.ResetMemory()

	qopts := &lingo.QueryOptions{
		Model:       modelName,
		MaxTokens:   maxTok,
		Temperature: float32(config.GlobalConfig.Services.LLM.Temperature),
	}
	if req.Temperature != nil {
		qopts.Temperature = *req.Temperature
	}

	userMessage := strings.TrimSpace(req.Message)

	// 多轮工具调用循环（最多 5 轮）
	const maxToolRounds = 5
	var lastResp *lingo.QueryResult
	totalPromptTok, totalCompletionTok, totalTotalTok := 0, 0, 0

	for round := 0; round < maxToolRounds; round++ {
		qresp, err := handler.QueryWithOptions(userMessage, qopts)
		if err != nil {
			if lingo.Lg != nil {
				lingo.Lg.Error("llm query", zap.Error(err))
			}
			return nil, fmt.Errorf("LLM request failed: %w", err)
		}
		if qresp == nil || len(qresp.Choices) == 0 {
			return nil, errors.New("empty completion choices")
		}

		// 累加 token 用量
		if qresp.Usage != nil {
			totalPromptTok += qresp.Usage.PromptTokens
			totalCompletionTok += qresp.Usage.CompletionTokens
			totalTotalTok += qresp.Usage.TotalTokens
		}

		choice := qresp.Choices[0]

		// 如果 AI 请求工具调用，则执行工具并继续循环
		if len(choice.ToolCalls) > 0 {
			if lingo.Lg != nil {
				lingo.Lg.Info("tool_calls detected, executing", zap.Int("count", len(choice.ToolCalls)))
			}
			for _, tc := range choice.ToolCalls {
				// 执行工具调用
				result := fmt.Sprintf("工具 %s 在当前聊天会话中不可用，请切换到工作区页面使用。", tc.Function.Name)
				handler.RecordToolResult(tc.ID, result)
			}
			// 要求 AI 继续（告诉它工具不可用于普通聊天）
			userMessage = "请直接回答用户问题，不要调用工具（当前对话模式下工具不可用）。"
			lastResp = qresp
			continue
		}

		// 无工具调用，这是最终回复
		lastResp = qresp
		break
	}

	if lastResp == nil {
		return nil, errors.New("failed to get final response")
	}

	choice := lastResp.Choices[0]
	assistantText := strings.TrimSpace(choice.Content)

	seqUser, err := models.NextChatMessageSeq(ch.db, sid)
	if err != nil {
		return nil, errors.New("failed to allocate message seq")
	}

	userRow := &models.ChatMessage{
		SessionID: sid,
		Seq:       seqUser,
		Role:      models.ChatMessageRoleUser,
		Content:   strings.TrimSpace(req.Message),
	}
	userRow.SetCreateInfo("system")

	reqID := lingo.GenerateLingRequestID()
	asstRow := &models.ChatMessage{
		SessionID:        sid,
		Seq:              seqUser + 1,
		Role:             models.ChatMessageRoleAssistant,
		Content:          assistantText,
		FinishReason:     choice.FinishReason,
		RequestID:        reqID,
		PromptTokens:     totalPromptTok,
		CompletionTokens: totalCompletionTok,
		TotalTokens:      totalTotalTok,
	}
	asstRow.SetCreateInfo("system")

	tx := ch.db.Begin()
	if err := tx.Create(userRow).Error; err != nil {
		tx.Rollback()
		return nil, errors.New("failed to save user message")
	}
	if err := tx.Create(asstRow).Error; err != nil {
		tx.Rollback()
		return nil, errors.New("failed to save assistant message")
	}
	updates := map[string]interface{}{
		"last_message_at": time.Now().Unix(),
		"updated_at":      time.Now(),
		"model":           modelName,
	}
	if strings.TrimSpace(session.Title) == "" {
		title := strings.TrimSpace(req.Message)
		if len(title) > 80 {
			title = title[:80] + "…"
		}
		updates["title"] = title
	}
	if err := tx.Model(&models.ChatSession{}).Where("id = ?", sid).Updates(updates).Error; err != nil {
		tx.Rollback()
		return nil, errors.New("failed to update session")
	}
	if err := tx.Commit().Error; err != nil {
		return nil, errors.New("failed to commit")
	}

	usage := &chatUsageResponse{
		PromptTokens:     totalPromptTok,
		CompletionTokens: totalCompletionTok,
		TotalTokens:      totalTotalTok,
	}
	return &ChatTurnResponse{
		UserMessage:      chatMessageToResponse(userRow),
		AssistantMessage: chatMessageToResponse(asstRow),
		Usage:            usage,
	}, nil
}

func pickChatProvider(p string) string {
	p = strings.TrimSpace(p)
	if p != "" {
		return p
	}
	p = strings.TrimSpace(config.GlobalConfig.Services.LLM.Provider)
	if p != "" {
		return p
	}
	return models.ChatLLMProviderOpenAI
}

func pickChatModel(m string) string {
	m = strings.TrimSpace(m)
	if m != "" {
		return m
	}
	return config.GlobalConfig.Services.LLM.Model
}

func buildLingoroutineContextSystemPrompt(session *models.ChatSession, history []*models.ChatMessage) string {
	var b strings.Builder
	if s := strings.TrimSpace(session.SystemPrompt); s != "" {
		b.WriteString(s)
	}
	if sum := strings.TrimSpace(session.Summary); sum != "" {
		if b.Len() > 0 {
			b.WriteString("\n\n")
		}
		b.WriteString("Conversation summary so far: ")
		b.WriteString(sum)
	}
	if len(history) > 0 {
		if b.Len() > 0 {
			b.WriteString("\n\n")
		}
		b.WriteString("Prior conversation (chronological, each line is role: content):\n")
		for _, m := range history {
			if m == nil {
				continue
			}
			role := strings.ToLower(strings.TrimSpace(m.Role))
			if role == models.ChatMessageRoleTool {
				continue
			}
			if role != models.ChatMessageRoleUser && role != models.ChatMessageRoleAssistant && role != models.ChatMessageRoleSystem {
				continue
			}
			b.WriteString(m.Role)
			b.WriteString(": ")
			b.WriteString(m.Content)
			b.WriteString("\n")
		}
	}
	if b.Len() > 0 {
		b.WriteString("\n\n")
	}
	b.WriteString("Continue the above. Reply only to the user's latest message (sent as the next user turn via the chat API).")
	out := b.String()
	if len(out) > maxSystemPromptContextBytes {
		out = out[len(out)-maxSystemPromptContextBytes:]
	}
	return out
}
