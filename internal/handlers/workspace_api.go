// Copyright (c) 2026 LingByte. All rights reserved.
// SPDX-License-Identifier: AGPL-3.0

package handlers

import (
	"net/http"

	"github.com/LingByte/CinyuVerse/internal/service/workspace"
	"github.com/gin-gonic/gin"
)

// ── Workspace Routes ───────────────────────────────────────────────

func (ch *CinyuHandlers) registerWorkspaceRoutes(r *gin.RouterGroup) {
	ws := r.Group("/workspace")
	{
		ws.POST("", ch.CreateWorkspaceAPI)
		ws.GET("/list", ch.ListWorkspacesAPI)
		ws.GET("/:id", ch.GetWorkspaceAPI)
		ws.PUT("/:id", ch.UpdateWorkspaceAPI)
		ws.DELETE("/:id", ch.DeleteWorkspaceAPI)

		// 分卷
		ws.POST("/:id/volumes", ch.NewVolumeAPI)

		// 章节
		ws.POST("/:id/volumes/:volId/chapters", ch.NewChapterAPI)
		ws.GET("/:id/volumes/:volId/chapters/:chId", ch.GetChapterContentAPI)
		ws.PUT("/:id/volumes/:volId/chapters/:chId", ch.SaveChapterContentAPI)

		// 统计
		ws.GET("/:id/wordcount", ch.GetWordCountAPI)
	}
}

// ── Request/Response ───────────────────────────────────────────────

type createWorkspaceReq struct {
	BookName  string `json:"book_name" binding:"required"`
	Type      string `json:"type"`
	WorldView string `json:"world_view"`
	Character string `json:"character"`
	Outline   string `json:"outline"`
	Style     string `json:"style"`
}

type updateWorkspaceReq struct {
	BookName  string `json:"book_name"`
	Type      string `json:"type"`
	WorldView string `json:"world_view"`
	Character string `json:"character"`
	Outline   string `json:"outline"`
	Style     string `json:"style"`
}

type newVolumeReq struct {
	Title string `json:"title" binding:"required"`
}

type newChapterReq struct {
	Title string `json:"title" binding:"required"`
}

type saveChapterReq struct {
	Content string `json:"content" binding:"required"`
}

// ── Handlers ───────────────────────────────────────────────────────

// CreateWorkspaceAPI POST /api/workspace
func (ch *CinyuHandlers) CreateWorkspaceAPI(c *gin.Context) {
	var req createWorkspaceReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ws := workspace.Workspace{
		BookName:  req.BookName,
		Type:      req.Type,
		WorldView: req.WorldView,
		Character: req.Character,
		Outline:   req.Outline,
		Style:     req.Style,
	}
	result, err := workspace.GetService().CreateWorkspace(ws)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": result})
}

// ListWorkspacesAPI GET /api/workspace/list
func (ch *CinyuHandlers) ListWorkspacesAPI(c *gin.Context) {
	list, err := workspace.GetService().ListWorkspaces()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if list == nil {
		list = []workspace.Workspace{}
	}
	c.JSON(http.StatusOK, gin.H{"data": list})
}

// GetWorkspaceAPI GET /api/workspace/:id
func (ch *CinyuHandlers) GetWorkspaceAPI(c *gin.Context) {
	id := c.Param("id")
	ws, err := workspace.GetService().GetWorkspace(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": ws})
}

// UpdateWorkspaceAPI PUT /api/workspace/:id
func (ch *CinyuHandlers) UpdateWorkspaceAPI(c *gin.Context) {
	id := c.Param("id")
	var req updateWorkspaceReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	result, err := workspace.GetService().UpdateWorkspaceMeta(id, workspace.Workspace{
		BookName:  req.BookName,
		Type:      req.Type,
		WorldView: req.WorldView,
		Character: req.Character,
		Outline:   req.Outline,
		Style:     req.Style,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": result})
}

// DeleteWorkspaceAPI DELETE /api/workspace/:id
func (ch *CinyuHandlers) DeleteWorkspaceAPI(c *gin.Context) {
	id := c.Param("id")
	if err := workspace.GetService().DeleteWorkspace(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

// NewVolumeAPI POST /api/workspace/:id/volumes
func (ch *CinyuHandlers) NewVolumeAPI(c *gin.Context) {
	id := c.Param("id")
	var req newVolumeReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	vol, err := workspace.GetService().NewVolume(id, req.Title)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": vol})
}

// NewChapterAPI POST /api/workspace/:id/volumes/:volId/chapters
func (ch *CinyuHandlers) NewChapterAPI(c *gin.Context) {
	wsID := c.Param("id")
	volID := c.Param("volId")
	var req newChapterReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	chapter, err := workspace.GetService().NewChapter(wsID, volID, req.Title)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": chapter})
}

// GetChapterContentAPI GET /api/workspace/:id/volumes/:volId/chapters/:chId
func (ch *CinyuHandlers) GetChapterContentAPI(c *gin.Context) {
	wsID := c.Param("id")
	volID := c.Param("volId")
	chID := c.Param("chId")
	content, err := workspace.GetService().GetChapterContent(wsID, volID, chID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{
		"content": content,
	}})
}

// SaveChapterContentAPI PUT /api/workspace/:id/volumes/:volId/chapters/:chId
func (ch *CinyuHandlers) SaveChapterContentAPI(c *gin.Context) {
	wsID := c.Param("id")
	volID := c.Param("volId")
	chID := c.Param("chId")
	var req saveChapterReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := workspace.GetService().SaveChapterContent(wsID, volID, chID, req.Content); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "saved"})
}

// GetWordCountAPI GET /api/workspace/:id/wordcount
func (ch *CinyuHandlers) GetWordCountAPI(c *gin.Context) {
	id := c.Param("id")
	total, err := workspace.GetService().CalcWordCount(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{
		"total_words": total,
	}})
}
