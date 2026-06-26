package models

// ContextSource names a piece of governed context selected for one chapter.
type ContextSource string

const (
	ContextAuthorIntent   ContextSource = "author_intent"
	ContextCurrentFocus   ContextSource = "current_focus"
	ContextStoryBible     ContextSource = "story_bible"
	ContextBookRules      ContextSource = "book_rules"
	ContextVolumeOutline  ContextSource = "volume_outline"
	ContextCurrentState   ContextSource = "current_state"
	ContextPendingHooks   ContextSource = "pending_hooks"
	ContextChapterSummary ContextSource = "chapter_summaries"
	ContextRecentChapter  ContextSource = "recent_chapter"
	ContextReferenceStyle ContextSource = "reference_style"
	ContextExternal       ContextSource = "external_context"
)

// ProtectedContextSources must not be silently compressed away.
var ProtectedContextSources = map[ContextSource]bool{
	ContextAuthorIntent:  true,
	ContextCurrentFocus:  true,
	ContextCurrentState:  true,
	ContextPendingHooks:  true,
	ContextExternal:      true,
}

// ContextEntry is one selected context block for the writer.
type ContextEntry struct {
	Source  ContextSource `json:"source"`
	Heading string        `json:"heading,omitempty"`
	Content string        `json:"content"`
	Tokens  int           `json:"tokens,omitempty"`
}

// ContextPackage is the compiled input package for one chapter.
type ContextPackage struct {
	Chapter         int            `json:"chapter"`
	SelectedContext []ContextEntry `json:"selectedContext"`
}

// ChapterIntent is the simplified planner intent (machine-readable).
type ChapterIntent struct {
	Goal      string   `json:"goal"`
	MustKeep  []string `json:"mustKeep"`
	MustAvoid []string `json:"mustAvoid"`
	Conflicts []string `json:"conflicts,omitempty"`
}

// ChapterMemo is the human-facing 7-section chapter brief from the planner.
type ChapterMemo struct {
	Goal              string   `json:"goal"`
	MustKeep          []string `json:"mustKeep"`
	MustAvoid         []string `json:"mustAvoid"`
	HookAgenda        string   `json:"hookAgenda"`
	ScenePlan         string   `json:"scenePlan"`
	EndingChange      string   `json:"endingChange"`
	StyleNotes        string   `json:"styleNotes"`
	RawMarkdown       string   `json:"rawMarkdown,omitempty"`
}

// RuleLayerScope defines where a rule layer applies.
type RuleLayerScope string

const (
	RuleScopeGlobal RuleLayerScope = "global"
	RuleScopeBook   RuleLayerScope = "book"
	RuleScopeGenre  RuleLayerScope = "genre"
	RuleScopeChapter RuleLayerScope = "chapter"
)

// RuleLayer is one layer in the rule stack.
type RuleLayer struct {
	Scope    RuleLayerScope `json:"scope"`
	Name     string         `json:"name"`
	Priority int            `json:"priority"`
	Content  string         `json:"content"`
}

// RuleStack is the compiled priority stack for one chapter.
type RuleStack struct {
	Chapter int         `json:"chapter"`
	Layers  []RuleLayer `json:"layers"`
}

// ChapterTrace records how context was assembled (debug/audit).
type ChapterTrace struct {
	Chapter       int      `json:"chapter"`
	PlannerInputs []string `json:"plannerInputs,omitempty"`
	ComposerNotes []string `json:"composerNotes,omitempty"`
}

// PlanChapterOutput is the planner artifact bundle.
type PlanChapterOutput struct {
	Intent         ChapterIntent `json:"intent"`
	Memo           ChapterMemo   `json:"memo"`
	IntentMarkdown string        `json:"intentMarkdown"`
	RuntimePath    string        `json:"runtimePath,omitempty"`
}

// ComposeChapterOutput is the composer artifact bundle.
type ComposeChapterOutput struct {
	PlanChapterOutput
	ContextPackage ContextPackage `json:"contextPackage"`
	RuleStack      RuleStack      `json:"ruleStack"`
	Trace          ChapterTrace   `json:"trace"`
	ContextPath    string         `json:"contextPath,omitempty"`
	RuleStackPath  string         `json:"ruleStackPath,omitempty"`
	TracePath      string         `json:"tracePath,omitempty"`
}
