package bootstrap

import (
	"fmt"
	"os"

	"github.com/LingByte/CinyuVerse/pkg/protocol"
	"github.com/LingByte/CinyuVerse/pkg/story/agent"
	"github.com/LingByte/CinyuVerse/pkg/story/pipeline"
)

// LLMConfig holds environment-derived LLM settings.
type LLMConfig struct {
	Provider protocol.ProviderType
	BaseURL  string
	APIKey   string
	Model    string
}

// LoadLLMConfig reads STORY_LLM_* environment variables.
func LoadLLMConfig() (LLMConfig, error) {
	provider := envOr("STORY_LLM_PROVIDER", "openai")
	baseURL := os.Getenv("STORY_LLM_BASE_URL")
	apiKey := os.Getenv("STORY_LLM_API_KEY")
	model := envOr("STORY_LLM_MODEL", "gpt-4o-mini")
	pt := protocol.ProviderOpenAI
	switch provider {
	case "ollama":
		pt = protocol.ProviderOllama
	case "openai", "custom":
		pt = protocol.ProviderOpenAI
	default:
		return LLMConfig{}, fmt.Errorf("unsupported STORY_LLM_PROVIDER %q", provider)
	}
	if baseURL == "" && pt == protocol.ProviderOllama {
		baseURL = "http://127.0.0.1:11434"
	}
	return LLMConfig{Provider: pt, BaseURL: baseURL, APIKey: apiKey, Model: model}, nil
}

// NewChatClient builds a protocol client from config.
func NewChatClient(cfg LLMConfig) (protocol.ChatModel, error) {
	return protocol.NewClient(protocol.ClientConfig{
		Provider: cfg.Provider,
		BaseURL:  cfg.BaseURL,
		APIKey:   cfg.APIKey,
	})
}

// NewRouter builds the default agent router.
func NewRouter(client protocol.ChatModel, model string) agent.Router {
	return agent.Router{DefaultClient: client, DefaultModel: model}
}

// NewPipelineRunner creates a pipeline runner for a project root.
func NewPipelineRunner(projectRoot string, router agent.Router) *pipeline.Runner {
	return pipeline.NewRunner(pipeline.Config{
		ProjectRoot: projectRoot,
		Router:      router,
	})
}

// NewPipelineFromEnv is the one-shot bootstrap for CLI and HTTP server.
func NewPipelineFromEnv(projectRoot string) (*pipeline.Runner, error) {
	cfg, err := LoadLLMConfig()
	if err != nil {
		return nil, err
	}
	client, err := NewChatClient(cfg)
	if err != nil {
		return nil, err
	}
	return NewPipelineRunner(projectRoot, NewRouter(client, cfg.Model)), nil
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
