package daemon_test

import (
	"context"
	"testing"
	"time"

	"github.com/LingByte/CinyuVerse/pkg/story/daemon"
	"github.com/LingByte/CinyuVerse/pkg/story/events"
	"github.com/LingByte/CinyuVerse/pkg/story/models"
	"github.com/LingByte/CinyuVerse/pkg/story/pipeline"
	"github.com/LingByte/CinyuVerse/pkg/story/store"
)

func TestDaemonStartStop(t *testing.T) {
	dir := t.TempDir()
	hub := events.NewHub()
	st := store.NewProjectStore(dir)
	run := pipeline.NewRunner(pipeline.Config{ProjectRoot: dir, Events: hub})
	svc := daemon.NewService(st, run, hub)

	if err := svc.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	state, _, err := svc.Status(context.Background())
	if err != nil || !state.Running {
		t.Fatalf("status: %+v err=%v", state, err)
	}
	if err := svc.Stop(context.Background()); err != nil {
		t.Fatal(err)
	}
	state, _, _ = svc.Status(context.Background())
	if state.Running {
		t.Fatal("expected stopped")
	}
}

func TestDaemonConfigPersist(t *testing.T) {
	dir := t.TempDir()
	st := store.NewProjectStore(dir)
	cfg := models.DefaultDaemonConfig()
	cfg.ChaptersPerCycle = 2
	if err := svcUpdate(st, cfg); err != nil {
		t.Fatal(err)
	}
	loaded, err := st.LoadProjectConfig()
	if err != nil || loaded.Daemon.ChaptersPerCycle != 2 {
		t.Fatalf("cfg: %+v err=%v", loaded.Daemon, err)
	}
	_ = time.Now()
}

func svcUpdate(st *store.ProjectStore, d models.DaemonConfig) error {
	p, err := st.LoadProjectConfig()
	if err != nil {
		return err
	}
	p.Daemon = d
	return st.SaveProjectConfig(p)
}
