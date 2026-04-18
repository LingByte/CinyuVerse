package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
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

type CreateCharacterRequest struct {
	NovelID      uint   `json:"novelId"`
	Name         string `json:"name" binding:"required"`
	RoleType     string `json:"roleType"`
	Gender       string `json:"gender"`
	Age          string `json:"age"`
	Personality  string `json:"personality"`
	Background   string `json:"background"`
	Goal         string `json:"goal"`
	Relationship string `json:"relationship"`
	Appearance   string `json:"appearance"`
	Abilities    string `json:"abilities"`
	Notes        string `json:"notes"`
}

type UpdateCharacterRequest struct {
	NovelID      uint   `json:"novelId"`
	Name         string `json:"name"`
	RoleType     string `json:"roleType"`
	Gender       string `json:"gender"`
	Age          string `json:"age"`
	Personality  string `json:"personality"`
	Background   string `json:"background"`
	Goal         string `json:"goal"`
	Relationship string `json:"relationship"`
	Appearance   string `json:"appearance"`
	Abilities    string `json:"abilities"`
	Notes        string `json:"notes"`
}

type CharacterResponse struct {
	ID           uint   `json:"id"`
	NovelID      uint   `json:"novelId"`
	Name         string `json:"name"`
	RoleType     string `json:"roleType"`
	Gender       string `json:"gender"`
	Age          string `json:"age"`
	Personality  string `json:"personality"`
	Background   string `json:"background"`
	Goal         string `json:"goal"`
	Relationship string `json:"relationship"`
	Appearance   string `json:"appearance"`
	Abilities    string `json:"abilities"`
	Notes        string `json:"notes"`
	CreatedAt    string `json:"createdAt"`
	UpdatedAt    string `json:"updatedAt"`
}

type PaginatedCharacterResponse struct {
	Characters []*CharacterResponse `json:"characters"`
	Total      int64                `json:"total"`
	Page       int                  `json:"page"`
	Size       int                  `json:"size"`
}

type GenerateCharacterByAIRequest struct {
	Message      string             `json:"message" binding:"required"`
	Model        string             `json:"model"`
	Temperature  *float32           `json:"temperature"`
	MaxTokens    int                `json:"maxTokens"`
	BaseDraft    *CharacterResponse `json:"baseDraft"`
	LockedFields []string           `json:"lockedFields"`
	Feedback     string             `json:"feedback"`
}

type GenerateCharacterByAIResponse struct {
	Draft CharacterResponse `json:"draft"`
	Raw   string            `json:"raw"`
}

func (ch *CinyuHandlers) registerCharacterRoutes(r *gin.RouterGroup) {
	characters := r.Group("/characters")
	{
		characters.POST("", ch.CreateCharacter)
		characters.GET("", ch.GetAllCharacters)
		characters.GET("/:id", ch.GetCharacter)
		characters.PUT("/:id", ch.UpdateCharacter)
		characters.DELETE("/:id", ch.DeleteCharacter)
		characters.POST("/generate", ch.GenerateCharacterByAI)
	}
}

func (ch *CinyuHandlers) CreateCharacter(c *gin.Context) {
	var req CreateCharacterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, err.Error(), nil)
		return
	}
	row := &models.Character{
		NovelID:      req.NovelID,
		Name:         req.Name,
		RoleType:     req.RoleType,
		Gender:       req.Gender,
		Age:          req.Age,
		Personality:  req.Personality,
		Background:   req.Background,
		Goal:         req.Goal,
		Relationship: req.Relationship,
		Appearance:   req.Appearance,
		Abilities:    req.Abilities,
		Notes:        req.Notes,
	}
	row.SetCreateInfo("system")
	if err := models.CreateCharacter(ch.db, row); err != nil {
		response.Fail(c, "Failed to create character", nil)
		return
	}
	response.Success(c, "Character created successfully", characterToResponse(row))
}

func (ch *CinyuHandlers) GetCharacter(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.Fail(c, "Invalid character ID", nil)
		return
	}
	row, err := models.GetCharacterByID(ch.db, uint(id))
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.FailWithCode(c, 404, "Character not found", nil)
			return
		}
		response.Fail(c, "Failed to get character", nil)
		return
	}
	response.Success(c, "Character retrieved successfully", characterToResponse(row))
}

func (ch *CinyuHandlers) UpdateCharacter(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.Fail(c, "Invalid character ID", nil)
		return
	}
	var req UpdateCharacterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, err.Error(), nil)
		return
	}
	row, err := models.GetCharacterByID(ch.db, uint(id))
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.FailWithCode(c, 404, "Character not found", nil)
			return
		}
		response.Fail(c, "Failed to get character", nil)
		return
	}
	if req.NovelID > 0 {
		row.NovelID = req.NovelID
	}
	if req.Name != "" {
		row.Name = req.Name
	}
	if req.RoleType != "" {
		row.RoleType = req.RoleType
	}
	if req.Gender != "" {
		row.Gender = req.Gender
	}
	if req.Age != "" {
		row.Age = req.Age
	}
	if req.Personality != "" {
		row.Personality = req.Personality
	}
	if req.Background != "" {
		row.Background = req.Background
	}
	if req.Goal != "" {
		row.Goal = req.Goal
	}
	if req.Relationship != "" {
		row.Relationship = req.Relationship
	}
	if req.Appearance != "" {
		row.Appearance = req.Appearance
	}
	if req.Abilities != "" {
		row.Abilities = req.Abilities
	}
	if req.Notes != "" {
		row.Notes = req.Notes
	}
	row.SetUpdateInfo("system")
	if err := models.UpdateCharacter(ch.db, row); err != nil {
		response.Fail(c, "Failed to update character", nil)
		return
	}
	response.Success(c, "Character updated successfully", characterToResponse(row))
}

func (ch *CinyuHandlers) DeleteCharacter(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.Fail(c, "Invalid character ID", nil)
		return
	}
	if err := models.DeleteCharacter(ch.db, uint(id), "system"); err != nil {
		response.Fail(c, "Failed to delete character", nil)
		return
	}
	response.Success(c, "Character deleted successfully", nil)
}

func (ch *CinyuHandlers) RestoreCharacter(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.Fail(c, "Invalid character ID", nil)
		return
	}
	if err := models.RestoreCharacter(ch.db, uint(id), "system"); err != nil {
		response.Fail(c, "Failed to restore character", nil)
		return
	}
	response.Success(c, "Character restored successfully", nil)
}

func (ch *CinyuHandlers) GetAllCharacters(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "10"))
	if page < 1 {
		page = 1
	}
	if size < 1 || size > 100 {
		size = 10
	}
	var novelID uint
	if nid := strings.TrimSpace(c.Query("novelId")); nid != "" {
		n, err := strconv.ParseUint(nid, 10, 32)
		if err == nil {
			novelID = uint(n)
		}
	}
	keyword := strings.TrimSpace(c.Query("keyword"))
	rows, total, err := models.GetAllCharacters(ch.db, novelID, keyword, page, size)
	if err != nil {
		response.Fail(c, "Failed to list characters", nil)
		return
	}
	out := make([]*CharacterResponse, len(rows))
	for i, row := range rows {
		out[i] = characterToResponse(row)
	}
	response.Success(c, "Characters retrieved successfully", PaginatedCharacterResponse{
		Characters: out,
		Total:      total,
		Page:       page,
		Size:       size,
	})
}

func (ch *CinyuHandlers) GenerateCharacterByAI(c *gin.Context) {
	if strings.TrimSpace(config.GlobalConfig.Services.LLM.APIKey) == "" {
		response.FailWithCode(c, 503, "LLM is not configured (LLM_API_KEY)", nil)
		return
	}
	var req GenerateCharacterByAIRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, err.Error(), nil)
		return
	}
	prompt := buildGenerateCharacterPrompt(req)
	llmOpts := &llm.LLMOptions{
		Provider:     pickChatProvider(""),
		ApiKey:       strings.TrimSpace(config.GlobalConfig.Services.LLM.APIKey),
		BaseURL:      strings.TrimSpace(config.GlobalConfig.Services.LLM.BaseURL),
		SystemPrompt: buildGenerateCharacterSystemPrompt(),
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
		Model:            pickChatModel(req.Model),
		MaxTokens:        req.MaxTokens,
		EnableJSONOutput: true,
		OutputFormat:     "json_object",
	}
	if qopts.Model == "" {
		qopts.Model = "gpt-4o-mini"
	}
	if qopts.MaxTokens <= 0 {
		qopts.MaxTokens = 1200
	}
	if req.Temperature != nil {
		qopts.Temperature = *req.Temperature
	}
	qresp, err := handler.QueryWithOptions(prompt, qopts)
	if err != nil {
		if logger.Lg != nil {
			logger.Lg.Error("generate character with ai failed", zap.Error(err))
		}
		response.Fail(c, "LLM request failed: "+err.Error(), nil)
		return
	}
	if qresp == nil || len(qresp.Choices) == 0 {
		response.Fail(c, "empty completion choices", nil)
		return
	}
	raw := strings.TrimSpace(qresp.Choices[0].Content)
	draft, err := parseCharacterDraft(raw)
	if err != nil {
		response.FailWithCode(c, 422, "AI输出不是合法角色JSON: "+err.Error(), gin.H{"raw": raw})
		return
	}
	if strings.TrimSpace(draft.Name) == "" {
		response.FailWithCode(c, 422, "AI输出缺少必填字段: name", gin.H{"raw": raw})
		return
	}
	applyLockedCharacterFields(&draft, req.BaseDraft, req.LockedFields)
	response.Success(c, "OK", GenerateCharacterByAIResponse{Draft: draft, Raw: raw})
}

func parseCharacterDraft(raw string) (CharacterResponse, error) {
	var draft CharacterResponse
	raw = strings.TrimSpace(raw)
	if raw == "" {
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
	// 兜底：兼容 number/bool 类型字段
	var m map[string]any
	if err := json.Unmarshal([]byte(candidate), &m); err != nil {
		return draft, err
	}
	draft = CharacterResponse{
		ID:           anyToUint(m["id"]),
		NovelID:      anyToUint(m["novelId"]),
		Name:         anyToString(m["name"]),
		RoleType:     anyToString(m["roleType"]),
		Gender:       anyToString(m["gender"]),
		Age:          anyToString(m["age"]),
		Personality:  anyToString(m["personality"]),
		Background:   anyToString(m["background"]),
		Goal:         anyToString(m["goal"]),
		Relationship: anyToString(m["relationship"]),
		Appearance:   anyToString(m["appearance"]),
		Abilities:    anyToString(m["abilities"]),
		Notes:        anyToString(m["notes"]),
	}
	return draft, nil
}

func buildGenerateCharacterPrompt(req GenerateCharacterByAIRequest) string {
	var b strings.Builder
	b.WriteString("用户需求：\n")
	b.WriteString(strings.TrimSpace(req.Message))
	if strings.TrimSpace(req.Feedback) != "" {
		b.WriteString("\n修改意见：\n")
		b.WriteString(strings.TrimSpace(req.Feedback))
	}
	if req.BaseDraft != nil {
		if raw, err := json.Marshal(req.BaseDraft); err == nil {
			b.WriteString("\n当前角色草稿：\n")
			b.Write(raw)
		}
	}
	if len(req.LockedFields) > 0 {
		b.WriteString("\n锁定字段：")
		b.WriteString(strings.Join(req.LockedFields, ","))
	}
	return b.String()
}

func buildGenerateCharacterSystemPrompt() string {
	return strings.TrimSpace(`
你是小说角色设定助手。只能输出一个合法 JSON 对象，不要输出解释和 markdown。
必须严格只包含这些键（全部 string 或 number）：
id,novelId,name,roleType,gender,age,personality,background,goal,relationship,appearance,abilities,notes
规则：
1) name 必填。
2) 若传入锁定字段，这些字段值必须保持不变。
3) 不确定字段可输出空字符串，id/novelId 可输出 0。
`)
}

func applyLockedCharacterFields(draft *CharacterResponse, base *CharacterResponse, locked []string) {
	if draft == nil || base == nil || len(locked) == 0 {
		return
	}
	for _, f := range locked {
		switch strings.TrimSpace(f) {
		case "id":
			draft.ID = base.ID
		case "novelId":
			draft.NovelID = base.NovelID
		case "name":
			draft.Name = base.Name
		case "roleType":
			draft.RoleType = base.RoleType
		case "gender":
			draft.Gender = base.Gender
		case "age":
			draft.Age = base.Age
		case "personality":
			draft.Personality = base.Personality
		case "background":
			draft.Background = base.Background
		case "goal":
			draft.Goal = base.Goal
		case "relationship":
			draft.Relationship = base.Relationship
		case "appearance":
			draft.Appearance = base.Appearance
		case "abilities":
			draft.Abilities = base.Abilities
		case "notes":
			draft.Notes = base.Notes
		}
	}
}

func characterToResponse(row *models.Character) *CharacterResponse {
	return &CharacterResponse{
		ID:           row.ID,
		NovelID:      row.NovelID,
		Name:         row.Name,
		RoleType:     row.RoleType,
		Gender:       row.Gender,
		Age:          row.Age,
		Personality:  row.Personality,
		Background:   row.Background,
		Goal:         row.Goal,
		Relationship: row.Relationship,
		Appearance:   row.Appearance,
		Abilities:    row.Abilities,
		Notes:        row.Notes,
		CreatedAt:    row.GetCreatedAtString(),
		UpdatedAt:    row.GetUpdatedAtString(),
	}
}

func anyToString(v any) string {
	switch x := v.(type) {
	case nil:
		return ""
	case string:
		return x
	case float64:
		if x == float64(int64(x)) {
			return strconv.FormatInt(int64(x), 10)
		}
		return strconv.FormatFloat(x, 'f', -1, 64)
	case float32:
		f := float64(x)
		if f == float64(int64(f)) {
			return strconv.FormatInt(int64(f), 10)
		}
		return strconv.FormatFloat(f, 'f', -1, 64)
	case int:
		return strconv.Itoa(x)
	case int8:
		return strconv.FormatInt(int64(x), 10)
	case int16:
		return strconv.FormatInt(int64(x), 10)
	case int32:
		return strconv.FormatInt(int64(x), 10)
	case int64:
		return strconv.FormatInt(x, 10)
	case uint:
		return strconv.FormatUint(uint64(x), 10)
	case uint8:
		return strconv.FormatUint(uint64(x), 10)
	case uint16:
		return strconv.FormatUint(uint64(x), 10)
	case uint32:
		return strconv.FormatUint(uint64(x), 10)
	case uint64:
		return strconv.FormatUint(x, 10)
	case bool:
		if x {
			return "true"
		}
		return "false"
	default:
		return fmt.Sprint(v)
	}
}

func anyToUint(v any) uint {
	switch x := v.(type) {
	case nil:
		return 0
	case float64:
		if x < 0 {
			return 0
		}
		return uint(x)
	case int:
		if x < 0 {
			return 0
		}
		return uint(x)
	case int64:
		if x < 0 {
			return 0
		}
		return uint(x)
	case uint:
		return x
	case uint64:
		return uint(x)
	case string:
		n, err := strconv.ParseUint(strings.TrimSpace(x), 10, 64)
		if err != nil {
			return 0
		}
		return uint(n)
	default:
		return 0
	}
}
