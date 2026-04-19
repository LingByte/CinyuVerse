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
	PreviousChapterIDs string `json:"previousChapterIds"`
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
	PreviousChapterIDs *string `json:"previousChapterIds"`
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
	PreviousChapterIDs string `json:"previousChapterIds"`
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

type PredictPlotRequest struct {
	NovelID           uint   `json:"novelId" binding:"required"`
	VolumeID          uint   `json:"volumeId"`
	PreviousChapterID uint   `json:"previousChapterId"`
	PreviousChapterIDs string `json:"previousChapterIds"`
	CharacterIDs      string `json:"characterIds"`
	Direction         string `json:"direction"`
	Count             int    `json:"count"`
	Model             string `json:"model"`
}

type PlotPrediction struct {
	Direction string `json:"direction"`
	Summary   string `json:"summary"`
}

type PredictPlotResponse struct {
	Predictions []PlotPrediction `json:"predictions"`
	Raw         string           `json:"raw"`
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

// --- Separate field generation types ---

type GenerateChapterFieldRequest struct {
	NovelID           uint             `json:"novelId" binding:"required"`
	VolumeID          uint             `json:"volumeId"`
	PreviousChapterID uint             `json:"previousChapterId"`
	PreviousChapterIDs string          `json:"previousChapterIds"`
	CharacterIDs      string           `json:"characterIds"`
	Model             string           `json:"model"`
	Feedback          string           `json:"feedback"`
	BaseDraft         *ChapterResponse `json:"baseDraft"`
}

type GenerateChapterFieldResponse struct {
	Value string `json:"value"`
	Raw   string `json:"raw"`
}

func dedupeChapterIDsOrdered(ids []uint) []uint {
	seen := map[uint]struct{}{}
	out := make([]uint, 0, len(ids))
	for _, id := range ids {
		if id == 0 {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	return out
}

func parseChapterIDCSV(s string) []uint {
	var nums []uint
	for _, part := range strings.Split(s, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		n, err := strconv.ParseUint(part, 10, 32)
		if err != nil {
			continue
		}
		nums = append(nums, uint(n))
	}
	return dedupeChapterIDsOrdered(nums)
}

func joinChapterIDCSV(ids []uint) string {
	if len(ids) == 0 {
		return ""
	}
	parts := make([]string, len(ids))
	for i, id := range ids {
		parts[i] = strconv.FormatUint(uint64(id), 10)
	}
	return strings.Join(parts, ",")
}

func firstChapterIDOrZero(ids []uint) uint {
	if len(ids) == 0 {
		return 0
	}
	return ids[0]
}

func mergeRequestPreviousChapterIDs(csv string, single uint) []uint {
	ids := parseChapterIDCSV(csv)
	if len(ids) == 0 && single > 0 {
		ids = []uint{single}
	}
	return dedupeChapterIDsOrdered(ids)
}

func (ch *CinyuHandlers) filterChapterIDsForNovel(novelID uint, ids []uint) []uint {
	if novelID == 0 {
		return nil
	}
	out := make([]uint, 0, len(ids))
	for _, id := range ids {
		c, err := models.GetChapterByID(ch.db, id)
		if err != nil || c == nil || c.NovelID != novelID {
			continue
		}
		out = append(out, id)
	}
	return out
}

func (ch *CinyuHandlers) appendPreviousChaptersToPrompt(b *strings.Builder, novelID uint, ids []uint) {
	ids = ch.filterChapterIDsForNovel(novelID, dedupeChapterIDsOrdered(ids))
	if len(ids) == 0 {
		return
	}
	if len(ids) > 8 {
		ids = ids[:8]
	}
	tailRunes := 800
	if len(ids) >= 2 {
		tailRunes = 450
	}
	if len(ids) >= 4 {
		tailRunes = 300
	}
	if len(ids) > 1 {
		b.WriteString("\n以下多章为连贯前情（按选择顺序由远及近）：\n")
	}
	for _, cid := range ids {
		prev, err := models.GetChapterByID(ch.db, cid)
		if err != nil || prev == nil {
			continue
		}
		b.WriteString("\n前序章节「")
		b.WriteString(prev.Title)
		b.WriteString("」（第")
		b.WriteString(strconv.Itoa(prev.OrderNo))
		b.WriteString("章，ID=")
		b.WriteString(strconv.FormatUint(uint64(prev.ID), 10))
		b.WriteString("）\n")
		if strings.TrimSpace(prev.Summary) != "" {
			b.WriteString("摘要：")
			b.WriteString(prev.Summary)
			b.WriteString("\n")
		}
		if strings.TrimSpace(prev.Content) != "" {
			runes := []rune(prev.Content)
			if len(runes) > tailRunes {
				b.WriteString("正文末尾：")
				b.WriteString(string(runes[len(runes)-tailRunes:]))
			} else {
				b.WriteString("正文：")
				b.WriteString(prev.Content)
			}
			b.WriteString("\n")
		}
	}
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
		g.POST("/generate-summary", ch.GenerateChapterSummary)
		g.POST("/generate-outline", ch.GenerateChapterOutline)
		g.POST("/generate-body", ch.GenerateChapterBody)
		g.POST("/predict-plot", ch.PredictPlot)
	}
}

func (ch *CinyuHandlers) CreateChapter(c *gin.Context) {
	var req CreateChapterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, err.Error(), nil)
		return
	}
	prevIDs := mergeRequestPreviousChapterIDs(req.PreviousChapterIDs, req.PreviousChapterID)
	prevIDs = ch.filterChapterIDsForNovel(req.NovelID, prevIDs)
	row := &models.Chapter{
		NovelID:            req.NovelID,
		VolumeID:           req.VolumeID,
		Title:              req.Title,
		Content:            req.Content,
		OrderNo:            req.OrderNo,
		WordCount:          req.WordCount,
		Summary:            req.Summary,
		CharacterIDs:       req.CharacterIDs,
		PlotPointIDs:       req.PlotPointIDs,
		PreviousChapterID:  firstChapterIDOrZero(prevIDs),
		PreviousChapterIDs: joinChapterIDCSV(prevIDs),
		Outline:            req.Outline,
		RelatedNodeIDs:     req.RelatedNodeIDs,
		PromptMemo:         req.PromptMemo,
		Status:             req.Status,
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
	if req.PreviousChapterIDs != nil {
		ids := parseChapterIDCSV(strings.TrimSpace(*req.PreviousChapterIDs))
		ids = ch.filterChapterIDsForNovel(row.NovelID, ids)
		row.PreviousChapterIDs = joinChapterIDCSV(ids)
		row.PreviousChapterID = firstChapterIDOrZero(ids)
	} else if req.PreviousChapterID > 0 {
		ids := ch.filterChapterIDsForNovel(row.NovelID, []uint{req.PreviousChapterID})
		row.PreviousChapterIDs = joinChapterIDCSV(ids)
		row.PreviousChapterID = firstChapterIDOrZero(ids)
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

// buildChapterFieldContext builds common context for single-field generation.
func (ch *CinyuHandlers) buildChapterFieldContext(req *GenerateChapterFieldRequest) string {
	var b strings.Builder
	// Novel
	novel, _ := models.GetNovelByID(ch.db, req.NovelID)
	if novel != nil {
		b.WriteString("小说标题：")
		b.WriteString(novel.Title)
		b.WriteString("\n")
		if strings.TrimSpace(novel.Theme) != "" {
			b.WriteString("主题：")
			b.WriteString(novel.Theme)
			b.WriteString("\n")
		}
		if strings.TrimSpace(novel.Description) != "" {
			b.WriteString("简介：")
			b.WriteString(novel.Description)
			b.WriteString("\n")
		}
		if strings.TrimSpace(novel.WorldSetting) != "" {
			b.WriteString("世界观：")
			b.WriteString(novel.WorldSetting)
			b.WriteString("\n")
		}
	}
	// Volume
	if req.VolumeID > 0 {
		vol, err := models.GetVolumeByID(ch.db, req.VolumeID)
		if err == nil && vol != nil {
			b.WriteString("\n当前卷：")
			b.WriteString(vol.Title)
			if strings.TrimSpace(vol.Description) != "" {
				b.WriteString(" — ")
				b.WriteString(vol.Description)
			}
			b.WriteString("\n")
		}
	}
	prevIDs := mergeRequestPreviousChapterIDs(req.PreviousChapterIDs, req.PreviousChapterID)
	ch.appendPreviousChaptersToPrompt(&b, req.NovelID, prevIDs)
	// Characters
	if strings.TrimSpace(req.CharacterIDs) != "" {
		b.WriteString("\n关联角色：\n")
		for _, idStr := range strings.Split(req.CharacterIDs, ",") {
			idStr = strings.TrimSpace(idStr)
			if idStr == "" {
				continue
			}
			cid, err := strconv.ParseUint(idStr, 10, 32)
			if err != nil {
				continue
			}
			char, err := models.GetCharacterByID(ch.db, uint(cid))
			if err != nil || char == nil {
				continue
			}
			b.WriteString("- ")
			b.WriteString(char.Name)
			if strings.TrimSpace(char.RoleType) != "" {
				b.WriteString("（")
				b.WriteString(char.RoleType)
				b.WriteString("）")
			}
			if strings.TrimSpace(char.Personality) != "" {
				b.WriteString(" 性格：")
				b.WriteString(char.Personality)
			}
			if strings.TrimSpace(char.Goal) != "" {
				b.WriteString(" 目标：")
				b.WriteString(char.Goal)
			}
			b.WriteString("\n")
		}
	}
	// BaseDraft context
	if req.BaseDraft != nil {
		if strings.TrimSpace(req.BaseDraft.Title) != "" {
			b.WriteString("\n当前章节标题：")
			b.WriteString(req.BaseDraft.Title)
			b.WriteString("\n")
		}
		if strings.TrimSpace(req.BaseDraft.Outline) != "" {
			b.WriteString("当前章节大纲：")
			b.WriteString(req.BaseDraft.Outline)
			b.WriteString("\n")
		}
		if strings.TrimSpace(req.BaseDraft.Summary) != "" {
			b.WriteString("当前章节摘要：")
			b.WriteString(req.BaseDraft.Summary)
			b.WriteString("\n")
		}
		if strings.TrimSpace(req.BaseDraft.Content) != "" {
			runes := []rune(req.BaseDraft.Content)
			if len(runes) > 400 {
				b.WriteString("当前正文末尾：")
				b.WriteString(string(runes[len(runes)-400:]))
			} else {
				b.WriteString("当前正文：")
				b.WriteString(req.BaseDraft.Content)
			}
			b.WriteString("\n")
		}
	}
	// Feedback
	if strings.TrimSpace(req.Feedback) != "" {
		b.WriteString("\n修改意见：")
		b.WriteString(strings.TrimSpace(req.Feedback))
		b.WriteString("\n")
	}
	return b.String()
}

func (ch *CinyuHandlers) GenerateChapterSummary(c *gin.Context) {
	if strings.TrimSpace(config.GlobalConfig.Services.LLM.APIKey) == "" {
		response.FailWithCode(c, 503, "LLM is not configured (LLM_API_KEY)", nil)
		return
	}
	var req GenerateChapterFieldRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, err.Error(), nil)
		return
	}
	if req.BaseDraft == nil || strings.TrimSpace(req.BaseDraft.Content) == "" {
		response.FailWithCode(c, 400, "请先在编辑器中撰写章节正文，再生成摘要；摘要必须依据已写正文归纳，不能为空文生成。", nil)
		return
	}
	promptText := ch.buildChapterFieldContext(&req)
	systemPrompt := strings.TrimSpace(`
你是小说章节摘要生成助手。你必须严格根据下方用户消息中的「当前章节正文」进行归纳，不得编造正文中没有的情节。
可结合小说设定与前序章节帮助理解，但摘要内容必须能在当前正文里找到依据。
输出一段章节摘要（100-200字），简体中文。只输出摘要纯文本，不要 markdown、引号或解释。
`)
	llmOpts := &llm.LLMOptions{
		Provider:     pickChatProvider(""),
		ApiKey:       strings.TrimSpace(config.GlobalConfig.Services.LLM.APIKey),
		BaseURL:      strings.TrimSpace(config.GlobalConfig.Services.LLM.BaseURL),
		SystemPrompt: systemPrompt,
		Logger:       logger.Lg,
	}
	cctx, cancel := context.WithTimeout(c.Request.Context(), 60*time.Second)
	defer cancel()
	handler, err := llm.NewProviderHandler(cctx, llmOpts.Provider, llmOpts)
	if err != nil {
		response.Fail(c, "llm handler init failed: "+err.Error(), nil)
		return
	}
	handler.ResetMemory()
	qopts := &llm.QueryOptions{
		Model:       pickChatModel(req.Model),
		MaxTokens:   600,
		Temperature: 0.5,
	}
	if qopts.Model == "" {
		qopts.Model = "gpt-4o-mini"
	}
	qresp, err := handler.QueryWithOptions(promptText, qopts)
	if err != nil {
		response.Fail(c, "LLM request failed: "+err.Error(), nil)
		return
	}
	raw := ""
	if qresp != nil && len(qresp.Choices) > 0 {
		raw = strings.TrimSpace(qresp.Choices[0].Content)
	}
	response.Success(c, "OK", GenerateChapterFieldResponse{Value: raw, Raw: raw})
}

func (ch *CinyuHandlers) GenerateChapterOutline(c *gin.Context) {
	if strings.TrimSpace(config.GlobalConfig.Services.LLM.APIKey) == "" {
		response.FailWithCode(c, 503, "LLM is not configured (LLM_API_KEY)", nil)
		return
	}
	var req GenerateChapterFieldRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, err.Error(), nil)
		return
	}
	promptText := ch.buildChapterFieldContext(&req)
	systemPrompt := strings.TrimSpace(`
你是小说章节大纲生成助手。根据提供的小说设定、前序章节和角色信息，生成下一章的详细大纲（200-400字），描述关键情节点、人物互动和转折。
只输出大纲纯文本，不要 markdown、引号或解释。
`)
	llmOpts := &llm.LLMOptions{
		Provider:     pickChatProvider(""),
		ApiKey:       strings.TrimSpace(config.GlobalConfig.Services.LLM.APIKey),
		BaseURL:      strings.TrimSpace(config.GlobalConfig.Services.LLM.BaseURL),
		SystemPrompt: systemPrompt,
		Logger:       logger.Lg,
	}
	cctx, cancel := context.WithTimeout(c.Request.Context(), 60*time.Second)
	defer cancel()
	handler, err := llm.NewProviderHandler(cctx, llmOpts.Provider, llmOpts)
	if err != nil {
		response.Fail(c, "llm handler init failed: "+err.Error(), nil)
		return
	}
	handler.ResetMemory()
	qopts := &llm.QueryOptions{
		Model:       pickChatModel(req.Model),
		MaxTokens:   1200,
		Temperature: 0.6,
	}
	if qopts.Model == "" {
		qopts.Model = "gpt-4o-mini"
	}
	qresp, err := handler.QueryWithOptions(promptText, qopts)
	if err != nil {
		response.Fail(c, "LLM request failed: "+err.Error(), nil)
		return
	}
	raw := ""
	if qresp != nil && len(qresp.Choices) > 0 {
		raw = strings.TrimSpace(qresp.Choices[0].Content)
	}
	response.Success(c, "OK", GenerateChapterFieldResponse{Value: raw, Raw: raw})
}

func (ch *CinyuHandlers) GenerateChapterBody(c *gin.Context) {
	if strings.TrimSpace(config.GlobalConfig.Services.LLM.APIKey) == "" {
		response.FailWithCode(c, 503, "LLM is not configured (LLM_API_KEY)", nil)
		return
	}
	var req GenerateChapterFieldRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, err.Error(), nil)
		return
	}
	promptText := ch.buildChapterFieldContext(&req)
	systemPrompt := strings.TrimSpace(`
你是小说章节正文写作助手。根据提供的小说设定、大纲和前序章节，生成完整的章节正文。
要求：
1) 正文必须可直接发布，不要"以下是正文"等说明。
2) 文风与已有设定一致。
3) 只输出正文纯文本，不要 markdown、标题或解释。
`)
	llmOpts := &llm.LLMOptions{
		Provider:     pickChatProvider(""),
		ApiKey:       strings.TrimSpace(config.GlobalConfig.Services.LLM.APIKey),
		BaseURL:      strings.TrimSpace(config.GlobalConfig.Services.LLM.BaseURL),
		SystemPrompt: systemPrompt,
		Logger:       logger.Lg,
	}
	cctx, cancel := context.WithTimeout(c.Request.Context(), 180*time.Second)
	defer cancel()
	handler, err := llm.NewProviderHandler(cctx, llmOpts.Provider, llmOpts)
	if err != nil {
		response.Fail(c, "llm handler init failed: "+err.Error(), nil)
		return
	}
	handler.ResetMemory()
	qopts := &llm.QueryOptions{
		Model:       pickChatModel(req.Model),
		MaxTokens:   4000,
		Temperature: 0.7,
	}
	if qopts.Model == "" {
		qopts.Model = "gpt-4o-mini"
	}
	qresp, err := handler.QueryWithOptions(promptText, qopts)
	if err != nil {
		response.Fail(c, "LLM request failed: "+err.Error(), nil)
		return
	}
	raw := ""
	if qresp != nil && len(qresp.Choices) > 0 {
		raw = strings.TrimSpace(qresp.Choices[0].Content)
	}
	response.Success(c, "OK", GenerateChapterFieldResponse{Value: raw, Raw: raw})
}

func (ch *CinyuHandlers) PredictPlot(c *gin.Context) {
	if strings.TrimSpace(config.GlobalConfig.Services.LLM.APIKey) == "" {
		response.FailWithCode(c, 503, "LLM is not configured (LLM_API_KEY)", nil)
		return
	}
	var req PredictPlotRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, err.Error(), nil)
		return
	}
	if req.Count <= 0 {
		req.Count = 3
	}
	if req.Count > 6 {
		req.Count = 6
	}

	// Build context
	var b strings.Builder

	// Novel context
	var novel *models.Novel
	if req.NovelID > 0 {
		novel, _ = models.GetNovelByID(ch.db, req.NovelID)
	}
	if novel != nil {
		b.WriteString("小说标题：")
		b.WriteString(novel.Title)
		b.WriteString("\n")
		if strings.TrimSpace(novel.Theme) != "" {
			b.WriteString("主题：")
			b.WriteString(novel.Theme)
			b.WriteString("\n")
		}
		if strings.TrimSpace(novel.Description) != "" {
			b.WriteString("简介：")
			b.WriteString(novel.Description)
			b.WriteString("\n")
		}
		if strings.TrimSpace(novel.WorldSetting) != "" {
			b.WriteString("世界观：")
			b.WriteString(novel.WorldSetting)
			b.WriteString("\n")
		}
	}

	// Volume context
	if req.VolumeID > 0 {
		vol, err := models.GetVolumeByID(ch.db, req.VolumeID)
		if err == nil && vol != nil {
			b.WriteString("\n当前卷：")
			b.WriteString(vol.Title)
			if strings.TrimSpace(vol.Description) != "" {
				b.WriteString(" — ")
				b.WriteString(vol.Description)
			}
			b.WriteString("\n")
		}
	}

	prevIDs := mergeRequestPreviousChapterIDs(req.PreviousChapterIDs, req.PreviousChapterID)
	ch.appendPreviousChaptersToPrompt(&b, req.NovelID, prevIDs)

	// Character context
	if strings.TrimSpace(req.CharacterIDs) != "" {
		b.WriteString("\n关联角色：\n")
		ids := strings.Split(req.CharacterIDs, ",")
		for _, idStr := range ids {
			idStr = strings.TrimSpace(idStr)
			if idStr == "" {
				continue
			}
			cid, err := strconv.ParseUint(idStr, 10, 32)
			if err != nil {
				continue
			}
			char, err := models.GetCharacterByID(ch.db, uint(cid))
			if err != nil || char == nil {
				continue
			}
			b.WriteString("- ")
			b.WriteString(char.Name)
			if strings.TrimSpace(char.RoleType) != "" {
				b.WriteString("（")
				b.WriteString(char.RoleType)
				b.WriteString("）")
			}
			if strings.TrimSpace(char.Personality) != "" || strings.TrimSpace(char.Goal) != "" {
				b.WriteString("：")
				if strings.TrimSpace(char.Personality) != "" {
					b.WriteString("性格：")
					b.WriteString(char.Personality)
					b.WriteString("；")
				}
				if strings.TrimSpace(char.Goal) != "" {
					b.WriteString("目标：")
					b.WriteString(char.Goal)
				}
			}
			b.WriteString("\n")
		}
	}

	// Direction hint
	if strings.TrimSpace(req.Direction) != "" {
		b.WriteString("\n用户倾向方向：")
		b.WriteString(strings.TrimSpace(req.Direction))
		b.WriteString("\n")
	}

	prompt := b.String()

	systemPrompt := strings.TrimSpace(`
你是小说情节预测助手。根据已有的小说设定、前序章节内容和角色信息，预测后续可能的情节发展方向。
输出一个 JSON 数组，每个元素包含两个字段：
- direction: 发展方向名称（简短概括，如"复仇路线"、"和解路线"等）
- summary: 该方向下新章节的摘要（100-200字，描述关键事件和转折）

输出 ` + strconv.Itoa(req.Count) + ` 个不同方向。只输出 JSON 数组，不要 markdown 或解释。
`)

	llmOpts := &llm.LLMOptions{
		Provider:     pickChatProvider(""),
		ApiKey:       strings.TrimSpace(config.GlobalConfig.Services.LLM.APIKey),
		BaseURL:      strings.TrimSpace(config.GlobalConfig.Services.LLM.BaseURL),
		SystemPrompt: systemPrompt,
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
		MaxTokens:        2000,
		EnableJSONOutput: true,
		OutputFormat:     "json_object",
		Temperature:      0.85,
	}
	if qopts.Model == "" {
		qopts.Model = "gpt-4o-mini"
	}
	qresp, err := handler.QueryWithOptions(prompt, qopts)
	if err != nil {
		if logger.Lg != nil {
			logger.Lg.Error("predict plot with ai failed", zap.Error(err))
		}
		response.Fail(c, "LLM request failed: "+err.Error(), nil)
		return
	}
	if qresp == nil || len(qresp.Choices) == 0 {
		response.Fail(c, "empty completion choices", nil)
		return
	}
	raw := strings.TrimSpace(qresp.Choices[0].Content)
	predictions, err := parsePlotPredictions(raw)
	if err != nil {
		response.FailWithCode(c, 422, "AI输出解析失败: "+err.Error(), gin.H{"raw": raw})
		return
	}
	response.Success(c, "OK", PredictPlotResponse{
		Predictions: predictions,
		Raw:         raw,
	})
}

func parsePlotPredictions(raw string) ([]PlotPrediction, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, errors.New("empty response")
	}
	// Try direct array parse
	var predictions []PlotPrediction
	candidate := raw
	if !json.Valid([]byte(candidate)) {
		start := strings.Index(candidate, "[")
		end := strings.LastIndex(candidate, "]")
		if start < 0 || end < 0 || start >= end {
			// Maybe wrapped in object with a key
			s := strings.Index(candidate, "{")
			e := strings.LastIndex(candidate, "}")
			if s >= 0 && e > s {
				var obj map[string]any
				if err := json.Unmarshal([]byte(candidate[s:e+1]), &obj); err == nil {
					if arr, ok := obj["predictions"]; ok {
						if arrBytes, err2 := json.Marshal(arr); err2 == nil {
							candidate = string(arrBytes)
						}
					}
				}
			}
		} else {
			candidate = candidate[start : end+1]
		}
	}
	if err := json.Unmarshal([]byte(candidate), &predictions); err == nil {
		return predictions, nil
	}
	// Fallback: parse as map array
	var rawArr []map[string]any
	if err := json.Unmarshal([]byte(candidate), &rawArr); err != nil {
		return nil, err
	}
	for _, m := range rawArr {
		predictions = append(predictions, PlotPrediction{
			Direction: anyToString(m["direction"]),
			Summary:   anyToString(m["summary"]),
		})
	}
	return predictions, nil
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
	// Preserve input-only fields from baseDraft (AI should not generate these)
	if req.BaseDraft != nil {
		draft.ID = req.BaseDraft.ID
		draft.NovelID = req.BaseDraft.NovelID
		draft.VolumeID = req.BaseDraft.VolumeID
		draft.CharacterIDs = req.BaseDraft.CharacterIDs
		draft.PlotPointIDs = req.BaseDraft.PlotPointIDs
		draft.RelatedNodeIDs = req.BaseDraft.RelatedNodeIDs
		draft.PreviousChapterID = req.BaseDraft.PreviousChapterID
		draft.PreviousChapterIDs = req.BaseDraft.PreviousChapterIDs
	}
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

// enrichChapterPromptWithPreviousChapter 将多章前序摘要与正文片段注入 prompt。
func (ch *CinyuHandlers) enrichChapterPromptWithPreviousChapter(prompt string, baseDraft *ChapterResponse) string {
	if baseDraft == nil {
		return prompt
	}
	ids := mergeRequestPreviousChapterIDs(baseDraft.PreviousChapterIDs, baseDraft.PreviousChapterID)
	if len(ids) == 0 {
		return prompt
	}
	first, err := models.GetChapterByID(ch.db, ids[0])
	if err != nil || first == nil {
		return prompt
	}
	novelID := first.NovelID
	ids = ch.filterChapterIDsForNovel(novelID, ids)
	if len(ids) == 0 {
		return prompt
	}
	var b strings.Builder
	b.WriteString(prompt)
	ch.appendPreviousChaptersToPrompt(&b, novelID, ids)
	return b.String()
}

func buildGenerateChapterSystemPrompt() string {
	return strings.TrimSpace(`
你是小说章节写作助手。只输出一个 JSON 对象，不要 markdown 或解释。
输出字段严格如下：
title,content,orderNo,wordCount,summary,outline,promptMemo,status
规则：
1) title 与 content 必填。
2) content 必须是可直接发布的正文，不要"以下是正文"这类说明。
3) orderNo >= 1；wordCount >= 0。
4) 若有锁定字段，必须保持输入草稿对应字段不变。
5) 输出必须可被 JSON.parse 直接解析。
6) 不要输出 characterIds、plotPointIds、relatedNodeIds、previousChapterId、previousChapterIds 等输入型字段，这些由用户指定。
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
		Outline:         anyToString(m["outline"]),
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
		case "outline":
			draft.Outline = base.Outline
		case "promptMemo":
			draft.PromptMemo = base.PromptMemo
		case "status":
			draft.Status = base.Status
		}
	}
}

func chapterToResponse(row *models.Chapter) *ChapterResponse {
	ids := parseChapterIDCSV(row.PreviousChapterIDs)
	if len(ids) == 0 && row.PreviousChapterID > 0 {
		ids = []uint{row.PreviousChapterID}
	}
	ids = dedupeChapterIDsOrdered(ids)
	return &ChapterResponse{
		ID:                 row.ID,
		NovelID:            row.NovelID,
		VolumeID:           row.VolumeID,
		Title:              row.Title,
		Content:            row.Content,
		OrderNo:            row.OrderNo,
		WordCount:          row.WordCount,
		Summary:            row.Summary,
		CharacterIDs:       row.CharacterIDs,
		PlotPointIDs:       row.PlotPointIDs,
		PreviousChapterID:  firstChapterIDOrZero(ids),
		PreviousChapterIDs: joinChapterIDCSV(ids),
		Outline:            row.Outline,
		RelatedNodeIDs:     row.RelatedNodeIDs,
		PromptMemo:         row.PromptMemo,
		Status:             row.Status,
		CreatedAt:          row.GetCreatedAtString(),
		UpdatedAt:          row.GetUpdatedAtString(),
	}
}
