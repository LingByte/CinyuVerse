package store

import (
	"os"

	"github.com/LingByte/CinyuVerse/pkg/story/models"
	"github.com/LingByte/CinyuVerse/pkg/story/state"
)

const (
	relManifest         = "story/state/manifest.json"
	relHooks            = "story/state/hooks.json"
	relCurrentStateJSON = "story/state/current_state.json"
	relSummariesJSON    = "story/state/chapter_summaries.json"
)

// LoadRuntimeSnapshot loads authoritative JSON state or returns an empty snapshot.
func (s *ProjectStore) LoadRuntimeSnapshot(bookID string, lang models.Language) (models.RuntimeStateSnapshot, error) {
	in := state.LoadSnapshotInput{}
	if err := s.ReadJSON(bookID, relManifest, &in.Manifest); err != nil && !os.IsNotExist(err) {
		return models.RuntimeStateSnapshot{}, err
	}
	if err := s.ReadJSON(bookID, relHooks, &in.Hooks); err != nil && !os.IsNotExist(err) {
		return models.RuntimeStateSnapshot{}, err
	}
	if err := s.ReadJSON(bookID, relCurrentStateJSON, &in.CurrentState); err != nil && !os.IsNotExist(err) {
		return models.RuntimeStateSnapshot{}, err
	}
	if err := s.ReadJSON(bookID, relSummariesJSON, &in.ChapterSummaries); err != nil && !os.IsNotExist(err) {
		return models.RuntimeStateSnapshot{}, err
	}
	return state.MergeLoadInput(in, lang), nil
}

// SaveRuntimeSnapshot persists JSON state and Markdown projections.
func (s *ProjectStore) SaveRuntimeSnapshot(bookID string, snap models.RuntimeStateSnapshot) error {
	writeJSON := func(rel string, v any) error { return s.WriteJSON(bookID, rel, v) }
	writeText := func(rel, content string) error { return s.WriteText(bookID, rel, content) }
	return state.PersistSnapshot(writeJSON, writeText, snap)
}
