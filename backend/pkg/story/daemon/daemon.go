package daemon

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/LingByte/CinyuVerse/pkg/story/agents"
	"github.com/LingByte/CinyuVerse/pkg/story/events"
	"github.com/LingByte/CinyuVerse/pkg/story/models"
	"github.com/LingByte/CinyuVerse/pkg/story/pipeline"
	"github.com/LingByte/CinyuVerse/pkg/story/store"
)

// Service runs background auto-write cycles for active books.
type Service struct {
	st       store.BookStore
	run      *pipeline.Runner
	hub      *events.Hub
	mu       sync.Mutex
	state    models.DaemonRuntimeState
	cancel   context.CancelFunc
	cfg      models.DaemonConfig
	failures map[string]int // consecutive audit failures per book
}

// NewService creates a daemon bound to a pipeline runner and event hub.
func NewService(st store.BookStore, run *pipeline.Runner, hub *events.Hub) *Service {
	return &Service{st: st, run: run, hub: hub, failures: map[string]int{}}
}

// Status returns current daemon runtime state and config.
func (d *Service) Status(ctx context.Context) (models.DaemonRuntimeState, models.DaemonConfig, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	cfg, err := d.st.LoadProjectConfig()
	if err != nil {
		return d.state, models.DaemonConfig{}, err
	}
	return d.state, cfg.Daemon, nil
}

// Start begins the background write loop.
func (d *Service) Start(ctx context.Context) error {
	d.mu.Lock()
	if d.state.Running {
		d.mu.Unlock()
		return fmt.Errorf("daemon already running")
	}
	cfg, err := d.st.LoadProjectConfig()
	if err != nil {
		d.mu.Unlock()
		return err
	}
	cfg.Daemon.Enabled = true
	if err := d.st.SaveProjectConfig(cfg); err != nil {
		d.mu.Unlock()
		return err
	}
	d.cfg = cfg.Daemon
	loopCtx, cancel := context.WithCancel(context.Background())
	d.cancel = cancel
	d.state = models.DaemonRuntimeState{
		Running: true, StartedAt: time.Now().UTC(), DayStarted: time.Now().UTC(),
	}
	d.mu.Unlock()

	if d.hub != nil {
		d.hub.Daemon("start", "daemon started", map[string]any{"config": d.cfg})
	}
	go d.loop(loopCtx)
	return nil
}

// Stop halts the background loop.
func (d *Service) Stop(ctx context.Context) error {
	d.mu.Lock()
	defer d.mu.Unlock()
	if d.cancel != nil {
		d.cancel()
		d.cancel = nil
	}
	d.state.Running = false
	cfg, err := d.st.LoadProjectConfig()
	if err == nil {
		cfg.Daemon.Enabled = false
		_ = d.st.SaveProjectConfig(cfg)
	}
	if d.hub != nil {
		d.hub.Daemon("stop", "daemon stopped", nil)
	}
	return err
}

// UpdateConfig merges daemon settings and persists project.json.
func (d *Service) UpdateConfig(cfg models.DaemonConfig) error {
	proj, err := d.st.LoadProjectConfig()
	if err != nil {
		return err
	}
	proj.Daemon = cfg
	if err := d.st.SaveProjectConfig(proj); err != nil {
		return err
	}
	d.mu.Lock()
	d.cfg = cfg
	d.mu.Unlock()
	return nil
}

func (d *Service) loop(ctx context.Context) {
	interval := time.Duration(d.cfg.Schedule.WriteIntervalMinutes) * time.Minute
	if interval <= 0 {
		interval = 15 * time.Minute
	}
	radarInterval := time.Duration(d.cfg.Schedule.RadarIntervalMinutes) * time.Minute
	if radarInterval <= 0 {
		radarInterval = 360 * time.Minute
	}
	writeTicker := time.NewTicker(interval)
	defer writeTicker.Stop()
	radarTicker := time.NewTicker(radarInterval)
	defer radarTicker.Stop()
	d.runCycle(ctx)
	for {
		select {
		case <-ctx.Done():
			return
		case <-writeTicker.C:
			d.runCycle(ctx)
		case <-radarTicker.C:
			d.runRadar(ctx)
		}
	}
}

func (d *Service) runRadar(ctx context.Context) {
	if d.hub != nil {
		d.hub.Daemon("radar", "scheduled radar scan", nil)
	}
	_, _ = d.run.RadarScan(ctx, "platform trends for web fiction", models.LanguageZH)
}

func (d *Service) runCycle(ctx context.Context) {
	d.mu.Lock()
	d.state.LastCycleAt = time.Now().UTC()
	if d.state.DayStarted.IsZero() || time.Since(d.state.DayStarted) > 24*time.Hour {
		d.state.DayStarted = time.Now().UTC()
		d.state.ChaptersWrittenToday = 0
	}
	if d.state.ChaptersWrittenToday >= d.cfg.MaxChaptersPerDay {
		d.mu.Unlock()
		if d.hub != nil {
			d.hub.Daemon("cycle", "daily chapter cap reached", nil)
		}
		return
	}
	cfg := d.cfg
	paused := map[string]bool{}
	for _, id := range d.state.PausedBookIDs {
		paused[id] = true
	}
	d.mu.Unlock()

	if d.hub != nil {
		d.hub.Daemon("cycle", "starting write cycle", nil)
	}

	books, err := d.st.ListBooks()
	if err != nil {
		d.setError(err)
		return
	}
	var active []models.BookConfig
	for _, b := range books {
		if b.Status != models.BookStatusActive {
			continue
		}
		if len(cfg.AutoBookIDs) > 0 && !contains(cfg.AutoBookIDs, b.ID) {
			continue
		}
		if paused[b.ID] {
			continue
		}
		active = append(active, b)
		if len(active) >= cfg.MaxConcurrentBooks {
			break
		}
	}

	written := 0
	for _, book := range active {
		for c := 0; c < cfg.ChaptersPerCycle; c++ {
			if d.atDailyCap() {
				break
			}
			if d.hub != nil {
				d.hub.Daemon("chapter", fmt.Sprintf("writing next for %s", book.ID), map[string]any{"bookId": book.ID})
			}
			result, err := d.run.WriteNextChapter(ctx, book.ID, 0, "")
			if err != nil {
				d.recordFailure(book.ID, err)
				break
			}
			d.recordSuccess(book.ID)
			written++
			if d.hub != nil {
				d.hub.Daemon("chapter", fmt.Sprintf("chapter %d complete", result.ChapterNumber), map[string]any{
					"bookId": book.ID, "chapter": result.ChapterNumber, "title": result.Title, "auditPassed": result.Audit.Passed,
				})
			}
			if !result.Audit.Passed {
				retries := d.cfg.QualityGates.MaxAuditRetries
				if retries <= 0 {
					retries = 2
				}
				revised := false
				for attempt := 0; attempt < retries && !result.Audit.Passed; attempt++ {
					if d.cfg.RetryDelayMs > 0 {
						select {
						case <-ctx.Done():
							return
						case <-time.After(time.Duration(d.cfg.RetryDelayMs) * time.Millisecond):
						}
					}
					revResult, revErr := d.run.ReviseChapter(ctx, book.ID, result.ChapterNumber, agents.ReviseModeAuto, false, false)
					if revErr != nil {
						break
					}
					revised = revResult.Saved
					audit, auditErr := d.run.AuditChapter(ctx, book.ID, result.ChapterNumber)
					if auditErr == nil {
						result.Audit = audit
					}
				}
				if revised && d.hub != nil {
					d.hub.Daemon("retry", "audit retry complete", map[string]any{"bookId": book.ID, "passed": result.Audit.Passed})
				}
				if !result.Audit.Passed {
					d.recordAuditFailure(book.ID)
				} else {
					d.clearFailures(book.ID)
				}
			} else {
				d.clearFailures(book.ID)
			}
			if cfg.CooldownAfterChapterMs > 0 {
				select {
				case <-ctx.Done():
					return
				case <-time.After(time.Duration(cfg.CooldownAfterChapterMs) * time.Millisecond):
				}
			}
		}
	}
	if d.hub != nil {
		d.hub.Daemon("cycle", fmt.Sprintf("cycle complete (%d chapters)", written), map[string]any{"written": written})
	}
}

func (d *Service) atDailyCap() bool {
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.state.ChaptersWrittenToday >= d.cfg.MaxChaptersPerDay
}

func (d *Service) recordSuccess(bookID string) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.state.ChaptersWrittenToday++
	d.state.LastError = ""
	delete(d.failures, bookID)
	var kept []string
	for _, id := range d.state.PausedBookIDs {
		if id != bookID {
			kept = append(kept, id)
		}
	}
	d.state.PausedBookIDs = kept
}

func (d *Service) recordFailure(bookID string, err error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.state.LastError = err.Error()
	if d.hub != nil {
		d.hub.Daemon("error", err.Error(), map[string]any{"bookId": bookID})
	}
}

func (d *Service) recordAuditFailure(bookID string) {
	d.mu.Lock()
	defer d.mu.Unlock()
	threshold := d.cfg.QualityGates.PauseAfterConsecutiveFailures
	if threshold <= 0 {
		threshold = 3
	}
	d.failures[bookID]++
	if d.failures[bookID] >= threshold && !contains(d.state.PausedBookIDs, bookID) {
		d.state.PausedBookIDs = append(d.state.PausedBookIDs, bookID)
		if d.hub != nil {
			d.hub.Daemon("pause", fmt.Sprintf("book paused after %d consecutive audit failures", d.failures[bookID]), map[string]any{"bookId": bookID})
		}
	}
}

func (d *Service) clearFailures(bookID string) {
	d.mu.Lock()
	defer d.mu.Unlock()
	delete(d.failures, bookID)
}

func (d *Service) setError(err error) {
	d.mu.Lock()
	d.state.LastError = err.Error()
	d.mu.Unlock()
	if d.hub != nil {
		d.hub.Daemon("error", err.Error(), nil)
	}
}

func contains(ss []string, v string) bool {
	for _, s := range ss {
		if s == v {
			return true
		}
	}
	return false
}

// UnpauseBook removes a book from the daemon pause list.
func (d *Service) UnpauseBook(bookID string) {
	d.mu.Lock()
	defer d.mu.Unlock()
	var kept []string
	for _, id := range d.state.PausedBookIDs {
		if id != bookID {
			kept = append(kept, id)
		}
	}
	d.state.PausedBookIDs = kept
}
