package agents

import (
	"context"
	"encoding/json"
	"fmt"
	"path/filepath"
	"strings"
	"unicode"

	"github.com/LingByte/CinyuVerse/pkg/story/agent"
	"github.com/LingByte/CinyuVerse/pkg/story/memory"
	"github.com/LingByte/CinyuVerse/pkg/story/models"
	"github.com/LingByte/CinyuVerse/pkg/story/references"
	"github.com/LingByte/CinyuVerse/pkg/story/store"
)

// ComposeChapterInput is local context assembly input (no LLM required by default).
type ComposeChapterInput struct {
	Store           *store.ProjectStore
	Book            models.BookConfig
	ChapterNumber   int
	Plan            models.PlanChapterOutput
	ExternalContext string
	Ctx             context.Context
	Router          agent.Router
}

// ComposeChapter selects context, builds rule stack, writes runtime artifacts.
func ComposeChapter(in ComposeChapterInput) (models.ComposeChapterOutput, error) {
	lang := in.Book.Language
	if lang == "" {
		lang = models.LanguageZH
	}
	bookID := in.Book.ID
	st := in.Store
	selected := collectContextEntries(in)
	pkg := models.ContextPackage{
		Chapter:         in.ChapterNumber,
		SelectedContext: selected,
	}
	stack := buildRuleStack(in.Book, in.ChapterNumber, st, bookID)
	trace := models.ChapterTrace{
		Chapter:       in.ChapterNumber,
		PlannerInputs: []string{in.Plan.RuntimePath},
		ComposerNotes: []string{"governed-compose-v2"},
	}
	ctxPath := fmt.Sprintf("story/runtime/chapter-%04d.context.json", in.ChapterNumber)
	rulePath := fmt.Sprintf("story/runtime/chapter-%04d.rule-stack.json", in.ChapterNumber)
	tracePath := fmt.Sprintf("story/runtime/chapter-%04d.trace.json", in.ChapterNumber)
	if err := st.WriteJSON(bookID, ctxPath, pkg); err != nil {
		return models.ComposeChapterOutput{}, err
	}
	if err := st.WriteJSON(bookID, rulePath, stack); err != nil {
		return models.ComposeChapterOutput{}, err
	}
	if err := st.WriteJSON(bookID, tracePath, trace); err != nil {
		return models.ComposeChapterOutput{}, err
	}
	return models.ComposeChapterOutput{
		PlanChapterOutput: in.Plan,
		ContextPackage:    pkg,
		RuleStack:         stack,
		Trace:             trace,
		ContextPath:       ctxPath,
		RuleStackPath:     rulePath,
		TracePath:         tracePath,
	}, nil
}

func collectContextEntries(in ComposeChapterInput) []models.ContextEntry {
	st := in.Store
	bookID := in.Book.ID
	plan := in.Plan
	external := in.ExternalContext
	lang := in.Book.Language
	if lang == "" {
		lang = models.LanguageZH
	}
	type spec struct {
		source models.ContextSource
		label  string
		path   string
	}
	specs := []spec{
		{models.ContextAuthorIntent, "author_intent", "story/author_intent.md"},
		{models.ContextCurrentFocus, "current_focus", "story/current_focus.md"},
		{models.ContextStoryBible, "story_bible", "story/story_bible.md"},
		{models.ContextBookRules, "book_rules", "story/book_rules.md"},
		{models.ContextCurrentState, "current_state", "story/current_state.md"},
		{models.ContextPendingHooks, "pending_hooks", "story/pending_hooks.md"},
	}
	var entries []models.ContextEntry
	for _, sp := range specs {
		content := strings.TrimSpace(st.ReadTextOrDefault(bookID, sp.path, ""))
		if content == "" {
			continue
		}
		entries = append(entries, models.ContextEntry{
			Source:  sp.source,
			Heading: sp.label,
			Content: content,
			Tokens:  estimateTokens(content),
		})
	}

	// Outline section selection (InkOS composer outline selector)
	var outlineSelector func(context.Context, []outlineSection, outlineSelectionHints) ([]outlineSection, error)
	if in.Router.DefaultClient != nil {
		if composerCtx, err := in.Router.ContextFor(agent.NameComposer, st.Root, bookID); err == nil {
			outlineSelector = LLMOutlineSectionSelector(composerCtx)
		}
	}
	if outlineEntries := selectOutlineSections(st, bookID, plan, lang, outlineSelector, in.Ctx); len(outlineEntries) > 0 {
		entries = append(entries, outlineEntries...)
	} else if vol := strings.TrimSpace(st.ReadTextOrDefault(bookID, "story/volume_outline.md", "")); vol != "" {
		entries = append(entries, models.ContextEntry{
			Source: models.ContextVolumeOutline, Heading: "volume_outline", Content: vol, Tokens: estimateTokens(vol),
		})
	}

	// Memory retrieval (SQLite acceleration index)
	snap, _ := st.LoadRuntimeSnapshot(bookID, lang)
	bookDir := filepath.Join(st.Root, "books", bookID)
	mem, _ := memory.Retrieve(memory.RetrieveInput{
		BookDir: bookDir, ChapterNumber: in.ChapterNumber,
		Goal: plan.Intent.Goal, MustKeep: plan.Intent.MustKeep, Snapshot: snap,
	})
	if len(mem.Summaries) > 0 {
		var b strings.Builder
		for _, s := range mem.Summaries {
			fmt.Fprintf(&b, "### Ch%d %s\n%s\n\n", s.Chapter, s.Title, s.Events)
		}
		content := strings.TrimSpace(b.String())
		entries = append(entries, models.ContextEntry{
			Source: models.ContextChapterSummary, Heading: "memory_summaries", Content: content, Tokens: estimateTokens(content),
		})
	}
	if len(mem.Facts) > 0 {
		var b strings.Builder
		for _, f := range mem.Facts {
			b.WriteString(memory.FormatFact(f))
			b.WriteString("\n")
		}
		content := strings.TrimSpace(b.String())
		entries = append(entries, models.ContextEntry{
			Source: models.ContextCurrentState, Heading: "memory_facts", Content: content, Tokens: estimateTokens(content),
		})
	}
	if len(mem.Hooks) > 0 {
		recyclable := memory.ComputeRecyclableHooks(mem.Hooks, in.ChapterNumber)
		if len(recyclable) > 0 {
			var b strings.Builder
			for _, h := range recyclable {
				fmt.Fprintf(&b, "- %s (%s) last=%d\n", h.HookID, h.Status, h.LastAdvancedChapter)
			}
			content := strings.TrimSpace(b.String())
			entries = append(entries, models.ContextEntry{
				Source: models.ContextPendingHooks, Heading: "recyclable_hooks", Content: content, Tokens: estimateTokens(content),
			})
		}
	}

	if plan.IntentMarkdown != "" {
		entries = append(entries, models.ContextEntry{
			Source:  models.ContextExternal,
			Heading: "chapter_intent",
			Content: plan.IntentMarkdown,
			Tokens:  estimateTokens(plan.IntentMarkdown),
		})
	}
	if external != "" {
		entries = append(entries, models.ContextEntry{
			Source:  models.ContextExternal,
			Heading: "guidance",
			Content: external,
			Tokens:  estimateTokens(external),
		})
	}
	if corpus, _ := references.NewLibrary(st.Root).LoadCorpus(); strings.TrimSpace(corpus) != "" {
		formatted := references.FormatCorpusSection(corpus)
		entries = append(entries, models.ContextEntry{
			Source: models.ContextReferenceStyle, Heading: references.CorpusHeading(),
			Content: formatted, Tokens: estimateTokens(formatted),
		})
	}
	return entries
}

func buildRuleStack(book models.BookConfig, chapter int, st *store.ProjectStore, bookID string) models.RuleStack {
	layers := []models.RuleLayer{
		{Scope: models.RuleScopeGlobal, Name: "craft", Priority: 10, Content: CraftRulesForGenre(book.Language, book.Genre)},
		{Scope: models.RuleScopeGenre, Name: book.Genre, Priority: 20, Content: fmt.Sprintf("Genre profile: %s", book.Genre)},
	}
	if rules := strings.TrimSpace(st.ReadTextOrDefault(bookID, "story/book_rules.md", "")); rules != "" {
		layers = append(layers, models.RuleLayer{
			Scope: models.RuleScopeBook, Name: "book_rules", Priority: 30, Content: rules,
		})
	}
	if corpus, _ := references.NewLibrary(st.Root).LoadCorpus(); strings.TrimSpace(corpus) != "" {
		layers = append(layers, models.RuleLayer{
			Scope: models.RuleScopeBook, Name: "reference_style", Priority: 25,
			Content: references.FormatCorpusSection(corpus),
		})
	}
	if profile := strings.TrimSpace(st.ReadTextOrDefault(bookID, "story/style_guide.md", "")); profile != "" {
		layers = append(layers, models.RuleLayer{
			Scope: models.RuleScopeBook, Name: "style_guide", Priority: 26, Content: profile,
		})
	}
	return models.RuleStack{Chapter: chapter, Layers: layers}
}

func defaultCraftRules(lang models.Language) string {
	return CraftRulesForGenre(lang, "")
}

func estimateTokens(text string) int {
	cjk := 0
	other := 0
	for _, r := range text {
		if unicode.Is(unicode.Han, r) {
			cjk++
		} else if !unicode.IsSpace(r) {
			other++
		}
	}
	return cjk + other/4
}

// FormatContextPackageForPrompt renders context for the writer user prompt.
func FormatContextPackageForPrompt(pkg models.ContextPackage, memo models.ChapterMemo, stack models.RuleStack) string {
	var b strings.Builder
	if corpus := extractReferenceCorpus(pkg, stack); corpus != "" {
		b.WriteString("## 参考文笔（必须仿写，优先级最高）\n")
		b.WriteString(corpus)
		b.WriteString("\n\n")
	}
	b.WriteString("## Chapter Memo\n")
	if memo.RawMarkdown != "" {
		b.WriteString(memo.RawMarkdown)
	} else {
		b.WriteString(memo.Goal)
	}
	b.WriteString("\n\n## Selected Context\n")
	for _, e := range pkg.SelectedContext {
		fmt.Fprintf(&b, "### %s (%s)\n%s\n\n", e.Heading, e.Source, e.Content)
	}
	b.WriteString("## Rule Stack\n")
	data, _ := json.MarshalIndent(stack.Layers, "", "  ")
	b.Write(data)
	return b.String()
}

func extractReferenceCorpus(pkg models.ContextPackage, stack models.RuleStack) string {
	for _, e := range pkg.SelectedContext {
		if e.Source == models.ContextReferenceStyle && strings.TrimSpace(e.Content) != "" {
			return e.Content
		}
	}
	for _, layer := range stack.Layers {
		if layer.Name == "reference_style" && strings.TrimSpace(layer.Content) != "" {
			return layer.Content
		}
	}
	return ""
}
