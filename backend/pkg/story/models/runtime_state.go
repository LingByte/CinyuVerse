package models

// HookStatus tracks narrative hook lifecycle.
type HookStatus string

const (
	HookStatusOpen        HookStatus = "open"
	HookStatusProgressing HookStatus = "progressing"
	HookStatusDeferred    HookStatus = "deferred"
	HookStatusResolved    HookStatus = "resolved"
)

// HookRecord is one foreshadowing / plot thread entry.
type HookRecord struct {
	HookID              string     `json:"hookId"`
	StartChapter        int        `json:"startChapter"`
	Type                string     `json:"type"`
	Status              HookStatus `json:"status"`
	LastAdvancedChapter int        `json:"lastAdvancedChapter"`
	ExpectedPayoff      string     `json:"expectedPayoff"`
	Notes               string     `json:"notes"`
}

// HooksState is authoritative hook table (story/state/hooks.json).
type HooksState struct {
	Hooks []HookRecord `json:"hooks"`
}

// CurrentStateFact is one structured world fact.
type CurrentStateFact struct {
	Key       string `json:"key"`
	Value     string `json:"value"`
	Chapter   int    `json:"chapter,omitempty"`
	UpdatedAt string `json:"updatedAt,omitempty"`
}

// CurrentStateState is authoritative runtime facts (story/state/current_state.json).
type CurrentStateState struct {
	Facts []CurrentStateFact `json:"facts"`
}

// ChapterSummaryRow is one chapter summary row.
type ChapterSummaryRow struct {
	Chapter int    `json:"chapter"`
	Title   string `json:"title"`
	Summary string `json:"summary"`
}

// ChapterSummariesState holds rolling chapter summaries.
type ChapterSummariesState struct {
	Rows []ChapterSummaryRow `json:"rows"`
}

// StateManifest tracks schema version and last applied chapter.
type StateManifest struct {
	SchemaVersion      int      `json:"schemaVersion"`
	Language           Language `json:"language"`
	LastAppliedChapter int      `json:"lastAppliedChapter"`
	ProjectionVersion  int      `json:"projectionVersion"`
}

// HookOp is one hook mutation from the reflector.
type HookOp struct {
	Action              string     `json:"action"` // upsert | mention | resolve | defer
	HookID              string     `json:"hookId"`
	Type                string     `json:"type,omitempty"`
	Status              HookStatus `json:"status,omitempty"`
	LastAdvancedChapter int        `json:"lastAdvancedChapter,omitempty"`
	ExpectedPayoff      string     `json:"expectedPayoff,omitempty"`
	Notes               string     `json:"notes,omitempty"`
}

// CurrentStatePatch patches current state facts.
type CurrentStatePatch struct {
	Upserts []CurrentStateFact `json:"upserts,omitempty"`
	Removes []string           `json:"removes,omitempty"`
}

// RuntimeStateDelta is the JSON delta emitted by the reflector agent.
type RuntimeStateDelta struct {
	ChapterNumber  int                  `json:"chapterNumber"`
	HookOps        []HookOp             `json:"hookOps,omitempty"`
	CurrentState   *CurrentStatePatch   `json:"currentStatePatch,omitempty"`
	ChapterSummary *ChapterSummaryRow   `json:"chapterSummary,omitempty"`
}

// RuntimeStateSnapshot is the full authoritative state bundle.
type RuntimeStateSnapshot struct {
	Manifest         StateManifest         `json:"manifest"`
	Hooks            HooksState            `json:"hooks"`
	CurrentState     CurrentStateState     `json:"currentState"`
	ChapterSummaries ChapterSummariesState `json:"chapterSummaries"`
}

// NewEmptyRuntimeSnapshot returns an initialized snapshot for a new book.
func NewEmptyRuntimeSnapshot(lang Language) RuntimeStateSnapshot {
	return RuntimeStateSnapshot{
		Manifest: StateManifest{
			SchemaVersion:      1,
			Language:           lang,
			LastAppliedChapter: 0,
			ProjectionVersion:  0,
		},
		Hooks:            HooksState{Hooks: []HookRecord{}},
		CurrentState:     CurrentStateState{Facts: []CurrentStateFact{}},
		ChapterSummaries: ChapterSummariesState{Rows: []ChapterSummaryRow{}},
	}
}
