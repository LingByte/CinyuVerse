package handlers

import (
	"context"
	"encoding/json"
	"errors"
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

type CreateVolumeRequest struct {
	NovelID         uint   `json:"novelId" binding:"required"`
	Title           string `json:"title" binding:"required"`
	Subtitle        string `json:"subtitle"`
	Description     string `json:"description"`
	Theme           string `json:"theme"`
	CoreConflict    string `json:"coreConflict"`
	Goal            string `json:"goal"`
	EndingHook      string `json:"endingHook"`
	Status          string `json:"status"`
	OrderNo         int    `json:"orderNo"`
	TargetChapters  int    `json:"targetChapters"`
	TargetWords     int    `json:"targetWords"`
	ChapterStart    int    `json:"chapterStart"`
	ChapterEnd      int    `json:"chapterEnd"`
	RelatedNodeIDs  string `json:"relatedNodeIds"`
	RelatedCharIDs  string `json:"relatedCharacterIds"`
	WritingStrategy string `json:"writingStrategy"`
	Tags            string `json:"tags"`
}

type UpdateVolumeRequest struct {
	NovelID         uint   `json:"novelId"`
	Title           string `json:"title"`
	Subtitle        string `json:"subtitle"`
	Description     string `json:"description"`
	Theme           string `json:"theme"`
	CoreConflict    string `json:"coreConflict"`
	Goal            string `json:"goal"`
	EndingHook      string `json:"endingHook"`
	Status          string `json:"status"`
	OrderNo         int    `json:"orderNo"`
	TargetChapters  int    `json:"targetChapters"`
	TargetWords     int    `json:"targetWords"`
	ChapterStart    int    `json:"chapterStart"`
	ChapterEnd      int    `json:"chapterEnd"`
	RelatedNodeIDs  string `json:"relatedNodeIds"`
	RelatedCharIDs  string `json:"relatedCharacterIds"`
	WritingStrategy string `json:"writingStrategy"`
	Tags            string `json:"tags"`
}

type VolumeResponse struct {
	ID              uint   `json:"id"`
	NovelID         uint   `json:"novelId"`
	Title           string `json:"title"`
	Subtitle        string `json:"subtitle"`
	Description     string `json:"description"`
	Theme           string `json:"theme"`
	CoreConflict    string `json:"coreConflict"`
	Goal            string `json:"goal"`
	EndingHook      string `json:"endingHook"`
	Status          string `json:"status"`
	OrderNo         int    `json:"orderNo"`
	TargetChapters  int    `json:"targetChapters"`
	TargetWords     int    `json:"targetWords"`
	ChapterStart    int    `json:"chapterStart"`
	ChapterEnd      int    `json:"chapterEnd"`
	RelatedNodeIDs  string `json:"relatedNodeIds"`
	RelatedCharIDs  string `json:"relatedCharacterIds"`
	WritingStrategy string `json:"writingStrategy"`
	Tags            string `json:"tags"`
	CreatedAt       string `json:"createdAt"`
	UpdatedAt       string `json:"updatedAt"`
}

type PaginatedVolumeResponse struct {
	Volumes []*VolumeResponse `json:"volumes"`
	Total   int64             `json:"total"`
	Page    int               `json:"page"`
	Size    int               `json:"size"`
}

type GenerateVolumeByAIRequest struct {
	Message      string          `json:"message" binding:"required"`
	Model        string          `json:"model"`
	Temperature  *float32        `json:"temperature"`
	MaxTokens    int             `json:"maxTokens"`
	BaseDraft    *VolumeResponse `json:"baseDraft"`
	LockedFields []string        `json:"lockedFields"`
	Feedback     string          `json:"feedback"`
}

type GenerateVolumeByAIResponse struct {
	Draft VolumeResponse `json:"draft"`
	Raw   string         `json:"raw"`
}

func (ch *CinyuHandlers) registerVolumeRoutes(r *gin.RouterGroup) {
	g := r.Group("/volumes")
	{
		g.POST("", ch.CreateVolume)
		g.GET("", ch.GetAllVolumes)
		g.GET("/:id", ch.GetVolume)
		g.PUT("/:id", ch.UpdateVolume)
		g.DELETE("/:id", ch.DeleteVolume)
		g.POST("/generate", ch.GenerateVolumeByAI)
	}
}

func (ch *CinyuHandlers) CreateVolume(c *gin.Context) {
	var req CreateVolumeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, err.Error(), nil)
		return
	}
	row := &models.Volume{
		NovelID:         req.NovelID,
		Title:           req.Title,
		Subtitle:        req.Subtitle,
		Description:     req.Description,
		Theme:           req.Theme,
		CoreConflict:    req.CoreConflict,
		Goal:            req.Goal,
		EndingHook:      req.EndingHook,
		Status:          req.Status,
		OrderNo:         req.OrderNo,
		TargetChapters:  req.TargetChapters,
		TargetWords:     req.TargetWords,
		ChapterStart:    req.ChapterStart,
		ChapterEnd:      req.ChapterEnd,
		RelatedNodeIDs:  req.RelatedNodeIDs,
		RelatedCharIDs:  req.RelatedCharIDs,
		WritingStrategy: req.WritingStrategy,
		Tags:            req.Tags,
	}
	if row.OrderNo <= 0 {
		row.OrderNo = 1
	}
	if strings.TrimSpace(row.Status) == "" {
		row.Status = "draft"
	}
	row.SetCreateInfo("system")
	if err := models.CreateVolume(ch.db, row); err != nil {
		response.Fail(c, "Failed to create volume", nil)
		return
	}
	response.Success(c, "Volume created successfully", volumeToResponse(row))
}

func (ch *CinyuHandlers) GetVolume(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.Fail(c, "Invalid volume ID", nil)
		return
	}
	row, err := models.GetVolumeByID(ch.db, uint(id))
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.FailWithCode(c, 404, "Volume not found", nil)
			return
		}
		response.Fail(c, "Failed to get volume", nil)
		return
	}
	response.Success(c, "Volume retrieved successfully", volumeToResponse(row))
}

func (ch *CinyuHandlers) UpdateVolume(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.Fail(c, "Invalid volume ID", nil)
		return
	}
	var req UpdateVolumeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, err.Error(), nil)
		return
	}
	row, err := models.GetVolumeByID(ch.db, uint(id))
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.FailWithCode(c, 404, "Volume not found", nil)
			return
		}
		response.Fail(c, "Failed to get volume", nil)
		return
	}
	if req.NovelID > 0 {
		row.NovelID = req.NovelID
	}
	if req.Title != "" {
		row.Title = req.Title
	}
	if req.Subtitle != "" {
		row.Subtitle = req.Subtitle
	}
	if req.Description != "" {
		row.Description = req.Description
	}
	if req.Theme != "" {
		row.Theme = req.Theme
	}
	if req.CoreConflict != "" {
		row.CoreConflict = req.CoreConflict
	}
	if req.Goal != "" {
		row.Goal = req.Goal
	}
	if req.EndingHook != "" {
		row.EndingHook = req.EndingHook
	}
	if req.Status != "" {
		row.Status = req.Status
	}
	if req.OrderNo > 0 {
		row.OrderNo = req.OrderNo
	}
	if req.TargetChapters > 0 {
		row.TargetChapters = req.TargetChapters
	}
	if req.TargetWords > 0 {
		row.TargetWords = req.TargetWords
	}
	if req.ChapterStart > 0 {
		row.ChapterStart = req.ChapterStart
	}
	if req.ChapterEnd > 0 {
		row.ChapterEnd = req.ChapterEnd
	}
	if req.RelatedNodeIDs != "" {
		row.RelatedNodeIDs = req.RelatedNodeIDs
	}
	if req.RelatedCharIDs != "" {
		row.RelatedCharIDs = req.RelatedCharIDs
	}
	if req.WritingStrategy != "" {
		row.WritingStrategy = req.WritingStrategy
	}
	if req.Tags != "" {
		row.Tags = req.Tags
	}
	row.SetUpdateInfo("system")
	if err := models.UpdateVolume(ch.db, row); err != nil {
		response.Fail(c, "Failed to update volume", nil)
		return
	}
	response.Success(c, "Volume updated successfully", volumeToResponse(row))
}

func (ch *CinyuHandlers) DeleteVolume(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.Fail(c, "Invalid volume ID", nil)
		return
	}
	if err := models.DeleteVolume(ch.db, uint(id), "system"); err != nil {
		response.Fail(c, "Failed to delete volume", nil)
		return
	}
	response.Success(c, "Volume deleted successfully", nil)
}

func (ch *CinyuHandlers) RestoreVolume(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.Fail(c, "Invalid volume ID", nil)
		return
	}
	if err := models.RestoreVolume(ch.db, uint(id), "system"); err != nil {
		response.Fail(c, "Failed to restore volume", nil)
		return
	}
	response.Success(c, "Volume restored successfully", nil)
}

func (ch *CinyuHandlers) GetAllVolumes(c *gin.Context) {
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
	rows, total, err := models.GetAllVolumes(ch.db, novelID, page, size)
	if err != nil {
		response.Fail(c, "Failed to list volumes", nil)
		return
	}
	out := make([]*VolumeResponse, len(rows))
	for i, row := range rows {
		out[i] = volumeToResponse(row)
	}
	response.Success(c, "Volumes retrieved successfully", PaginatedVolumeResponse{
		Volumes: out,
		Total:   total,
		Page:    page,
		Size:    size,
	})
}

func (ch *CinyuHandlers) GenerateVolumeByAI(c *gin.Context) {
	if strings.TrimSpace(config.GlobalConfig.Services.LLM.APIKey) == "" {
		response.FailWithCode(c, 503, "LLM is not configured (LLM_API_KEY)", nil)
		return
	}
	var req GenerateVolumeByAIRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, err.Error(), nil)
		return
	}
	if strings.TrimSpace(req.Message) == "" {
		response.Fail(c, "message is required", nil)
		return
	}
	prompt := buildGenerateVolumePrompt(req)
	llmOpts := &llm.LLMOptions{
		Provider:     pickChatProvider(""),
		ApiKey:       strings.TrimSpace(config.GlobalConfig.Services.LLM.APIKey),
		BaseURL:      strings.TrimSpace(config.GlobalConfig.Services.LLM.BaseURL),
		SystemPrompt: buildGenerateVolumeSystemPrompt(),
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
		qopts.MaxTokens = 1600
	}
	if req.Temperature != nil {
		qopts.Temperature = *req.Temperature
	}
	qresp, err := handler.QueryWithOptions(prompt, qopts)
	if err != nil {
		if logger.Lg != nil {
			logger.Lg.Error("generate volume with ai failed", zap.Error(err))
		}
		response.Fail(c, "LLM request failed: "+err.Error(), nil)
		return
	}
	if qresp == nil || len(qresp.Choices) == 0 {
		response.Fail(c, "empty completion choices", nil)
		return
	}
	raw := strings.TrimSpace(qresp.Choices[0].Content)
	draft, err := parseVolumeDraft(raw)
	if err != nil {
		response.FailWithCode(c, 422, "AI输出不是合法卷JSON: "+err.Error(), gin.H{"raw": raw})
		return
	}
	if strings.TrimSpace(draft.Title) == "" {
		response.FailWithCode(c, 422, "AI输出缺少必填字段: title", gin.H{"raw": raw})
		return
	}
	applyLockedVolumeFields(&draft, req.BaseDraft, req.LockedFields)
	response.Success(c, "OK", GenerateVolumeByAIResponse{
		Draft: draft,
		Raw:   raw,
	})
}

func buildGenerateVolumePrompt(req GenerateVolumeByAIRequest) string {
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
			b.WriteString("\n当前卷草稿：\n")
			b.Write(raw)
			b.WriteString("\n")
		}
	}
	if len(req.LockedFields) > 0 {
		b.WriteString("\n锁定字段：")
		b.WriteString(strings.Join(req.LockedFields, ","))
		b.WriteString("\n")
	}
	return b.String()
}

func buildGenerateVolumeSystemPrompt() string {
	return strings.TrimSpace(`
你是小说分卷策划助手。只能输出一个合法 JSON 对象，不要输出解释和 markdown。
输出字段严格如下：
id,novelId,title,subtitle,description,theme,coreConflict,goal,endingHook,status,orderNo,targetChapters,targetWords,chapterStart,chapterEnd,relatedNodeIds,relatedCharacterIds,writingStrategy,tags
规则：
1) title 必填。
2) orderNo 必须 >= 1，targetChapters/targetWords/chapterStart/chapterEnd 必须 >= 0。
3) relatedNodeIds 和 relatedCharacterIds 使用逗号分隔。
4) 若有锁定字段，必须保持与输入草稿完全一致。
5) 输出必须能被 JSON.parse 直接解析。
`)
}

func parseVolumeDraft(raw string) (VolumeResponse, error) {
	var draft VolumeResponse
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
		draft.OrderNo = clampInt(draft.OrderNo, 1, 1000000)
		draft.TargetChapters = clampInt(draft.TargetChapters, 0, 1000000)
		draft.TargetWords = clampInt(draft.TargetWords, 0, 100000000)
		draft.ChapterStart = clampInt(draft.ChapterStart, 0, 1000000)
		draft.ChapterEnd = clampInt(draft.ChapterEnd, 0, 1000000)
		return draft, nil
	}
	var m map[string]any
	if err := json.Unmarshal([]byte(candidate), &m); err != nil {
		return draft, err
	}
	draft = VolumeResponse{
		ID:              anyToUint(m["id"]),
		NovelID:         anyToUint(m["novelId"]),
		Title:           anyToString(m["title"]),
		Subtitle:        anyToString(m["subtitle"]),
		Description:     anyToString(m["description"]),
		Theme:           anyToString(m["theme"]),
		CoreConflict:    anyToString(m["coreConflict"]),
		Goal:            anyToString(m["goal"]),
		EndingHook:      anyToString(m["endingHook"]),
		Status:          anyToString(m["status"]),
		OrderNo:         int(anyToInt64(m["orderNo"])),
		TargetChapters:  int(anyToInt64(m["targetChapters"])),
		TargetWords:     int(anyToInt64(m["targetWords"])),
		ChapterStart:    int(anyToInt64(m["chapterStart"])),
		ChapterEnd:      int(anyToInt64(m["chapterEnd"])),
		RelatedNodeIDs:  anyToString(m["relatedNodeIds"]),
		RelatedCharIDs:  anyToString(m["relatedCharacterIds"]),
		WritingStrategy: anyToString(m["writingStrategy"]),
		Tags:            anyToString(m["tags"]),
	}
	draft.OrderNo = clampInt(draft.OrderNo, 1, 1000000)
	draft.TargetChapters = clampInt(draft.TargetChapters, 0, 1000000)
	draft.TargetWords = clampInt(draft.TargetWords, 0, 100000000)
	draft.ChapterStart = clampInt(draft.ChapterStart, 0, 1000000)
	draft.ChapterEnd = clampInt(draft.ChapterEnd, 0, 1000000)
	return draft, nil
}

func applyLockedVolumeFields(draft *VolumeResponse, base *VolumeResponse, locked []string) {
	if draft == nil || base == nil || len(locked) == 0 {
		return
	}
	for _, f := range locked {
		switch strings.TrimSpace(f) {
		case "id":
			draft.ID = base.ID
		case "novelId":
			draft.NovelID = base.NovelID
		case "title":
			draft.Title = base.Title
		case "subtitle":
			draft.Subtitle = base.Subtitle
		case "description":
			draft.Description = base.Description
		case "theme":
			draft.Theme = base.Theme
		case "coreConflict":
			draft.CoreConflict = base.CoreConflict
		case "goal":
			draft.Goal = base.Goal
		case "endingHook":
			draft.EndingHook = base.EndingHook
		case "status":
			draft.Status = base.Status
		case "orderNo":
			draft.OrderNo = base.OrderNo
		case "targetChapters":
			draft.TargetChapters = base.TargetChapters
		case "targetWords":
			draft.TargetWords = base.TargetWords
		case "chapterStart":
			draft.ChapterStart = base.ChapterStart
		case "chapterEnd":
			draft.ChapterEnd = base.ChapterEnd
		case "relatedNodeIds":
			draft.RelatedNodeIDs = base.RelatedNodeIDs
		case "relatedCharacterIds":
			draft.RelatedCharIDs = base.RelatedCharIDs
		case "writingStrategy":
			draft.WritingStrategy = base.WritingStrategy
		case "tags":
			draft.Tags = base.Tags
		}
	}
}

func volumeToResponse(row *models.Volume) *VolumeResponse {
	return &VolumeResponse{
		ID:              row.ID,
		NovelID:         row.NovelID,
		Title:           row.Title,
		Subtitle:        row.Subtitle,
		Description:     row.Description,
		Theme:           row.Theme,
		CoreConflict:    row.CoreConflict,
		Goal:            row.Goal,
		EndingHook:      row.EndingHook,
		Status:          row.Status,
		OrderNo:         row.OrderNo,
		TargetChapters:  row.TargetChapters,
		TargetWords:     row.TargetWords,
		ChapterStart:    row.ChapterStart,
		ChapterEnd:      row.ChapterEnd,
		RelatedNodeIDs:  row.RelatedNodeIDs,
		RelatedCharIDs:  row.RelatedCharIDs,
		WritingStrategy: row.WritingStrategy,
		Tags:            row.Tags,
		CreatedAt:       row.GetCreatedAtString(),
		UpdatedAt:       row.GetUpdatedAtString(),
	}
}
