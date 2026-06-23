// Copyright (c) 2026 LingByte. All rights reserved.
// SPDX-License-Identifier: AGPL-3.0

package handlers

import (
	"net/http"
	"path/filepath"

	"github.com/LingByte/CinyuVerse/internal/service/export"
	"github.com/LingByte/CinyuVerse/internal/service/workspace"
	"github.com/gin-gonic/gin"
)

func (ch *CinyuHandlers) registerExportRoutes(r *gin.RouterGroup) {
	ex := r.Group("/export")
	{
		ex.GET("/:id/txt", ch.ExportTXT)
		ex.GET("/:id/md", ch.ExportMarkdown)
	}
}

// ExportTXT GET /api/export/:id/txt
func (ch *CinyuHandlers) ExportTXT(c *gin.Context) {
	ws, err := workspace.GetService().GetWorkspace(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	svc := export.NewService("exports")
	path, err := svc.ExportTXT(ws)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	filename := filepath.Base(path)
	c.Header("Content-Disposition", "attachment; filename="+filename)
	c.File(path)
}

// ExportMarkdown GET /api/export/:id/md
func (ch *CinyuHandlers) ExportMarkdown(c *gin.Context) {
	ws, err := workspace.GetService().GetWorkspace(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	svc := export.NewService("exports")
	path, err := svc.ExportMarkdown(ws)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	filename := filepath.Base(path)
	c.Header("Content-Disposition", "attachment; filename="+filename)
	c.File(path)
}
