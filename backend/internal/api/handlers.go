package api

import (
	"net/http"
	"strconv"
	"strings"
	"unicode"

	"github.com/LingByte/CinyuVerse/pkg/story/agents"
	"github.com/LingByte/CinyuVerse/pkg/story/models"
	"github.com/LingByte/CinyuVerse/pkg/story/store"
)

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleListAgents(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, s.Pipeline.ListAgents())
}

func (s *Server) handleListBooks(w http.ResponseWriter, _ *http.Request) {
	books, err := s.Store.ListBooks()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, books)
}

func (s *Server) handleGetBook(w http.ResponseWriter, r *http.Request) {
	cfg, err := s.Store.LoadBookConfig(bookID(r))
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, cfg)
}

func (s *Server) handleCreateBook(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Title    string          `json:"title"`
		ID       string          `json:"id"`
		Genre    string          `json:"genre"`
		Language models.Language `json:"language"`
		Brief    string          `json:"brief"`
	}
	if err := readJSONBody(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if req.Title == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "title required"})
		return
	}
	id := req.ID
	if id == "" {
		id = slugTitle(req.Title)
	}
	cfg := models.BookConfig{
		ID: id, Title: req.Title, Genre: req.Genre, Language: req.Language, Status: models.BookStatusDraft,
	}
	if cfg.Language == "" {
		cfg.Language = models.LanguageZH
	}
	if cfg.Genre == "" {
		cfg.Genre = "xuanhuan"
	}
	if err := s.Pipeline.InitBook(r.Context(), cfg, req.Brief); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	state, err := store.ExportBookState(s.Store, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	result := models.CreateBookResult{Book: cfg, State: state}
	result.Foundation.StoryBible = state.Documents["story/story_bible.md"]
	result.Foundation.VolumeOutline = state.Documents["story/volume_outline.md"]
	result.Foundation.BookRules = state.Documents["story/book_rules.md"]
	result.Foundation.PendingHooks = state.Documents["story/pending_hooks.md"]
	result.Foundation.CurrentState = state.Documents["story/current_state.md"]
	writeJSON(w, http.StatusCreated, result)
}

func (s *Server) handleWriteNext(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Guidance  string            `json:"guidance"`
		WordCount int               `json:"wordCount"`
		State     *models.BookState `json:"state"`
	}
	if err := readJSONBody(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	id := bookID(r)
	if req.State != nil {
		if err := store.ApplyBookState(s.Store, *req.State); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
	}
	out, err := s.Pipeline.WriteNextChapter(r.Context(), id, req.WordCount, req.Guidance)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	bookState, err := store.ExportBookState(s.Store, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, models.WriteNextResult{
		ChapterNumber: out.ChapterNumber,
		Title:         out.Title,
		Content:       out.Content,
		WordCount:     out.WordCount,
		Revised:       out.Revised,
		Status:        out.Status,
		ChapterMeta:   out.ChapterMeta,
		State:         bookState,
	})
}

func (s *Server) handlePlan(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Guidance string `json:"guidance"`
	}
	_ = readJSONBody(r, &req)
	out, err := s.Pipeline.PlanChapter(r.Context(), bookID(r), req.Guidance)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleCompose(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Guidance string `json:"guidance"`
	}
	_ = readJSONBody(r, &req)
	out, err := s.Pipeline.ComposeChapter(r.Context(), bookID(r), req.Guidance)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleDraft(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Guidance  string `json:"guidance"`
		WordCount int    `json:"wordCount"`
	}
	_ = readJSONBody(r, &req)
	out, err := s.Pipeline.DraftChapter(r.Context(), bookID(r), req.WordCount, req.Guidance)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleAudit(w http.ResponseWriter, r *http.Request) {
	ch, _ := strconv.Atoi(r.PathValue("chapter"))
	out, err := s.Pipeline.AuditChapter(r.Context(), bookID(r), ch)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleRevise(w http.ResponseWriter, r *http.Request) {
	ch, _ := strconv.Atoi(r.PathValue("chapter"))
	var req struct {
		Mode   string `json:"mode"`
		DryRun bool   `json:"dryRun"`
		Force  bool   `json:"force"`
	}
	_ = readJSONBody(r, &req)
	if r.URL.Query().Get("dryRun") == "true" {
		req.DryRun = true
	}
	mode := agents.ReviseModeAuto
	if req.Mode != "" {
		mode = agents.ReviseMode(req.Mode)
	}
	out, err := s.Pipeline.ReviseChapter(r.Context(), bookID(r), ch, mode, req.DryRun, req.Force)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleListTruth(w http.ResponseWriter, r *http.Request) {
	id := bookID(r)
	files, err := s.Store.ListTruthFiles(id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"bookId": id, "files": files})
}

func (s *Server) handleGetTruth(w http.ResponseWriter, r *http.Request) {
	rel := r.PathValue("file")
	content, err := s.Store.ReadText(bookID(r), rel)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
		return
	}
	w.Header().Set("Content-Type", "text/markdown; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(content))
}

func (s *Server) handlePutTruth(w http.ResponseWriter, r *http.Request) {
	rel := r.PathValue("file")
	var req struct {
		Content string `json:"content"`
	}
	if err := readJSONBody(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if err := s.Store.WriteText(bookID(r), rel, req.Content); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleConsolidate(w http.ResponseWriter, r *http.Request) {
	out, err := s.Pipeline.ConsolidateSummaries(r.Context(), bookID(r))
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"summary": out})
}

func (s *Server) handleShortFiction(w http.ResponseWriter, r *http.Request) {
	var req agents.ShortFictionRunInput
	if err := readJSONBody(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	out, err := s.Pipeline.RunShortFiction(r.Context(), req)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handlePlayStart(w http.ResponseWriter, r *http.Request) {
	var req agents.PlayStartInput
	if err := readJSONBody(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	out, err := s.Pipeline.PlayStart(r.Context(), req)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handlePlayStep(w http.ResponseWriter, r *http.Request) {
	var req agents.PlayStepInput
	if err := readJSONBody(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	out, err := s.Pipeline.PlayStep(r.Context(), req)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleGenerateCover(w http.ResponseWriter, r *http.Request) {
	var req agents.CoverInput
	if err := readJSONBody(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	out, err := s.Pipeline.GenerateCover(r.Context(), req)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleRadarScan(w http.ResponseWriter, r *http.Request) {
	var req struct {
		PlatformContext string          `json:"platformContext"`
		Language        models.Language `json:"language"`
	}
	if err := readJSONBody(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	out, err := s.Pipeline.RadarScan(r.Context(), req.PlatformContext, req.Language)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleInteractionSession(w http.ResponseWriter, r *http.Request) {
	bookID := r.URL.Query().Get("bookId")
	if bookID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bookId required"})
		return
	}
	cfg, err := s.Store.LoadBookConfig(bookID)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
		return
	}
	sess := s.sessionFor(bookID, string(cfg.Language))
	msgs := sess.Messages()
	writeJSON(w, http.StatusOK, map[string]any{"bookId": bookID, "messages": msgs})
}

func (s *Server) handleAgent(w http.ResponseWriter, r *http.Request) {
	var req struct {
		BookID      string `json:"bookId"`
		Instruction string `json:"instruction"`
		Language    string `json:"language"`
	}
	if err := readJSONBody(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if req.BookID == "" || req.Instruction == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bookId and instruction required"})
		return
	}
	lang := req.Language
	if lang == "" {
		lang = "zh"
	}
	sess := s.sessionFor(req.BookID, lang)
	out, err := sess.Run(r.Context(), req.Instruction)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"response": out})
}

func slugTitle(title string) string {
	var b strings.Builder
	for _, r := range strings.TrimSpace(title) {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9':
			b.WriteRune(unicode.ToLower(r))
		case r >= '\u4e00' && r <= '\u9fff':
			b.WriteRune(r)
		default:
			b.WriteRune('-')
		}
	}
	out := strings.Trim(b.String(), "-")
	if out == "" {
		return "book"
	}
	return out
}
