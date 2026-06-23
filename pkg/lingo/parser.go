package lingo

import (
	"context"
	"errors"
	"strings"
	"time"
)

// ── Parser Stub ───────────────────────────────────────────────────
// Simplified replacement for lingoroutine/parser.
// Supports basic text/markdown reading only.

var (
	ErrUnsupportedFileType = errors.New("unsupported file type")
	ErrEmptyInput          = errors.New("empty input")
)

type ParseRequest struct {
	FileName string
	Content  []byte
	FileType string
}

type ParseOptions struct {
	MaxTextLength      int
	PreserveLineBreaks bool
	IncludeTables      bool
}

type ParseResult struct {
	Text     string
	FileType string
	FileName string
	ParsedAt time.Time
}

// ParseAuto tries to parse a document from raw bytes.
func ParseAuto(ctx context.Context, req *ParseRequest, opts *ParseOptions) (*ParseResult, error) {
	if req == nil || len(req.Content) == 0 {
		return nil, ErrEmptyInput
	}

	result := &ParseResult{
		FileName: req.FileName,
		ParsedAt: time.Now(),
	}

	ft := strings.ToLower(req.FileType)
	if ft == "" {
		// Detect by file extension
		ext := strings.ToLower(req.FileName)
		switch {
		case strings.HasSuffix(ext, ".txt"), strings.HasSuffix(ext, ".md"):
			ft = "text"
		case strings.HasSuffix(ext, ".json"):
			ft = "json"
		case strings.HasSuffix(ext, ".html"), strings.HasSuffix(ext, ".htm"):
			ft = "html"
		default:
			ft = "text"
		}
	}

	switch ft {
	case "text", "md", "markdown":
		text := string(req.Content)
		if opts != nil && opts.MaxTextLength > 0 && len(text) > opts.MaxTextLength {
			text = text[:opts.MaxTextLength]
		}
		result.Text = text
		result.FileType = "text"

	case "json":
		result.Text = string(req.Content)
		result.FileType = "json"

	case "html", "htm":
		// Basic HTML text extraction
		text := stripHTML(string(req.Content))
		result.Text = text
		result.FileType = "html"

	default:
		return nil, ErrUnsupportedFileType
	}

	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
	}

	return result, nil
}

func stripHTML(s string) string {
	// Very basic HTML tag stripper
	var b strings.Builder
	inTag := false
	for _, r := range s {
		if r == '<' {
			inTag = true
			continue
		}
		if r == '>' {
			inTag = false
			continue
		}
		if !inTag {
			b.WriteRune(r)
		}
	}
	return b.String()
}
