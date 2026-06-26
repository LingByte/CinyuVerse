package api

import (
	"net/http"
	"strconv"

	"github.com/LingByte/CinyuVerse/pkg/story/agents"
	"github.com/LingByte/CinyuVerse/pkg/story/analytics"
	"github.com/LingByte/CinyuVerse/pkg/story/genres"
	"github.com/LingByte/CinyuVerse/pkg/story/models"
	"github.com/LingByte/CinyuVerse/pkg/story/references"
)

func (s *Server) handleListChapters(w http.ResponseWriter, r *http.Request) {
	index, err := s.Store.LoadChapterIndex(bookID(r))
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, index)
}

func (s *Server) handleGetChapter(w http.ResponseWriter, r *http.Request) {
	ch, _ := strconv.Atoi(r.PathValue("num"))
	index, err := s.Store.LoadChapterIndex(bookID(r))
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
		return
	}
	var meta models.ChapterMeta
	for _, c := range index {
		if c.Number == ch {
			meta = c
			break
		}
	}
	if meta.FileName == "" {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "chapter not found"})
		return
	}
	content, err := s.Store.ReadText(bookID(r), "chapters/"+meta.FileName)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"meta": meta, "content": content})
}

func (s *Server) handlePutChapter(w http.ResponseWriter, r *http.Request) {
	ch, _ := strconv.Atoi(r.PathValue("num"))
	var req struct {
		Title   string `json:"title"`
		Content string `json:"content"`
	}
	if err := readJSONBody(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	book, err := s.Store.LoadBookConfig(bookID(r))
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
		return
	}
	meta := models.ChapterMeta{
		Number: ch, Title: req.Title,
		WordCount: agents.CountLength(req.Content, book.Language),
		Status:    models.ChapterStatusReadyForReview,
	}
	if err := s.Store.SaveChapter(bookID(r), meta, req.Content); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, meta)
}

func (s *Server) handleRewriteChapter(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Chapter   int    `json:"chapter"`
		Guidance  string `json:"guidance"`
		WordCount int    `json:"wordCount"`
	}
	if err := readJSONBody(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	out, err := s.Pipeline.RewriteChapter(r.Context(), bookID(r), req.Chapter, req.Guidance, req.WordCount)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleRepairState(w http.ResponseWriter, r *http.Request) {
	ch, _ := strconv.Atoi(r.PathValue("chapter"))
	if err := s.Pipeline.RepairChapterState(r.Context(), bookID(r), ch); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handlePolish(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Chapter int    `json:"chapter"`
		Content string `json:"content"`
	}
	if err := readJSONBody(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	content := req.Content
	if content == "" && req.Chapter > 0 {
		book, err := s.Store.LoadBookConfig(bookID(r))
		if err != nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
			return
		}
		index, err := s.Store.LoadChapterIndex(bookID(r))
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		for _, ch := range index {
			if ch.Number == req.Chapter {
				content, err = s.Store.ReadText(bookID(r), "chapters/"+ch.FileName)
				if err != nil {
					writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
					return
				}
				_ = book
				break
			}
		}
	}
	out, err := s.Pipeline.PolishChapter(r.Context(), bookID(r), content)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"content": out})
}

func (s *Server) handleFanficInit(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Book       models.BookConfig `json:"book"`
		SourceText string            `json:"sourceText"`
		SourceName string            `json:"sourceName"`
		Mode       models.FanficMode `json:"mode"`
	}
	if err := readJSONBody(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if err := s.Pipeline.InitFanficBook(r.Context(), req.Book, req.SourceText, req.SourceName, req.Mode); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, req.Book)
}

func (s *Server) handleImportChapters(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Chapters []agents.ImportChapterMeta `json:"chapters"`
	}
	if err := readJSONBody(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	out, err := s.Pipeline.ImportChapters(r.Context(), bookID(r), req.Chapters)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleDaemonUnpause(w http.ResponseWriter, r *http.Request) {
	var req struct{ BookID string `json:"bookId"` }
	if err := readJSONBody(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if req.BookID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bookId required"})
		return
	}
	s.Daemon.UnpauseBook(req.BookID)
	writeJSON(w, http.StatusOK, map[string]string{"status": "unpaused"})
}

func (s *Server) handleBookAnalytics(w http.ResponseWriter, r *http.Request) {
	stats, err := analytics.ComputeBookStats(s.Store, bookID(r))
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, stats)
}

func (s *Server) handleBookEval(w http.ResponseWriter, r *http.Request) {
	id := bookID(r)
	stats, err := analytics.ComputeBookStats(s.Store, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	health := s.Pipeline.HookHealth(id, stats.ChapterCount)
	report := analytics.EvaluateBook(stats, health.OpenCount, health.StaleDebt)
	writeJSON(w, http.StatusOK, report)
}

func (s *Server) handleExportBook(w http.ResponseWriter, r *http.Request) {
	format := r.URL.Query().Get("format")
	if format == "" {
		format = "md"
	}
	out, err := analytics.FormatExport(s.Store, bookID(r), format)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if format == "txt" {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	} else {
		w.Header().Set("Content-Type", "text/markdown; charset=utf-8")
	}
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(out))
}

func (s *Server) handleListGenres(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, genres.BuiltIn())
}

func (s *Server) handlePlayRevise(w http.ResponseWriter, r *http.Request) {
	var req agents.PlayReviseInput
	if err := readJSONBody(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	out, err := s.Pipeline.PlayRevise(r.Context(), req)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handlePlayEdit(w http.ResponseWriter, r *http.Request) {
	var req agents.PlayEditInput
	if err := readJSONBody(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	out, err := s.Pipeline.PlayEdit(req)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleGetGovernanceMode(w http.ResponseWriter, r *http.Request) {
	cfg, err := s.Store.LoadProjectConfig()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"mode": cfg.InputGovernanceMode})
}

func (s *Server) handlePutGovernanceMode(w http.ResponseWriter, r *http.Request) {
	var req struct{ Mode string `json:"mode"` }
	if err := readJSONBody(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	cfg, err := s.Store.LoadProjectConfig()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	cfg.InputGovernanceMode = req.Mode
	if err := s.Store.SaveProjectConfig(cfg); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"mode": cfg.InputGovernanceMode})
}

func (s *Server) handleGetDetectionConfig(w http.ResponseWriter, r *http.Request) {
	cfg, err := s.Store.LoadProjectConfig()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, cfg.Detection)
}

func (s *Server) handlePutDetectionConfig(w http.ResponseWriter, r *http.Request) {
	var det models.DetectionConfig
	if err := readJSONBody(r, &det); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	cfg, err := s.Store.LoadProjectConfig()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	cfg.Detection = det
	if err := s.Store.SaveProjectConfig(cfg); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, cfg.Detection)
}

func (s *Server) handleListReferences(w http.ResponseWriter, r *http.Request) {
	lib := references.NewLibrary(s.ProjectRoot)
	_ = lib.EnsureLayout()
	files, err := lib.ListSourceFiles()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	pending, _ := lib.NeedsSync()
	idx, _ := lib.LoadIndex()
	corpus, _ := lib.LoadCorpus()
	writeJSON(w, http.StatusOK, map[string]any{
		"dir": "references", "files": files, "pendingSync": pending,
		"index": idx, "corpusChars": len([]rune(corpus)),
	})
}

func (s *Server) handleSyncReferences(w http.ResponseWriter, r *http.Request) {
	force := r.URL.Query().Get("force") == "true"
	corpus, err := s.Pipeline.SyncReferenceLibrary(r.Context(), force)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"status": "ok", "corpusChars": len([]rune(corpus)), "corpusPreview": truncatePreview(corpus, 500),
	})
}

func (s *Server) handleDetectChapterZhuque(w http.ResponseWriter, r *http.Request) {
	ch, _ := strconv.Atoi(r.PathValue("chapter"))
	out, err := s.Pipeline.DetectChapterZhuque(r.Context(), bookID(r), ch)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func truncatePreview(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n]) + "…"
}

func (s *Server) handleHookHealth(w http.ResponseWriter, r *http.Request) {
	ch, _ := strconv.Atoi(r.URL.Query().Get("chapter"))
	if ch <= 0 {
		ch = 1
	}
	writeJSON(w, http.StatusOK, s.Pipeline.HookHealth(bookID(r), ch))
}
