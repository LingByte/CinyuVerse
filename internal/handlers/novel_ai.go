package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/LingByte/CinyuVerse/pkg/config"
	"github.com/LingByte/lingoroutine/llm"
	"github.com/LingByte/lingoroutine/logger"
	"github.com/LingByte/lingoroutine/response"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

type GenerateNovelByAIRequest struct {
	UserID      uint     `json:"userId" binding:"required"`
	Message     string   `json:"message" binding:"required"`
	Model       string   `json:"model"`
	Temperature *float32 `json:"temperature"`
	MaxTokens   int      `json:"maxTokens"`
}

type GeneratedNovelDraft struct {
	Title          string `json:"title"`
	Status         string `json:"status"`
	Genre          string `json:"genre"`
	Audience       string `json:"audience"`
	Theme          string `json:"theme"`
	Description    string `json:"description"`
	WorldSetting   string `json:"worldSetting"`
	Tags           string `json:"tags"`
	CoverImage     string `json:"coverImage"`
	StyleGuide     string `json:"styleGuide"`
	ReferenceNovel string `json:"referenceNovel"`
}

type GenerateNovelByAIResponse struct {
	Draft GeneratedNovelDraft `json:"draft"`
	Raw   string              `json:"raw"`
}

// GenerateNovelByAI POST /api/novels/generate
func (ch *CinyuHandlers) GenerateNovelByAI(c *gin.Context) {
	if strings.TrimSpace(config.GlobalConfig.Services.LLM.APIKey) == "" {
		response.FailWithCode(c, 503, "LLM is not configured (LLM_API_KEY)", nil)
		return
	}
	var req GenerateNovelByAIRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, err.Error(), nil)
		return
	}

	prompt := strings.TrimSpace(req.Message)
	if prompt == "" {
		response.Fail(c, "message is required", nil)
		return
	}
	modelName := pickChatModel(req.Model)
	if modelName == "" {
		modelName = "gpt-4o-mini"
	}

	llmOpts := &llm.LLMOptions{
		Provider:     pickChatProvider(""),
		ApiKey:       strings.TrimSpace(config.GlobalConfig.Services.LLM.APIKey),
		BaseURL:      strings.TrimSpace(config.GlobalConfig.Services.LLM.BaseURL),
		SystemPrompt: buildGenerateNovelSystemPrompt(),
		Logger:       logger.Lg,
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 120*time.Second)
	defer cancel()

	handler, err := llm.NewProviderHandler(ctx, llmOpts.Provider, llmOpts)
	if err != nil {
		response.Fail(c, "llm handler init failed: "+err.Error(), nil)
		return
	}
	handler.ResetMemory()

	qopts := &llm.QueryOptions{
		Model:     modelName,
		MaxTokens: req.MaxTokens,
	}
	if qopts.MaxTokens <= 0 {
		qopts.MaxTokens = 1800
	}
	if req.Temperature != nil {
		qopts.Temperature = *req.Temperature
	}

	qresp, err := handler.QueryWithOptions(prompt, qopts)
	if err != nil {
		if logger.Lg != nil {
			logger.Lg.Error("generate novel with ai failed", zap.Error(err))
		}
		response.Fail(c, "LLM request failed: "+err.Error(), nil)
		return
	}
	if qresp == nil || len(qresp.Choices) == 0 {
		response.Fail(c, "empty completion choices", nil)
		return
	}
	raw := strings.TrimSpace(qresp.Choices[0].Content)

	draft, err := parseGeneratedNovelDraft(raw)
	if err != nil {
		response.FailWithCode(c, 422, "AI输出不是合法小说JSON: "+err.Error(), gin.H{"raw": raw})
		return
	}
	if strings.TrimSpace(draft.Title) == "" {
		response.FailWithCode(c, 422, "AI输出缺少必填字段: title", gin.H{"raw": raw})
		return
	}

	response.Success(c, "OK", GenerateNovelByAIResponse{
		Draft: draft,
		Raw:   raw,
	})
}

func parseGeneratedNovelDraft(raw string) (GeneratedNovelDraft, error) {
	var draft GeneratedNovelDraft
	if strings.TrimSpace(raw) == "" {
		return draft, errors.New("empty response")
	}

	candidate := raw
	if !json.Valid([]byte(candidate)) {
		start := strings.Index(candidate, "{")
		end := strings.LastIndex(candidate, "}")
		if start < 0 || end < 0 || start >= end {
			return draft, errors.New("cannot locate JSON object")
		}
		candidate = candidate[start : end+1]
	}
	if err := json.Unmarshal([]byte(candidate), &draft); err != nil {
		return draft, fmt.Errorf("invalid json: %w", err)
	}
	return draft, nil
}

func buildGenerateNovelSystemPrompt() string {
	return strings.TrimSpace(`
你是小说策划助手。你必须只输出一个 JSON 对象，不能输出任何额外解释、Markdown、代码块标记。
输出字段必须严格是以下键名（全部为 string）：
title,status,genre,audience,theme,description,worldSetting,tags,coverImage,styleGuide,referenceNovel

规则：
1) title 必填，长度建议 <= 40 字。
2) tags 使用逗号分隔，如 "热血,成长,系统"。
3) audience 仅可为 "male" 或 "female" 或 ""。
4) 如果用户未提供某字段信息，可填空字符串。
5) 输出必须是可被标准 JSON.parse 直接解析的合法 JSON。
`)
}
