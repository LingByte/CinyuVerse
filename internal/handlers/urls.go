package handlers

import (
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

func (ch *CinyuHandlers) RegisterHandlers(handlerFunc *gin.Engine) {

}
