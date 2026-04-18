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

type CreateChapterRequest struct {
	NovelID         uint   `json:"novelId" binding:"required"`
	VolumeID        uint   `json:"volumeId"`
	Title           string `json:"title" binding:"required"`
	Content         string `json:"content"`
	OrderNo         int    `json:"orderNo"`
	WordCount       int    `json:"wordCount"`
	Summary         string `json:"summary"`
	CharacterIDs    string `json:"characterIds"`
	PlotPointIDs    string `json:"plotPointIds"`
	PreviousChapterID uint   `json:"previousChapterId"`
	Outline           string `json:"outline"`
	RelatedNodeIDs    string `json:"relatedNodeIds"`
	PromptMemo        string `json:"promptMemo"`
	Status            string `json:"status"`
}

type UpdateChapterRequest struct {
	NovelID         uint   `json:"novelId"`
	VolumeID        uint   `json:"volumeId"`
	Title           string `json:"title"`
	Content         string `json:"content"`
	OrderNo         int    `json:"orderNo"`
	WordCount       int    `json:"wordCount"`
	Summary         string `json:"summary"`
	CharacterIDs    string `json:"characterIds"`
	PlotPointIDs    string `json:"plotPointIds"`
	PreviousChapterID uint   `json:"previousChapterId"`
	Outline           string `json:"outline"`
	RelatedNodeIDs    string `json:"relatedNodeIds"`
	PromptMemo        string `json:"promptMemo"`
	Status            string `json:"status"`
}

type ChapterResponse struct {
	ID              uint   `json:"id"`
	NovelID         uint   `json:"novelId"`
	VolumeID        uint   `json:"volumeId"`
	Title           string `json:"title"`
	Content         string `json:"content"`
	OrderNo         int    `json:"orderNo"`
	WordCount       int    `json:"wordCount"`
	Summary         string `json:"summary"`
	CharacterIDs    string `json:"characterIds"`
	PlotPointIDs    string `json:"plotPointIds"`
	PreviousChapterID uint   `json:"previousChapterId"`
	Outline           string `json:"outline"`
	RelatedNodeIDs    string `json:"relatedNodeIds"`
	PromptMemo        string `json:"promptMemo"`
	Status            string `json:"status"`
	CreatedAt         string `json:"createdAt"`
	UpdatedAt       string `json:"updatedAt"`
}

type PaginatedChapterResponse struct {
	Chapters []*ChapterResponse `json:"chapters"`
	Total    int64              `json:"total"`
	Page     int                `json:"page"`
	Size     int                `json:"size"`
}

type GenerateChapterByAIRequest struct {
	Message      string           `json:"message" binding:"required"`
	Model        string           `json:"model"`
	Temperature  *float32         `json:"temperature"`
	MaxTokens    int              `json:"maxTokens"`
	BaseDraft    *ChapterResponse `json:"baseDraft"`
	LockedFields []string         `json:"lockedFields"`
	Feedback     string           `json:"feedback"`
}

type GenerateChapterByAIResponse struct {
	Draft ChapterResponse `json:"draft"`
	Raw   string          `json:"raw"`
}

func (ch *CinyuHandlers) registerChapterRoutes(r *gin.RouterGroup) {
	g := r.Group("/chapters")
	{
		g.POST("", ch.CreateChapter)
		g.GET("", ch.GetAllChapters)
		g.GET("/:id", ch.GetChapter)
		g.PUT("/:id", ch.UpdateChapter)
		g.DELETE("/:id", ch.DeleteChapter)
		g.POST("/generate-content", ch.GenerateChapterContentByAI)
	}
}

func (ch *CinyuHandlers) CreateChapter(c *gin.Context) {
	var req CreateChapterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, err.Error(), nil)
		return
	}
	row := &models.Chapter{
		NovelID:         req.NovelID,
		VolumeID:        req.VolumeID,
		Title:           req.Title,
		Content:         req.Content,
		OrderNo:         req.OrderNo,
		WordCount:       req.WordCount,
		Summary:         req.Summary,
		CharacterIDs:    req.CharacterIDs,
		PlotPointIDs:    req.PlotPointIDs,
		PreviousChapterID: req.PreviousChapterID,
		Outline:           req.Outline,
		RelatedNodeIDs:  req.RelatedNodeIDs,
		PromptMemo:      req.PromptMemo,
		Status:          req.Status,
	}
	if row.OrderNo <= 0 {
		row.OrderNo = 1
	}
	if row.WordCount <= 0 && strings.TrimSpace(row.Content) != "" {
		row.WordCount = len([]rune(row.Content))
	}
	if strings.TrimSpace(row.Status) == "" {
		row.Status = "draft"
	}
	row.SetCreateInfo("system")
	if err := models.CreateChapter(ch.db, row); err != nil {
		response.Fail(c, "Failed to create chapter", nil)
		return
	}
	response.Success(c, "Chapter created successfully", chapterToResponse(row))
}

func (ch *CinyuHandlers) GetChapter(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.Fail(c, "Invalid chapter ID", nil)
		return
	}
	row, err := models.GetChapterByID(ch.db, uint(id))
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.FailWithCode(c, 404, "Chapter not found", nil)
			return
		}
		response.Fail(c, "Failed to get chapter", nil)
		return
	}
	response.Success(c, "Chapter retrieved successfully", chapterToResponse(row))
}

func (ch *CinyuHandlers) UpdateChapter(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.Fail(c, "Invalid chapter ID", nil)
		return
	}
	var req UpdateChapterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, err.Error(), nil)
		return
	}
	row, err := models.GetChapterByID(ch.db, uint(id))
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.FailWithCode(c, 404, "Chapter not found", nil)
			return
		}
		response.Fail(c, "Failed to get chapter", nil)
		return
	}
	if req.NovelID > 0 {
		row.NovelID = req.NovelID
	}
	if req.VolumeID > 0 {
		row.VolumeID = req.VolumeID
	}
	if req.Title != "" {
		row.Title = req.Title
	}
	if req.Content != "" {
		row.Content = req.Content
	}
	if req.OrderNo > 0 {
		row.OrderNo = req.OrderNo
	}
	if req.WordCount > 0 {
		row.WordCount = req.WordCount
	}
	if req.Summary != "" {
		row.Summary = req.Summary
	}
	if req.CharacterIDs != "" {
		row.CharacterIDs = req.CharacterIDs
	}
	if req.PlotPointIDs != "" {
		row.PlotPointIDs = req.PlotPointIDs
	}
	if req.PreviousChapterID > 0 {
		row.PreviousChapterID = req.PreviousChapterID
	}
	if req.Outline != "" {
		row.Outline = req.Outline
	}
	if req.RelatedNodeIDs != "" {
		row.RelatedNodeIDs = req.RelatedNodeIDs
	}
	if req.PromptMemo != "" {
		row.PromptMemo = req.PromptMemo
	}
	if req.Status != "" {
		row.Status = req.Status
	}
	if row.WordCount <= 0 && strings.TrimSpace(row.Content) != "" {
		row.WordCount = len([]rune(row.Content))
	}
	row.SetUpdateInfo("system")
	if err := models.UpdateChapter(ch.db, row); err != nil {
		response.Fail(c, "Failed to update chapter", nil)
		return
	}
	response.Success(c, "Chapter updated successfully", chapterToResponse(row))
}

func (ch *CinyuHandlers) DeleteChapter(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.Fail(c, "Invalid chapter ID", nil)
		return
	}
	if err := models.DeleteChapter(ch.db, uint(id), "system"); err != nil {
		response.Fail(c, "Failed to delete chapter", nil)
		return
	}
	response.Success(c, "Chapter deleted successfully", nil)
}

func (ch *CinyuHandlers) RestoreChapter(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.Fail(c, "Invalid chapter ID", nil)
		return
	}
	if err := models.RestoreChapter(ch.db, uint(id), "system"); err != nil {
		response.Fail(c, "Failed to restore chapter", nil)
		return
	}
	response.Success(c, "Chapter restored successfully", nil)
}

func (ch *CinyuHandlers) GetAllChapters(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "10"))
	if page < 1 {
		page = 1
	}
	if size < 1 || size > 100 {
		size = 10
	}
	var novelID uint
	if v := strings.TrimSpace(c.Query("novelId")); v != "" {
		n, err := strconv.ParseUint(v, 10, 32)
		if err == nil {
			novelID = uint(n)
		}
	}
	var volumeID uint
	if v := strings.TrimSpace(c.Query("volumeId")); v != "" {
		n, err := strconv.ParseUint(v, 10, 32)
		if err == nil {
			volumeID = uint(n)
		}
	}
	rows, total, err := models.GetAllChapters(ch.db, novelID, volumeID, page, size)
	if err != nil {
		response.Fail(c, "Failed to list chapters", nil)
		return
	}
	out := make([]*ChapterResponse, len(rows))
	for i, row := range rows {
		out[i] = chapterToResponse(row)
	}
	response.Success(c, "Chapters retrieved successfully", PaginatedChapterResponse{
		Chapters: out,
		Total:    total,
		Page:     page,
		Size:     size,
	})
}

func (ch *CinyuHandlers) GenerateChapterContentByAI(c *gin.Context) {
	if strings.TrimSpace(config.GlobalConfig.Services.LLM.APIKey) == "" {
		response.FailWithCode(c, 503, "LLM is not configured (LLM_API_KEY)", nil)
		return
	}
	var req GenerateChapterByAIRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, err.Error(), nil)
		return
	}
	if strings.TrimSpace(req.Message) == "" {
		response.Fail(c, "message is required", nil)
		return
	}
	prompt := buildGenerateChapterPrompt(req)
	prompt = ch.enrichChapterPromptWithPreviousChapter(prompt, req.BaseDraft)
	llmOpts := &llm.LLMOptions{
		Provider:     pickChatProvider(""),
		ApiKey:       strings.TrimSpace(config.GlobalConfig.Services.LLM.APIKey),
		BaseURL:      strings.TrimSpace(config.GlobalConfig.Services.LLM.BaseURL),
		SystemPrompt: buildGenerateChapterSystemPrompt(),
		Logger:       logger.Lg,
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 180*time.Second)
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
		qopts.MaxTokens = 2600
	}
	if req.Temperature != nil {
		qopts.Temperature = *req.Temperature
	} else {
		qopts.Temperature = 0.7
	}
	qresp, err := handler.QueryWithOptions(prompt, qopts)
	if err != nil {
		if logger.Lg != nil {
			logger.Lg.Error("generate chapter content with ai failed", zap.Error(err))
		}
		response.Fail(c, "LLM request failed: "+err.Error(), nil)
		return
	}
	if qresp == nil || len(qresp.Choices) == 0 {
		response.Fail(c, "empty completion choices", nil)
		return
	}
	raw := strings.TrimSpace(qresp.Choices[0].Content)
	draft, err := parseChapterDraft(raw)
	if err != nil {
		response.FailWithCode(c, 422, "AI输出不是合法章节JSON: "+err.Error(), gin.H{"raw": raw})
		return
	}
	if strings.TrimSpace(draft.Title) == "" {
		response.FailWithCode(c, 422, "AI输出缺少必填字段: title", gin.H{"raw": raw})
		return
	}
	if strings.TrimSpace(draft.Content) == "" {
		response.FailWithCode(c, 422, "AI输出缺少必填字段: content", gin.H{"raw": raw})
		return
	}
	applyLockedChapterFields(&draft, req.BaseDraft, req.LockedFields)
	if draft.WordCount <= 0 {
		draft.WordCount = len([]rune(draft.Content))
	}
	response.Success(c, "OK", GenerateChapterByAIResponse{
		Draft: draft,
		Raw:   raw,
	})
}

func buildGenerateChapterPrompt(req GenerateChapterByAIRequest) string {
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
			b.WriteString("\n当前章节草稿：\n")
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

// enrichChapterPromptWithPreviousChapter 查找 previousChapterId 对应的章节，将其摘要注入 prompt。
func (ch *CinyuHandlers) enrichChapterPromptWithPreviousChapter(prompt string, baseDraft *ChapterResponse) string {
	if baseDraft == nil || baseDraft.PreviousChapterID == 0 {
		return prompt
	}
	prev, err := models.GetChapterByID(ch.db, baseDraft.PreviousChapterID)
	if err != nil || prev == nil {
		return prompt
	}
	var b strings.Builder
	b.WriteString(prompt)
	b.WriteString("\n前序章节信息（ID=")
	b.WriteString(strconv.FormatUint(uint64(prev.ID), 10))
	b.WriteString("，标题=")
	b.WriteString(prev.Title)
	b.WriteString("）：\n")
	if strings.TrimSpace(prev.Summary) != "" {
		b.WriteString("摘要：")
		b.WriteString(prev.Summary)
		b.WriteString("\n")
	}
	if strings.TrimSpace(prev.Content) != "" {
		runes := []rune(prev.Content)
		tail := runes
		if len(runes) > 800 {
			tail = runes[len(runes)-800:]
			b.WriteString("正文末尾片段：")
		} else {
			b.WriteString("正文：")
		}
		b.WriteString(string(tail))
		b.WriteString("\n")
	}
	return b.String()
}

func buildGenerateChapterSystemPrompt() string {
	return strings.TrimSpace(`
你是小说章节写作助手。只输出一个 JSON 对象，不要 markdown 或解释。
输出字段严格如下：
id,novelId,volumeId,title,content,orderNo,wordCount,summary,characterIds,plotPointIds,previousChapterId,outline,relatedNodeIds,promptMemo,status
规则：
1) title 与 content 必填。
2) content 必须是可直接发布的正文，不要“以下是正文”这类说明。
3) orderNo >= 1；wordCount >= 0。
4) 若有锁定字段，必须保持输入草稿对应字段不变。
5) 输出必须可被 JSON.parse 直接解析。
`)
}

func parseChapterDraft(raw string) (ChapterResponse, error) {
	var draft ChapterResponse
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
		draft.WordCount = clampInt(draft.WordCount, 0, 100000000)
		return draft, nil
	}
	var m map[string]any
	if err := json.Unmarshal([]byte(candidate), &m); err != nil {
		return draft, err
	}
	draft = ChapterResponse{
		ID:              anyToUint(m["id"]),
		NovelID:         anyToUint(m["novelId"]),
		VolumeID:        anyToUint(m["volumeId"]),
		Title:           anyToString(m["title"]),
		Content:         anyToString(m["content"]),
		OrderNo:         int(anyToInt64(m["orderNo"])),
		WordCount:       int(anyToInt64(m["wordCount"])),
		Summary:         anyToString(m["summary"]),
		CharacterIDs:    anyToString(m["characterIds"]),
		PlotPointIDs:    anyToString(m["plotPointIds"]),
		PreviousChapterID: anyToUint(m["previousChapterId"]),
		Outline:         anyToString(m["outline"]),
		RelatedNodeIDs:  anyToString(m["relatedNodeIds"]),
		PromptMemo:      anyToString(m["promptMemo"]),
		Status:          anyToString(m["status"]),
	}
	draft.OrderNo = clampInt(draft.OrderNo, 1, 1000000)
	draft.WordCount = clampInt(draft.WordCount, 0, 100000000)
	return draft, nil
}

func applyLockedChapterFields(draft *ChapterResponse, base *ChapterResponse, locked []string) {
	if draft == nil || base == nil || len(locked) == 0 {
		return
	}
	for _, f := range locked {
		switch strings.TrimSpace(f) {
		case "id":
			draft.ID = base.ID
		case "novelId":
			draft.NovelID = base.NovelID
		case "volumeId":
			draft.VolumeID = base.VolumeID
		case "title":
			draft.Title = base.Title
		case "content":
			draft.Content = base.Content
		case "orderNo":
			draft.OrderNo = base.OrderNo
		case "wordCount":
			draft.WordCount = base.WordCount
		case "summary":
			draft.Summary = base.Summary
		case "characterIds":
			draft.CharacterIDs = base.CharacterIDs
		case "plotPointIds":
			draft.PlotPointIDs = base.PlotPointIDs
		case "previousChapterId":
			draft.PreviousChapterID = base.PreviousChapterID
		case "outline":
			draft.Outline = base.Outline
		case "relatedNodeIds":
			draft.RelatedNodeIDs = base.RelatedNodeIDs
		case "promptMemo":
			draft.PromptMemo = base.PromptMemo
		case "status":
			draft.Status = base.Status
		}
	}
}

func chapterToResponse(row *models.Chapter) *ChapterResponse {
	return &ChapterResponse{
		ID:              row.ID,
		NovelID:         row.NovelID,
		VolumeID:        row.VolumeID,
		Title:           row.Title,
		Content:         row.Content,
		OrderNo:         row.OrderNo,
		WordCount:       row.WordCount,
		Summary:         row.Summary,
		CharacterIDs:    row.CharacterIDs,
		PlotPointIDs:    row.PlotPointIDs,
		PreviousChapterID: row.PreviousChapterID,
		Outline:           row.Outline,
		RelatedNodeIDs:  row.RelatedNodeIDs,
		PromptMemo:      row.PromptMemo,
		Status:          row.Status,
		CreatedAt:       row.GetCreatedAtString(),
		UpdatedAt:       row.GetUpdatedAtString(),
	}
}
