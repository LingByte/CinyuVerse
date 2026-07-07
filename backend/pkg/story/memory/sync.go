package memory

import (
	"path/filepath"

	"github.com/LingByte/CinyuVerse/pkg/story/models"
	"github.com/LingByte/CinyuVerse/pkg/story/store"
)

// SyncFromSnapshot rebuilds the SQLite index from authoritative JSON state.
func SyncFromSnapshot(st store.BookStore, bookID string, snap models.RuntimeStateSnapshot) error {
	bookDir := filepath.Join(st.Root(), "books", bookID)
	db, err := Open(bookDir)
	if err != nil {
		return err
	}
	defer db.Close()
	if err := db.ReplaceSummaries(snap.ChapterSummaries.Rows); err != nil {
		return err
	}
	return db.ReplaceCurrentFacts(snap.CurrentState.Facts)
}
