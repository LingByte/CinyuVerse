package state

import (
	"fmt"
	"strings"
	"time"

	"github.com/LingByte/CinyuVerse/pkg/story/hooks"
	"github.com/LingByte/CinyuVerse/pkg/story/models"
)

// ApplyDelta immutably applies a RuntimeStateDelta onto a snapshot.
func ApplyDelta(snapshot models.RuntimeStateSnapshot, delta models.RuntimeStateDelta) (models.RuntimeStateSnapshot, error) {
	if err := ValidateDelta(delta); err != nil {
		return snapshot, err
	}
	out := snapshot
	out.Manifest.LastAppliedChapter = delta.ChapterNumber
	out.Manifest.ProjectionVersion++

	for _, op := range delta.HookOps {
		if issues := hooks.ValidateAdmission(op, out.Hooks); len(issues) > 0 {
			return out, fmt.Errorf("hook admission: %s", strings.Join(issues, "; "))
		}
		switch strings.ToLower(op.Action) {
		case "upsert", "mention":
			upsertHook(&out.Hooks, op, delta.ChapterNumber)
		case "resolve":
			resolveHook(&out.Hooks, op.HookID, delta.ChapterNumber)
		case "defer":
			deferHook(&out.Hooks, op.HookID, delta.ChapterNumber)
		default:
			return out, fmt.Errorf("unknown hook action %q", op.Action)
		}
	}

	if delta.CurrentState != nil {
		applyCurrentStatePatch(&out.CurrentState, *delta.CurrentState, delta.ChapterNumber)
	}

	if delta.ChapterSummary != nil {
		upsertSummary(&out.ChapterSummaries, *delta.ChapterSummary)
	}

	return out, nil
}

func upsertHook(hooks *models.HooksState, op models.HookOp, chapter int) {
	for i, h := range hooks.Hooks {
		if h.HookID == op.HookID {
			rec := hooks.Hooks[i]
			if op.Type != "" {
				rec.Type = op.Type
			}
			if op.Status != "" {
				rec.Status = op.Status
			}
			if op.LastAdvancedChapter > 0 {
				rec.LastAdvancedChapter = op.LastAdvancedChapter
			} else if op.Action == "mention" || op.Action == "upsert" {
				rec.LastAdvancedChapter = chapter
			}
			if op.ExpectedPayoff != "" {
				rec.ExpectedPayoff = op.ExpectedPayoff
			}
			if op.Notes != "" {
				rec.Notes = op.Notes
			}
			hooks.Hooks[i] = rec
			return
		}
	}
	status := op.Status
	if status == "" {
		status = models.HookStatusOpen
	}
	hooks.Hooks = append(hooks.Hooks, models.HookRecord{
		HookID:              op.HookID,
		StartChapter:        chapter,
		Type:                op.Type,
		Status:              status,
		LastAdvancedChapter: chapter,
		ExpectedPayoff:      op.ExpectedPayoff,
		Notes:               op.Notes,
	})
}

func resolveHook(hooks *models.HooksState, hookID string, chapter int) {
	for i, h := range hooks.Hooks {
		if h.HookID == hookID {
			hooks.Hooks[i].Status = models.HookStatusResolved
			hooks.Hooks[i].LastAdvancedChapter = chapter
			return
		}
	}
}

func deferHook(hooks *models.HooksState, hookID string, chapter int) {
	for i, h := range hooks.Hooks {
		if h.HookID == hookID {
			hooks.Hooks[i].Status = models.HookStatusDeferred
			hooks.Hooks[i].LastAdvancedChapter = chapter
			return
		}
	}
}

func applyCurrentStatePatch(state *models.CurrentStateState, patch models.CurrentStatePatch, chapter int) {
	now := time.Now().UTC().Format(time.RFC3339)
	remove := make(map[string]bool, len(patch.Removes))
	for _, k := range patch.Removes {
		remove[k] = true
	}
	filtered := state.Facts[:0]
	for _, f := range state.Facts {
		if !remove[f.Key] {
			filtered = append(filtered, f)
		}
	}
	state.Facts = filtered
	for _, u := range patch.Upserts {
		u.Chapter = chapter
		u.UpdatedAt = now
		replaced := false
		for i, f := range state.Facts {
			if f.Key == u.Key {
				state.Facts[i] = u
				replaced = true
				break
			}
		}
		if !replaced {
			state.Facts = append(state.Facts, u)
		}
	}
}

func upsertSummary(summaries *models.ChapterSummariesState, row models.ChapterSummaryRow) {
	for i, r := range summaries.Rows {
		if r.Chapter == row.Chapter {
			summaries.Rows[i] = row
			return
		}
	}
	summaries.Rows = append(summaries.Rows, row)
}

// ValidateDelta checks required fields on a delta before apply.
func ValidateDelta(delta models.RuntimeStateDelta) error {
	if delta.ChapterNumber <= 0 {
		return fmt.Errorf("delta chapterNumber must be positive")
	}
	for _, op := range delta.HookOps {
		if op.HookID == "" {
			return fmt.Errorf("hook op missing hookId")
		}
		if op.LastAdvancedChapter < 0 {
			return fmt.Errorf("hook %s: lastAdvancedChapter must be non-negative", op.HookID)
		}
	}
	return nil
}

// LoadSnapshot reads all state JSON files via read/write funcs.
type LoadSnapshotInput struct {
	Manifest         models.StateManifest
	Hooks            models.HooksState
	CurrentState     models.CurrentStateState
	ChapterSummaries models.ChapterSummariesState
}

// MergeLoadInput builds a snapshot from partial load results.
func MergeLoadInput(in LoadSnapshotInput, lang models.Language) models.RuntimeStateSnapshot {
	snap := models.NewEmptyRuntimeSnapshot(lang)
	if in.Manifest.SchemaVersion > 0 {
		snap.Manifest = in.Manifest
	}
	if len(in.Hooks.Hooks) > 0 {
		snap.Hooks = in.Hooks
	}
	if len(in.CurrentState.Facts) > 0 {
		snap.CurrentState = in.CurrentState
	}
	if len(in.ChapterSummaries.Rows) > 0 {
		snap.ChapterSummaries = in.ChapterSummaries
	}
	return snap
}
