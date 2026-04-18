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
	Message      string               `json:"message" binding:"required"`
	Model        string               `json:"model"`
	Temperature  *float32             `json:"temperature"`
	MaxTokens    int                  `json:"maxTokens"`
	BaseDraft    *GeneratedNovelDraft `json:"baseDraft"`
	LockedFields []string             `json:"lockedFields"`
	Feedback     string               `json:"feedback"`
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

	if strings.TrimSpace(req.Message) == "" {
		response.Fail(c, "message is required", nil)
		return
	}
	prompt := buildGenerateNovelPrompt(req)
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
		Model:            modelName,
		MaxTokens:        req.MaxTokens,
		EnableJSONOutput: true,
		OutputFormat:     "json_object",
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
	applyLockedFields(&draft, req.BaseDraft, req.LockedFields)

	response.Success(c, "OK", GenerateNovelByAIResponse{
		Draft: draft,
		Raw:   raw,
	})
}

func buildGenerateNovelPrompt(req GenerateNovelByAIRequest) string {
	var b strings.Builder
	b.WriteString("用户需求：\n")
	b.WriteString(strings.TrimSpace(req.Message))
	b.WriteString("\n")
	if strings.TrimSpace(req.Feedback) != "" {
		b.WriteString("\n修改意见：\n")
		b.WriteString(strings.TrimSpace(req.Feedback))
		b.WriteString("\n")
	}
	if req.BaseDraft != nil {
		if raw, err := json.Marshal(req.BaseDraft); err == nil {
			b.WriteString("\n当前草稿（请在此基础上优化）：\n")
			b.Write(raw)
			b.WriteString("\n")
		}
	}
	if len(req.LockedFields) > 0 {
		b.WriteString("\n锁定字段（这些字段必须原样保留，不可改动）：\n")
		b.WriteString(strings.Join(req.LockedFields, ","))
		b.WriteString("\n")
	}
	return b.String()
}

func applyLockedFields(draft *GeneratedNovelDraft, base *GeneratedNovelDraft, lockedFields []string) {
	if draft == nil || base == nil || len(lockedFields) == 0 {
		return
	}
	for _, field := range lockedFields {
		switch strings.TrimSpace(field) {
		case "title":
			draft.Title = base.Title
		case "status":
			draft.Status = base.Status
		case "genre":
			draft.Genre = base.Genre
		case "audience":
			draft.Audience = base.Audience
		case "theme":
			draft.Theme = base.Theme
		case "description":
			draft.Description = base.Description
		case "worldSetting":
			draft.WorldSetting = base.WorldSetting
		case "tags":
			draft.Tags = base.Tags
		case "coverImage":
			draft.CoverImage = base.CoverImage
		case "styleGuide":
			draft.StyleGuide = base.StyleGuide
		}
	}
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
	if err := json.Unmarshal([]byte(candidate), &draft); err == nil {
		return draft, nil
	}
	// 兜底：兼容模型把 string 字段返回成 number/bool 的情况
	var m map[string]any
	if err := json.Unmarshal([]byte(candidate), &m); err != nil {
		return draft, fmt.Errorf("invalid json: %w", err)
	}
	draft = GeneratedNovelDraft{
		Title:          anyToString(m["title"]),
		Status:         anyToString(m["status"]),
		Genre:          anyToString(m["genre"]),
		Audience:       anyToString(m["audience"]),
		Theme:          anyToString(m["theme"]),
		Description:    anyToString(m["description"]),
		WorldSetting:   anyToString(m["worldSetting"]),
		Tags:           anyToString(m["tags"]),
		CoverImage:     anyToString(m["coverImage"]),
		StyleGuide:     anyToString(m["styleGuide"]),
	}
	return draft, nil
}

func buildGenerateNovelSystemPrompt() string {
	return strings.TrimSpace(`
你是小说策划助手。你必须只输出一个 JSON 对象，不能输出任何额外解释、Markdown、代码块标记。
输出字段必须严格是以下键名（全部为 string）：
title,status,genre,audience,theme,description,worldSetting,tags,coverImage,styleGuide

规则：
1) title 必填，长度建议 <= 40 字。
2) tags 使用逗号分隔，如 "热血,成长,系统"。
3) audience 仅可为 "male" 或 "female" 或 ""。
4) 如果用户未提供某字段信息，可填空字符串。
5) 若请求里有“锁定字段”，这些字段值必须与输入草稿保持完全一致。
6) 输出必须是可被标准 JSON.parse 直接解析的合法 JSON。
`)
}
