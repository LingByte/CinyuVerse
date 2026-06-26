package memory

import (
	"strings"
	"unicode"

	"github.com/LingByte/CinyuVerse/pkg/story/models"
)

// Selection is the retrieved memory slice for compose/plan.
type Selection struct {
	Summaries []StoredSummary `json:"summaries"`
	Facts     []StoredFact    `json:"facts"`
	Hooks     []models.HookRecord `json:"hooks"`
	DBPath    string          `json:"dbPath,omitempty"`
}

// RetrieveInput configures memory retrieval.
type RetrieveInput struct {
	BookDir       string
	ChapterNumber int
	Goal          string
	MustKeep      []string
	Snapshot      models.RuntimeStateSnapshot
}

// Retrieve selects relevant summaries, facts, and hooks for context assembly.
func Retrieve(in RetrieveInput) (Selection, error) {
	terms := extractQueryTerms(in.Goal, in.MustKeep)
	sel := Selection{Hooks: filterActiveHooks(in.Snapshot.Hooks.Hooks)}

	db, err := Open(in.BookDir)
	if err != nil {
		return fallbackSelection(in, terms), nil
	}
	defer db.Close()
	sel.DBPath = db.Path()

	if n, _ := db.ChapterCount(); n == 0 && len(in.Snapshot.ChapterSummaries.Rows) > 0 {
		_ = db.ReplaceSummaries(in.Snapshot.ChapterSummaries.Rows)
	}
	if facts, _ := db.GetCurrentFacts(); len(facts) == 0 && len(in.Snapshot.CurrentState.Facts) > 0 {
		_ = db.ReplaceCurrentFacts(in.Snapshot.CurrentState.Facts)
	}

	from := 1
	to := in.ChapterNumber - 1
	if to < 1 {
		to = 1
	}
	if sums, err := db.GetSummaries(from, to); err == nil {
		sel.Summaries = selectRelevantSummaries(sums, in.ChapterNumber, terms, 4)
	}
	if facts, err := db.GetCurrentFacts(); err == nil {
		sel.Facts = selectRelevantFacts(facts, terms, 4)
	}
	if len(sel.Hooks) == 0 {
		// authority path preferred; DB hooks are acceleration-only
	}
	return sel, nil
}

func fallbackSelection(in RetrieveInput, terms []string) Selection {
	var sums []StoredSummary
	for _, r := range in.Snapshot.ChapterSummaries.Rows {
		if r.Chapter < in.ChapterNumber {
			sums = append(sums, StoredSummary{Chapter: r.Chapter, Title: r.Title, Events: r.Summary})
		}
	}
	var facts []StoredFact
	for _, f := range in.Snapshot.CurrentState.Facts {
		parts := splitFactKey(f.Key)
		facts = append(facts, StoredFact{Subject: parts[0], Predicate: parts[1], Object: f.Value, ValidFromChapter: f.Chapter})
	}
	return Selection{
		Summaries: selectRelevantSummaries(sums, in.ChapterNumber, terms, 4),
		Facts:     selectRelevantFacts(facts, terms, 4),
		Hooks:     filterActiveHooks(in.Snapshot.Hooks.Hooks),
	}
}

func filterActiveHooks(hooks []models.HookRecord) []models.HookRecord {
	var out []models.HookRecord
	for _, h := range hooks {
		switch h.Status {
		case models.HookStatusResolved:
			continue
		default:
			out = append(out, h)
		}
	}
	return out
}

func extractQueryTerms(goal string, mustKeep []string) []string {
	seen := map[string]bool{}
	var terms []string
	for _, src := range append([]string{goal}, mustKeep...) {
		for _, t := range tokenize(src) {
			if len([]rune(t)) < 2 {
				continue
			}
			if seen[t] {
				continue
			}
			seen[t] = true
			terms = append(terms, t)
		}
	}
	return terms
}

func tokenize(s string) []string {
	s = strings.ToLower(s)
	var parts []string
	var b strings.Builder
	flush := func() {
		if b.Len() > 0 {
			parts = append(parts, b.String())
			b.Reset()
		}
	}
	for _, r := range s {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || unicode.Is(unicode.Han, r) {
			b.WriteRune(r)
		} else {
			flush()
		}
	}
	flush()
	return parts
}

func scoreTerms(text string, terms []string) int {
	lower := strings.ToLower(text)
	score := 0
	for _, t := range terms {
		if strings.Contains(lower, strings.ToLower(t)) {
			score++
		}
	}
	return score
}

func selectRelevantSummaries(sums []StoredSummary, chapter int, terms []string, limit int) []StoredSummary {
	type scored struct {
		s     StoredSummary
		score int
	}
	var ranked []scored
	for _, s := range sums {
		text := s.Title + " " + s.Events
		score := scoreTerms(text, terms) + (chapter - s.Chapter) // recency bias inverted
		if score < 0 {
			score = 0
		}
		ranked = append(ranked, scored{s: s, score: score})
	}
	// simple sort by score desc then chapter desc
	for i := 0; i < len(ranked); i++ {
		for j := i + 1; j < len(ranked); j++ {
			if ranked[j].score > ranked[i].score || (ranked[j].score == ranked[i].score && ranked[j].s.Chapter > ranked[i].s.Chapter) {
				ranked[i], ranked[j] = ranked[j], ranked[i]
			}
		}
	}
	if limit <= 0 {
		limit = 4
	}
	if len(ranked) > limit {
		ranked = ranked[:limit]
	}
	out := make([]StoredSummary, len(ranked))
	for i, r := range ranked {
		out[i] = r.s
	}
	return out
}

func selectRelevantFacts(facts []StoredFact, terms []string, limit int) []StoredFact {
	type scored struct {
		f     StoredFact
		score int
	}
	var ranked []scored
	for _, f := range facts {
		text := f.Subject + " " + f.Predicate + " " + f.Object
		ranked = append(ranked, scored{f: f, score: scoreTerms(text, terms)})
	}
	for i := 0; i < len(ranked); i++ {
		for j := i + 1; j < len(ranked); j++ {
			if ranked[j].score > ranked[i].score {
				ranked[i], ranked[j] = ranked[j], ranked[i]
			}
		}
	}
	if limit <= 0 {
		limit = 4
	}
	if len(ranked) > limit {
		ranked = ranked[:limit]
	}
	out := make([]StoredFact, len(ranked))
	for i, r := range ranked {
		out[i] = r.f
	}
	return out
}

// ComputeRecyclableHooks returns hooks stale enough for planner attention.
func ComputeRecyclableHooks(hooks []models.HookRecord, chapter int) []models.HookRecord {
	var out []models.HookRecord
	for _, h := range hooks {
		if h.Status == models.HookStatusResolved || h.Status == models.HookStatusDeferred {
			continue
		}
		last := h.LastAdvancedChapter
		if last <= 0 {
			last = h.StartChapter
		}
		silence := chapter - last
		threshold := 10
		if h.Status == models.HookStatusProgressing {
			threshold = 5
		}
		if silence >= threshold {
			out = append(out, h)
		}
	}
	return out
}
