// Package novelanalyze calls OpenAI-compatible Chat Completions (Ollama / v1).
package novelanalyze

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// ChatMessage is one chat completion message.
type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatRequest struct {
	Model       string        `json:"model"`
	Messages    []ChatMessage `json:"messages"`
	Temperature float64       `json:"temperature,omitempty"`
	Stream      bool          `json:"stream"`
}

type chatResponse struct {
	Choices []struct {
		Message ChatMessage `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

// Client calls POST {baseURL}/chat/completions (baseURL must end with /v1).
type Client struct {
	BaseURL    string
	APIKey     string
	HTTP       *http.Client
	UserAgent  string
	MaxRetries int
}

func (c *Client) httpClient() *http.Client {
	if c.HTTP != nil {
		return c.HTTP
	}
	return &http.Client{Timeout: 10 * time.Minute}
}

// ChatCompletion returns assistant text for non-streaming chat.
func (c *Client) ChatCompletion(ctx context.Context, model string, messages []ChatMessage, temperature float64) (string, error) {
	base := strings.TrimSuffix(strings.TrimSpace(c.BaseURL), "/")
	url := base + "/chat/completions"
	body, err := json.Marshal(chatRequest{
		Model:       model,
		Messages:    messages,
		Temperature: temperature,
		Stream:      false,
	})
	if err != nil {
		return "", err
	}

	retries := c.MaxRetries
	if retries <= 0 {
		retries = 2
	}
	var lastErr error
	for attempt := 0; attempt <= retries; attempt++ {
		if attempt > 0 {
			select {
			case <-ctx.Done():
				return "", ctx.Err()
			case <-time.After(time.Duration(attempt) * 2 * time.Second):
			}
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
		if err != nil {
			return "", err
		}
		req.Header.Set("Content-Type", "application/json")
		if strings.TrimSpace(c.APIKey) != "" {
			req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(c.APIKey))
		}
		if c.UserAgent != "" {
			req.Header.Set("User-Agent", c.UserAgent)
		}

		resp, err := c.httpClient().Do(req)
		if err != nil {
			lastErr = err
			continue
		}
		respBody, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			lastErr = err
			continue
		}
		if resp.StatusCode != http.StatusOK {
			lastErr = fmt.Errorf("HTTP %d: %s", resp.StatusCode, truncate(string(respBody), 500))
			continue
		}
		var out chatResponse
		if err := json.Unmarshal(respBody, &out); err != nil {
			return "", fmt.Errorf("decode response: %w (body: %s)", err, truncate(string(respBody), 300))
		}
		if out.Error != nil && out.Error.Message != "" {
			return "", fmt.Errorf("api error: %s", out.Error.Message)
		}
		if len(out.Choices) == 0 {
			return "", fmt.Errorf("empty choices")
		}
		return strings.TrimSpace(out.Choices[0].Message.Content), nil
	}
	if lastErr != nil {
		return "", lastErr
	}
	return "", fmt.Errorf("chat completion failed after retries")
}

func truncate(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n]) + "…"
}
