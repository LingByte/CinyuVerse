package agents

import (
	"context"
	"fmt"
	"strings"

	"github.com/LingByte/CinyuVerse/pkg/protocol"
	"github.com/LingByte/CinyuVerse/pkg/story/agent"
	"github.com/LingByte/CinyuVerse/pkg/story/models"
	"github.com/LingByte/CinyuVerse/pkg/story/state"
	"github.com/LingByte/CinyuVerse/pkg/story/store"
)

// ChapterAnalyzerAgent reverse-engineers runtime state from imported chapter text.
type ChapterAnalyzerAgent struct {
	ctx agent.Context
	st  *store.ProjectStore
}

func NewChapterAnalyzerAgent(ctx agent.Context, st *store.ProjectStore) *ChapterAnalyzerAgent {
	return &ChapterAnalyzerAgent{ctx: ctx, st: st}
}

type AnalyzeChapterInput struct {
	Book          models.BookConfig
	ChapterNumber int
	Title         string
	Content       string
}

// AnalyzeChapter produces a runtime delta for one imported chapter.
func (a *ChapterAnalyzerAgent) AnalyzeChapter(ctx context.Context, in AnalyzeChapterInput) (models.RuntimeStateDelta, error) {
	lang := in.Book.Language
	if lang == "" {
		lang = models.LanguageZH
	}
	user := fmt.Sprintf("Analyze chapter %d (%s) and emit reflector JSON delta.\n\n%s",
		in.ChapterNumber, in.Title, in.Content)
	resp, err := a.ctx.Chat(ctx, []protocol.Message{
		protocol.SystemMessage(reflectorSystemPrompt(lang)),
		protocol.UserMessage(user),
	}, 0.3)
	if err != nil {
		return models.RuntimeStateDelta{}, err
	}
	delta, err := ParseRuntimeStateDelta(resp.FirstContent())
	if err != nil {
		return models.RuntimeStateDelta{
			ChapterNumber: in.ChapterNumber,
			ChapterSummary: &models.ChapterSummaryRow{
				Chapter: in.ChapterNumber, Title: in.Title, Summary: truncate(in.Content, 200),
			},
		}, nil
	}
	if delta.ChapterNumber == 0 {
		delta.ChapterNumber = in.ChapterNumber
	}
	return delta, nil
}

// ReplayImportedChapter applies analyzer delta onto snapshot.
func (a *ChapterAnalyzerAgent) ReplayImportedChapter(ctx context.Context, bookID string, lang models.Language, in AnalyzeChapterInput) error {
	delta, err := a.AnalyzeChapter(ctx, in)
	if err != nil {
		return err
	}
	snap, err := a.st.LoadRuntimeSnapshot(bookID, lang)
	if err != nil {
		return err
	}
	newSnap, err := state.ApplyDelta(snap, delta)
	if err != nil {
		return err
	}
	return a.st.SaveRuntimeSnapshot(bookID, newSnap)
}

// ImportChapterMeta holds one imported chapter.
type ImportChapterMeta struct {
	Title   string
	Content string
}

// ImportChaptersInput is batch import request.
type ImportChaptersInput struct {
	BookID   string
	Chapters []ImportChapterMeta
}

// ImportChaptersResult summarizes import.
type ImportChaptersResult struct {
	ImportedCount int
	TotalWords    int
	NextChapter   int
}

// ImportChapters saves chapters and replays analyzer for each.
func ImportChapters(ctx context.Context, st *store.ProjectStore, router agent.Router, projectRoot string, in ImportChaptersInput) (ImportChaptersResult, error) {
	book, err := st.LoadBookConfig(in.BookID)
	if err != nil {
		return ImportChaptersResult{}, err
	}
	lang := book.Language
	if lang == "" {
		lang = models.LanguageZH
	}
	analyzerCtx, err := router.ContextFor(agent.NameChapterAnalyzer, projectRoot, in.BookID)
	if err != nil {
		return ImportChaptersResult{}, err
	}
	analyzer := NewChapterAnalyzerAgent(analyzerCtx, st)
	start, err := st.NextChapterNumber(in.BookID)
	if err != nil {
		return ImportChaptersResult{}, err
	}
	totalWords := 0
	for i, ch := range in.Chapters {
		num := start + i
		meta := models.ChapterMeta{
			Number: num, Title: ch.Title,
			WordCount: CountLength(ch.Content, lang),
			Status:    models.ChapterStatusApproved,
		}
		if err := st.SaveChapter(in.BookID, meta, ch.Content); err != nil {
			return ImportChaptersResult{}, err
		}
		totalWords += meta.WordCount
		if err := analyzer.ReplayImportedChapter(ctx, in.BookID, lang, AnalyzeChapterInput{
			Book: book, ChapterNumber: num, Title: ch.Title, Content: ch.Content,
		}); err != nil {
			return ImportChaptersResult{}, err
		}
	}
	next, _ := st.NextChapterNumber(in.BookID)
	return ImportChaptersResult{
		ImportedCount: len(in.Chapters),
		TotalWords:    totalWords,
		NextChapter:   next,
	}, nil
}

// SplitChaptersByHeading splits text on 第N章 or Chapter N headings.
func SplitChaptersByHeading(text string) []ImportChapterMeta {
	lines := strings.Split(text, "\n")
	var chapters []ImportChapterMeta
	var curTitle string
	var curBody strings.Builder
	flush := func() {
		if curTitle == "" && curBody.Len() == 0 {
			return
		}
		chapters = append(chapters, ImportChapterMeta{
			Title: curTitle, Content: strings.TrimSpace(curBody.String()),
		})
		curTitle = ""
		curBody.Reset()
	}
	for _, line := range lines {
		trim := strings.TrimSpace(line)
		if strings.HasPrefix(trim, "第") && strings.Contains(trim, "章") ||
			strings.HasPrefix(strings.ToLower(trim), "chapter ") {
			flush()
			curTitle = strings.TrimPrefix(strings.TrimPrefix(trim, "# "), "")
			continue
		}
		curBody.WriteString(line)
		curBody.WriteByte('\n')
	}
	flush()
	return chapters
}
