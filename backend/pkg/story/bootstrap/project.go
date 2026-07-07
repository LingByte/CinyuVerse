package bootstrap

import (
	"os"

	"github.com/LingByte/CinyuVerse/pkg/protocol"
	"github.com/LingByte/CinyuVerse/pkg/story/agent"
	"github.com/LingByte/CinyuVerse/pkg/story/events"
	"github.com/LingByte/CinyuVerse/pkg/story/models"
	"github.com/LingByte/CinyuVerse/pkg/story/pipeline"
	"github.com/LingByte/CinyuVerse/pkg/story/store"
)

// RouterFromProject builds a router with per-agent model overrides from project.json.
func RouterFromProject(projectRoot string, baseClient protocol.ChatModel, baseModel string) (agent.Router, models.ProjectConfig, error) {
	st := store.NewProjectStore(projectRoot)
	cfg, err := st.LoadProjectConfig()
	if err != nil {
		return agent.Router{}, models.ProjectConfig{}, err
	}
	router := agent.Router{DefaultClient: baseClient, DefaultModel: baseModel, Overrides: map[agent.Name]agent.Override{}}
	for name, model := range cfg.ModelOverrides {
		if model == "" {
			continue
		}
		router.Overrides[agent.Name(name)] = agent.Override{Model: model}
	}
	return router, cfg, nil
}

// PipelineConfigFromProject maps project.json into pipeline.Config fields.
func PipelineConfigFromProject(cfg models.ProjectConfig, projectRoot string, router agent.Router, hub *events.Hub) pipeline.Config {
	review := cfg.Writing.ReviewRetries
	if review <= 0 {
		review = 1
	}
	foundation := cfg.Foundation.ReviewRetries
	if foundation <= 0 {
		foundation = 2
	}
	mode := cfg.ChapterReviewMode
	if mode == "" {
		mode = "auto"
	}
	return pipeline.Config{
		ProjectRoot:             projectRoot,
		Router:                  router,
		ReviewIterations:        review,
		ChapterReviewMode:       mode,
		FoundationReviewRetries: foundation,
		Events:                  hub,
	}
}

// NewServerPipeline builds a fully configured pipeline runner from env + project.json.
func NewServerPipeline(projectRoot string, hub *events.Hub) (*pipeline.Runner, agent.Router, error) {
	llm, err := LoadLLMConfig()
	if err != nil {
		return nil, agent.Router{}, err
	}
	client, err := NewChatClient(llm)
	if err != nil {
		return nil, agent.Router{}, err
	}
	router, proj, err := RouterFromProject(projectRoot, client, llm.Model)
	if err != nil {
		return nil, agent.Router{}, err
	}
	cfg := PipelineConfigFromProject(proj, projectRoot, router, hub)
	return pipeline.NewRunner(cfg, nil), router, nil
}

// MaxTokensFromEnv reads optional STORY_LLM_MAX_TOKENS.
func MaxTokensFromEnv() int {
	v := os.Getenv("STORY_LLM_MAX_TOKENS")
	if v == "" {
		return 8192
	}
	var n int
	for _, c := range v {
		if c < '0' || c > '9' {
			return 8192
		}
		n = n*10 + int(c-'0')
	}
	return n
}
