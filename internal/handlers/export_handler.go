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
		ex.GET("/:id/epub", ch.ExportEPUB)
		ex.GET("/:id/docx", ch.ExportDOCX)
		ex.GET("/:id/platform/:platform", ch.ExportPlatform)
		ex.GET("/:id/outline-md", ch.ExportOutlineMD)
	}
}

func exportFile(c *gin.Context, path string, err error) {
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	filename := filepath.Base(path)
	c.Header("Content-Disposition", "attachment; filename="+filename)
	c.File(path)
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
	exportFile(c, path, err)
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
	exportFile(c, path, err)
}

// ExportEPUB GET /api/export/:id/epub
func (ch *CinyuHandlers) ExportEPUB(c *gin.Context) {
	ws, err := workspace.GetService().GetWorkspace(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	svc := export.NewService("exports")
	path, err := svc.ExportEPUB(ws)
	exportFile(c, path, err)
}

// ExportDOCX GET /api/export/:id/docx
func (ch *CinyuHandlers) ExportDOCX(c *gin.Context) {
	ws, err := workspace.GetService().GetWorkspace(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	svc := export.NewService("exports")
	path, err := svc.ExportDOCX(ws)
	exportFile(c, path, err)
}

// ExportPlatform GET /api/export/:id/platform/:platform
func (ch *CinyuHandlers) ExportPlatform(c *gin.Context) {
	ws, err := workspace.GetService().GetWorkspace(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	svc := export.NewService("exports")
	path, err := svc.ExportPlatform(ws, c.Param("platform"))
	exportFile(c, path, err)
}

// ExportOutlineMD GET /api/export/:id/outline-md
func (ch *CinyuHandlers) ExportOutlineMD(c *gin.Context) {
	md, err := workspace.GetService().ExportOutlineMarkdown(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Header("Content-Disposition", "attachment; filename=outline.md")
	c.Data(http.StatusOK, "text/markdown; charset=utf-8", []byte(md))
}
