package api

import (
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/LingByte/CinyuVerse/pkg/story/events"
	"github.com/LingByte/CinyuVerse/pkg/story/models"
)

func (s *Server) handleEvents(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "streaming unsupported"})
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	filterType := r.URL.Query().Get("type")
	sub, unsub := s.Hub.Subscribe(func(ev events.Event) bool {
		if filterType == "" {
			return true
		}
		return ev.Type == filterType || ev.Type == filterType+":" || len(ev.Type) >= len(filterType) && ev.Type[:len(filterType)] == filterType
	})
	defer unsub()

	fmt.Fprintf(w, "data: %s\n\n", `{"type":"connected","message":"sse connected"}`)
	flusher.Flush()

	notify := r.Context().Done()
	ticker := time.NewTicker(25 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-notify:
			return
		case ev, open := <-sub.Ch:
			if !open {
				return
			}
			_, _ = w.Write(events.FormatSSE(ev))
			flusher.Flush()
		case <-ticker.C:
			_, _ = w.Write([]byte(": ping\n\n"))
			flusher.Flush()
		}
	}
}

func (s *Server) handleLogs(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.Hub.Recent("log", 100))
}

func (s *Server) handleDaemonStatus(w http.ResponseWriter, r *http.Request) {
	state, cfg, err := s.Daemon.Status(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"runtime": state, "config": cfg})
}

func (s *Server) handleDaemonStart(w http.ResponseWriter, r *http.Request) {
	if err := s.Daemon.Start(r.Context()); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "started"})
}

func (s *Server) handleDaemonStop(w http.ResponseWriter, r *http.Request) {
	if err := s.Daemon.Stop(r.Context()); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "stopped"})
}

func (s *Server) handleDaemonConfig(w http.ResponseWriter, r *http.Request) {
	var cfg models.DaemonConfig
	if err := readJSONBody(r, &cfg); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if err := s.Daemon.UpdateConfig(cfg); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleGetProject(w http.ResponseWriter, r *http.Request) {
	cfg, err := s.Store.LoadProjectConfig()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, cfg)
}

func (s *Server) handlePutProject(w http.ResponseWriter, r *http.Request) {
	var cfg models.ProjectConfig
	if err := readJSONBody(r, &cfg); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if err := s.Store.SaveProjectConfig(cfg); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, cfg)
}

func (s *Server) handleDetectChapter(w http.ResponseWriter, r *http.Request) {
	ch, _ := strconv.Atoi(r.PathValue("chapter"))
	local, zhuque, err := s.Pipeline.DetectChapterFull(r.Context(), bookID(r), ch)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	resp := map[string]any{
		"chapterNumber": local.ChapterNumber,
		"title":         local.Title,
		"aiTells":       local.AITells,
		"sensitive":     local.Sensitive,
		"postWrite":     local.PostWrite,
	}
	if zhuque != nil {
		resp["zhuque"] = zhuque
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *Server) handleDetectAll(w http.ResponseWriter, r *http.Request) {
	out, err := s.Pipeline.DetectAllChapters(r.Context(), bookID(r))
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleFoundationRevise(w http.ResponseWriter, r *http.Request) {
	var req struct{ Feedback string `json:"feedback"` }
	if err := readJSONBody(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if err := s.Pipeline.ReviseFoundation(r.Context(), bookID(r), req.Feedback); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleApproveChapter(w http.ResponseWriter, r *http.Request) {
	ch, _ := strconv.Atoi(r.PathValue("num"))
	if err := s.Pipeline.ApproveChapter(bookID(r), ch); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "approved"})
}

func (s *Server) handleRejectChapter(w http.ResponseWriter, r *http.Request) {
	ch, _ := strconv.Atoi(r.PathValue("num"))
	if err := s.Pipeline.RejectChapter(bookID(r), ch); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "rejected"})
}

func (s *Server) handleImportStyle(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ReferenceText string `json:"referenceText"`
		SourceName    string `json:"sourceName"`
	}
	if err := readJSONBody(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	out, err := s.Pipeline.ImportStyle(r.Context(), bookID(r), req.ReferenceText, req.SourceName)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleSpinoffInit(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SourceBookID string            `json:"sourceBookId"`
		Book         models.BookConfig `json:"book"`
		Direction    string            `json:"direction"`
	}
	if err := readJSONBody(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if err := s.Pipeline.InitSpinoff(r.Context(), req.SourceBookID, req.Book, req.Direction); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, req.Book)
}

func (s *Server) handleImitationInit(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Book          models.BookConfig `json:"book"`
		ReferenceText string            `json:"referenceText"`
	}
	if err := readJSONBody(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if err := s.Pipeline.InitImitation(r.Context(), req.Book, req.ReferenceText); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, req.Book)
}
