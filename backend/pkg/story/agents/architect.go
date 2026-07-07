package agents

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/LingByte/CinyuVerse/pkg/protocol"
	"github.com/LingByte/CinyuVerse/pkg/story/agent"
	"github.com/LingByte/CinyuVerse/pkg/story/models"
	"github.com/LingByte/CinyuVerse/pkg/story/store"
)

// ArchitectOutput is the foundation bundle for a new book.
type ArchitectOutput struct {
	StoryBible    string
	VolumeOutline string
	BookRules     string
	PendingHooks  string
	CurrentState  string
}

// ArchitectAgent generates initial book foundation via LLM.
type ArchitectAgent struct {
	ctx agent.Context
}

func NewArchitectAgent(ctx agent.Context) *ArchitectAgent {
	return &ArchitectAgent{ctx: ctx}
}

type InitBookInput struct {
	Book            models.BookConfig
	ExternalContext string
	Brief           string
}

// GenerateFoundation calls the LLM and parses sectioned output.
func (a *ArchitectAgent) GenerateFoundation(ctx context.Context, in InitBookInput) (ArchitectOutput, error) {
	lang := in.Book.Language
	if lang == "" {
		lang = models.LanguageZH
	}
	user := buildArchitectUser(in, lang)
	resp, err := a.ctx.Chat(ctx, []protocol.Message{
		protocol.SystemMessage(architectSystemPrompt(lang)),
		protocol.UserMessage(user),
	}, 0.8)
	if err != nil {
		return ArchitectOutput{}, err
	}
	sections := ParseArchitectSections(resp.FirstContent())
	out := ArchitectOutput{
		StoryBible:    sections["STORY_BIBLE"],
		VolumeOutline: sections["VOLUME_OUTLINE"],
		BookRules:     sections["BOOK_RULES"],
		PendingHooks:  sections["PENDING_HOOKS"],
		CurrentState:  sections["CURRENT_STATE"],
	}
	if strings.TrimSpace(out.StoryBible) == "" {
		return out, fmt.Errorf("architect: missing STORY_BIBLE section")
	}
	return out, nil
}

func buildArchitectUser(in InitBookInput, lang models.Language) string {
	var b strings.Builder
	if lang == models.LanguageEN {
		fmt.Fprintf(&b, "Title: %s\nGenre: %s\nTarget chapter length: %d\nTarget chapters: %d\n",
			in.Book.Title, in.Book.Genre, in.Book.ChapterWordCount, in.Book.TargetChapters)
	} else {
		fmt.Fprintf(&b, "书名：%s\n题材：%s\n目标章节字数：%d\n目标总章数：%d\n",
			in.Book.Title, in.Book.Genre, in.Book.ChapterWordCount, in.Book.TargetChapters)
	}
	if in.Brief != "" {
		b.WriteString("\n--- Brief ---\n")
		b.WriteString(in.Brief)
	}
	if in.ExternalContext != "" {
		b.WriteString("\n--- External Context ---\n")
		b.WriteString(in.ExternalContext)
	}
	return b.String()
}

// WriteFoundationFiles persists architect output to the book directory.
func WriteFoundationFiles(st store.BookStore, bookID string, out ArchitectOutput, lang models.Language) error {
	if err := st.WriteText(bookID, "story/story_bible.md", out.StoryBible); err != nil {
		return err
	}
	if out.VolumeOutline != "" {
		if err := st.WriteText(bookID, "story/volume_outline.md", out.VolumeOutline); err != nil {
			return err
		}
	}
	if out.BookRules != "" {
		if err := st.WriteText(bookID, "story/book_rules.md", out.BookRules); err != nil {
			return err
		}
	}
	if out.PendingHooks != "" {
		if err := st.WriteText(bookID, "story/pending_hooks.md", out.PendingHooks); err != nil {
			return err
		}
	}
	if out.CurrentState != "" {
		if err := st.WriteText(bookID, "story/current_state.md", out.CurrentState); err != nil {
			return err
		}
	}
	snap := models.NewEmptyRuntimeSnapshot(lang)
	snap.Manifest.LastAppliedChapter = 0
	return st.SaveRuntimeSnapshot(bookID, snap)
}

// InitBook creates book config, control docs, and foundation with optional review loop.
func InitBook(ctx context.Context, st store.BookStore, router agent.Router, cfg models.BookConfig, brief string) error {
	return InitBookWithOptions(ctx, st, router, cfg, brief, InitBookOptions{FoundationReviewRetries: 2})
}

// InitBookOptions configures book initialization.
type InitBookOptions struct {
	FoundationReviewRetries int
	SkipFoundationReview    bool
}

// InitBookWithOptions creates a book with architect + optional foundation reviewer.
func InitBookWithOptions(ctx context.Context, st store.BookStore, router agent.Router, cfg models.BookConfig, brief string, opts InitBookOptions) error {
	if cfg.ID == "" {
		return fmt.Errorf("book id required")
	}
	now := time.Now().UTC()
	cfg.CreatedAt = now
	cfg.UpdatedAt = now
	if cfg.Status == "" {
		cfg.Status = models.BookStatusDraft
	}
	if cfg.ChapterWordCount <= 0 {
		if cfg.Language == models.LanguageEN {
			cfg.ChapterWordCount = models.DefaultChapterWordCountEN
		} else {
			cfg.ChapterWordCount = models.DefaultChapterWordCountZH
		}
	}
	if cfg.Language == "" {
		cfg.Language = models.LanguageZH
	}
	if err := st.SaveBookConfig(cfg); err != nil {
		return err
	}
	if err := st.EnsureControlDocuments(cfg.ID, cfg.Title, cfg.Language); err != nil {
		return err
	}
	actx, err := router.ContextFor(agent.NameArchitect, st.Root(), cfg.ID)
	if err != nil {
		return err
	}
	arch := NewArchitectAgent(actx)
	in := InitBookInput{Book: cfg, Brief: brief}
	var out ArchitectOutput
	if opts.SkipFoundationReview {
		out, err = arch.GenerateFoundation(ctx, in)
	} else {
		revCtx, rErr := router.ContextFor(agent.NameFoundationReviewer, st.Root(), cfg.ID)
		if rErr != nil {
			out, err = arch.GenerateFoundation(ctx, in)
		} else {
			out, err = GenerateAndReviewFoundation(ctx, arch, NewFoundationReviewerAgent(revCtx), in, opts.FoundationReviewRetries)
		}
	}
	if err != nil {
		return err
	}
	return WriteFoundationFiles(st, cfg.ID, out, cfg.Language)
}
