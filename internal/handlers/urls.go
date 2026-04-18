package handlers

import (
	"github.com/LingByte/CinyuVerse/pkg/config"
	"github.com/LingByte/lingoroutine/middleware"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// Copyright (c) 2026 LingByte
// SPDX-License-Identifier: MIT

type CinyuHandlers struct {
	db *gorm.DB
}

func NewCinyuHandlers(db *gorm.DB) *CinyuHandlers {
	return &CinyuHandlers{
		db: db,
	}
}

func (ch *CinyuHandlers) RegisterHandlers(engine *gin.Engine) {
	r := engine.Group(config.GlobalConfig.Server.APIPrefix)

	// Register Global Singleton DB
	r.Use(middleware.InjectDB(ch.db))

	// Novel routes
	ch.registerNovelRoutes(r)
	ch.registerVolumeRoutes(r)
	ch.registerChapterRoutes(r)
	ch.registerCharacterRoutes(r)
	ch.registerStorylineRoutes(r)
	ch.registerStyleLearningRoutes(r)
	ch.registerChatRoutes(r)
	ch.registerRecognizeRoutes(r)
}
