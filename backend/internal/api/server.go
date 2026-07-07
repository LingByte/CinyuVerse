package api

import (
	"encoding/json"
	"net/http"
	"sync"

	"github.com/LingByte/CinyuVerse/pkg/story/agent"
	"github.com/LingByte/CinyuVerse/pkg/story/daemon"
	"github.com/LingByte/CinyuVerse/pkg/story/events"
	"github.com/LingByte/CinyuVerse/pkg/story/interaction"
	"github.com/LingByte/CinyuVerse/pkg/story/models"
	"github.com/LingByte/CinyuVerse/pkg/story/pipeline"
	"github.com/LingByte/CinyuVerse/pkg/story/store"
)

// Server exposes InkOS-compatible story HTTP endpoints.
type Server struct {
	ProjectRoot string
	Router      agent.Router
	Pipeline    *pipeline.Runner
	Store       store.BookStore
	Hub         *events.Hub
	Daemon      *daemon.Service

	mu       sync.Mutex
	sessions map[string]*interaction.Session
}

// NewServer creates an API server using in-memory book storage (no disk layout).
func NewServer(projectRoot string, router agent.Router) *Server {
	hub := events.NewHub()
	st := store.NewMemoryStore(projectRoot)
	proj, _ := st.LoadProjectConfig()
	cfg := bootstrapPipelineConfig(projectRoot, router, hub, proj)
	run := pipeline.NewRunner(cfg, st)
	return &Server{
		ProjectRoot: projectRoot,
		Router:      router,
		Pipeline:    run,
		Store:       st,
		Hub:         hub,
		Daemon:      daemon.NewService(st, run, hub),
		sessions:    map[string]*interaction.Session{},
	}
}

func bootstrapPipelineConfig(projectRoot string, router agent.Router, hub *events.Hub, proj models.ProjectConfig) pipeline.Config {
	review := proj.Writing.ReviewRetries
	if review <= 0 {
		review = 1
	}
	foundation := proj.Foundation.ReviewRetries
	if foundation <= 0 {
		foundation = 2
	}
	mode := proj.ChapterReviewMode
	if mode == "" {
		mode = "auto"
	}
	return pipeline.Config{
		ProjectRoot: projectRoot, Router: router, Events: hub,
		ReviewIterations: review, ChapterReviewMode: mode,
		FoundationReviewRetries: foundation,
	}
}

// Handler returns the root HTTP handler with all routes registered.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/v1/health", s.handleHealth)
	mux.HandleFunc("GET /api/v1/agents", s.handleListAgents)
	mux.HandleFunc("GET /api/v1/events", s.handleEvents)
	mux.HandleFunc("GET /api/v1/logs", s.handleLogs)
	mux.HandleFunc("GET /api/v1/daemon", s.handleDaemonStatus)
	mux.HandleFunc("POST /api/v1/daemon/start", s.handleDaemonStart)
	mux.HandleFunc("POST /api/v1/daemon/stop", s.handleDaemonStop)
	mux.HandleFunc("POST /api/v1/daemon/unpause", s.handleDaemonUnpause)
	mux.HandleFunc("PUT /api/v1/daemon/config", s.handleDaemonConfig)
	mux.HandleFunc("GET /api/v1/project", s.handleGetProject)
	mux.HandleFunc("PUT /api/v1/project", s.handlePutProject)
	mux.HandleFunc("GET /api/v1/project/input-governance-mode", s.handleGetGovernanceMode)
	mux.HandleFunc("PUT /api/v1/project/input-governance-mode", s.handlePutGovernanceMode)
	mux.HandleFunc("GET /api/v1/project/detection", s.handleGetDetectionConfig)
	mux.HandleFunc("PUT /api/v1/project/detection", s.handlePutDetectionConfig)
	mux.HandleFunc("GET /api/v1/references", s.handleListReferences)
	mux.HandleFunc("POST /api/v1/references/sync", s.handleSyncReferences)
	mux.HandleFunc("POST /api/v1/books/{id}/detect/{chapter}/zhuque", s.handleDetectChapterZhuque)
	mux.HandleFunc("GET /api/v1/genres", s.handleListGenres)
	mux.HandleFunc("GET /api/v1/books", s.handleListBooks)
	mux.HandleFunc("GET /api/v1/books/{id}", s.handleGetBook)
	mux.HandleFunc("GET /api/v1/books/{id}/chapters", s.handleListChapters)
	mux.HandleFunc("GET /api/v1/books/{id}/chapters/{num}", s.handleGetChapter)
	mux.HandleFunc("PUT /api/v1/books/{id}/chapters/{num}", s.handlePutChapter)
	mux.HandleFunc("POST /api/v1/books/create", s.handleCreateBook)
	mux.HandleFunc("POST /api/v1/books/{id}/write-next", s.handleWriteNext)
	mux.HandleFunc("POST /api/v1/books/{id}/rewrite", s.handleRewriteChapter)
	mux.HandleFunc("POST /api/v1/books/{id}/plan", s.handlePlan)
	mux.HandleFunc("POST /api/v1/books/{id}/compose", s.handleCompose)
	mux.HandleFunc("POST /api/v1/books/{id}/draft", s.handleDraft)
	mux.HandleFunc("POST /api/v1/books/{id}/polish", s.handlePolish)
	mux.HandleFunc("POST /api/v1/books/{id}/audit/{chapter}", s.handleAudit)
	mux.HandleFunc("POST /api/v1/books/{id}/revise/{chapter}", s.handleRevise)
	mux.HandleFunc("POST /api/v1/books/{id}/detect/{chapter}", s.handleDetectChapter)
	mux.HandleFunc("POST /api/v1/books/{id}/detect-all", s.handleDetectAll)
	mux.HandleFunc("POST /api/v1/books/{id}/foundation/revise", s.handleFoundationRevise)
	mux.HandleFunc("POST /api/v1/books/{id}/repair-state/{chapter}", s.handleRepairState)
	mux.HandleFunc("POST /api/v1/books/{id}/chapters/{num}/approve", s.handleApproveChapter)
	mux.HandleFunc("POST /api/v1/books/{id}/chapters/{num}/reject", s.handleRejectChapter)
	mux.HandleFunc("POST /api/v1/books/{id}/style/import", s.handleImportStyle)
	mux.HandleFunc("POST /api/v1/books/{id}/import/chapters", s.handleImportChapters)
	mux.HandleFunc("GET /api/v1/books/{id}/analytics", s.handleBookAnalytics)
	mux.HandleFunc("GET /api/v1/books/{id}/eval", s.handleBookEval)
	mux.HandleFunc("GET /api/v1/books/{id}/export", s.handleExportBook)
	mux.HandleFunc("GET /api/v1/books/{id}/hooks/health", s.handleHookHealth)
	mux.HandleFunc("GET /api/v1/books/{id}/truth", s.handleListTruth)
	mux.HandleFunc("GET /api/v1/books/{id}/truth/{file...}", s.handleGetTruth)
	mux.HandleFunc("PUT /api/v1/books/{id}/truth/{file...}", s.handlePutTruth)
	mux.HandleFunc("POST /api/v1/books/{id}/consolidate", s.handleConsolidate)
	mux.HandleFunc("POST /api/v1/short-fiction", s.handleShortFiction)
	mux.HandleFunc("POST /api/v1/fanfic/init", s.handleFanficInit)
	mux.HandleFunc("POST /api/v1/spinoff/init", s.handleSpinoffInit)
	mux.HandleFunc("POST /api/v1/imitation/init", s.handleImitationInit)
	mux.HandleFunc("POST /api/v1/play/start", s.handlePlayStart)
	mux.HandleFunc("POST /api/v1/play/step", s.handlePlayStep)
	mux.HandleFunc("POST /api/v1/play/revise", s.handlePlayRevise)
	mux.HandleFunc("POST /api/v1/play/edit", s.handlePlayEdit)
	mux.HandleFunc("POST /api/v1/cover/generate", s.handleGenerateCover)
	mux.HandleFunc("POST /api/v1/radar/scan", s.handleRadarScan)
	mux.HandleFunc("GET /api/v1/interaction/session", s.handleInteractionSession)
	mux.HandleFunc("POST /api/v1/agent", s.handleAgent)
	return withCORS(mux)
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) sessionFor(bookID, lang string) *interaction.Session {
	s.mu.Lock()
	defer s.mu.Unlock()
	if sess, ok := s.sessions[bookID]; ok {
		return sess
	}
	if lang == "" {
		lang = "zh"
	}
	sess := interaction.NewSession(interaction.SessionConfig{
		Router: s.Router, ProjectRoot: s.ProjectRoot, Pipeline: s.Pipeline,
		BookID: bookID, Language: lang, Events: s.Hub,
	})
	s.sessions[bookID] = sess
	return sess
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func readJSONBody(r *http.Request, dest any) error {
	defer r.Body.Close()
	return json.NewDecoder(r.Body).Decode(dest)
}

func bookID(r *http.Request) string {
	return r.PathValue("id")
}
