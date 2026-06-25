package agents

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/LingByte/CinyuVerse/pkg/story/agent"
	"github.com/LingByte/CinyuVerse/pkg/story/store"
)

// CoverInput configures cover prompt + optional image generation.
type CoverInput struct {
	ProjectRoot string
	Title       string
	Intro       string
	SellingPoints string
	CoverPrompt string
	OutputDir   string
}

// CoverResult is the generated cover artifact bundle.
type CoverResult struct {
	OutputDir      string `json:"outputDir"`
	PromptPath     string `json:"promptPath"`
	ImagePath      string `json:"imagePath,omitempty"`
	PromptMarkdown string `json:"promptMarkdown"`
	ImageGenerated bool   `json:"imageGenerated"`
}

// GenerateCover writes cover-prompt.md and optionally generates cover.png via image API.
func GenerateCover(ctx context.Context, router agent.Router, in CoverInput) (CoverResult, error) {
	if strings.TrimSpace(in.Title) == "" {
		return CoverResult{}, fmt.Errorf("cover: title required")
	}
	outDir := in.OutputDir
	if outDir == "" {
		outDir = filepath.Join("covers", slugify(in.Title))
	}
	st := store.NewProjectStore(in.ProjectRoot)
	promptMD := buildCoverPrompt(in)
	promptRel := filepath.Join(outDir, "cover-prompt.md")
	if err := st.WriteProjectText(promptRel, promptMD); err != nil {
		return CoverResult{}, err
	}
	result := CoverResult{
		OutputDir: outDir, PromptPath: promptRel, PromptMarkdown: promptMD,
	}
	if img, err := tryGenerateCoverImage(ctx, router, in, promptMD); err == nil && len(img) > 0 {
		imgRel := filepath.Join(outDir, "cover.png")
		abs := filepath.Join(in.ProjectRoot, imgRel)
		_ = os.MkdirAll(filepath.Dir(abs), 0o755)
		if writeErr := os.WriteFile(abs, img, 0o644); writeErr == nil {
			result.ImagePath = imgRel
			result.ImageGenerated = true
		}
	}
	return result, nil
}

func buildCoverPrompt(in CoverInput) string {
	if in.CoverPrompt != "" {
		return in.CoverPrompt
	}
	var b strings.Builder
	fmt.Fprintf(&b, "# Cover Prompt — %s\n\n", in.Title)
	if in.Intro != "" {
		b.WriteString("## Synopsis\n\n")
		b.WriteString(in.Intro)
		b.WriteString("\n\n")
	}
	if in.SellingPoints != "" {
		b.WriteString("## Selling Points\n\n")
		b.WriteString(in.SellingPoints)
		b.WriteString("\n\n")
	}
	b.WriteString("## Image Direction\n\n")
	b.WriteString("Vertical book cover, cinematic lighting, strong focal character, title-safe negative space at top.\n")
	return b.String()
}

// tryGenerateCoverImage calls an OpenAI-compatible images API when configured.
func tryGenerateCoverImage(ctx context.Context, _ agent.Router, _ CoverInput, prompt string) ([]byte, error) {
	apiKey := os.Getenv("STORY_COVER_API_KEY")
	if apiKey == "" {
		apiKey = os.Getenv("STORY_LLM_API_KEY")
	}
	baseURL := strings.TrimRight(os.Getenv("STORY_COVER_BASE_URL"), "/")
	if baseURL == "" {
		baseURL = strings.TrimRight(os.Getenv("STORY_LLM_BASE_URL"), "/")
	}
	if apiKey == "" || baseURL == "" {
		return nil, fmt.Errorf("cover image api not configured")
	}
	endpoint := os.Getenv("STORY_COVER_ENDPOINT")
	if endpoint == "" {
		endpoint = "/images/generations"
	}
	if !strings.HasPrefix(endpoint, "/") {
		endpoint = "/" + endpoint
	}
	model := os.Getenv("STORY_COVER_MODEL")
	if model == "" {
		model = "dall-e-3"
	}
	body, _ := json.Marshal(map[string]any{
		"model": model, "prompt": prompt, "n": 1, "size": "1024x1024", "response_format": "b64_json",
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, baseURL+endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)
	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("cover image http %d: %s", resp.StatusCode, truncate(string(raw), 200))
	}
	var parsed struct {
		Data []struct {
			B64JSON string `json:"b64_json"`
			URL     string `json:"url"`
		} `json:"data"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return nil, err
	}
	if len(parsed.Data) == 0 {
		return nil, fmt.Errorf("cover image: empty response")
	}
	if parsed.Data[0].B64JSON != "" {
		return base64.StdEncoding.DecodeString(parsed.Data[0].B64JSON)
	}
	if parsed.Data[0].URL != "" {
		imgReq, err := http.NewRequestWithContext(ctx, http.MethodGet, parsed.Data[0].URL, nil)
		if err != nil {
			return nil, err
		}
		imgResp, err := client.Do(imgReq)
		if err != nil {
			return nil, err
		}
		defer imgResp.Body.Close()
		return io.ReadAll(imgResp.Body)
	}
	return nil, fmt.Errorf("cover image: no b64_json or url in response")
}
