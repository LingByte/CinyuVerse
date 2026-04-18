package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/LingByte/CinyuVerse/internal/models"
	"github.com/LingByte/CinyuVerse/pkg/config"
	"github.com/LingByte/lingoroutine/llm"
	"github.com/LingByte/lingoroutine/logger"
	"github.com/LingByte/lingoroutine/response"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

const maxPersistedHistoryMessages = 80 // 约 40 轮 user+assistant，控制上下文体积

const maxSystemPromptContextBytes = 28000

// CreateChatSessionRequest 创建会话
type CreateChatSessionRequest struct {
	Title        string `json:"title"`
	NovelID      uint   `json:"novelId"`
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
	NovelID       uint   `json:"novelId"`
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

// ChatCompletionRequest POST /api/ai/chat — 统一对话入口：sessionId 为 0 时先建会话再生成回复；否则在已有会话中续聊。
type ChatCompletionRequest struct {
	SessionID    uint     `json:"sessionId"`
	NovelID      uint     `json:"novelId"`
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
	ai.POST("/chat/stream", ch.ChatCompletionStream)
	ai.POST("/chat", ch.ChatCompletion)
	sessions := ai.Group("/sessions")
	{
		sessions.POST("", ch.CreateChatSession)
		sessions.GET("", ch.ListChatSessions)
		sessions.GET("/:id/messages", ch.ListChatMessages)
		sessions.POST("/:id/chat/stream", ch.ChatTurnStream)
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
		NovelID:       s.NovelID,
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
		response.Fail(c, err.Error(), nil)
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
		NovelID:      req.NovelID,
		Provider:     provider,
		Model:        model,
		SystemPrompt: req.SystemPrompt,
	}
	s.SetCreateInfo("system")
	if err := models.CreateChatSession(ch.db, s); err != nil {
		response.Fail(c, "Failed to create chat session", nil)
		return
	}
	response.Success(c, "Chat session created", chatSessionToResponse(s))
}

// ListChatSessions GET /api/ai/sessions?novelId=&page=&size= — 无 novelId 时列出全部会话。
func (ch *CinyuHandlers) ListChatSessions(c *gin.Context) {
	novelIDStr := c.Query("novelId")
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
	if novelIDStr != "" {
		nid, err := strconv.ParseUint(novelIDStr, 10, 32)
		if err != nil {
			response.Fail(c, "Invalid novelId", nil)
			return
		}
		rows, total, err = models.ListChatSessionsByNovelID(ch.db, uint(nid), page, size)
	} else {
		rows, total, err = models.ListAllChatSessions(ch.db, page, size)
	}
	if err != nil {
		response.Fail(c, "Failed to list sessions", nil)
		return
	}
	out := make([]*ChatSessionResponse, 0, len(rows))
	for _, s := range rows {
		out = append(out, chatSessionToResponse(s))
	}
	response.Success(c, "OK", paginatedChatSessionsResponse{
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
		response.Fail(c, "Invalid session id", nil)
		return
	}
	s, err := models.GetChatSessionByID(ch.db, uint(id))
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.FailWithCode(c, 404, "Session not found", nil)
			return
		}
		response.Fail(c, "Failed to load session", nil)
		return
	}
	response.Success(c, "OK", chatSessionToResponse(s))
}

// DeleteChatSession DELETE /api/ai/sessions/:id
func (ch *CinyuHandlers) DeleteChatSession(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.Fail(c, "Invalid session id", nil)
		return
	}
	if err := models.DeleteChatSession(ch.db, uint(id), "system"); err != nil {
		response.Fail(c, "Failed to delete session", nil)
		return
	}
	response.Success(c, "Session deleted", gin.H{"id": id})
}

// ListChatMessages GET /api/ai/sessions/:id/messages
func (ch *CinyuHandlers) ListChatMessages(c *gin.Context) {
	sid, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.Fail(c, "Invalid session id", nil)
		return
	}
	if _, err := models.GetChatSessionByID(ch.db, uint(sid)); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.FailWithCode(c, 404, "Session not found", nil)
			return
		}
		response.Fail(c, "Failed to load session", nil)
		return
	}
	msgs, err := models.ListChatMessagesBySessionID(ch.db, uint(sid))
	if err != nil {
		response.Fail(c, "Failed to list messages", nil)
		return
	}
	out := make([]*ChatMessageResponse, 0, len(msgs))
	for _, m := range msgs {
		out = append(out, chatMessageToResponse(m))
	}
	response.Success(c, "OK", gin.H{"messages": out})
}

// ChatCompletion POST /api/ai/chat — 统一「对话」入口（含自动建会话）。
func (ch *CinyuHandlers) ChatCompletion(c *gin.Context) {
	if strings.TrimSpace(config.GlobalConfig.Services.LLM.APIKey) == "" {
		response.FailWithCode(c, 503, "LLM is not configured (LLM_API_KEY)", nil)
		return
	}
	var body ChatCompletionRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		response.Fail(c, err.Error(), nil)
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
			NovelID:      body.NovelID,
			Provider:     pickChatProvider(body.Provider),
			Model:        pickChatModel(body.Model),
			SystemPrompt: body.SystemPrompt,
		}
		s.SetCreateInfo("system")
		if err := models.CreateChatSession(ch.db, s); err != nil {
			response.Fail(c, "Failed to create chat session", nil)
			return
		}
		session = s
	} else {
		s, err := models.GetChatSessionByID(ch.db, body.SessionID)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				response.FailWithCode(c, 404, "Session not found", nil)
				return
			}
			response.Fail(c, "Failed to load session", nil)
			return
		}
		if s.Status != models.ChatSessionStatusActive {
			response.FailWithCode(c, 400, "Session is not active", nil)
			return
		}
		session = s
	}

	resp, err := ch.runChatTurn(c.Request.Context(), session, &turn)
	if err != nil {
		response.Fail(c, err.Error(), nil)
		return
	}
	fresh, err := models.GetChatSessionByID(ch.db, session.ID)
	if err != nil {
		fresh = session
	}
	response.Success(c, "OK", ChatCompletionResponse{
		Session:          chatSessionToResponse(fresh),
		UserMessage:      resp.UserMessage,
		AssistantMessage: resp.AssistantMessage,
		Usage:            resp.Usage,
	})
}

// ChatTurn POST /api/ai/sessions/:id/chat — 在指定会话中续聊（与 POST /api/ai/chat 逻辑相同，仅入口不同）。
func (ch *CinyuHandlers) ChatTurn(c *gin.Context) {
	if strings.TrimSpace(config.GlobalConfig.Services.LLM.APIKey) == "" {
		response.FailWithCode(c, 503, "LLM is not configured (LLM_API_KEY)", nil)
		return
	}
	sid, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.Fail(c, "Invalid session id", nil)
		return
	}
	var req ChatTurnRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, err.Error(), nil)
		return
	}

	session, err := models.GetChatSessionByID(ch.db, uint(sid))
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.FailWithCode(c, 404, "Session not found", nil)
			return
		}
		response.Fail(c, "Failed to load session", nil)
		return
	}
	if session.Status != models.ChatSessionStatusActive {
		response.FailWithCode(c, 400, "Session is not active", nil)
		return
	}

	resp, err := ch.runChatTurn(c.Request.Context(), session, &req)
	if err != nil {
		response.Fail(c, err.Error(), nil)
		return
	}
	response.Success(c, "OK", resp)
}

// ChatTurnStream POST /api/ai/sessions/:id/chat/stream — SSE：meta → delta → done（与 ChatTurn 同请求体）。
func (ch *CinyuHandlers) ChatTurnStream(c *gin.Context) {
	if strings.TrimSpace(config.GlobalConfig.Services.LLM.APIKey) == "" {
		response.FailWithCode(c, 503, "LLM is not configured (LLM_API_KEY)", nil)
		return
	}
	sid, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.Fail(c, "Invalid session id", nil)
		return
	}
	var req ChatTurnRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, err.Error(), nil)
		return
	}

	session, err := models.GetChatSessionByID(ch.db, uint(sid))
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.FailWithCode(c, 404, "Session not found", nil)
			return
		}
		response.Fail(c, "Failed to load session", nil)
		return
	}
	if session.Status != models.ChatSessionStatusActive {
		response.FailWithCode(c, 400, "Session is not active", nil)
		return
	}

	ch.runChatTurnStream(c.Request.Context(), c, session, &req, false)
}

// ChatCompletionStream POST /api/ai/chat/stream — 与 ChatCompletion 相同 JSON 体，响应为 text/event-stream。
func (ch *CinyuHandlers) ChatCompletionStream(c *gin.Context) {
	if strings.TrimSpace(config.GlobalConfig.Services.LLM.APIKey) == "" {
		response.FailWithCode(c, 503, "LLM is not configured (LLM_API_KEY)", nil)
		return
	}
	var body ChatCompletionRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		response.Fail(c, err.Error(), nil)
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
			NovelID:      body.NovelID,
			Provider:     pickChatProvider(body.Provider),
			Model:        pickChatModel(body.Model),
			SystemPrompt: body.SystemPrompt,
		}
		s.SetCreateInfo("system")
		if err := models.CreateChatSession(ch.db, s); err != nil {
			response.Fail(c, "Failed to create chat session", nil)
			return
		}
		session = s
	} else {
		s, err := models.GetChatSessionByID(ch.db, body.SessionID)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				response.FailWithCode(c, 404, "Session not found", nil)
				return
			}
			response.Fail(c, "Failed to load session", nil)
			return
		}
		if s.Status != models.ChatSessionStatusActive {
			response.FailWithCode(c, 400, "Session is not active", nil)
			return
		}
		session = s
	}

	ch.runChatTurnStream(c.Request.Context(), c, session, &turn, true)
}

func writeChatSSEJSON(c *gin.Context, v any) error {
	b, err := json.Marshal(v)
	if err != nil {
		return err
	}
	if _, err := fmt.Fprintf(c.Writer, "data: %s\n\n", b); err != nil {
		return err
	}
	if f, ok := c.Writer.(http.Flusher); ok {
		f.Flush()
	}
	return nil
}

func beginChatSSE(c *gin.Context) {
	h := c.Writer.Header()
	h.Set("Content-Type", "text/event-stream")
	h.Set("Cache-Control", "no-cache")
	h.Set("Connection", "keep-alive")
	h.Set("X-Accel-Buffering", "no")
	c.Status(http.StatusOK)
}

// runChatTurnStream 先落库 user 消息，再以 SSE 推送 delta，最后写入 assistant 并发送 done。
// includeSessionInMeta 为 true 时首包 meta 携带 session（供 /ai/chat/stream 首次建会话）。
func (ch *CinyuHandlers) runChatTurnStream(ctx context.Context, c *gin.Context, session *models.ChatSession, req *ChatTurnRequest, includeSessionInMeta bool) {
	if session == nil || req == nil {
		response.Fail(c, "invalid session or request", nil)
		return
	}
	sid := session.ID

	history, err := models.ListChatMessagesBySessionID(ch.db, sid)
	if err != nil {
		response.Fail(c, "failed to load history", nil)
		return
	}
	if len(history) > maxPersistedHistoryMessages {
		history = history[len(history)-maxPersistedHistoryMessages:]
	}

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

	log := logger.Lg
	if log == nil {
		log = zap.NewNop()
	}
	llmOpts := &llm.LLMOptions{
		Provider:     strings.TrimSpace(session.Provider),
		ApiKey:       strings.TrimSpace(config.GlobalConfig.Services.LLM.APIKey),
		BaseURL:      strings.TrimSpace(config.GlobalConfig.Services.LLM.BaseURL),
		SystemPrompt: buildLingoroutineContextSystemPrompt(session, history),
		Logger:       log,
	}

	llmCtx, cancel := context.WithTimeout(ctx, 120*time.Second)
	defer cancel()

	handler, err := llm.NewProviderHandler(llmCtx, session.Provider, llmOpts)
	if err != nil {
		response.Fail(c, fmt.Sprintf("llm handler: %v", err), nil)
		return
	}
	handler.ResetMemory()

	qopts := &llm.QueryOptions{
		Model:     modelName,
		MaxTokens: maxTok,
	}
	if req.Temperature != nil {
		qopts.Temperature = *req.Temperature
	}

	seqUser, err := models.NextChatMessageSeq(ch.db, sid)
	if err != nil {
		response.Fail(c, "failed to allocate message seq", nil)
		return
	}

	userRow := &models.ChatMessage{
		SessionID: sid,
		Seq:       seqUser,
		Role:      models.ChatMessageRoleUser,
		Content:   strings.TrimSpace(req.Message),
	}
	userRow.SetCreateInfo("system")
	if err := ch.db.Create(userRow).Error; err != nil {
		response.Fail(c, "failed to save user message", nil)
		return
	}

	beginChatSSE(c)

	meta := gin.H{
		"type":        "meta",
		"userMessage": chatMessageToResponse(userRow),
	}
	if includeSessionInMeta {
		fresh, err := models.GetChatSessionByID(ch.db, sid)
		if err != nil || fresh == nil {
			fresh = session
		}
		meta["session"] = chatSessionToResponse(fresh)
	}
	if err := writeChatSSEJSON(c, meta); err != nil {
		return
	}

	var full strings.Builder
	qresp, err := handler.QueryStream(strings.TrimSpace(req.Message), qopts, func(segment string, isComplete bool) error {
		if isComplete || segment == "" {
			return nil
		}
		full.WriteString(segment)
		return writeChatSSEJSON(c, gin.H{"type": "delta", "text": segment})
	})
	if err != nil {
		_ = writeChatSSEJSON(c, gin.H{"type": "error", "msg": err.Error()})
		return
	}

	assistantText := strings.TrimSpace(full.String())
	if assistantText == "" && qresp != nil && len(qresp.Choices) > 0 {
		assistantText = strings.TrimSpace(qresp.Choices[0].Content)
	}
	if assistantText == "" {
		_ = writeChatSSEJSON(c, gin.H{"type": "error", "msg": "empty assistant output"})
		return
	}

	reqID := llm.GenerateLingRequestID()
	var promptTok, completionTok, totalTok int
	if qresp != nil && qresp.Usage != nil {
		promptTok = qresp.Usage.PromptTokens
		completionTok = qresp.Usage.CompletionTokens
		totalTok = qresp.Usage.TotalTokens
	}
	finishReason := "stop"
	if qresp != nil && len(qresp.Choices) > 0 && strings.TrimSpace(qresp.Choices[0].FinishReason) != "" {
		finishReason = qresp.Choices[0].FinishReason
	}

	asstRow := &models.ChatMessage{
		SessionID:        sid,
		Seq:              seqUser + 1,
		Role:             models.ChatMessageRoleAssistant,
		Content:          assistantText,
		FinishReason:     finishReason,
		RequestID:        reqID,
		PromptTokens:     promptTok,
		CompletionTokens: completionTok,
		TotalTokens:      totalTok,
	}
	asstRow.SetCreateInfo("system")

	tx := ch.db.Begin()
	if err := tx.Create(asstRow).Error; err != nil {
		tx.Rollback()
		_ = writeChatSSEJSON(c, gin.H{"type": "error", "msg": "failed to save assistant message"})
		return
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
		_ = writeChatSSEJSON(c, gin.H{"type": "error", "msg": "failed to update session"})
		return
	}
	if err := tx.Commit().Error; err != nil {
		_ = writeChatSSEJSON(c, gin.H{"type": "error", "msg": "failed to commit"})
		return
	}

	usage := &chatUsageResponse{
		PromptTokens:     promptTok,
		CompletionTokens: completionTok,
		TotalTokens:      totalTok,
	}
	_ = writeChatSSEJSON(c, gin.H{
		"type":               "done",
		"assistantMessage":   chatMessageToResponse(asstRow),
		"usage":              usage,
	})
}

// runChatTurn 执行一轮持久化对话：读历史 → 调 LLM → 写入 user/assistant 消息并更新会话。
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

	log := logger.Lg
	if log == nil {
		log = zap.NewNop()
	}
	llmOpts := &llm.LLMOptions{
		Provider:     strings.TrimSpace(session.Provider),
		ApiKey:       strings.TrimSpace(config.GlobalConfig.Services.LLM.APIKey),
		BaseURL:      strings.TrimSpace(config.GlobalConfig.Services.LLM.BaseURL),
		SystemPrompt: buildLingoroutineContextSystemPrompt(session, history),
		Logger:       log,
	}

	llmCtx, cancel := context.WithTimeout(ctx, 120*time.Second)
	defer cancel()

	handler, err := llm.NewProviderHandler(llmCtx, session.Provider, llmOpts)
	if err != nil {
		return nil, fmt.Errorf("llm handler: %w", err)
	}
	handler.ResetMemory()

	qopts := &llm.QueryOptions{
		Model:     modelName,
		MaxTokens: maxTok,
	}
	if req.Temperature != nil {
		qopts.Temperature = *req.Temperature
	}

	qresp, err := handler.QueryWithOptions(strings.TrimSpace(req.Message), qopts)
	if err != nil {
		if logger.Lg != nil {
			logger.Lg.Error("llm query", zap.Error(err))
		}
		return nil, fmt.Errorf("LLM request failed: %w", err)
	}
	if qresp == nil || len(qresp.Choices) == 0 {
		return nil, errors.New("empty completion choices")
	}
	choice := qresp.Choices[0]
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

	reqID := llm.GenerateLingRequestID()
	var promptTok, completionTok, totalTok int
	if qresp.Usage != nil {
		promptTok = qresp.Usage.PromptTokens
		completionTok = qresp.Usage.CompletionTokens
		totalTok = qresp.Usage.TotalTokens
	}
	asstRow := &models.ChatMessage{
		SessionID:        sid,
		Seq:              seqUser + 1,
		Role:             models.ChatMessageRoleAssistant,
		Content:          assistantText,
		FinishReason:     choice.FinishReason,
		RequestID:        reqID,
		PromptTokens:     promptTok,
		CompletionTokens: completionTok,
		TotalTokens:      totalTok,
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
		PromptTokens:     promptTok,
		CompletionTokens: completionTok,
		TotalTokens:      totalTok,
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
