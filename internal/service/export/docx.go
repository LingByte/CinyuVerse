// Copyright (c) 2026 LingByte. All rights reserved.
// SPDX-License-Identifier: AGPL-3.0

package export

import (
	"archive/zip"
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	ws "github.com/LingByte/CinyuVerse/internal/service/workspace"
)

// ExportDOCX 导出 Word .docx
func (s *Service) ExportDOCX(workspace *ws.Workspace) (string, error) {
	chapters := collectChapters(s, workspace)
	var body strings.Builder
	body.WriteString(`<w:body>`)
	if workspace.BookName != "" {
		body.WriteString(docxParagraph(workspace.BookName, true))
	}
	for _, ch := range chapters {
		body.WriteString(docxParagraph(ch.FullTitle, true))
		for _, line := range strings.Split(ch.Content, "\n") {
			line = strings.TrimSpace(line)
			if line == "" {
				continue
			}
			if strings.HasPrefix(line, "# ") {
				body.WriteString(docxParagraph(strings.TrimPrefix(line, "# "), true))
			} else {
				body.WriteString(docxParagraph(line, false))
			}
		}
	}
	body.WriteString(`</w:body>`)

	document := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
%s
</w:document>`, body.String())

	buf := new(bytes.Buffer)
	zw := zip.NewWriter(buf)
	files := map[string]string{
		"[Content_Types].xml": docxContentTypes(),
		"_rels/.rels":         docxRels(),
		"word/_rels/document.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="document.xml"/>
</Relationships>`,
		"word/document.xml": document,
	}
	for name, content := range files {
		w, err := zw.Create(name)
		if err != nil {
			return "", err
		}
		if _, err := w.Write([]byte(content)); err != nil {
			return "", err
		}
	}
	if err := zw.Close(); err != nil {
		return "", err
	}

	name := sanitizeFilename(workspace.BookName) + ".docx"
	path := filepath.Join(s.outputDir, name)
	return path, os.WriteFile(path, buf.Bytes(), 0o644)
}

func docxParagraph(text string, bold bool) string {
	text = escapeXML(text)
	if bold {
		return fmt.Sprintf(`<w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">%s</w:t></w:r></w:p>`, text)
	}
	return fmt.Sprintf(`<w:p><w:r><w:t xml:space="preserve">%s</w:t></w:r></w:p>`, text)
}

func escapeXML(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	s = strings.ReplaceAll(s, `"`, "&quot;")
	return s
}

func docxContentTypes() string {
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
}

func docxRels() string {
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
}

// ExportPlatform 网文平台分卷导出 platform: fanqie | qidian | jjwxc
func (s *Service) ExportPlatform(workspace *ws.Workspace, platform string) (string, error) {
	var b strings.Builder
	b.WriteString(fmt.Sprintf("《%s》\n\n", workspace.BookName))

	filter := newSensitiveFilter(platform)

	for _, vol := range workspace.Volumes {
		switch platform {
		case "fanqie":
			b.WriteString(fmt.Sprintf("\n========== %s ==========\n\n", vol.Title))
		case "qidian":
			b.WriteString(fmt.Sprintf("\n【%s】\n\n", vol.Title))
		case "jjwxc":
			b.WriteString(fmt.Sprintf("\n※ %s ※\n\n", vol.Title))
		default:
			b.WriteString(fmt.Sprintf("\n## %s\n\n", vol.Title))
		}
		svc := ws.GetService()
		for _, ch := range vol.Chapters {
			content, _ := svc.GetChapterContent(workspace.ID, vol.ID, ch.ID)
			content = filter.clean(content)
			switch platform {
			case "fanqie":
				b.WriteString(fmt.Sprintf("第%d章 %s\n\n", ch.OrderNo, ch.Title))
			case "qidian":
				b.WriteString(fmt.Sprintf("第%d章 %s\n\n", ch.OrderNo, ch.Title))
			case "jjwxc":
				b.WriteString(fmt.Sprintf("第%d章 %s\n\n", ch.OrderNo, ch.Title))
			default:
				b.WriteString(fmt.Sprintf("### %s\n\n", ch.Title))
			}
			b.WriteString(content)
			b.WriteString("\n\n")
		}
	}

	suffix := platform
	if suffix == "" {
		suffix = "platform"
	}
	name := sanitizeFilename(workspace.BookName) + "_" + suffix + ".txt"
	path := filepath.Join(s.outputDir, name)
	return path, os.WriteFile(path, []byte(b.String()), 0o644)
}

type sensitiveFilter struct {
	words []string
}

func newSensitiveFilter(platform string) *sensitiveFilter {
	// 基础违禁词过滤（各平台可扩展）
	common := []string{"操", "妈的", "去死"}
	if platform == "fanqie" {
		common = append(common, "杀", "血")
	}
	return &sensitiveFilter{words: common}
}

func (f *sensitiveFilter) clean(text string) string {
	for _, w := range f.words {
		text = strings.ReplaceAll(text, w, strings.Repeat("*", len([]rune(w))))
	}
	return text
}
