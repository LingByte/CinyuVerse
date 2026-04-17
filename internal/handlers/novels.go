package handlers

import (
	"strconv"

	"github.com/LingByte/CinyuVerse/internal/models"
	"github.com/LingByte/lingoroutine/response"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// Copyright (c) 2026 LingByte
// SPDX-License-Identifier: MIT

// CreateNovelRequest 创建小说请求结构
type CreateNovelRequest struct {
	Title          string `json:"title" binding:"required"`
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

// UpdateNovelRequest 更新小说请求结构
type UpdateNovelRequest struct {
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

// NovelResponse 小说响应结构
type NovelResponse struct {
	ID             uint   `json:"id"`
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
	CreatedAt      string `json:"createdAt"`
	UpdatedAt      string `json:"updatedAt"`
	CreateBy       string `json:"createBy"`
	UpdateBy       string `json:"updateBy"`
}

// PaginatedNovelResponse 分页小说响应结构
type PaginatedNovelResponse struct {
	Novels []*NovelResponse `json:"novels"`
	Total  int64            `json:"total"`
	Page   int              `json:"page"`
	Size   int              `json:"size"`
}

func (ch *CinyuHandlers) registerNovelRoutes(r *gin.RouterGroup) {
	novels := r.Group("/novels")
	{
		novels.POST("", ch.CreateNovel)                     // 创建小说
		novels.GET("", ch.GetAllNovels)                     // 获取所有小说（分页）
		novels.GET("/search", ch.SearchNovels)              // 搜索小说
		novels.POST("/generate", ch.GenerateNovelByAI)      // AI 生成小说 JSON 草稿
		novels.POST("/cover/upload", ch.UploadNovelCover)   // 上传小说封面
		novels.GET("/:id", ch.GetNovel)                     // 获取单个小说
		novels.PUT("/:id", ch.UpdateNovel)                  // 更新小说
		novels.DELETE("/:id", ch.DeleteNovel)               // 删除小说
		novels.POST("/:id/restore", ch.RestoreNovel)        // 恢复小说
		novels.GET("/genre/:genre", ch.GetNovelsByGenre)    // 根据类型获取小说
		novels.GET("/status/:status", ch.GetNovelsByStatus) // 根据状态获取小说
	}
}

// CreateNovel 创建小说
func (ch *CinyuHandlers) CreateNovel(c *gin.Context) {
	var req CreateNovelRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, err.Error(), nil)
		return
	}

	novel := &models.Novel{
		Title:          req.Title,
		Status:         req.Status,
		Genre:          req.Genre,
		Audience:       req.Audience,
		Theme:          req.Theme,
		Description:    req.Description,
		WorldSetting:   req.WorldSetting,
		Tags:           req.Tags,
		CoverImage:     req.CoverImage,
		StyleGuide:     req.StyleGuide,
		ReferenceNovel: req.ReferenceNovel,
	}

	// 设置创建信息
	novel.SetCreateInfo("system") // 可以从JWT token中获取用户信息

	if err := models.CreateNovel(ch.db, novel); err != nil {
		response.Fail(c, "Failed to create novel", nil)
		return
	}

	response.Success(c, "Novel created successfully", novelToResponse(novel))
}

// GetNovel 获取单个小说
func (ch *CinyuHandlers) GetNovel(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		response.Fail(c, "Invalid novel ID", nil)
		return
	}

	novel, err := models.GetNovelByID(ch.db, uint(id))
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			response.FailWithCode(c, 404, "Novel not found", nil)
			return
		}
		response.Fail(c, "Failed to get novel", nil)
		return
	}

	response.Success(c, "Novel retrieved successfully", novelToResponse(novel))
}

// UpdateNovel 更新小说
func (ch *CinyuHandlers) UpdateNovel(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		response.Fail(c, "Invalid novel ID", nil)
		return
	}

	var req UpdateNovelRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, err.Error(), nil)
		return
	}

	novel, err := models.GetNovelByID(ch.db, uint(id))
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			response.FailWithCode(c, 404, "Novel not found", nil)
			return
		}
		response.Fail(c, "Failed to get novel", nil)
		return
	}

	// 更新字段
	if req.Title != "" {
		novel.Title = req.Title
	}
	if req.Status != "" {
		novel.Status = req.Status
	}
	if req.Genre != "" {
		novel.Genre = req.Genre
	}
	if req.Audience != "" {
		novel.Audience = req.Audience
	}
	if req.Theme != "" {
		novel.Theme = req.Theme
	}
	if req.Description != "" {
		novel.Description = req.Description
	}
	if req.WorldSetting != "" {
		novel.WorldSetting = req.WorldSetting
	}
	if req.Tags != "" {
		novel.Tags = req.Tags
	}
	if req.CoverImage != "" {
		novel.CoverImage = req.CoverImage
	}
	if req.StyleGuide != "" {
		novel.StyleGuide = req.StyleGuide
	}
	if req.ReferenceNovel != "" {
		novel.ReferenceNovel = req.ReferenceNovel
	}

	// 设置更新信息
	novel.SetUpdateInfo("system") // 可以从JWT token中获取用户信息

	if err := models.UpdateNovel(ch.db, novel); err != nil {
		response.Fail(c, "Failed to update novel", nil)
		return
	}

	response.Success(c, "Novel updated successfully", novelToResponse(novel))
}

// DeleteNovel 删除小说
func (ch *CinyuHandlers) DeleteNovel(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		response.Fail(c, "Invalid novel ID", nil)
		return
	}

	if err := models.DeleteNovel(ch.db, uint(id), "system"); err != nil {
		response.Fail(c, "Failed to delete novel", nil)
		return
	}

	response.Success(c, "Novel deleted successfully", nil)
}

// GetNovelsByGenre 根据类型获取小说列表
func (ch *CinyuHandlers) GetNovelsByGenre(c *gin.Context) {
	genre := c.Param("genre")

	novels, err := models.GetNovelsByGenre(ch.db, genre)
	if err != nil {
		response.Fail(c, "Failed to get novels by genre", nil)
		return
	}

	responses := make([]*NovelResponse, len(novels))
	for i, novel := range novels {
		responses[i] = novelToResponse(novel)
	}

	response.Success(c, "Novels retrieved successfully", responses)
}

// GetNovelsByStatus 根据状态获取小说列表
func (ch *CinyuHandlers) GetNovelsByStatus(c *gin.Context) {
	status := c.Param("status")

	novels, err := models.GetNovelsByStatus(ch.db, status)
	if err != nil {
		response.Fail(c, "Failed to get novels by status", nil)
		return
	}

	responses := make([]*NovelResponse, len(novels))
	for i, novel := range novels {
		responses[i] = novelToResponse(novel)
	}

	response.Success(c, "Novels retrieved successfully", responses)
}

// GetAllNovels 获取所有小说（分页）
func (ch *CinyuHandlers) GetAllNovels(c *gin.Context) {
	pageStr := c.DefaultQuery("page", "1")
	sizeStr := c.DefaultQuery("size", "10")

	page, err := strconv.Atoi(pageStr)
	if err != nil || page < 1 {
		page = 1
	}

	size, err := strconv.Atoi(sizeStr)
	if err != nil || size < 1 || size > 100 {
		size = 10
	}

	novels, total, err := models.GetAllNovels(ch.db, page, size)
	if err != nil {
		response.Fail(c, "Failed to get novels", nil)
		return
	}

	responses := make([]*NovelResponse, len(novels))
	for i, novel := range novels {
		responses[i] = novelToResponse(novel)
	}

	response.Success(c, "Novels retrieved successfully", PaginatedNovelResponse{
		Novels: responses,
		Total:  total,
		Page:   page,
		Size:   size,
	})
}

// SearchNovels 搜索小说
func (ch *CinyuHandlers) SearchNovels(c *gin.Context) {
	keyword := c.Query("keyword")
	if keyword == "" {
		response.Fail(c, "Keyword is required", nil)
		return
	}
	pageStr := c.DefaultQuery("page", "1")
	sizeStr := c.DefaultQuery("size", "10")
	page, err := strconv.Atoi(pageStr)
	if err != nil || page < 1 {
		page = 1
	}
	size, err := strconv.Atoi(sizeStr)
	if err != nil || size < 1 || size > 100 {
		size = 10
	}
	novels, total, err := models.SearchNovels(ch.db, keyword, page, size)
	if err != nil {
		response.Fail(c, "Failed to search novels", nil)
		return
	}
	responses := make([]*NovelResponse, len(novels))
	for i, novel := range novels {
		responses[i] = novelToResponse(novel)
	}
	response.Success(c, "Novels searched successfully", PaginatedNovelResponse{
		Novels: responses,
		Total:  total,
		Page:   page,
		Size:   size,
	})
}

// RestoreNovel 恢复已删除的小说
func (ch *CinyuHandlers) RestoreNovel(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		response.Fail(c, "Invalid novel ID", nil)
		return
	}

	if err := models.RestoreNovel(ch.db, uint(id), "system"); err != nil {
		response.Fail(c, "Failed to restore novel", nil)
		return
	}

	response.Success(c, "Novel restored successfully", nil)
}

// novelToResponse 将Novel模型转换为响应结构
func novelToResponse(novel *models.Novel) *NovelResponse {
	return &NovelResponse{
		ID:             novel.ID,
		Title:          novel.Title,
		Status:         novel.Status,
		Genre:          novel.Genre,
		Audience:       novel.Audience,
		Theme:          novel.Theme,
		Description:    novel.Description,
		WorldSetting:   novel.WorldSetting,
		Tags:           novel.Tags,
		CoverImage:     novel.CoverImage,
		StyleGuide:     novel.StyleGuide,
		ReferenceNovel: novel.ReferenceNovel,
		CreatedAt:      novel.GetCreatedAtString(),
		UpdatedAt:      novel.GetUpdatedAtString(),
		CreateBy:       novel.CreateBy,
		UpdateBy:       novel.UpdateBy,
	}
}
