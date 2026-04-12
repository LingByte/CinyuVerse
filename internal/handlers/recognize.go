package handlers

import (
	"context"
	"errors"
	"io"
	"strings"
	"time"

	"github.com/LingByte/lingoroutine/parser"
	"github.com/LingByte/lingoroutine/response"
	"github.com/gin-gonic/gin"
)

// 单次上传体积上限（与常见反向代理默认值接近，可按需调大）。
const maxRecognizeUploadBytes = 40 << 20

// RecognizeResponse 文档识别结果（以文本为主）。
type RecognizeResponse struct {
	Text     string `json:"text"`
	FileType string `json:"fileType"`
	FileName string `json:"fileName"`
	ParsedAt string `json:"parsedAt"`
}

func (ch *CinyuHandlers) registerRecognizeRoutes(r *gin.RouterGroup) {
	r.POST("/recognize", ch.RecognizeDocument)
}

// RecognizeDocument POST /api/recognize
// Content-Type: multipart/form-data，字段名 file；可选查询参数 fileType 强制指定解析类型（与 parser 常量一致，如 pdf、docx）。
func (ch *CinyuHandlers) RecognizeDocument(c *gin.Context) {
	fh, err := c.FormFile("file")
	if err != nil {
		response.Fail(c, `请使用 multipart/form-data 上传，表单字段名为 "file"`, nil)
		return
	}

	src, err := fh.Open()
	if err != nil {
		response.Fail(c, "无法读取上传文件", nil)
		return
	}
	defer src.Close()

	body, err := io.ReadAll(io.LimitReader(src, maxRecognizeUploadBytes+1))
	if err != nil {
		response.Fail(c, "读取文件内容失败", nil)
		return
	}
	if len(body) > maxRecognizeUploadBytes {
		response.FailWithCode(c, 413, "文件超过大小限制", gin.H{"maxBytes": maxRecognizeUploadBytes})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Minute)
	defer cancel()

	req := &parser.ParseRequest{
		FileName: fh.Filename,
		Content:  body,
	}
	if ft := strings.TrimSpace(c.Query("fileType")); ft != "" {
		req.FileType = strings.ToLower(ft)
	}

	opts := &parser.ParseOptions{
		MaxTextLength:      2_000_000,
		PreserveLineBreaks: true,
		IncludeTables:      strings.TrimSpace(c.DefaultQuery("includeTables", "")) == "1" || strings.EqualFold(c.Query("includeTables"), "true"),
	}

	res, err := parser.ParseAuto(ctx, req, opts)
	if err != nil {
		if errors.Is(err, parser.ErrUnsupportedFileType) {
			response.FailWithCode(c, 400, err.Error(), nil)
			return
		}
		if errors.Is(err, parser.ErrEmptyInput) {
			response.FailWithCode(c, 400, "空文件或无法解析出内容", nil)
			return
		}
		response.Fail(c, "识别失败: "+err.Error(), nil)
		return
	}

	out := RecognizeResponse{
		Text:     strings.TrimSpace(res.Text),
		FileType: res.FileType,
		FileName: res.FileName,
		ParsedAt: res.ParsedAt.Format(time.RFC3339),
	}
	if out.FileName == "" {
		out.FileName = fh.Filename
	}
	response.Success(c, "OK", out)
}
