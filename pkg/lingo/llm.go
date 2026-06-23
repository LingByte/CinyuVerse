package lingo

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"strings"
	"time"

	"go.uber.org/zap"
)

// ── LLM Types ─────────────────────────────────────────────────────

// LLMOptions configures the LLM provider handler.
type LLMOptions struct {
	Provider     string
	ApiKey       string
	BaseURL      string
	SystemPrompt string
	Logger       *zap.Logger
}

// QueryOptions controls generation parameters for a single query.
type QueryOptions struct {
	Model       string
	Temperature float32
	MaxTokens   int
}

// QueryResult represents the response from an LLM query.
type QueryResult struct {
	Choices   []Choice
	Usage     *UsageInfo
	ToolCalls []chatToolCall // 当 finish_reason=tool_calls 时有值
}

// Choice is a single completion choice.
type Choice struct {
	Content      string
	FinishReason string
	ToolCalls    []chatToolCall // 当 finish_reason=tool_calls 时有值
}

// UsageInfo tracks token consumption.
type UsageInfo struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
	TotalTokens      int `json:"total_tokens"`
}

// ProviderHandler is the interface for LLM interactions.
type ProviderHandler interface {
	ResetMemory()
	QueryWithOptions(userMessage string, opts *QueryOptions) (*QueryResult, error)
	// RecordToolResult adds a tool execution result to the history（用于多轮工具调用循环）。
	RecordToolResult(toolCallID string, content string)
}

// ── OpenAI Compatible Handler ─────────────────────────────────────

type openAIHandler struct {
	baseURL   string
	apiKey    string
	sysPrompt string
	history   []chatMessage
	client    *http.Client
}

type chatMessage struct {
	Role       string     `json:"role"`
	Content    string     `json:"content"`
	ToolCalls  []chatToolCall `json:"tool_calls,omitempty"`
	ToolCallID string     `json:"tool_call_id,omitempty"`
}

type chatToolCall struct {
	ID       string       `json:"id"`
	Type     string       `json:"type"`
	Function chatToolFunc `json:"function"`
}

type chatToolFunc struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
}

type openAIRequest struct {
	Model       string        `json:"model"`
	Messages    []chatMessage `json:"messages"`
	Temperature float32       `json:"temperature,omitempty"`
	MaxTokens   int           `json:"max_tokens,omitempty"`
	Tools       []chatToolDef `json:"tools,omitempty"`
}

type chatToolDef struct {
	Type     string       `json:"type"`
	Function chatToolFuncDef `json:"function"`
}

type chatToolFuncDef struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Parameters  chatToolParams `json:"parameters"`
}

type chatToolParams struct {
	Type       string                    `json:"type"`
	Properties map[string]chatParamProp  `json:"properties"`
	Required   []string                  `json:"required,omitempty"`
}

type chatParamProp struct {
	Type        string   `json:"type"`
	Description string   `json:"description"`
	Enum        []string `json:"enum,omitempty"`
}

type openAIResponse struct {
	Choices []struct {
		Message struct {
			Content   string         `json:"content"`
			ToolCalls []chatToolCall `json:"tool_calls"`
		} `json:"message"`
		FinishReason string `json:"finish_reason"`
	} `json:"choices"`
	Usage *UsageInfo `json:"usage"`
}

// NewProviderHandler creates a handler for the specified LLM provider.
// Supports: openai, ollama, lmstudio, alibaba (qwen), anthropic (claude), coze, siliconflow.
// All providers use OpenAI-compatible /chat/completions API format.
func NewProviderHandler(ctx context.Context, provider string, opts *LLMOptions) (ProviderHandler, error) {
	baseURL := strings.TrimRight(opts.BaseURL, "/")
	if baseURL == "" {
		baseURL = "https://api.openai.com/v1"
	}

	// All supported providers use OpenAI-compatible API format
	handler := &openAIHandler{
		baseURL:   baseURL,
		apiKey:    opts.ApiKey,
		sysPrompt: opts.SystemPrompt,
		client:    &http.Client{Timeout: 120 * time.Second},
		history:   []chatMessage{},
	}

	if handler.sysPrompt != "" {
		handler.history = append(handler.history, chatMessage{Role: "system", Content: handler.sysPrompt})
	}
	return handler, nil
}

func (h *openAIHandler) ResetMemory() {
	h.history = []chatMessage{}
	if h.sysPrompt != "" {
		h.history = append(h.history, chatMessage{Role: "system", Content: h.sysPrompt})
	}
}

func (h *openAIHandler) RecordToolResult(toolCallID string, content string) {
	h.history = append(h.history, chatMessage{
		Role:       "tool",
		ToolCallID: toolCallID,
		Content:    content,
	})
}

func (h *openAIHandler) QueryWithOptions(userMessage string, opts *QueryOptions) (*QueryResult, error) {
	h.history = append(h.history, chatMessage{Role: "user", Content: userMessage})

	apiURL := h.baseURL
	if !strings.HasSuffix(apiURL, "/chat/completions") {
		apiURL = strings.TrimRight(apiURL, "/") + "/chat/completions"
	}

	messages := h.history
	// Context window safety: keep last 40 messages (~20 turns)
	if len(messages) > 40 {
		// Preserve system message at position 0, trim middle
		keep := make([]chatMessage, 1, 40)
		keep[0] = messages[0]
		keep = append(keep, messages[len(messages)-39:]...)
		messages = keep
	}

	reqBody := openAIRequest{
		Model:     opts.Model,
		Messages:  messages,
		MaxTokens: opts.MaxTokens,
	}
	if opts.Temperature > 0 {
		reqBody.Temperature = opts.Temperature
	}

	bodyJSON, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(context.Background(), http.MethodPost, apiURL, bytes.NewReader(bodyJSON))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if h.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+h.apiKey)
	}

	resp, err := h.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("http request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API error %d: %s", resp.StatusCode, string(body))
	}

	var oaiResp openAIResponse
	if err := json.NewDecoder(resp.Body).Decode(&oaiResp); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}
	if len(oaiResp.Choices) == 0 {
		return nil, fmt.Errorf("empty completion choices")
	}

	choice := oaiResp.Choices[0]

	// Record assistant message in history
	if len(choice.Message.ToolCalls) > 0 {
		h.history = append(h.history, chatMessage{
			Role:      "assistant",
			Content:   choice.Message.Content,
			ToolCalls: choice.Message.ToolCalls,
		})
	} else {
		h.history = append(h.history, chatMessage{Role: "assistant", Content: choice.Message.Content})
	}

	return &QueryResult{
		Choices: []Choice{{
			Content:      choice.Message.Content,
			FinishReason: choice.FinishReason,
			ToolCalls:    choice.Message.ToolCalls,
		}},
		Usage:     oaiResp.Usage,
		ToolCalls: choice.Message.ToolCalls,
	}, nil
}

// GenerateLingRequestID generates a unique request ID.
func GenerateLingRequestID() string {
	return fmt.Sprintf("req_%d_%d", time.Now().UnixNano(), rand.Intn(10000))
}
