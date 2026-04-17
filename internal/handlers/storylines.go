package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
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

type storylineListResp[T any] struct {
	Items []*T  `json:"items"`
	Total int64 `json:"total"`
	Page  int   `json:"page"`
	Size  int   `json:"size"`
}

type aiStorylineGraphDraft struct {
	Storyline models.Storyline       `json:"storyline"`
	Nodes     []models.StorylineNode `json:"nodes"`
	Edges     []models.StorylineEdge `json:"edges"`
	Facts     []models.StorylineFact `json:"facts"`
}

type generateStorylineAIReq struct {
	UserID       uint                   `json:"userId" binding:"required"`
	Message      string                 `json:"message" binding:"required"`
	Model        string                 `json:"model"`
	Temperature  *float32               `json:"temperature"`
	MaxTokens    int                    `json:"maxTokens"`
	DetailLevel  string                 `json:"detailLevel"` // lite | standard | full
	NodeLimit    int                    `json:"nodeLimit"`
	EdgeLimit    int                    `json:"edgeLimit"`
	FactLimit    int                    `json:"factLimit"`
	BaseDraft    *aiStorylineGraphDraft `json:"baseDraft"`
	LockedFields []string               `json:"lockedFields"`
	Feedback     string                 `json:"feedback"`
}

type advanceBranchBudget struct {
	MaxNewNodesPerBranch int `json:"maxNewNodesPerBranch"`
	MaxChapterSpan       int `json:"maxChapterSpan"`
}

type advanceStorylineReq struct {
	UserID                  uint                 `json:"userId" binding:"required"`
	CurrentNodeID           string               `json:"currentNodeId" binding:"required"`
	TargetAnchorID          string               `json:"targetAnchorId"`
	StepNodes               int                  `json:"stepNodes"` // 建议 2~4
	DetailLevel             string               `json:"detailLevel"`
	StrictMainline          *bool                `json:"strictMainline"`  // true=强约束主线，false=允许支线探索
	MinProgressHops         int                  `json:"minProgressHops"` // 严格模式下，要求最短路径至少缩短的步数
	UnresolvedBranchNodeIDs []string             `json:"unresolvedBranchNodeIds"`
	BranchBudget            *advanceBranchBudget `json:"branchBudget"`
	Feedback                string               `json:"feedback"`
	Model                   string               `json:"model"`
	Temperature             *float32             `json:"temperature"`
	MaxTokens               int                  `json:"maxTokens"`
}

type storylineIncrementDraft struct {
	Nodes []models.StorylineNode `json:"nodes"`
	Edges []models.StorylineEdge `json:"edges"`
	Facts []models.StorylineFact `json:"facts"`
}

type commitIncrementReq struct {
	Nodes             []models.StorylineNode `json:"nodes"`
	Edges             []models.StorylineEdge `json:"edges"`
	Facts             []models.StorylineFact `json:"facts"`
	NextCurrentNodeID string                 `json:"nextCurrentNodeId"`
}

func (ch *CinyuHandlers) registerStorylineRoutes(r *gin.RouterGroup) {
	g := r.Group("/storylines")
	{
		g.POST("", ch.CreateStoryline)
		g.GET("", ch.ListStorylines)
		g.GET("/:id", ch.GetStoryline)
		g.PUT("/:id", ch.UpdateStoryline)
		g.DELETE("/:id", ch.DeleteStoryline)
		g.POST("/:id/restore", ch.RestoreStoryline)

		g.POST("/nodes", ch.CreateStorylineNode)
		g.GET("/nodes", ch.ListStorylineNodes)
		g.GET("/nodes/:id", ch.GetStorylineNode)
		g.PUT("/nodes/:id", ch.UpdateStorylineNode)
		g.DELETE("/nodes/:id", ch.DeleteStorylineNode)
		g.POST("/nodes/:id/restore", ch.RestoreStorylineNode)

		g.POST("/edges", ch.CreateStorylineEdge)
		g.GET("/edges", ch.ListStorylineEdges)
		g.GET("/edges/:id", ch.GetStorylineEdge)
		g.PUT("/edges/:id", ch.UpdateStorylineEdge)
		g.DELETE("/edges/:id", ch.DeleteStorylineEdge)
		g.POST("/edges/:id/restore", ch.RestoreStorylineEdge)

		g.POST("/facts", ch.CreateStorylineFact)
		g.GET("/facts", ch.ListStorylineFacts)
		g.GET("/facts/:id", ch.GetStorylineFact)
		g.PUT("/facts/:id", ch.UpdateStorylineFact)
		g.DELETE("/facts/:id", ch.DeleteStorylineFact)
		g.POST("/facts/:id/restore", ch.RestoreStorylineFact)

		g.POST("/ai/generate", ch.GenerateStorylineByAI)
		g.GET("/:id/graph", ch.GetStorylineGraph)
		g.POST("/:id/seed-demo", ch.SeedStorylineDemoData)
		g.GET("/:id/state", ch.GetStorylineState)
		g.POST("/:id/advance", ch.AdvanceStorylineByAI)
		g.POST("/:id/commit-increment", ch.CommitStorylineIncrement)
	}
}

type storylineGraphNode struct {
	ID    string         `json:"id"`
	Label string         `json:"label"`
	Type  string         `json:"type"`
	Props map[string]any `json:"props"`
}

type storylineGraphEdge struct {
	ID     string         `json:"id"`
	Source string         `json:"source"`
	Target string         `json:"target"`
	Type   string         `json:"type"`
	Props  map[string]any `json:"props"`
}

type storylineGraphStats struct {
	TotalNodes int `json:"totalNodes"`
	TotalEdges int `json:"totalEdges"`
	EventCount int `json:"eventCount"`
	ClueCount  int `json:"clueCount"`
	TwistCount int `json:"twistCount"`
	FactCount  int `json:"factCount"`
}

type storylineGraphResp struct {
	Nodes []storylineGraphNode `json:"nodes"`
	Edges []storylineGraphEdge `json:"edges"`
	Stats storylineGraphStats  `json:"stats"`
}

func parsePageSize(c *gin.Context) (int, int) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "10"))
	if page < 1 {
		page = 1
	}
	if size < 1 || size > 200 {
		size = 10
	}
	return page, size
}

func parseIDParam(c *gin.Context, key string) (uint, error) {
	n, err := strconv.ParseUint(c.Param(key), 10, 32)
	return uint(n), err
}

func (ch *CinyuHandlers) CreateStoryline(c *gin.Context) {
	var req models.Storyline
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, err.Error(), nil)
		return
	}
	req.SetCreateInfo("system")
	if req.Status == "" {
		req.Status = "draft"
	}
	if err := models.CreateStoryline(ch.db, &req); err != nil {
		response.Fail(c, "Failed to create storyline", nil)
		return
	}
	response.Success(c, "Storyline created", req)
}

func (ch *CinyuHandlers) ListStorylines(c *gin.Context) {
	page, size := parsePageSize(c)
	var novelID uint
	if raw := strings.TrimSpace(c.Query("novelId")); raw != "" {
		if n, err := strconv.ParseUint(raw, 10, 32); err == nil {
			novelID = uint(n)
		}
	}
	rows, total, err := models.ListStorylines(ch.db, novelID, page, size)
	if err != nil {
		response.Fail(c, "Failed to list storylines", nil)
		return
	}
	response.Success(c, "OK", storylineListResp[models.Storyline]{Items: rows, Total: total, Page: page, Size: size})
}

func (ch *CinyuHandlers) GetStoryline(c *gin.Context) {
	id, err := parseIDParam(c, "id")
	if err != nil {
		response.Fail(c, "Invalid id", nil)
		return
	}
	row, err := models.GetStorylineByID(ch.db, id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.FailWithCode(c, 404, "Not found", nil)
			return
		}
		response.Fail(c, "Failed to get storyline", nil)
		return
	}
	response.Success(c, "OK", row)
}

func (ch *CinyuHandlers) UpdateStoryline(c *gin.Context) {
	id, err := parseIDParam(c, "id")
	if err != nil {
		response.Fail(c, "Invalid id", nil)
		return
	}
	row, err := models.GetStorylineByID(ch.db, id)
	if err != nil {
		response.Fail(c, "Storyline not found", nil)
		return
	}
	var req models.Storyline
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, err.Error(), nil)
		return
	}
	if req.Name != "" {
		row.Name = req.Name
	}
	if req.Status != "" {
		row.Status = req.Status
	}
	if req.Theme != "" {
		row.Theme = req.Theme
	}
	if req.Promise != "" {
		row.Promise = req.Promise
	}
	if req.Forbidden != "" {
		row.Forbidden = req.Forbidden
	}
	if req.Description != "" {
		row.Description = req.Description
	}
	if req.CurrentNodeID != "" {
		row.CurrentNodeID = req.CurrentNodeID
	}
	if req.Version > 0 {
		row.Version = req.Version
	}
	row.SetUpdateInfo("system")
	if err := models.UpdateStoryline(ch.db, row); err != nil {
		response.Fail(c, "Failed to update storyline", nil)
		return
	}
	response.Success(c, "Storyline updated", row)
}

func (ch *CinyuHandlers) DeleteStoryline(c *gin.Context) {
	id, err := parseIDParam(c, "id")
	if err != nil {
		response.Fail(c, "Invalid id", nil)
		return
	}
	if err := models.DeleteStoryline(ch.db, id, "system"); err != nil {
		response.Fail(c, "Failed to delete storyline", nil)
		return
	}
	response.Success(c, "Storyline deleted", gin.H{"id": id})
}

func (ch *CinyuHandlers) RestoreStoryline(c *gin.Context) {
	id, err := parseIDParam(c, "id")
	if err != nil {
		response.Fail(c, "Invalid id", nil)
		return
	}
	if err := models.RestoreStoryline(ch.db, id, "system"); err != nil {
		response.Fail(c, "Failed to restore storyline", nil)
		return
	}
	response.Success(c, "Storyline restored", gin.H{"id": id})
}

func (ch *CinyuHandlers) CreateStorylineNode(c *gin.Context) { ch.createNodeLike(c, "node") }
func (ch *CinyuHandlers) CreateStorylineEdge(c *gin.Context) { ch.createNodeLike(c, "edge") }
func (ch *CinyuHandlers) CreateStorylineFact(c *gin.Context) { ch.createNodeLike(c, "fact") }

func (ch *CinyuHandlers) createNodeLike(c *gin.Context, kind string) {
	switch kind {
	case "node":
		var req models.StorylineNode
		if err := c.ShouldBindJSON(&req); err != nil {
			response.Fail(c, err.Error(), nil)
			return
		}
		req.SetCreateInfo("system")
		if err := models.CreateStorylineNode(ch.db, &req); err != nil {
			response.Fail(c, "create node failed", nil)
			return
		}
		response.Success(c, "OK", req)
	case "edge":
		var req models.StorylineEdge
		if err := c.ShouldBindJSON(&req); err != nil {
			response.Fail(c, err.Error(), nil)
			return
		}
		req.SetCreateInfo("system")
		if err := models.CreateStorylineEdge(ch.db, &req); err != nil {
			response.Fail(c, "create edge failed", nil)
			return
		}
		response.Success(c, "OK", req)
	case "fact":
		var req models.StorylineFact
		if err := c.ShouldBindJSON(&req); err != nil {
			response.Fail(c, err.Error(), nil)
			return
		}
		req.SetCreateInfo("system")
		if err := models.CreateStorylineFact(ch.db, &req); err != nil {
			response.Fail(c, "create fact failed", nil)
			return
		}
		response.Success(c, "OK", req)
	}
}

func (ch *CinyuHandlers) ListStorylineNodes(c *gin.Context) { ch.listNodeLike(c, "node") }
func (ch *CinyuHandlers) ListStorylineEdges(c *gin.Context) { ch.listNodeLike(c, "edge") }
func (ch *CinyuHandlers) ListStorylineFacts(c *gin.Context) { ch.listNodeLike(c, "fact") }

func (ch *CinyuHandlers) listNodeLike(c *gin.Context, kind string) {
	page, size := parsePageSize(c)
	var storylineID uint
	if raw := strings.TrimSpace(c.Query("storylineId")); raw != "" {
		if n, err := strconv.ParseUint(raw, 10, 32); err == nil {
			storylineID = uint(n)
		}
	}
	switch kind {
	case "node":
		rows, total, err := models.ListStorylineNodes(ch.db, storylineID, page, size)
		if err != nil {
			response.Fail(c, "list nodes failed", nil)
			return
		}
		response.Success(c, "OK", storylineListResp[models.StorylineNode]{Items: rows, Total: total, Page: page, Size: size})
	case "edge":
		rows, total, err := models.ListStorylineEdges(ch.db, storylineID, page, size)
		if err != nil {
			response.Fail(c, "list edges failed", nil)
			return
		}
		response.Success(c, "OK", storylineListResp[models.StorylineEdge]{Items: rows, Total: total, Page: page, Size: size})
	case "fact":
		rows, total, err := models.ListStorylineFacts(ch.db, storylineID, page, size)
		if err != nil {
			response.Fail(c, "list facts failed", nil)
			return
		}
		response.Success(c, "OK", storylineListResp[models.StorylineFact]{Items: rows, Total: total, Page: page, Size: size})
	}
}

func (ch *CinyuHandlers) GetStorylineNode(c *gin.Context) { ch.getNodeLike(c, "node") }
func (ch *CinyuHandlers) GetStorylineEdge(c *gin.Context) { ch.getNodeLike(c, "edge") }
func (ch *CinyuHandlers) GetStorylineFact(c *gin.Context) { ch.getNodeLike(c, "fact") }

func (ch *CinyuHandlers) getNodeLike(c *gin.Context, kind string) {
	id, err := parseIDParam(c, "id")
	if err != nil {
		response.Fail(c, "Invalid id", nil)
		return
	}
	switch kind {
	case "node":
		row, err := models.GetStorylineNodeByID(ch.db, id)
		if err != nil {
			response.Fail(c, "not found", nil)
			return
		}
		response.Success(c, "OK", row)
	case "edge":
		row, err := models.GetStorylineEdgeByID(ch.db, id)
		if err != nil {
			response.Fail(c, "not found", nil)
			return
		}
		response.Success(c, "OK", row)
	case "fact":
		row, err := models.GetStorylineFactByID(ch.db, id)
		if err != nil {
			response.Fail(c, "not found", nil)
			return
		}
		response.Success(c, "OK", row)
	}
}

func (ch *CinyuHandlers) UpdateStorylineNode(c *gin.Context) { ch.updateNodeLike(c, "node") }
func (ch *CinyuHandlers) UpdateStorylineEdge(c *gin.Context) { ch.updateNodeLike(c, "edge") }
func (ch *CinyuHandlers) UpdateStorylineFact(c *gin.Context) { ch.updateNodeLike(c, "fact") }

func (ch *CinyuHandlers) updateNodeLike(c *gin.Context, kind string) {
	id, err := parseIDParam(c, "id")
	if err != nil {
		response.Fail(c, "Invalid id", nil)
		return
	}
	switch kind {
	case "node":
		row, err := models.GetStorylineNodeByID(ch.db, id)
		if err != nil {
			response.Fail(c, "not found", nil)
			return
		}
		var req models.StorylineNode
		if err := c.ShouldBindJSON(&req); err != nil {
			response.Fail(c, err.Error(), nil)
			return
		}
		if req.Title != "" {
			row.Title = req.Title
		}
		if req.Summary != "" {
			row.Summary = req.Summary
		}
		if req.Type != "" {
			row.Type = req.Type
		}
		if req.Status != "" {
			row.Status = req.Status
		}
		if req.NodeID != "" {
			row.NodeID = req.NodeID
		}
		if req.StorylineID > 0 {
			row.StorylineID = req.StorylineID
		}
		if req.NovelID > 0 {
			row.NovelID = req.NovelID
		}
		if req.ChapterNo > 0 {
			row.ChapterNo = req.ChapterNo
		}
		if req.VolumeNo > 0 {
			row.VolumeNo = req.VolumeNo
		}
		if req.Priority != 0 {
			row.Priority = req.Priority
		}
		if req.Props != "" {
			row.Props = req.Props
		}
		row.SetUpdateInfo("system")
		if err := models.UpdateStorylineNode(ch.db, row); err != nil {
			response.Fail(c, "update failed", nil)
			return
		}
		response.Success(c, "OK", row)
	case "edge":
		row, err := models.GetStorylineEdgeByID(ch.db, id)
		if err != nil {
			response.Fail(c, "not found", nil)
			return
		}
		var req models.StorylineEdge
		if err := c.ShouldBindJSON(&req); err != nil {
			response.Fail(c, err.Error(), nil)
			return
		}
		if req.EdgeID != "" {
			row.EdgeID = req.EdgeID
		}
		if req.FromNodeID != "" {
			row.FromNodeID = req.FromNodeID
		}
		if req.ToNodeID != "" {
			row.ToNodeID = req.ToNodeID
		}
		if req.Relation != "" {
			row.Relation = req.Relation
		}
		if req.Status != "" {
			row.Status = req.Status
		}
		if req.Weight != 0 {
			row.Weight = req.Weight
		}
		if req.StorylineID > 0 {
			row.StorylineID = req.StorylineID
		}
		if req.NovelID > 0 {
			row.NovelID = req.NovelID
		}
		if req.Props != "" {
			row.Props = req.Props
		}
		row.SetUpdateInfo("system")
		if err := models.UpdateStorylineEdge(ch.db, row); err != nil {
			response.Fail(c, "update failed", nil)
			return
		}
		response.Success(c, "OK", row)
	case "fact":
		row, err := models.GetStorylineFactByID(ch.db, id)
		if err != nil {
			response.Fail(c, "not found", nil)
			return
		}
		var req models.StorylineFact
		if err := c.ShouldBindJSON(&req); err != nil {
			response.Fail(c, err.Error(), nil)
			return
		}
		if req.FactKey != "" {
			row.FactKey = req.FactKey
		}
		if req.FactValue != "" {
			row.FactValue = req.FactValue
		}
		if req.SourceNodeID != "" {
			row.SourceNodeID = req.SourceNodeID
		}
		if req.ValidFromChap > 0 {
			row.ValidFromChap = req.ValidFromChap
		}
		if req.ValidToChap > 0 {
			row.ValidToChap = req.ValidToChap
		}
		if req.Confidence > 0 {
			row.Confidence = req.Confidence
		}
		if req.StorylineID > 0 {
			row.StorylineID = req.StorylineID
		}
		if req.NovelID > 0 {
			row.NovelID = req.NovelID
		}
		row.SetUpdateInfo("system")
		if err := models.UpdateStorylineFact(ch.db, row); err != nil {
			response.Fail(c, "update failed", nil)
			return
		}
		response.Success(c, "OK", row)
	}
}

func (ch *CinyuHandlers) DeleteStorylineNode(c *gin.Context)  { ch.deleteNodeLike(c, "node") }
func (ch *CinyuHandlers) DeleteStorylineEdge(c *gin.Context)  { ch.deleteNodeLike(c, "edge") }
func (ch *CinyuHandlers) DeleteStorylineFact(c *gin.Context)  { ch.deleteNodeLike(c, "fact") }
func (ch *CinyuHandlers) RestoreStorylineNode(c *gin.Context) { ch.restoreNodeLike(c, "node") }
func (ch *CinyuHandlers) RestoreStorylineEdge(c *gin.Context) { ch.restoreNodeLike(c, "edge") }
func (ch *CinyuHandlers) RestoreStorylineFact(c *gin.Context) { ch.restoreNodeLike(c, "fact") }

func (ch *CinyuHandlers) deleteNodeLike(c *gin.Context, kind string) {
	id, err := parseIDParam(c, "id")
	if err != nil {
		response.Fail(c, "Invalid id", nil)
		return
	}
	var e error
	switch kind {
	case "node":
		e = models.DeleteStorylineNode(ch.db, id, "system")
	case "edge":
		e = models.DeleteStorylineEdge(ch.db, id, "system")
	case "fact":
		e = models.DeleteStorylineFact(ch.db, id, "system")
	}
	if e != nil {
		response.Fail(c, "delete failed", nil)
		return
	}
	response.Success(c, "OK", gin.H{"id": id})
}

func (ch *CinyuHandlers) restoreNodeLike(c *gin.Context, kind string) {
	id, err := parseIDParam(c, "id")
	if err != nil {
		response.Fail(c, "Invalid id", nil)
		return
	}
	var e error
	switch kind {
	case "node":
		e = models.RestoreStorylineNode(ch.db, id, "system")
	case "edge":
		e = models.RestoreStorylineEdge(ch.db, id, "system")
	case "fact":
		e = models.RestoreStorylineFact(ch.db, id, "system")
	}
	if e != nil {
		response.Fail(c, "restore failed", nil)
		return
	}
	response.Success(c, "OK", gin.H{"id": id})
}

func (ch *CinyuHandlers) GenerateStorylineByAI(c *gin.Context) {
	if strings.TrimSpace(config.GlobalConfig.Services.LLM.APIKey) == "" {
		response.FailWithCode(c, 503, "LLM is not configured (LLM_API_KEY)", nil)
		return
	}
	var req generateStorylineAIReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, err.Error(), nil)
		return
	}
	prompt := buildStorylineAIPrompt(req)
	llmOpts := &llm.LLMOptions{
		Provider:     pickChatProvider(""),
		ApiKey:       strings.TrimSpace(config.GlobalConfig.Services.LLM.APIKey),
		BaseURL:      strings.TrimSpace(config.GlobalConfig.Services.LLM.BaseURL),
		SystemPrompt: buildStorylineAISystemPrompt(req),
		Logger:       logger.Lg,
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 120*time.Second)
	defer cancel()
	h, err := llm.NewProviderHandler(ctx, llmOpts.Provider, llmOpts)
	if err != nil {
		response.Fail(c, "llm handler init failed: "+err.Error(), nil)
		return
	}
	h.ResetMemory()
	qopts := &llm.QueryOptions{Model: pickChatModel(req.Model), MaxTokens: req.MaxTokens, EnableJSONOutput: true, OutputFormat: "json_object"}
	if qopts.Model == "" {
		qopts.Model = "gpt-4o-mini"
	}
	if qopts.MaxTokens <= 0 {
		qopts.MaxTokens = defaultStorylineMaxTokens(req.DetailLevel)
	}
	if req.Temperature != nil {
		qopts.Temperature = *req.Temperature
	}
	raw, draft, err := ch.runStorylineGenerationOnce(c.Request.Context(), h, prompt, qopts, req.BaseDraft, req.LockedFields)
	if err != nil {
		retryPrompt := prompt + "\n\n上一次输出不是完整合法JSON。请重新输出完整且可解析的单个 JSON 对象，不要省略结尾，不要 markdown。"
		retryQopts := *qopts
		retryQopts.MaxTokens = int(float64(qopts.MaxTokens) * 1.3)
		if retryQopts.MaxTokens < qopts.MaxTokens+600 {
			retryQopts.MaxTokens = qopts.MaxTokens + 600
		}
		if retryQopts.MaxTokens > 8192 {
			retryQopts.MaxTokens = 8192
		}
		retryQopts.Temperature = 0.2
		raw2, draft2, err2 := ch.runStorylineGenerationOnce(c.Request.Context(), h, retryPrompt, &retryQopts, req.BaseDraft, req.LockedFields)
		if err2 != nil {
			response.FailWithCode(c, 422, "AI输出不是合法故事线JSON: "+err2.Error(), gin.H{"raw": raw})
			return
		}
		// 走后续校验流程
		raw = raw2
		draft = draft2
	}
	// 校验失败则带校验反馈自动重生一轮
	if verr := validateStorylineDraft(&draft); len(verr) > 0 {
		retryPrompt := prompt + "\n\n上一次输出未通过校验，请严格修复后重新输出，且只输出 JSON。\n校验失败原因：\n- " + strings.Join(verr, "\n- ")
		retryQopts := *qopts
		retryQopts.MaxTokens = int(float64(qopts.MaxTokens) * 1.3)
		if retryQopts.MaxTokens < qopts.MaxTokens+600 {
			retryQopts.MaxTokens = qopts.MaxTokens + 600
		}
		if retryQopts.MaxTokens > 8192 {
			retryQopts.MaxTokens = 8192
		}
		retryQopts.Temperature = 0.2
		raw2, draft2, err2 := ch.runStorylineGenerationOnce(c.Request.Context(), h, retryPrompt, &retryQopts, req.BaseDraft, req.LockedFields)
		if err2 != nil {
			response.FailWithCode(c, 422, "AI重生失败: "+err2.Error(), gin.H{"raw": raw, "validationErrors": verr})
			return
		}
		if verr2 := validateStorylineDraft(&draft2); len(verr2) > 0 {
			response.FailWithCode(c, 422, "AI输出未通过故事线校验", gin.H{
				"raw":              raw2,
				"validationErrors": verr2,
			})
			return
		}
		response.Success(c, "OK", gin.H{"draft": draft2, "raw": raw2, "regenerated": true})
		return
	}
	response.Success(c, "OK", gin.H{"draft": draft, "raw": raw, "regenerated": false})
}

func (ch *CinyuHandlers) runStorylineGenerationOnce(
	ctx context.Context,
	h interface {
		QueryWithOptions(prompt string, options *llm.QueryOptions) (*llm.QueryResponse, error)
	},
	prompt string,
	qopts *llm.QueryOptions,
	base *aiStorylineGraphDraft,
	locked []string,
) (string, aiStorylineGraphDraft, error) {
	var empty aiStorylineGraphDraft
	qresp, err := h.QueryWithOptions(prompt, qopts)
	if err != nil {
		if logger.Lg != nil {
			logger.Lg.Error("generate storyline with ai failed", zap.Error(err))
		}
		return "", empty, errors.New("LLM request failed: " + err.Error())
	}
	if qresp == nil || len(qresp.Choices) == 0 {
		return "", empty, errors.New("empty completion choices")
	}
	raw := strings.TrimSpace(qresp.Choices[0].Content)
	draft, err := parseStorylineAIDraft(raw)
	if err != nil {
		return raw, empty, errors.New("AI输出不是合法故事线JSON: " + err.Error())
	}
	applyLockedStorylineFields(&draft, base, locked)
	normalizeStorylineDraft(&draft)
	return raw, draft, nil
}

func (ch *CinyuHandlers) GetStorylineGraph(c *gin.Context) {
	id, err := parseIDParam(c, "id")
	if err != nil {
		response.Fail(c, "Invalid storyline id", nil)
		return
	}
	_, err = models.GetStorylineByID(ch.db, id)
	if err != nil {
		response.Fail(c, "Storyline not found", nil)
		return
	}
	nodes, _, err := models.ListStorylineNodes(ch.db, id, 1, 500)
	if err != nil {
		response.Fail(c, "list nodes failed", nil)
		return
	}
	edges, _, err := models.ListStorylineEdges(ch.db, id, 1, 500)
	if err != nil {
		response.Fail(c, "list edges failed", nil)
		return
	}
	facts, _, err := models.ListStorylineFacts(ch.db, id, 1, 500)
	if err != nil {
		response.Fail(c, "list facts failed", nil)
		return
	}

	graphNodes := make([]storylineGraphNode, 0, len(nodes)+len(facts))
	stats := storylineGraphStats{}
	for _, n := range nodes {
		props := map[string]any{
			"status":    n.Status,
			"summary":   n.Summary,
			"chapterNo": n.ChapterNo,
			"volumeNo":  n.VolumeNo,
			"priority":  n.Priority,
		}
		if n.Props != "" {
			props["rawProps"] = n.Props
		}
		graphNodes = append(graphNodes, storylineGraphNode{
			ID:    n.NodeID,
			Label: n.Title,
			Type:  n.Type,
			Props: props,
		})
		switch strings.ToLower(strings.TrimSpace(n.Type)) {
		case "event":
			stats.EventCount++
		case "clue":
			stats.ClueCount++
		case "twist":
			stats.TwistCount++
		}
	}
	for _, f := range facts {
		fid := "fact-" + strconv.FormatUint(uint64(f.ID), 10)
		graphNodes = append(graphNodes, storylineGraphNode{
			ID:    fid,
			Label: f.FactKey,
			Type:  "Fact",
			Props: map[string]any{
				"value":         f.FactValue,
				"sourceNodeId":  f.SourceNodeID,
				"validFromChap": f.ValidFromChap,
				"validToChap":   f.ValidToChap,
				"confidence":    f.Confidence,
			},
		})
		stats.FactCount++
	}

	graphEdges := make([]storylineGraphEdge, 0, len(edges)+len(facts))
	for _, e := range edges {
		graphEdges = append(graphEdges, storylineGraphEdge{
			ID:     e.EdgeID,
			Source: e.FromNodeID,
			Target: e.ToNodeID,
			Type:   e.Relation,
			Props: map[string]any{
				"weight": e.Weight,
				"status": e.Status,
				"props":  e.Props,
			},
		})
	}
	for _, f := range facts {
		if strings.TrimSpace(f.SourceNodeID) == "" {
			continue
		}
		fid := "fact-" + strconv.FormatUint(uint64(f.ID), 10)
		graphEdges = append(graphEdges, storylineGraphEdge{
			ID:     "edge-fact-" + strconv.FormatUint(uint64(f.ID), 10),
			Source: f.SourceNodeID,
			Target: fid,
			Type:   "HAS_FACT",
			Props:  map[string]any{"confidence": f.Confidence},
		})
	}

	stats.TotalNodes = len(graphNodes)
	stats.TotalEdges = len(graphEdges)
	response.Success(c, "OK", storylineGraphResp{
		Nodes: graphNodes,
		Edges: graphEdges,
		Stats: stats,
	})
}

func (ch *CinyuHandlers) SeedStorylineDemoData(c *gin.Context) {
	id, err := parseIDParam(c, "id")
	if err != nil {
		response.Fail(c, "Invalid storyline id", nil)
		return
	}
	sl, err := models.GetStorylineByID(ch.db, id)
	if err != nil {
		response.Fail(c, "Storyline not found", nil)
		return
	}
	demoNodes := []models.StorylineNode{
		{StorylineID: id, NodeID: "evt-open", NovelID: sl.NovelID, Type: "event", Title: "开篇危机", Summary: "主角被公开陷害", Status: "approved", ChapterNo: 1, VolumeNo: 1, Priority: 10, Props: "{}"},
		{StorylineID: id, NodeID: "clue-watch", NovelID: sl.NovelID, Type: "clue", Title: "黄铜怀表", Summary: "出现关键线索", Status: "approved", ChapterNo: 3, VolumeNo: 1, Priority: 9, Props: "{}"},
		{StorylineID: id, NodeID: "twist-friend", NovelID: sl.NovelID, Type: "twist", Title: "闺蜜背刺", Summary: "信任关系反转", Status: "approved", ChapterNo: 12, VolumeNo: 1, Priority: 10, Props: "{}"},
		{StorylineID: id, NodeID: "payoff-origin", NovelID: sl.NovelID, Type: "payoff", Title: "旧案真相", Summary: "伏笔回收", Status: "draft", ChapterNo: 46, VolumeNo: 2, Priority: 10, Props: "{}"},
	}
	for i := range demoNodes {
		demoNodes[i].SetCreateInfo("system")
		if err := models.CreateStorylineNode(ch.db, &demoNodes[i]); err != nil {
			response.Fail(c, "seed node failed", nil)
			return
		}
	}
	demoEdges := []models.StorylineEdge{
		{StorylineID: id, EdgeID: "e-open-clue", NovelID: sl.NovelID, FromNodeID: "evt-open", ToNodeID: "clue-watch", Relation: "introduces", Weight: 1, Status: "active", Props: "{}"},
		{StorylineID: id, EdgeID: "e-clue-twist", NovelID: sl.NovelID, FromNodeID: "clue-watch", ToNodeID: "twist-friend", Relation: "causes", Weight: 2, Status: "active", Props: "{}"},
		{StorylineID: id, EdgeID: "e-clue-payoff", NovelID: sl.NovelID, FromNodeID: "clue-watch", ToNodeID: "payoff-origin", Relation: "payoff", Weight: 3, Status: "active", Props: "{}"},
	}
	for i := range demoEdges {
		demoEdges[i].SetCreateInfo("system")
		if err := models.CreateStorylineEdge(ch.db, &demoEdges[i]); err != nil {
			response.Fail(c, "seed edge failed", nil)
			return
		}
	}
	demoFact := models.StorylineFact{
		StorylineID: id, NovelID: sl.NovelID, FactKey: "character.hero.age", FactValue: "26",
		SourceNodeID: "evt-open", ValidFromChap: 1, ValidToChap: 0, Confidence: 100,
	}
	demoFact.SetCreateInfo("system")
	if err := models.CreateStorylineFact(ch.db, &demoFact); err != nil {
		response.Fail(c, "seed fact failed", nil)
		return
	}
	response.Success(c, "OK", gin.H{"storylineId": id, "nodes": len(demoNodes), "edges": len(demoEdges), "facts": 1})
}

func (ch *CinyuHandlers) GetStorylineState(c *gin.Context) {
	id, err := parseIDParam(c, "id")
	if err != nil {
		response.Fail(c, "Invalid storyline id", nil)
		return
	}
	sl, err := models.GetStorylineByID(ch.db, id)
	if err != nil {
		response.Fail(c, "Storyline not found", nil)
		return
	}
	nodes, _, err := models.ListStorylineNodes(ch.db, id, 1, 1000)
	if err != nil {
		response.Fail(c, "list nodes failed", nil)
		return
	}
	edges, _, err := models.ListStorylineEdges(ch.db, id, 1, 1000)
	if err != nil {
		response.Fail(c, "list edges failed", nil)
		return
	}
	anchors := make([]gin.H, 0)
	for _, n := range nodes {
		propsObj := parsePropsObject(n.Props)
		if b, ok := propsObj["anchor"].(bool); ok && b {
			anchors = append(anchors, gin.H{
				"nodeId":      n.NodeID,
				"title":       n.Title,
				"anchorOrder": int(anyToInt64(propsObj["anchorOrder"])),
			})
		}
	}
	// unresolved: clue/twist and 没有出边
	outDeg := map[string]int{}
	for _, e := range edges {
		outDeg[e.FromNodeID]++
	}
	unresolved := make([]string, 0)
	for _, n := range nodes {
		t := strings.ToLower(strings.TrimSpace(n.Type))
		if (t == "clue" || t == "twist") && outDeg[n.NodeID] == 0 {
			unresolved = append(unresolved, n.NodeID)
		}
	}
	response.Success(c, "OK", gin.H{
		"storylineId":           id,
		"novelId":               sl.NovelID,
		"currentNodeId":         sl.CurrentNodeID,
		"totalNodes":            len(nodes),
		"totalEdges":            len(edges),
		"anchorNodes":           anchors,
		"unresolvedBranchNodes": unresolved,
	})
}

func (ch *CinyuHandlers) AdvanceStorylineByAI(c *gin.Context) {
	id, err := parseIDParam(c, "id")
	if err != nil {
		response.Fail(c, "Invalid storyline id", nil)
		return
	}
	sl, err := models.GetStorylineByID(ch.db, id)
	if err != nil {
		response.Fail(c, "Storyline not found", nil)
		return
	}
	var req advanceStorylineReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, err.Error(), nil)
		return
	}
	if strings.TrimSpace(req.CurrentNodeID) == "" {
		response.Fail(c, "currentNodeId is required", nil)
		return
	}
	stepNodes := req.StepNodes
	if stepNodes <= 0 {
		stepNodes = 3
	}
	if stepNodes > 6 {
		stepNodes = 6
	}
	nodes, _, err := models.ListStorylineNodes(ch.db, id, 1, 1000)
	if err != nil {
		response.Fail(c, "list nodes failed", nil)
		return
	}
	edges, _, err := models.ListStorylineEdges(ch.db, id, 1, 1000)
	if err != nil {
		response.Fail(c, "list edges failed", nil)
		return
	}
	facts, _, err := models.ListStorylineFacts(ch.db, id, 1, 1000)
	if err != nil {
		response.Fail(c, "list facts failed", nil)
		return
	}

	if strings.TrimSpace(config.GlobalConfig.Services.LLM.APIKey) == "" {
		response.FailWithCode(c, 503, "LLM is not configured (LLM_API_KEY)", nil)
		return
	}
	llmOpts := &llm.LLMOptions{
		Provider:     pickChatProvider(""),
		ApiKey:       strings.TrimSpace(config.GlobalConfig.Services.LLM.APIKey),
		BaseURL:      strings.TrimSpace(config.GlobalConfig.Services.LLM.BaseURL),
		SystemPrompt: buildAdvanceStorylineSystemPrompt(stepNodes),
		Logger:       logger.Lg,
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 120*time.Second)
	defer cancel()
	h, err := llm.NewProviderHandler(ctx, llmOpts.Provider, llmOpts)
	if err != nil {
		response.Fail(c, "llm handler init failed: "+err.Error(), nil)
		return
	}
	h.ResetMemory()
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
		qopts.MaxTokens = 1400
	}
	if req.Temperature != nil {
		qopts.Temperature = *req.Temperature
	} else {
		qopts.Temperature = 0.2
	}

	prompt := buildAdvanceStorylinePrompt(sl, nodes, edges, facts, req, stepNodes)
	raw, draft, err := runIncrementGenerationOnce(h, prompt, qopts, id, sl.NovelID)
	if err != nil {
		response.FailWithCode(c, 422, "AI增量生成失败: "+err.Error(), nil)
		return
	}
	valErrs := validateIncrementAnchored(draft, req, nodes, edges)
	if len(valErrs) > 0 {
		retryPrompt := prompt + "\n\n上一次增量不符合约束，请修复并仅输出JSON：\n- " + strings.Join(valErrs, "\n- ")
		retryOpts := *qopts
		retryOpts.MaxTokens = qopts.MaxTokens + 500
		raw2, draft2, err2 := runIncrementGenerationOnce(h, retryPrompt, &retryOpts, id, sl.NovelID)
		if err2 != nil {
			response.FailWithCode(c, 422, "AI增量重生失败: "+err2.Error(), gin.H{"raw": raw, "validationErrors": valErrs})
			return
		}
		valErrs2 := validateIncrementAnchored(draft2, req, nodes, edges)
		if len(valErrs2) > 0 {
			response.FailWithCode(c, 422, "AI增量未通过约束校验", gin.H{"raw": raw2, "validationErrors": valErrs2})
			return
		}
		response.Success(c, "OK", gin.H{"draftIncrement": draft2, "raw": raw2, "regenerated": true})
		return
	}
	response.Success(c, "OK", gin.H{"draftIncrement": draft, "raw": raw, "regenerated": false})
}

func (ch *CinyuHandlers) CommitStorylineIncrement(c *gin.Context) {
	id, err := parseIDParam(c, "id")
	if err != nil {
		response.Fail(c, "Invalid storyline id", nil)
		return
	}
	sl, err := models.GetStorylineByID(ch.db, id)
	if err != nil {
		response.Fail(c, "Storyline not found", nil)
		return
	}
	var req commitIncrementReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, err.Error(), nil)
		return
	}
	existNodes, _, err := models.ListStorylineNodes(ch.db, id, 1, 1000)
	if err != nil {
		response.Fail(c, "list existing nodes failed", nil)
		return
	}
	nodeSet := map[string]bool{}
	for _, n := range existNodes {
		nodeSet[n.NodeID] = true
	}
	for _, n := range req.Nodes {
		nodeSet[n.NodeID] = true
	}
	for _, e := range req.Edges {
		if !nodeSet[e.FromNodeID] || !nodeSet[e.ToNodeID] {
			response.FailWithCode(c, 422, "edge 引用了不存在的 nodeId", gin.H{"edgeId": e.EdgeID, "from": e.FromNodeID, "to": e.ToNodeID})
			return
		}
	}
	for i := range req.Nodes {
		req.Nodes[i].StorylineID = id
		req.Nodes[i].NovelID = sl.NovelID
		req.Nodes[i].Type = normalizeNodeType(req.Nodes[i].Type)
		req.Nodes[i].Props = ensureJSONPropsString(req.Nodes[i].Props)
		req.Nodes[i].SetCreateInfo("system")
		if err := models.CreateStorylineNode(ch.db, &req.Nodes[i]); err != nil {
			response.Fail(c, "create node failed: "+err.Error(), nil)
			return
		}
	}
	for i := range req.Edges {
		req.Edges[i].StorylineID = id
		req.Edges[i].NovelID = sl.NovelID
		req.Edges[i].Props = ensureJSONPropsString(req.Edges[i].Props)
		req.Edges[i].SetCreateInfo("system")
		if err := models.CreateStorylineEdge(ch.db, &req.Edges[i]); err != nil {
			response.Fail(c, "create edge failed: "+err.Error(), nil)
			return
		}
	}
	for i := range req.Facts {
		req.Facts[i].StorylineID = id
		req.Facts[i].NovelID = sl.NovelID
		req.Facts[i].Confidence = clampInt(req.Facts[i].Confidence, 0, 100)
		req.Facts[i].SetCreateInfo("system")
		if err := models.CreateStorylineFact(ch.db, &req.Facts[i]); err != nil {
			response.Fail(c, "create fact failed: "+err.Error(), nil)
			return
		}
	}
	nextCurrent := strings.TrimSpace(req.NextCurrentNodeID)
	if nextCurrent == "" {
		nextCurrent = pickIncrementCurrentNodeID(req.Nodes)
	}
	if nextCurrent != "" {
		sl.CurrentNodeID = nextCurrent
		sl.SetUpdateInfo("system")
		if err := models.UpdateStoryline(ch.db, sl); err != nil {
			response.Fail(c, "update storyline currentNodeId failed: "+err.Error(), nil)
			return
		}
	}
	response.Success(c, "Increment committed", gin.H{
		"storylineId":   id,
		"nodes":         len(req.Nodes),
		"edges":         len(req.Edges),
		"facts":         len(req.Facts),
		"currentNodeId": sl.CurrentNodeID,
	})
}

func buildStorylineAIPrompt(req generateStorylineAIReq) string {
	var b strings.Builder
	b.WriteString("用户需求：\n")
	b.WriteString(strings.TrimSpace(req.Message))
	b.WriteString("\n")
	if strings.TrimSpace(req.Feedback) != "" {
		b.WriteString("修改意见：\n")
		b.WriteString(strings.TrimSpace(req.Feedback))
		b.WriteString("\n")
	}
	if req.BaseDraft != nil {
		if raw, err := json.Marshal(req.BaseDraft); err == nil {
			b.WriteString("当前草稿：\n")
			b.Write(raw)
			b.WriteString("\n")
		}
	}
	if len(req.LockedFields) > 0 {
		b.WriteString("锁定字段：")
		b.WriteString(strings.Join(req.LockedFields, ","))
		b.WriteString("\n")
	}
	nl, el, fl := normalizeStorylineLimits(req)
	b.WriteString("输出规模约束：")
	b.WriteString("nodes<=" + strconv.Itoa(nl) + ", edges<=" + strconv.Itoa(el) + ", facts<=" + strconv.Itoa(fl))
	b.WriteString("\n")
	return b.String()
}

func buildStorylineAISystemPrompt(req generateStorylineAIReq) string {
	nl, el, fl := normalizeStorylineLimits(req)
	detail := normalizeDetailLevel(req.DetailLevel)
	propsRule := `props 请保持精简，仅包含 1-3 个关键键值。`
	if detail == "lite" {
		propsRule = `props 请尽量短小，每个节点/边 props 建议不超过 80 字。`
	}
	return strings.TrimSpace(`
你是小说故事线规划助手。只输出一个 JSON 对象，不要 markdown。
输出结构必须为：
{
  "storyline": { "novelId": number, "name": string, "version": number, "status": string, "theme": string, "promise": string, "forbidden": string, "description": string, "currentNodeId": string },
  "nodes": [{ "storylineId": number, "nodeId": string, "novelId": number, "type": string, "title": string, "summary": string, "status": string, "chapterNo": number, "volumeNo": number, "priority": number, "props": string }],
  "edges": [{ "storylineId": number, "edgeId": string, "novelId": number, "fromNodeId": string, "toNodeId": string, "relation": string, "weight": number, "status": string, "props": string }],
  "facts": [{ "storylineId": number, "novelId": number, "factKey": string, "factValue": string, "sourceNodeId": string, "validFromChap": number, "validToChap": number, "confidence": number }]
}
必须保证 nodes 与 edges 引用的 nodeId 可以互相对应。
输出规模约束：nodes <= ` + strconv.Itoa(nl) + `，edges <= ` + strconv.Itoa(el) + `，facts <= ` + strconv.Itoa(fl) + `。
detailLevel = ` + detail + `。
` + propsRule)
}

func normalizeDetailLevel(v string) string {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "full":
		return "full"
	case "standard":
		return "standard"
	default:
		return "lite"
	}
}

func normalizeStorylineLimits(req generateStorylineAIReq) (int, int, int) {
	level := normalizeDetailLevel(req.DetailLevel)
	nodeLimit, edgeLimit, factLimit := req.NodeLimit, req.EdgeLimit, req.FactLimit
	switch level {
	case "full":
		if nodeLimit <= 0 {
			nodeLimit = 14
		}
		if edgeLimit <= 0 {
			edgeLimit = 16
		}
		if factLimit <= 0 {
			factLimit = 8
		}
	case "standard":
		if nodeLimit <= 0 {
			nodeLimit = 10
		}
		if edgeLimit <= 0 {
			edgeLimit = 10
		}
		if factLimit <= 0 {
			factLimit = 6
		}
	default: // lite
		if nodeLimit <= 0 {
			nodeLimit = 6
		}
		if edgeLimit <= 0 {
			edgeLimit = 6
		}
		if factLimit <= 0 {
			factLimit = 3
		}
	}
	if nodeLimit > 20 {
		nodeLimit = 20
	}
	if edgeLimit > 24 {
		edgeLimit = 24
	}
	if factLimit > 12 {
		factLimit = 12
	}
	return nodeLimit, edgeLimit, factLimit
}

func defaultStorylineMaxTokens(detailLevel string) int {
	switch normalizeDetailLevel(detailLevel) {
	case "full":
		return 3200
	case "standard":
		return 2200
	default:
		return 1400
	}
}

func parseStorylineAIDraft(raw string) (aiStorylineGraphDraft, error) {
	var out aiStorylineGraphDraft
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return out, errors.New("empty response")
	}
	candidate := extractJSONObjectCandidate(raw)
	candidate = tryFixTruncatedJSON(candidate)
	if err := json.Unmarshal([]byte(candidate), &out); err == nil {
		return out, nil
	}

	// 兜底解析：兼容 confidence 为小数(0-1)等宽松类型
	type rawDraft struct {
		Storyline models.Storyline `json:"storyline"`
		Nodes     []map[string]any `json:"nodes"`
		Edges     []map[string]any `json:"edges"`
		Facts     []map[string]any `json:"facts"`
	}
	var rd rawDraft
	if err := json.Unmarshal([]byte(candidate), &rd); err != nil {
		return out, err
	}
	nodes := make([]models.StorylineNode, 0, len(rd.Nodes))
	for _, rn := range rd.Nodes {
		nodes = append(nodes, models.StorylineNode{
			StorylineID: uint(anyToInt64(rn["storylineId"])),
			NodeID:      anyToString(rn["nodeId"]),
			NovelID:     uint(anyToInt64(rn["novelId"])),
			Type:        anyToString(rn["type"]),
			Title:       anyToString(rn["title"]),
			Summary:     anyToString(rn["summary"]),
			Status:      anyToString(rn["status"]),
			ChapterNo:   int(anyToInt64(rn["chapterNo"])),
			VolumeNo:    int(anyToInt64(rn["volumeNo"])),
			Priority:    int(anyToInt64(rn["priority"])),
			Props:       anyToString(rn["props"]),
		})
	}
	edges := make([]models.StorylineEdge, 0, len(rd.Edges))
	for _, re := range rd.Edges {
		edges = append(edges, models.StorylineEdge{
			StorylineID: uint(anyToInt64(re["storylineId"])),
			EdgeID:      anyToString(re["edgeId"]),
			NovelID:     uint(anyToInt64(re["novelId"])),
			FromNodeID:  anyToString(re["fromNodeId"]),
			ToNodeID:    anyToString(re["toNodeId"]),
			Relation:    anyToString(re["relation"]),
			Weight:      int(anyToInt64(re["weight"])),
			Status:      anyToString(re["status"]),
			Props:       anyToString(re["props"]),
		})
	}
	facts := make([]models.StorylineFact, 0, len(rd.Facts))
	for _, rf := range rd.Facts {
		facts = append(facts, models.StorylineFact{
			StorylineID:   uint(anyToInt64(rf["storylineId"])),
			NovelID:       uint(anyToInt64(rf["novelId"])),
			FactKey:       anyToString(rf["factKey"]),
			FactValue:     anyToString(rf["factValue"]),
			SourceNodeID:  anyToString(rf["sourceNodeId"]),
			ValidFromChap: int(anyToInt64(rf["validFromChap"])),
			ValidToChap:   int(anyToInt64(rf["validToChap"])),
			Confidence:    normalizeConfidence(rf["confidence"]),
		})
	}
	return aiStorylineGraphDraft{
		Storyline: rd.Storyline,
		Nodes:     nodes,
		Edges:     edges,
		Facts:     facts,
	}, nil
}

func extractJSONObjectCandidate(raw string) string {
	s := strings.TrimSpace(raw)
	// 去掉 markdown fence
	s = strings.TrimPrefix(s, "```json")
	s = strings.TrimPrefix(s, "```JSON")
	s = strings.TrimPrefix(s, "```")
	s = strings.TrimSuffix(s, "```")
	s = strings.TrimSpace(s)
	// 优先提取首个对象块
	start := strings.Index(s, "{")
	if start < 0 {
		return s
	}
	brace := 0
	inStr := false
	esc := false
	end := -1
	for i := start; i < len(s); i++ {
		ch := s[i]
		if inStr {
			if esc {
				esc = false
				continue
			}
			if ch == '\\' {
				esc = true
			} else if ch == '"' {
				inStr = false
			}
			continue
		}
		if ch == '"' {
			inStr = true
			continue
		}
		if ch == '{' {
			brace++
		} else if ch == '}' {
			brace--
			if brace == 0 {
				end = i
				break
			}
		}
	}
	if end >= start {
		return strings.TrimSpace(s[start : end+1])
	}
	// 找不到完整结尾，返回从首个 { 起
	return strings.TrimSpace(s[start:])
}

func tryFixTruncatedJSON(s string) string {
	candidate := strings.TrimSpace(s)
	if candidate == "" {
		return candidate
	}
	if json.Valid([]byte(candidate)) {
		return candidate
	}
	// 尝试补齐缺失括号，常见于 LLM 截断
	objOpen, objClose := 0, 0
	arrOpen, arrClose := 0, 0
	inStr, esc := false, false
	for i := 0; i < len(candidate); i++ {
		ch := candidate[i]
		if inStr {
			if esc {
				esc = false
				continue
			}
			if ch == '\\' {
				esc = true
			} else if ch == '"' {
				inStr = false
			}
			continue
		}
		if ch == '"' {
			inStr = true
			continue
		}
		switch ch {
		case '{':
			objOpen++
		case '}':
			objClose++
		case '[':
			arrOpen++
		case ']':
			arrClose++
		}
	}
	if arrOpen > arrClose {
		candidate += strings.Repeat("]", arrOpen-arrClose)
	}
	if objOpen > objClose {
		candidate += strings.Repeat("}", objOpen-objClose)
	}
	return candidate
}

func applyLockedStorylineFields(draft *aiStorylineGraphDraft, base *aiStorylineGraphDraft, locked []string) {
	if draft == nil || base == nil || len(locked) == 0 {
		return
	}
	for _, f := range locked {
		switch strings.TrimSpace(f) {
		case "storyline":
			draft.Storyline = base.Storyline
		case "nodes":
			draft.Nodes = base.Nodes
		case "edges":
			draft.Edges = base.Edges
		case "facts":
			draft.Facts = base.Facts
		}
	}
}

func normalizeStorylineDraft(d *aiStorylineGraphDraft) {
	if d == nil {
		return
	}
	for i := range d.Nodes {
		d.Nodes[i].Type = normalizeNodeType(d.Nodes[i].Type)
		d.Nodes[i].Props = ensureJSONPropsString(d.Nodes[i].Props)
	}
	for i := range d.Edges {
		d.Edges[i].Props = ensureJSONPropsString(d.Edges[i].Props)
	}
}

func normalizeNodeType(t string) string {
	k := strings.ToLower(strings.TrimSpace(t))
	m := map[string]string{
		"event":             "event",
		"inciting_incident": "event",
		"inciting":          "event",
		"threshold":         "checkpoint",
		"trial":             "checkpoint",
		"awakening":         "checkpoint",
		"survival_trial":    "checkpoint",
		"training_arc":      "goal",
		"return":            "checkpoint",
		"twist":             "twist",
		"transformation":    "twist",
		"payoff":            "payoff",
		"climax":            "payoff",
		"culmination":       "payoff",
		"goal":              "goal",
		"checkpoint":        "checkpoint",
		"clue":              "clue",
	}
	if v, ok := m[k]; ok {
		return v
	}
	return "checkpoint"
}

func ensureJSONPropsString(raw string) string {
	s := strings.TrimSpace(raw)
	if s == "" {
		return "{}"
	}
	// 直接是 JSON 对象
	var obj map[string]any
	if json.Unmarshal([]byte(s), &obj) == nil {
		b, _ := json.Marshal(obj)
		return string(b)
	}
	// 非 JSON 对象文本，包成 {"text": "..."}
	b, _ := json.Marshal(map[string]any{"text": s})
	return string(b)
}

func validateStorylineDraft(d *aiStorylineGraphDraft) []string {
	errs := make([]string, 0)
	if d == nil {
		return []string{"draft is nil"}
	}
	allowed := map[string]bool{
		"event": true, "clue": true, "twist": true, "payoff": true, "goal": true, "checkpoint": true,
	}
	nodeSet := map[string]models.StorylineNode{}
	for _, n := range d.Nodes {
		if strings.TrimSpace(n.NodeID) == "" {
			errs = append(errs, "存在空 nodeId")
			continue
		}
		if !allowed[n.Type] {
			errs = append(errs, "节点类型不在固定枚举内: "+n.NodeID+"("+n.Type+")")
		}
		// props 已在 normalize 中做了对象包装，这里只做兜底确认
		var m map[string]any
		if json.Unmarshal([]byte(ensureJSONPropsString(n.Props)), &m) != nil {
			errs = append(errs, "节点 props 非法JSON对象: "+n.NodeID)
		}
		nodeSet[n.NodeID] = n
	}
	if len(nodeSet) == 0 {
		errs = append(errs, "nodes 为空")
		return errs
	}
	adjUndirected := map[string]map[string]bool{}
	adjDirected := map[string][]string{}
	inDeg := map[string]int{}
	outDeg := map[string]int{}
	for id := range nodeSet {
		adjUndirected[id] = map[string]bool{}
		adjDirected[id] = []string{}
	}
	for _, e := range d.Edges {
		if strings.TrimSpace(e.FromNodeID) == "" || strings.TrimSpace(e.ToNodeID) == "" {
			errs = append(errs, "存在空 from/to 的边: "+e.EdgeID)
			continue
		}
		if _, ok := nodeSet[e.FromNodeID]; !ok {
			errs = append(errs, "边引用不存在的起点节点: "+e.EdgeID+"->"+e.FromNodeID)
			continue
		}
		if _, ok := nodeSet[e.ToNodeID]; !ok {
			errs = append(errs, "边引用不存在的终点节点: "+e.EdgeID+"->"+e.ToNodeID)
			continue
		}
		adjUndirected[e.FromNodeID][e.ToNodeID] = true
		adjUndirected[e.ToNodeID][e.FromNodeID] = true
		adjDirected[e.FromNodeID] = append(adjDirected[e.FromNodeID], e.ToNodeID)
		outDeg[e.FromNodeID]++
		inDeg[e.ToNodeID]++
		var m map[string]any
		if json.Unmarshal([]byte(ensureJSONPropsString(e.Props)), &m) != nil {
			errs = append(errs, "边 props 非法JSON对象: "+e.EdgeID)
		}
	}
	// 节点度校验
	for id := range nodeSet {
		if inDeg[id]+outDeg[id] == 0 {
			errs = append(errs, "存在孤立主线节点: "+id)
		}
	}
	// 连通性校验（忽略 Fact；当前 nodes 已不含 Fact）
	first := ""
	for id := range nodeSet {
		first = id
		break
	}
	vis := map[string]bool{}
	queue := []string{first}
	vis[first] = true
	for len(queue) > 0 {
		cur := queue[0]
		queue = queue[1:]
		for nxt := range adjUndirected[cur] {
			if !vis[nxt] {
				vis[nxt] = true
				queue = append(queue, nxt)
			}
		}
	}
	if len(vis) != len(nodeSet) {
		errs = append(errs, fmt.Sprintf("主线节点非单一连通分量: connected=%d total=%d", len(vis), len(nodeSet)))
	}
	// 路径校验：event -> payoff 可达
	starts := make([]string, 0)
	ends := make([]string, 0)
	for id, n := range nodeSet {
		if n.Type == "event" {
			starts = append(starts, id)
		}
		if n.Type == "payoff" {
			ends = append(ends, id)
		}
	}
	if len(starts) == 0 {
		errs = append(errs, "缺少起点节点(event)")
	}
	if len(ends) == 0 {
		errs = append(errs, "缺少终点节点(payoff)")
	}
	if len(starts) > 0 && len(ends) > 0 {
		endSet := map[string]bool{}
		for _, e := range ends {
			endSet[e] = true
		}
		reach := false
		for _, s := range starts {
			q := []string{s}
			seen := map[string]bool{s: true}
			for len(q) > 0 {
				cur := q[0]
				q = q[1:]
				if endSet[cur] {
					reach = true
					break
				}
				for _, nxt := range adjDirected[cur] {
					if !seen[nxt] {
						seen[nxt] = true
						q = append(q, nxt)
					}
				}
			}
			if reach {
				break
			}
		}
		if !reach {
			errs = append(errs, "不存在从 event 到 payoff 的可达路径")
		}
	}
	return errs
}

func anyToInt64(v any) int64 {
	switch x := v.(type) {
	case nil:
		return 0
	case int:
		return int64(x)
	case int8:
		return int64(x)
	case int16:
		return int64(x)
	case int32:
		return int64(x)
	case int64:
		return x
	case uint:
		return int64(x)
	case uint8:
		return int64(x)
	case uint16:
		return int64(x)
	case uint32:
		return int64(x)
	case uint64:
		return int64(x)
	case float64:
		return int64(x)
	case float32:
		return int64(x)
	case string:
		n, err := strconv.ParseFloat(strings.TrimSpace(x), 64)
		if err != nil {
			return 0
		}
		return int64(n)
	default:
		return 0
	}
}

// normalizeConfidence 支持:
// - 0~1 的小数（如 0.98 -> 98）
// - 0~100 的整数/浮点（如 98 -> 98）
func normalizeConfidence(v any) int {
	switch x := v.(type) {
	case float64:
		if x <= 1 && x >= 0 {
			return int(math.Round(x * 100))
		}
		return clampInt(int(math.Round(x)), 0, 100)
	case float32:
		f := float64(x)
		if f <= 1 && f >= 0 {
			return int(math.Round(f * 100))
		}
		return clampInt(int(math.Round(f)), 0, 100)
	case int:
		return clampInt(x, 0, 100)
	case int64:
		return clampInt(int(x), 0, 100)
	case string:
		s := strings.TrimSpace(x)
		if s == "" {
			return 100
		}
		f, err := strconv.ParseFloat(s, 64)
		if err != nil {
			return 100
		}
		if f <= 1 && f >= 0 {
			return int(math.Round(f * 100))
		}
		return clampInt(int(math.Round(f)), 0, 100)
	default:
		return 100
	}
}

func clampInt(v, min, max int) int {
	if v < min {
		return min
	}
	if v > max {
		return max
	}
	return v
}

func parsePropsObject(raw string) map[string]any {
	out := map[string]any{}
	s := strings.TrimSpace(raw)
	if s == "" {
		return out
	}
	_ = json.Unmarshal([]byte(s), &out)
	return out
}

func buildAdvanceStorylineSystemPrompt(stepNodes int) string {
	return strings.TrimSpace(`
你是故事线增量推进助手。只输出一个 JSON 对象，不要 markdown。
仅输出增量，不要重复历史节点。
输出结构：
{
  "nodes": [{ "nodeId": string, "type": string, "title": string, "summary": string, "status": string, "chapterNo": number, "volumeNo": number, "priority": number, "props": string }],
  "edges": [{ "edgeId": string, "fromNodeId": string, "toNodeId": string, "relation": string, "weight": number, "status": string, "props": string }],
  "facts": [{ "factKey": string, "factValue": string, "sourceNodeId": string, "validFromChap": number, "validToChap": number, "confidence": number }]
}
约束：
1) nodes 数量 <= ` + strconv.Itoa(stepNodes) + `
2) nodes.type 必须在 event/clue/twist/payoff/goal/checkpoint
3) props 必须是 JSON 对象字符串
4) 必须围绕 currentNodeId 向 targetAnchorId 推进，保证可连接
`)
}

func isStrictMainline(req advanceStorylineReq) bool {
	if req.StrictMainline == nil {
		return true
	}
	return *req.StrictMainline
}

func buildAdvanceStorylinePrompt(
	sl *models.Storyline,
	nodes []*models.StorylineNode,
	edges []*models.StorylineEdge,
	facts []*models.StorylineFact,
	req advanceStorylineReq,
	stepNodes int,
) string {
	type miniNode struct {
		NodeID    string `json:"nodeId"`
		Type      string `json:"type"`
		Title     string `json:"title"`
		ChapterNo int    `json:"chapterNo"`
	}
	type miniEdge struct {
		FromNodeID string `json:"fromNodeId"`
		ToNodeID   string `json:"toNodeId"`
		Relation   string `json:"relation"`
	}
	nmini := make([]miniNode, 0, len(nodes))
	for _, n := range nodes {
		nmini = append(nmini, miniNode{NodeID: n.NodeID, Type: normalizeNodeType(n.Type), Title: n.Title, ChapterNo: n.ChapterNo})
	}
	emini := make([]miniEdge, 0, len(edges))
	for _, e := range edges {
		emini = append(emini, miniEdge{FromNodeID: e.FromNodeID, ToNodeID: e.ToNodeID, Relation: e.Relation})
	}
	existing := map[string]any{
		"storyline": gin.H{
			"id":            sl.ID,
			"novelId":       sl.NovelID,
			"name":          sl.Name,
			"theme":         sl.Theme,
			"currentNodeId": sl.CurrentNodeID,
		},
		"nodes":      nmini,
		"edges":      emini,
		"factsCount": len(facts),
	}
	raw, _ := json.Marshal(existing)
	var b strings.Builder
	b.WriteString("当前故事线上下文：\n")
	b.Write(raw)
	b.WriteString("\n\n生成目标：\n")
	b.WriteString("- currentNodeId: " + req.CurrentNodeID + "\n")
	if strings.TrimSpace(req.TargetAnchorID) != "" {
		b.WriteString("- targetAnchorId: " + req.TargetAnchorID + "\n")
	}
	b.WriteString("- stepNodes: " + strconv.Itoa(stepNodes) + "\n")
	if len(req.UnresolvedBranchNodeIDs) > 0 {
		b.WriteString("- unresolvedBranchNodeIds: " + strings.Join(req.UnresolvedBranchNodeIDs, ",") + "\n")
	}
	if req.BranchBudget != nil {
		b.WriteString("- branchBudget.maxNewNodesPerBranch: " + strconv.Itoa(req.BranchBudget.MaxNewNodesPerBranch) + "\n")
		b.WriteString("- branchBudget.maxChapterSpan: " + strconv.Itoa(req.BranchBudget.MaxChapterSpan) + "\n")
	}
	if strings.TrimSpace(req.Feedback) != "" {
		b.WriteString("用户补充意见：\n")
		b.WriteString(strings.TrimSpace(req.Feedback))
		b.WriteString("\n")
	}
	if isStrictMainline(req) {
		b.WriteString("推进模式：strictMainline=true（必须保证 currentNodeId 向 targetAnchorId 的可达主线推进）\n")
		minHops := req.MinProgressHops
		if minHops <= 0 {
			minHops = 1
		}
		b.WriteString("推进强度：minProgressHops=" + strconv.Itoa(minHops) + "（要求距离目标锚点的最短路径至少缩短该步数）\n")
	} else {
		b.WriteString("推进模式：strictMainline=false（允许探索支线，但必须连接现有图）\n")
	}
	return b.String()
}

func runIncrementGenerationOnce(
	h interface {
		QueryWithOptions(prompt string, options *llm.QueryOptions) (*llm.QueryResponse, error)
	},
	prompt string,
	qopts *llm.QueryOptions,
	storylineID uint,
	novelID uint,
) (string, storylineIncrementDraft, error) {
	var empty storylineIncrementDraft
	qresp, err := h.QueryWithOptions(prompt, qopts)
	if err != nil {
		return "", empty, errors.New("LLM request failed: " + err.Error())
	}
	if qresp == nil || len(qresp.Choices) == 0 {
		return "", empty, errors.New("empty completion choices")
	}
	raw := strings.TrimSpace(qresp.Choices[0].Content)
	candidate := extractJSONObjectCandidate(raw)
	candidate = tryFixTruncatedJSON(candidate)
	var m map[string]any
	if err := json.Unmarshal([]byte(candidate), &m); err != nil {
		return raw, empty, errors.New("AI输出不是合法故事线JSON: " + err.Error())
	}
	nodesRaw, _ := m["nodes"].([]any)
	edgesRaw, _ := m["edges"].([]any)
	factsRaw, _ := m["facts"].([]any)
	out := storylineIncrementDraft{
		Nodes: make([]models.StorylineNode, 0, len(nodesRaw)),
		Edges: make([]models.StorylineEdge, 0, len(edgesRaw)),
		Facts: make([]models.StorylineFact, 0, len(factsRaw)),
	}
	for _, it := range nodesRaw {
		obj, ok := it.(map[string]any)
		if !ok {
			continue
		}
		out.Nodes = append(out.Nodes, models.StorylineNode{
			StorylineID: storylineID,
			NovelID:     novelID,
			NodeID:      anyToString(obj["nodeId"]),
			Type:        normalizeNodeType(anyToString(obj["type"])),
			Title:       anyToString(obj["title"]),
			Summary:     anyToString(obj["summary"]),
			Status:      anyToString(obj["status"]),
			ChapterNo:   int(anyToInt64(obj["chapterNo"])),
			VolumeNo:    int(anyToInt64(obj["volumeNo"])),
			Priority:    int(anyToInt64(obj["priority"])),
			Props:       ensureJSONPropsString(anyToString(obj["props"])),
		})
	}
	for _, it := range edgesRaw {
		obj, ok := it.(map[string]any)
		if !ok {
			continue
		}
		out.Edges = append(out.Edges, models.StorylineEdge{
			StorylineID: storylineID,
			NovelID:     novelID,
			EdgeID:      anyToString(obj["edgeId"]),
			FromNodeID:  anyToString(obj["fromNodeId"]),
			ToNodeID:    anyToString(obj["toNodeId"]),
			Relation:    anyToString(obj["relation"]),
			Weight:      int(anyToInt64(obj["weight"])),
			Status:      anyToString(obj["status"]),
			Props:       ensureJSONPropsString(anyToString(obj["props"])),
		})
	}
	for _, it := range factsRaw {
		obj, ok := it.(map[string]any)
		if !ok {
			continue
		}
		out.Facts = append(out.Facts, models.StorylineFact{
			StorylineID:   storylineID,
			NovelID:       novelID,
			FactKey:       anyToString(obj["factKey"]),
			FactValue:     anyToString(obj["factValue"]),
			SourceNodeID:  anyToString(obj["sourceNodeId"]),
			ValidFromChap: int(anyToInt64(obj["validFromChap"])),
			ValidToChap:   int(anyToInt64(obj["validToChap"])),
			Confidence:    normalizeConfidence(obj["confidence"]),
		})
	}
	return raw, out, nil
}

func validateIncrementAnchored(
	inc storylineIncrementDraft,
	req advanceStorylineReq,
	existingNodes []*models.StorylineNode,
	existingEdges []*models.StorylineEdge,
) []string {
	errs := make([]string, 0)
	strictMainline := isStrictMainline(req)
	if len(inc.Nodes) == 0 {
		return []string{"增量 nodes 为空"}
	}
	allowed := map[string]bool{req.CurrentNodeID: true}
	if strings.TrimSpace(req.TargetAnchorID) != "" {
		allowed[req.TargetAnchorID] = true
	}
	for _, b := range req.UnresolvedBranchNodeIDs {
		if strings.TrimSpace(b) != "" {
			allowed[b] = true
		}
	}
	existSet := map[string]bool{}
	for _, n := range existingNodes {
		existSet[n.NodeID] = true
	}
	newSet := map[string]bool{}
	for _, n := range inc.Nodes {
		if strings.TrimSpace(n.NodeID) == "" {
			errs = append(errs, "存在空 nodeId")
			continue
		}
		newSet[n.NodeID] = true
	}
	// 节点数量约束
	stepNodes := req.StepNodes
	if stepNodes <= 0 {
		stepNodes = 3
	}
	if len(inc.Nodes) > stepNodes {
		errs = append(errs, "增量节点数超过 stepNodes 限制")
	}
	// 支线预算约束（简单版）
	if req.BranchBudget != nil && req.BranchBudget.MaxNewNodesPerBranch > 0 && len(inc.Nodes) > req.BranchBudget.MaxNewNodesPerBranch {
		errs = append(errs, "增量节点数超过 branchBudget.maxNewNodesPerBranch")
	}
	// 边引用合法 + 锚点连接约束
	anchorConnected := false
	validIncEdgeCount := 0
	for _, e := range inc.Edges {
		if strings.TrimSpace(e.FromNodeID) == "" || strings.TrimSpace(e.ToNodeID) == "" {
			errs = append(errs, "边 fromNodeId/toNodeId 不能为空: "+e.EdgeID)
			continue
		}
		fromOK := existSet[e.FromNodeID] || newSet[e.FromNodeID]
		toOK := existSet[e.ToNodeID] || newSet[e.ToNodeID]
		if !fromOK || !toOK {
			errs = append(errs, "边引用不存在节点: "+e.EdgeID)
			continue
		}
		validIncEdgeCount++
		if allowed[e.FromNodeID] || allowed[e.ToNodeID] {
			anchorConnected = true
		}
	}
	if validIncEdgeCount == 0 {
		errs = append(errs, "增量 edges 为空或全部非法，无法形成推进链路")
	}
	if !anchorConnected {
		errs = append(errs, "增量未与 currentNodeId/targetAnchorId/未回收支线建立连接")
	}
	if !existSet[req.CurrentNodeID] && !newSet[req.CurrentNodeID] {
		errs = append(errs, "currentNodeId 不存在于当前故事线")
	}
	if strings.TrimSpace(req.TargetAnchorID) != "" && !existSet[req.TargetAnchorID] && !newSet[req.TargetAnchorID] {
		errs = append(errs, "targetAnchorId 不存在于当前故事线")
	}
	// 主线可达性：若给定 targetAnchorId，要求在“历史+增量”有向图中 current -> target 可达
	if strictMainline && strings.TrimSpace(req.TargetAnchorID) != "" && (existSet[req.CurrentNodeID] || newSet[req.CurrentNodeID]) && (existSet[req.TargetAnchorID] || newSet[req.TargetAnchorID]) {
		minProgressHops := req.MinProgressHops
		if minProgressHops <= 0 {
			minProgressHops = 1
		}
		allEdges := make([]*models.StorylineEdge, 0, len(existingEdges)+len(inc.Edges))
		allEdges = append(allEdges, existingEdges...)
		for i := range inc.Edges {
			e := inc.Edges[i]
			allEdges = append(allEdges, &e)
		}
		if !hasDirectedPath(req.CurrentNodeID, req.TargetAnchorID, allEdges) {
			errs = append(errs, "未形成 currentNodeId -> targetAnchorId 的有向可达路径")
		} else {
			beforeDist, beforeOK := shortestDirectedPathHops(req.CurrentNodeID, req.TargetAnchorID, existingEdges)
			afterDist, afterOK := shortestDirectedPathHops(req.CurrentNodeID, req.TargetAnchorID, allEdges)
			if !afterOK {
				errs = append(errs, "增量后仍无法计算到目标锚点的最短路径")
			} else if beforeOK {
				if beforeDist-afterDist < minProgressHops {
					errs = append(errs, fmt.Sprintf("主线推进不足: 目标最短路径仅缩短 %d 步，要求至少缩短 %d 步", beforeDist-afterDist, minProgressHops))
				}
			}
		}
	}
	// 章节跨度约束
	if req.BranchBudget != nil && req.BranchBudget.MaxChapterSpan > 0 {
		minChap, maxChap := 1<<30, -1
		for _, n := range inc.Nodes {
			if n.ChapterNo > 0 {
				if n.ChapterNo < minChap {
					minChap = n.ChapterNo
				}
				if n.ChapterNo > maxChap {
					maxChap = n.ChapterNo
				}
			}
		}
		if maxChap >= minChap && (maxChap-minChap) > req.BranchBudget.MaxChapterSpan {
			errs = append(errs, "增量章节跨度超过 branchBudget.maxChapterSpan")
		}
	}
	return errs
}

func pickIncrementCurrentNodeID(nodes []models.StorylineNode) string {
	if len(nodes) == 0 {
		return ""
	}
	best := nodes[0]
	for i := 1; i < len(nodes); i++ {
		n := nodes[i]
		if n.ChapterNo > best.ChapterNo {
			best = n
			continue
		}
		if n.ChapterNo == best.ChapterNo && n.Priority > best.Priority {
			best = n
			continue
		}
		if n.ChapterNo == best.ChapterNo && n.Priority == best.Priority && n.VolumeNo > best.VolumeNo {
			best = n
		}
	}
	return strings.TrimSpace(best.NodeID)
}

func hasDirectedPath(fromID, toID string, edges []*models.StorylineEdge) bool {
	fromID = strings.TrimSpace(fromID)
	toID = strings.TrimSpace(toID)
	if fromID == "" || toID == "" {
		return false
	}
	if fromID == toID {
		return true
	}
	adj := make(map[string][]string)
	for _, e := range edges {
		if e == nil {
			continue
		}
		f := strings.TrimSpace(e.FromNodeID)
		t := strings.TrimSpace(e.ToNodeID)
		if f == "" || t == "" {
			continue
		}
		adj[f] = append(adj[f], t)
	}
	queue := []string{fromID}
	visited := map[string]bool{fromID: true}
	for len(queue) > 0 {
		cur := queue[0]
		queue = queue[1:]
		for _, nxt := range adj[cur] {
			if nxt == toID {
				return true
			}
			if !visited[nxt] {
				visited[nxt] = true
				queue = append(queue, nxt)
			}
		}
	}
	return false
}

func shortestDirectedPathHops(fromID, toID string, edges []*models.StorylineEdge) (int, bool) {
	fromID = strings.TrimSpace(fromID)
	toID = strings.TrimSpace(toID)
	if fromID == "" || toID == "" {
		return 0, false
	}
	if fromID == toID {
		return 0, true
	}
	adj := make(map[string][]string)
	for _, e := range edges {
		if e == nil {
			continue
		}
		f := strings.TrimSpace(e.FromNodeID)
		t := strings.TrimSpace(e.ToNodeID)
		if f == "" || t == "" {
			continue
		}
		adj[f] = append(adj[f], t)
	}
	type qn struct {
		id   string
		dist int
	}
	queue := []qn{{id: fromID, dist: 0}}
	visited := map[string]bool{fromID: true}
	for len(queue) > 0 {
		cur := queue[0]
		queue = queue[1:]
		for _, nxt := range adj[cur.id] {
			if nxt == toID {
				return cur.dist + 1, true
			}
			if !visited[nxt] {
				visited[nxt] = true
				queue = append(queue, qn{id: nxt, dist: cur.dist + 1})
			}
		}
	}
	return 0, false
}
