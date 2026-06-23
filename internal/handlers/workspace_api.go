// Copyright (c) 2026 LingByte. All rights reserved.
// SPDX-License-Identifier: AGPL-3.0

package handlers

import (
	"net/http"
	"strconv"

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
		ws.DELETE("/:id/volumes/:volId", ch.DeleteVolumeAPI)

		// 章节
		ws.POST("/:id/volumes/:volId/chapters", ch.NewChapterAPI)
		ws.GET("/:id/volumes/:volId/chapters/:chId", ch.GetChapterContentAPI)
		ws.PUT("/:id/volumes/:volId/chapters/:chId", ch.SaveChapterContentAPI)
		ws.DELETE("/:id/volumes/:volId/chapters/:chId", ch.DeleteChapterAPI)

		// 章节快照
		ws.GET("/:id/volumes/:volId/chapters/:chId/snapshots", ch.ListChapterSnapshotsAPI)
		ws.GET("/:id/volumes/:volId/chapters/:chId/snapshots/:snapId", ch.GetChapterSnapshotAPI)
		ws.POST("/:id/volumes/:volId/chapters/:chId/snapshots/:snapId/restore", ch.RestoreChapterSnapshotAPI)

		// 人物 / 词条
		ws.GET("/:id/characters", ch.GetCharactersAPI)
		ws.PUT("/:id/characters", ch.SaveCharactersAPI)
		ws.GET("/:id/glossary", ch.GetGlossaryAPI)
		ws.PUT("/:id/glossary", ch.SaveGlossaryAPI)

		// 回收站
		ws.GET("/:id/trash", ch.ListTrashAPI)
		ws.POST("/:id/trash/:trashId/restore", ch.RestoreTrashAPI)

		// 统计
		ws.GET("/:id/wordcount", ch.GetWordCountAPI)
		ws.GET("/:id/stats", ch.GetWordStatsAPI)

		// 大纲
		ws.GET("/:id/outline", ch.GetOutlineAPI)
		ws.PUT("/:id/outline", ch.SaveOutlineAPI)
		ws.POST("/:id/outline/import-md", ch.ImportOutlineMDAPI)
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

// DeleteVolumeAPI DELETE /api/workspace/:id/volumes/:volId
func (ch *CinyuHandlers) DeleteVolumeAPI(c *gin.Context) {
	wsID := c.Param("id")
	volID := c.Param("volId")
	if err := workspace.GetService().DeleteVolume(wsID, volID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

// DeleteChapterAPI DELETE /api/workspace/:id/volumes/:volId/chapters/:chId
func (ch *CinyuHandlers) DeleteChapterAPI(c *gin.Context) {
	wsID := c.Param("id")
	volID := c.Param("volId")
	chID := c.Param("chId")
	if err := workspace.GetService().DeleteChapter(wsID, volID, chID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

// ListTrashAPI GET /api/workspace/:id/trash
func (ch *CinyuHandlers) ListTrashAPI(c *gin.Context) {
	items, err := workspace.GetService().ListTrash(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if items == nil {
		items = []workspace.TrashItem{}
	}
	c.JSON(http.StatusOK, gin.H{"data": items})
}

// RestoreTrashAPI POST /api/workspace/:id/trash/:trashId/restore
func (ch *CinyuHandlers) RestoreTrashAPI(c *gin.Context) {
	wsID := c.Param("id")
	trashID := c.Param("trashId")
	if err := workspace.GetService().RestoreTrash(wsID, trashID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "restored"})
}

// GetCharactersAPI GET /api/workspace/:id/characters
func (ch *CinyuHandlers) GetCharactersAPI(c *gin.Context) {
	cards, err := workspace.GetService().GetCharacters(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": cards})
}

// SaveCharactersAPI PUT /api/workspace/:id/characters
func (ch *CinyuHandlers) SaveCharactersAPI(c *gin.Context) {
	var cards []workspace.CharacterCard
	if err := c.ShouldBindJSON(&cards); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	result, err := workspace.GetService().SaveCharacters(c.Param("id"), cards)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": result})
}

// GetGlossaryAPI GET /api/workspace/:id/glossary
func (ch *CinyuHandlers) GetGlossaryAPI(c *gin.Context) {
	entries, err := workspace.GetService().GetGlossary(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": entries})
}

// SaveGlossaryAPI PUT /api/workspace/:id/glossary
func (ch *CinyuHandlers) SaveGlossaryAPI(c *gin.Context) {
	var entries []workspace.GlossaryEntry
	if err := c.ShouldBindJSON(&entries); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	result, err := workspace.GetService().SaveGlossary(c.Param("id"), entries)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": result})
}

// GetWordStatsAPI GET /api/workspace/:id/stats?target=
func (ch *CinyuHandlers) GetWordStatsAPI(c *gin.Context) {
	target := 0
	if t := c.Query("target"); t != "" {
		if n, err := strconv.Atoi(t); err == nil {
			target = n
		}
	}
	stats, err := workspace.GetService().CalcWordStats(c.Param("id"), target)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": stats})
}

// ListChapterSnapshotsAPI GET .../snapshots
func (ch *CinyuHandlers) ListChapterSnapshotsAPI(c *gin.Context) {
	snaps, err := workspace.GetService().ListChapterSnapshots(c.Param("id"), c.Param("volId"), c.Param("chId"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": snaps})
}

// GetChapterSnapshotAPI GET .../snapshots/:snapId
func (ch *CinyuHandlers) GetChapterSnapshotAPI(c *gin.Context) {
	content, err := workspace.GetService().GetChapterSnapshot(c.Param("id"), c.Param("volId"), c.Param("chId"), c.Param("snapId"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"content": content}})
}

// RestoreChapterSnapshotAPI POST .../snapshots/:snapId/restore
func (ch *CinyuHandlers) RestoreChapterSnapshotAPI(c *gin.Context) {
	content, err := workspace.GetService().RestoreChapterSnapshot(c.Param("id"), c.Param("volId"), c.Param("chId"), c.Param("snapId"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"content": content}})
}

// GetOutlineAPI GET /api/workspace/:id/outline
func (ch *CinyuHandlers) GetOutlineAPI(c *gin.Context) {
	outline, err := workspace.GetService().GetOutline(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": outline})
}

// SaveOutlineAPI PUT /api/workspace/:id/outline
func (ch *CinyuHandlers) SaveOutlineAPI(c *gin.Context) {
	var body workspace.ProjectOutline
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	result, err := workspace.GetService().SaveOutline(c.Param("id"), &body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": result})
}

// ImportOutlineMDAPI POST /api/workspace/:id/outline/import-md
func (ch *CinyuHandlers) ImportOutlineMDAPI(c *gin.Context) {
	var req struct {
		Content string `json:"content" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	result, err := workspace.GetService().ImportOutlineMarkdown(c.Param("id"), req.Content)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": result})
}
