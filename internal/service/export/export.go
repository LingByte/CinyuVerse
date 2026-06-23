// Copyright (c) 2026 LingByte. All rights reserved.
// SPDX-License-Identifier: AGPL-3.0

package export

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	ws "github.com/LingByte/CinyuVerse/internal/service/workspace"
)

// Service 导出服务
type Service struct {
	outputDir string
}

// NewService 创建导出服务
func NewService(outputDir string) *Service {
	if outputDir == "" {
		outputDir = "exports"
	}
	os.MkdirAll(outputDir, 0o755)
	return &Service{outputDir: outputDir}
}

// ── TXT 导出 ──

// ExportTXT 导出小说为 TXT
func (s *Service) ExportTXT(workspace *ws.Workspace) (string, error) {
	var b strings.Builder

	b.WriteString(fmt.Sprintf("《%s》\n\n", workspace.BookName))
	if workspace.WorldView != "" {
		b.WriteString(fmt.Sprintf("世界观：%s\n\n", workspace.WorldView))
	}

	for _, vol := range workspace.Volumes {
		b.WriteString(fmt.Sprintf("\n%s\n\n", vol.Title))

		svc := ws.GetService()
		for _, ch := range vol.Chapters {
			b.WriteString(fmt.Sprintf("第%d章 %s\n\n", ch.OrderNo, ch.Title))
			content, err := svc.GetChapterContent(workspace.ID, vol.ID, ch.ID)
			if err == nil {
				b.WriteString(content)
			}
			b.WriteString("\n\n")
		}
	}

	name := sanitizeFilename(workspace.BookName) + ".txt"
	path := filepath.Join(s.outputDir, name)
	if err := os.WriteFile(path, []byte(b.String()), 0o644); err != nil {
		return "", err
	}
	return path, nil
}

// ── Markdown 导出 ──

// ExportMarkdown 导出小说为 Markdown
func (s *Service) ExportMarkdown(workspace *ws.Workspace) (string, error) {
	var b strings.Builder

	b.WriteString(fmt.Sprintf("# 《%s》\n\n", workspace.BookName))
	if workspace.Type != "" {
		b.WriteString(fmt.Sprintf("> 类型：%s\n\n", workspace.Type))
	}
	if workspace.WorldView != "" {
		b.WriteString(fmt.Sprintf("## 世界观\n\n%s\n\n", workspace.WorldView))
	}
	if workspace.Character != "" {
		b.WriteString(fmt.Sprintf("## 人物设定\n\n%s\n\n", workspace.Character))
	}

	svc := ws.GetService()
	for _, vol := range workspace.Volumes {
		b.WriteString(fmt.Sprintf("## %s\n\n", vol.Title))

		for _, ch := range vol.Chapters {
			b.WriteString(fmt.Sprintf("### 第%d章 %s\n\n", ch.OrderNo, ch.Title))
			content, err := svc.GetChapterContent(workspace.ID, vol.ID, ch.ID)
			if err == nil {
				b.WriteString(content)
			}
			b.WriteString("\n\n---\n\n")
		}
	}

	name := sanitizeFilename(workspace.BookName) + ".md"
	path := filepath.Join(s.outputDir, name)
	if err := os.WriteFile(path, []byte(b.String()), 0o644); err != nil {
		return "", err
	}
	return path, nil
}

// ── Helpers ──

func sanitizeFilename(name string) string {
	replacer := strings.NewReplacer(
		"/", "_", "\\", "_", ":", "_",
		"*", "_", "?", "_", "\"", "_",
		"<", "_", ">", "_", "|", "_",
	)
	return replacer.Replace(name)
}
