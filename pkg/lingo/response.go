package lingo

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

type ApiResponse struct {
	Code int         `json:"code"`
	Msg  string      `json:"msg"`
	Data interface{} `json:"data,omitempty"`
}

// Success returns a 200 JSON success response.
func Success(c *gin.Context, msg string, data interface{}) {
	c.JSON(http.StatusOK, ApiResponse{
		Code: 0,
		Msg:  msg,
		Data: data,
	})
}

// Fail returns a 400 JSON error response.
func Fail(c *gin.Context, msg string, data interface{}) {
	c.JSON(http.StatusBadRequest, ApiResponse{
		Code: 1,
		Msg:  msg,
		Data: data,
	})
}

// FailWithCode returns a custom HTTP status JSON error response.
func FailWithCode(c *gin.Context, code int, msg string, data interface{}) {
	c.JSON(code, ApiResponse{
		Code: code,
		Msg:  msg,
		Data: data,
	})
}
