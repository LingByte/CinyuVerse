// Copyright (c) 2026 LingByte. All rights reserved.
// SPDX-License-Identifier: AGPL-3.0

package llm

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// ── Streaming Client ──────────────────────────────────────────────

// StreamClient 流式大模型统一客户端，支持 OpenAI / DeepSeek / Qwen / Ollama 等
// 兼容 OpenAI Chat Completions 格式的 API。
type StreamClient struct {
	BaseURL    string
	APIKey     string
	Model      string
	HTTPClient *http.Client
}

// NewStreamClient 创建一个流式 LLM 客户端。
func NewStreamClient(baseURL, apiKey, model string) *StreamClient {
	return &StreamClient{
		BaseURL: strings.TrimRight(baseURL, "/"),
		APIKey:  apiKey,
		Model:   model,
		HTTPClient: &http.Client{
			Timeout: 300 * time.Second, // 流式长连接
		},
	}
}

// StreamMessage 流式消息格式
type StreamMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
	// ToolCallID 仅用于 role=tool 的消息，关联到具体的工具调用
	ToolCallID string `json:"tool_call_id,omitempty"`
}

// StreamRequest 流式请求体（OpenAI 兼容）
type StreamRequest struct {
	Model       string          `json:"model"`
	Messages    []StreamMessage `json:"messages"`
	Temperature float64         `json:"temperature,omitempty"`
	MaxTokens   int             `json:"max_tokens,omitempty"`
	Stream      bool            `json:"stream"`
	Tools       []ToolDefinition `json:"tools,omitempty"`
}

// StreamChunk 流式响应片段
type StreamChunk struct {
	Content      string     `json:"content"`                // 本次文本增量
	Reasoning    bool       `json:"reasoning,omitempty"`    // 是否为推理思考内容
	Done         bool       `json:"done"`                   // 是否生成完毕
	FinishReason string     `json:"finish_reason,omitempty"` // stop | tool_calls | length
	Error        string     `json:"error,omitempty"`        // 错误信息
	Usage        *Usage     `json:"usage,omitempty"`        // token 用量（done 时返回）
	ToolCalls    []ToolCall `json:"tool_calls,omitempty"`   // 累积的工具调用（finish_reason=tool_calls 时返回）
}

// Usage token 用量统计
type Usage struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
	TotalTokens      int `json:"total_tokens"`
}

// openAIStreamChunk OpenAI 流式 SSE 响应结构
type openAIStreamChunk struct {
	Choices []struct {
		Delta struct {
			Content          string                   `json:"content"`
			ReasoningContent string                   `json:"reasoning_content"`
			ToolCalls        []openAIToolCallDelta    `json:"tool_calls"`
		} `json:"delta"`
		FinishReason *string `json:"finish_reason"`
	} `json:"choices"`
	Usage *struct {
		PromptTokens     int `json:"prompt_tokens"`
		CompletionTokens int `json:"completion_tokens"`
		TotalTokens      int `json:"total_tokens"`
	} `json:"usage"`
}

// openAIToolCallDelta 流式 tool_call 增量
type openAIToolCallDelta struct {
	Index    *int                  `json:"index"`
	ID       *string               `json:"id"`
	Type     *string               `json:"type"`
	Function *openAIToolCallFnDelta `json:"function"`
}

type openAIToolCallFnDelta struct {
	Name      *string `json:"name"`
	Arguments *string `json:"arguments"`
}

// Stream 发起流式请求，通过 channel 返回文本片段。
// 调用方负责消费 channel 直到关闭。
// tools 参数可选，传入 nil 表示不使用 function calling。
func (c *StreamClient) Stream(ctx context.Context, messages []StreamMessage, temperature float64, maxTokens int, tools []ToolDefinition) (<-chan StreamChunk, error) {
	apiURL := c.BaseURL
	if apiURL == "" {
		apiURL = "https://api.openai.com/v1"
	}
	if !strings.HasSuffix(apiURL, "/chat/completions") {
		apiURL = strings.TrimRight(apiURL, "/") + "/chat/completions"
	}

	reqBody := StreamRequest{
		Model:       c.Model,
		Messages:    messages,
		Temperature: temperature,
		MaxTokens:   maxTokens,
		Stream:      true,
		Tools:       tools,
	}

	bodyJSON, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, apiURL, strings.NewReader(string(bodyJSON)))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	if c.APIKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.APIKey)
	}

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("http request: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		return nil, fmt.Errorf("API error %d: %s", resp.StatusCode, string(body))
	}

	ch := make(chan StreamChunk, 64)
	go c.readStream(resp.Body, ch)
	return ch, nil
}

func (c *StreamClient) readStream(body io.ReadCloser, ch chan<- StreamChunk) {
	defer body.Close()
	defer close(ch)

	scanner := bufio.NewScanner(body)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	// Accumulated tool calls across delta chunks
	type accCall struct {
		id        string
		typ       string
		name      string
		arguments strings.Builder
	}
	acc := map[int]*accCall{}

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || !strings.HasPrefix(line, "data:") {
			continue
		}

		data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if data == "[DONE]" {
			ch <- StreamChunk{Done: true}
			return
		}

		var chunk openAIStreamChunk
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			continue
		}

		// Accumulate tool_calls across deltas
		for _, choice := range chunk.Choices {
			if len(choice.Delta.ToolCalls) > 0 {
				for _, tc := range choice.Delta.ToolCalls {
					idx := 0
					if tc.Index != nil {
						idx = *tc.Index
					}
					if _, ok := acc[idx]; !ok {
						acc[idx] = &accCall{}
					}
					a := acc[idx]
					if tc.ID != nil {
						a.id = *tc.ID
					}
					if tc.Type != nil {
						a.typ = *tc.Type
					}
					if tc.Function != nil {
						if tc.Function.Name != nil {
							a.name = *tc.Function.Name
						}
						if tc.Function.Arguments != nil {
							a.arguments.WriteString(*tc.Function.Arguments)
						}
					}
				}
			}

			// 推理模型（如 DeepSeek-R1）的思考过程
			if choice.Delta.ReasoningContent != "" {
				ch <- StreamChunk{Content: choice.Delta.ReasoningContent, Reasoning: true}
			}

			if choice.Delta.Content != "" {
				ch <- StreamChunk{Content: choice.Delta.Content}
			}
		}

		// Check finish reason
		for _, choice := range chunk.Choices {
			if choice.FinishReason != nil && *choice.FinishReason != "" {
				reason := *choice.FinishReason
				usage := &Usage{}
				if chunk.Usage != nil {
					usage.PromptTokens = chunk.Usage.PromptTokens
					usage.CompletionTokens = chunk.Usage.CompletionTokens
					usage.TotalTokens = chunk.Usage.TotalTokens
				}

				// If we accumulated tool calls, include them
				var toolCalls []ToolCall
				if reason == "tool_calls" && len(acc) > 0 {
					for i := 0; i < len(acc); i++ {
						if a, ok := acc[i]; ok {
							toolCalls = append(toolCalls, ToolCall{
								ID:   a.id,
								Type: a.typ,
								Function: ToolCallFunc{
									Name:      a.name,
									Arguments: a.arguments.String(),
								},
							})
						}
					}
				}

				ch <- StreamChunk{
					Done:         true,
					FinishReason: reason,
					Usage:        usage,
					ToolCalls:    toolCalls,
				}
				return
			}
		}
	}

	// Scan finished without explicit finish_reason
	ch <- StreamChunk{Done: true}
}
