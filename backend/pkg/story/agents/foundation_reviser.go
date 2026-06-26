package agents

import (
	"context"
	"fmt"
	"strings"

	"github.com/LingByte/CinyuVerse/pkg/protocol"
	"github.com/LingByte/CinyuVerse/pkg/story/agent"
	"github.com/LingByte/CinyuVerse/pkg/story/models"
	"github.com/LingByte/CinyuVerse/pkg/story/store"
)

// FoundationReviserAgent revises architect foundation from reviewer feedback.
type FoundationReviserAgent struct {
	ctx agent.Context
}

func NewFoundationReviserAgent(ctx agent.Context) *FoundationReviserAgent {
	return &FoundationReviserAgent{ctx: ctx}
}

// ReviseFoundation regenerates weak foundation sections.
func (f *FoundationReviserAgent) ReviseFoundation(ctx context.Context, in InitBookInput, current ArchitectOutput, feedback string) (ArchitectOutput, error) {
	lang := in.Book.Language
	if lang == "" {
		lang = models.LanguageZH
	}
	var b strings.Builder
	b.WriteString("Revise foundation based on reviewer feedback.\n\n")
	b.WriteString("Feedback:\n")
	b.WriteString(feedback)
	b.WriteString("\n\nCurrent foundation:\n")
	b.WriteString(current.StoryBible)
	resp, err := f.ctx.Chat(ctx, []protocol.Message{
		protocol.SystemMessage(architectSystemPrompt(lang)),
		protocol.UserMessage(b.String()),
	}, 0.6)
	if err != nil {
		return ArchitectOutput{}, err
	}
	sections := ParseArchitectSections(resp.FirstContent())
	out := ArchitectOutput{
		StoryBible:    pickNonEmpty(sections["STORY_BIBLE"], current.StoryBible),
		VolumeOutline: pickNonEmpty(sections["VOLUME_OUTLINE"], current.VolumeOutline),
		BookRules:     pickNonEmpty(sections["BOOK_RULES"], current.BookRules),
		PendingHooks:  pickNonEmpty(sections["PENDING_HOOKS"], current.PendingHooks),
		CurrentState:  pickNonEmpty(sections["CURRENT_STATE"], current.CurrentState),
	}
	if strings.TrimSpace(out.StoryBible) == "" {
		return out, fmt.Errorf("foundation reviser: empty story bible")
	}
	return out, nil
}

func pickNonEmpty(primary, fallback string) string {
	if strings.TrimSpace(primary) != "" {
		return primary
	}
	return fallback
}

// SpinoffArchitectAgent creates a spinoff book foundation from a source book.
type SpinoffArchitectAgent struct {
	ctx agent.Context
}

func NewSpinoffArchitectAgent(ctx agent.Context) *SpinoffArchitectAgent {
	return &SpinoffArchitectAgent{ctx: ctx}
}

type SpinoffInput struct {
	SourceBook models.BookConfig
	Direction  string
	NewTitle   string
}

// GenerateSpinoffFoundation creates spinoff bible/outline from source book context.
func (s *SpinoffArchitectAgent) GenerateSpinoffFoundation(ctx context.Context, st *store.ProjectStore, in SpinoffInput) (ArchitectOutput, error) {
	bible := st.ReadTextOrDefault(in.SourceBook.ID, "story/story_bible.md", "")
	outline := st.ReadTextOrDefault(in.SourceBook.ID, "story/volume_outline.md", "")
	user := fmt.Sprintf("Create spinoff foundation.\nSource: %s\nNew title: %s\nDirection: %s\n\nSource bible:\n%s\n\nSource outline:\n%s",
		in.SourceBook.Title, in.NewTitle, in.Direction, bible, outline)
	lang := in.SourceBook.Language
	resp, err := s.ctx.Chat(ctx, []protocol.Message{
		protocol.SystemMessage(architectSystemPrompt(lang)),
		protocol.UserMessage(user),
	}, 0.75)
	if err != nil {
		return ArchitectOutput{}, err
	}
	sections := ParseArchitectSections(resp.FirstContent())
	return ArchitectOutput{
		StoryBible: sections["STORY_BIBLE"], VolumeOutline: sections["VOLUME_OUTLINE"],
		BookRules: sections["BOOK_RULES"], PendingHooks: sections["PENDING_HOOKS"],
		CurrentState: sections["CURRENT_STATE"],
	}, nil
}

// ImitationArchitectAgent bootstraps a book mimicking reference style text.
type ImitationArchitectAgent struct {
	ctx agent.Context
}

func NewImitationArchitectAgent(ctx agent.Context) *ImitationArchitectAgent {
	return &ImitationArchitectAgent{ctx: ctx}
}

type ImitationInput struct {
	Book      models.BookConfig
	Reference string
	Profile   StyleProfile
}

// GenerateImitationFoundation creates foundation guided by style profile.
func (i *ImitationArchitectAgent) GenerateImitationFoundation(ctx context.Context, in ImitationInput) (ArchitectOutput, error) {
	lang := in.Book.Language
	user := fmt.Sprintf("Create book foundation imitating reference style.\nTitle: %s\nGenre: %s\n\nStyle profile: avg sentence %.1f, vocab %.2f\nPatterns: %v\n\nReference excerpt:\n%s",
		in.Book.Title, in.Book.Genre, in.Profile.AvgSentenceLength, in.Profile.VocabularyDiversity,
		in.Profile.RhetoricalFeatures, truncate(in.Reference, 6000))
	resp, err := i.ctx.Chat(ctx, []protocol.Message{
		protocol.SystemMessage(architectSystemPrompt(lang)),
		protocol.UserMessage(user),
	}, 0.75)
	if err != nil {
		return ArchitectOutput{}, err
	}
	sections := ParseArchitectSections(resp.FirstContent())
	return ArchitectOutput{
		StoryBible: sections["STORY_BIBLE"], VolumeOutline: sections["VOLUME_OUTLINE"],
		BookRules: sections["BOOK_RULES"], PendingHooks: sections["PENDING_HOOKS"],
		CurrentState: sections["CURRENT_STATE"],
	}, nil
}

// ReviseFoundationForBook runs foundation reviser and persists artifacts.
func ReviseFoundationForBook(ctx context.Context, st *store.ProjectStore, router agent.Router, bookID, feedback string) error {
	book, err := st.LoadBookConfig(bookID)
	if err != nil {
		return err
	}
	current := ArchitectOutput{
		StoryBible:    st.ReadTextOrDefault(bookID, "story/story_bible.md", ""),
		VolumeOutline: st.ReadTextOrDefault(bookID, "story/volume_outline.md", ""),
		BookRules:     st.ReadTextOrDefault(bookID, "story/book_rules.md", ""),
		PendingHooks:  st.ReadTextOrDefault(bookID, "story/pending_hooks.md", ""),
		CurrentState:  st.ReadTextOrDefault(bookID, "story/current_state.md", ""),
	}
	ctxAgent, err := router.ContextFor(agent.NameFoundationReviser, st.Root, bookID)
	if err != nil {
		return err
	}
	out, err := NewFoundationReviserAgent(ctxAgent).ReviseFoundation(ctx, InitBookInput{Book: book}, current, feedback)
	if err != nil {
		return err
	}
	return persistArchitectOutput(st, bookID, out)
}

func persistArchitectOutput(st *store.ProjectStore, bookID string, out ArchitectOutput) error {
	if err := st.WriteText(bookID, "story/story_bible.md", out.StoryBible); err != nil {
		return err
	}
	if out.VolumeOutline != "" {
		_ = st.WriteText(bookID, "story/volume_outline.md", out.VolumeOutline)
	}
	if out.BookRules != "" {
		_ = st.WriteText(bookID, "story/book_rules.md", out.BookRules)
	}
	if out.PendingHooks != "" {
		_ = st.WriteText(bookID, "story/pending_hooks.md", out.PendingHooks)
	}
	if out.CurrentState != "" {
		_ = st.WriteText(bookID, "story/current_state.md", out.CurrentState)
	}
	return nil
}
