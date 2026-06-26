// Command cinyu-story-server is the HTTP API for the governed fiction pipeline.
package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/LingByte/CinyuVerse/internal/api"
	_ "github.com/LingByte/CinyuVerse/pkg/protocol/ollama"
	_ "github.com/LingByte/CinyuVerse/pkg/protocol/openai"
	"github.com/LingByte/CinyuVerse/pkg/story/bootstrap"
	"github.com/LingByte/CinyuVerse/pkg/story/store"
)

func main() {
	root := envOr("STORY_PROJECT_ROOT", ".")
	addr := envOr("STORY_HTTP_ADDR", ":4567")

	cfg, err := bootstrap.LoadLLMConfig()
	if err != nil {
		log.Fatal(err)
	}
	client, err := bootstrap.NewChatClient(cfg)
	if err != nil {
		log.Fatal(err)
	}
	router, _, err := bootstrap.RouterFromProject(root, client, cfg.Model)
	if err != nil {
		log.Fatal(err)
	}
	srv := api.NewServer(root, router)

	proj, err := store.NewProjectStore(root).LoadProjectConfig()
	if err == nil && proj.Daemon.Enabled {
		_ = srv.Daemon.Start(context.Background())
	}

	log.Printf("cinyu-story-server listening on %s (project=%s)", addr, root)
	if err := http.ListenAndServe(addr, srv.Handler()); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
