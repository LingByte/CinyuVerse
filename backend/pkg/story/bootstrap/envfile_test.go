package bootstrap_test

import (
	"os"
	"testing"

	"github.com/LingByte/CinyuVerse/pkg/story/bootstrap"
)

func TestLoadLLMConfigFromDotEnv(t *testing.T) {
	_ = os.Unsetenv("STORY_LLM_PROVIDER")
	_ = os.Unsetenv("STORY_LLM_API_KEY")
	cfg, err := bootstrap.LoadLLMConfig()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Provider != "ollama" {
		t.Fatalf("expected ollama from backend/.env, got %q", cfg.Provider)
	}
}
