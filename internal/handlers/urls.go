// Copyright (c) 2026 LingByte
// SPDX-License-Identifier: MIT

package handlers

import (
	"github.com/LingByte/CinyuVerse/pkg/config"
	"github.com/LingByte/CinyuVerse/pkg/lingo"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ── Handler Aggregator ──────────────────────────────────────────────

// CinyuHandlers 聚合所有业务 Handler，通过 RegisterHandlers 统一注册路由。
type CinyuHandlers struct {
	db *gorm.DB
}

func NewCinyuHandlers(db *gorm.DB) *CinyuHandlers {
	return &CinyuHandlers{db: db}
}

// ── Route Registration ──────────────────────────────────────────────

// RegisterHandlers 向 Gin Engine 注册所有 API 路由。
// 统一三层前缀: /api → 子模块 (/novels, /ai, /workspace, /export, /ws, /recognize)
func (ch *CinyuHandlers) RegisterHandlers(engine *gin.Engine) {
	// ── API 统一前缀组 (可配置，默认 /api) ──
	r := engine.Group(config.GlobalConfig.Server.APIPrefix)

	// 注入 DB 实例到上下文（所有 /api/* 请求可用）
	r.Use(lingo.InjectDB(ch.db))

	// ── 路由模块注册 ──
	ch.registerNovelRoutes(r)       // /api/novels/*      小说 CRUD
	ch.registerChatRoutes(r)        // /api/ai/*           AI 对话 & 会话管理
	ch.registerRecognizeRoutes(r)   // /api/recognize      文档识别解析
	ch.registerWorkspaceRoutes(r)   // /api/workspace/*    IDE 工作区 (卷/章节)
	ch.registerExportRoutes(r)      // /api/export/*       导出 TXT/MD
	ch.registerWebSocketRoutes(r)   // /api/ws/*           WebSocket 实时通信
}
