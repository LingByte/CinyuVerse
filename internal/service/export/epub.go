// Copyright (c) 2026 LingByte. All rights reserved.
// SPDX-License-Identifier: AGPL-3.0

package export

import (
	"archive/zip"
	"bytes"
	"fmt"
	"html"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	ws "github.com/LingByte/CinyuVerse/internal/service/workspace"
)

// ExportEPUB 导出 EPUB 电子书
func (s *Service) ExportEPUB(workspace *ws.Workspace) (string, error) {
	name := sanitizeFilename(workspace.BookName) + ".epub"
	path := filepath.Join(s.outputDir, name)

	buf := new(bytes.Buffer)
	zw := zip.NewWriter(buf)

	mimetype := "application/epub+zip"
	h := &zip.FileHeader{Name: "mimetype", Method: zip.Store}
	h.SetModTime(time.Now())
	w, err := zw.CreateHeader(h)
	if err != nil {
		return "", err
	}
	if _, err := w.Write([]byte(mimetype)); err != nil {
		return "", err
	}

	chapters := collectChapters(s, workspace)
	if err := writeZipFile(zw, "META-INF/container.xml", containerXML()); err != nil {
		return "", err
	}

	var manifest strings.Builder
	var spine strings.Builder
	var navItems strings.Builder
	manifest.WriteString(`<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`)
	manifest.WriteString(`<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`)

	for i, ch := range chapters {
		id := fmt.Sprintf("ch%03d", i+1)
		fname := id + ".xhtml"
		body := markdownToXHTML(ch.Content)
		xhtml := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="zh-CN">
<head><title>%s</title></head>
<body><h1>%s</h1>%s</body>
</html>`, html.EscapeString(ch.Title), html.EscapeString(ch.Title), body)
		if err := writeZipFile(zw, "OEBPS/"+fname, xhtml); err != nil {
			return "", err
		}
		manifest.WriteString(fmt.Sprintf(`<item id="%s" href="%s" media-type="application/xhtml+xml"/>`, id, fname))
		spine.WriteString(fmt.Sprintf(`<itemref idref="%s"/>`, id))
		navItems.WriteString(fmt.Sprintf(`<li><a href="%s">%s</a></li>`, fname, html.EscapeString(ch.FullTitle)))
	}

	opf := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>%s</dc:title>
    <dc:language>zh-CN</dc:language>
    <dc:identifier id="uid">cinyuverse-%s</dc:identifier>
  </metadata>
  <manifest>%s</manifest>
  <spine>%s</spine>
</package>`, html.EscapeString(workspace.BookName), workspace.ID, manifest.String(), spine.String())
	if err := writeZipFile(zw, "OEBPS/content.opf", opf); err != nil {
		return "", err
	}

	ncx := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="cinyuverse-%s"/></head>
  <docTitle><text>%s</text></docTitle>
  <navMap></navMap>
</ncx>`, workspace.ID, html.EscapeString(workspace.BookName))
	if err := writeZipFile(zw, "OEBPS/toc.ncx", ncx); err != nil {
		return "", err
	}

	nav := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>目录</title></head>
<body><nav epub:type="toc"><ol>%s</ol></nav></body>
</html>`, navItems.String())
	if err := writeZipFile(zw, "OEBPS/nav.xhtml", nav); err != nil {
		return "", err
	}

	if err := zw.Close(); err != nil {
		return "", err
	}
	return path, os.WriteFile(path, buf.Bytes(), 0o644)
}

type chapterExport struct {
	FullTitle string
	Title     string
	Content   string
}

func collectChapters(s *Service, workspace *ws.Workspace) []chapterExport {
	svc := ws.GetService()
	var out []chapterExport
	for _, vol := range workspace.Volumes {
		for _, ch := range vol.Chapters {
			content, _ := svc.GetChapterContent(workspace.ID, vol.ID, ch.ID)
			out = append(out, chapterExport{
				FullTitle: fmt.Sprintf("%s · %s", vol.Title, ch.Title),
				Title:     ch.Title,
				Content:   content,
			})
		}
	}
	return out
}

func writeZipFile(zw *zip.Writer, name, content string) error {
	w, err := zw.Create(name)
	if err != nil {
		return err
	}
	_, err = io.WriteString(w, content)
	return err
}

func containerXML() string {
	return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
}

func markdownToXHTML(md string) string {
	var b strings.Builder
	paras := strings.Split(md, "\n\n")
	for _, p := range paras {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		if strings.HasPrefix(p, "# ") {
			b.WriteString("<h2>" + html.EscapeString(strings.TrimPrefix(p, "# ")) + "</h2>")
		} else {
			b.WriteString("<p>" + html.EscapeString(p) + "</p>")
		}
	}
	return b.String()
}
