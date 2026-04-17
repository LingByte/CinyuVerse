package handlers

import (
	"errors"
	"fmt"
	"io"
	"path/filepath"
	"strings"
	"time"

	"github.com/LingByte/CinyuVerse/pkg/config"
	"github.com/LingByte/lingoroutine/response"
	lingstorage "github.com/LingByte/lingstorage-sdk-go"
	"github.com/gin-gonic/gin"
)

const maxNovelCoverUploadBytes = 10 << 20

type UploadNovelCoverResponse struct {
	URL       string `json:"url"`
	ObjectKey string `json:"objectKey"`
	FileName  string `json:"fileName"`
}

// UploadNovelCover POST /api/novels/cover/upload
// Content-Type: multipart/form-data; field: file
func (ch *CinyuHandlers) UploadNovelCover(c *gin.Context) {
	if config.GlobalStore == nil {
		response.FailWithCode(c, 503, "GlobalStore is not initialized", nil)
		return
	}
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
	if fh.Size > maxNovelCoverUploadBytes {
		response.FailWithCode(c, 413, "文件超过大小限制", gin.H{"maxBytes": maxNovelCoverUploadBytes})
		return
	}
	if err := validateCoverContentType(fh.Header.Get("Content-Type"), fh.Filename); err != nil {
		response.Fail(c, "无效的图片类型", err)
		return
	}
	objectKey := buildCoverObjectKey(fh.Filename)
	url, err := uploadToLingStorageFromReader(src, objectKey)
	if err != nil {
		response.Fail(c, "上传封面失败: "+err.Error(), nil)
		return
	}
	response.Success(c, "OK", UploadNovelCoverResponse{
		URL:       url,
		ObjectKey: objectKey,
		FileName:  fh.Filename,
	})
}

func buildCoverObjectKey(filename string) string {
	ext := strings.ToLower(filepath.Ext(strings.TrimSpace(filename)))
	if ext == "" {
		ext = ".jpg"
	}
	return fmt.Sprintf("novel-covers/%d%s", time.Now().UnixNano(), ext)
}

func validateCoverContentType(contentType string, filename string) error {
	allowedTypes := map[string]bool{
		"image/jpeg": true,
		"image/jpg":  true,
		"image/png":  true,
		"image/gif":  true,
		"image/webp": true,
	}
	if contentType == "" {
		ext := strings.ToLower(filepath.Ext(filename))
		extToType := map[string]string{
			".jpg":  "image/jpeg",
			".jpeg": "image/jpeg",
			".png":  "image/png",
			".gif":  "image/gif",
			".webp": "image/webp",
		}
		contentType = extToType[ext]
	}
	if !allowedTypes[strings.ToLower(strings.TrimSpace(contentType))] {
		return errors.New("only jpeg, jpg, png, gif, webp files are allowed")
	}
	return nil
}

func uploadToLingStorageFromReader(reader io.Reader, objectKey string) (string, error) {
	bucket := strings.TrimSpace(config.GlobalConfig.Services.Storage.Bucket)
	if bucket == "" {
		bucket = "default"
	}
	resp, err := config.GlobalStore.UploadFromReader(&lingstorage.UploadFromReaderRequest{
		Reader:   reader,
		Bucket:   bucket,
		Filename: objectKey,
		Key:      objectKey,
	})
	if err != nil {
		return "", err
	}
	if resp == nil || strings.TrimSpace(resp.URL) == "" {
		return "", errors.New("storage returns empty url")
	}
	return resp.URL, nil
}
