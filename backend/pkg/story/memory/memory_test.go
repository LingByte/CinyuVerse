package memory_test

import (
	"path/filepath"
	"testing"

	"github.com/LingByte/CinyuVerse/pkg/story/memory"
	"github.com/LingByte/CinyuVerse/pkg/story/models"
)

func TestMemoryDBSummariesAndFacts(t *testing.T) {
	dir := t.TempDir()
	db, err := memory.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	if err := db.ReplaceSummaries([]models.ChapterSummaryRow{
		{Chapter: 1, Title: "开端", Summary: "主角出场"},
		{Chapter: 2, Title: "转折", Summary: "发现线索"},
	}); err != nil {
		t.Fatal(err)
	}
	if err := db.ReplaceCurrentFacts([]models.CurrentStateFact{
		{Key: "location", Value: "山门", Chapter: 1},
	}); err != nil {
		t.Fatal(err)
	}
	sums, err := db.GetSummaries(1, 2)
	if err != nil || len(sums) != 2 {
		t.Fatalf("summaries: %v %v", sums, err)
	}
	facts, err := db.GetCurrentFacts()
	if err != nil || len(facts) != 1 {
		t.Fatalf("facts: %v %v", facts, err)
	}
	if db.Path() != filepath.Join(dir, "story", "memory.db") {
		t.Fatalf("path=%s", db.Path())
	}
}

func TestRetrieveMemorySelection(t *testing.T) {
	dir := t.TempDir()
	snap := models.NewEmptyRuntimeSnapshot(models.LanguageZH)
	snap.ChapterSummaries.Rows = []models.ChapterSummaryRow{
		{Chapter: 1, Title: "开端", Summary: "林烬到山门"},
	}
	snap.CurrentState.Facts = []models.CurrentStateFact{{Key: "location", Value: "山门", Chapter: 1}}
	sel, err := memory.Retrieve(memory.RetrieveInput{
		BookDir: dir, ChapterNumber: 2, Goal: "林烬山门", Snapshot: snap,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(sel.Summaries) == 0 {
		t.Fatal("expected summaries")
	}
}

func TestComputeRecyclableHooks(t *testing.T) {
	hooks := []models.HookRecord{{
		HookID: "h1", StartChapter: 1, Status: models.HookStatusOpen, LastAdvancedChapter: 1,
	}}
	out := memory.ComputeRecyclableHooks(hooks, 12)
	if len(out) != 1 {
		t.Fatalf("expected recyclable hook, got %d", len(out))
	}
}
