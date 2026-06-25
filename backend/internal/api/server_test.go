package api_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/LingByte/CinyuVerse/internal/api"
	"github.com/LingByte/CinyuVerse/pkg/story/agent"
	"github.com/LingByte/CinyuVerse/pkg/story/models"
	"github.com/LingByte/CinyuVerse/pkg/story/store"
)

func TestHealthAndAgents(t *testing.T) {
	dir := t.TempDir()
	srv := api.NewServer(dir, agent.Router{})
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/api/v1/health")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("health status=%d", resp.StatusCode)
	}

	resp2, err := http.Get(ts.URL + "/api/v1/agents")
	if err != nil {
		t.Fatal(err)
	}
	defer resp2.Body.Close()
	if resp2.StatusCode != http.StatusOK {
		t.Fatalf("agents status=%d", resp2.StatusCode)
	}
}

func TestListBooksHTTP(t *testing.T) {
	dir := t.TempDir()
	st := store.NewProjectStore(dir)
	if err := st.SaveBookConfig(models.BookConfig{ID: "demo", Title: "Demo", Language: models.LanguageZH}); err != nil {
		t.Fatal(err)
	}
	srv := api.NewServer(dir, agent.Router{})
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/api/v1/books")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("books status=%d", resp.StatusCode)
	}
}
