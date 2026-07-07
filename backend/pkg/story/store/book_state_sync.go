package store

import (
	"fmt"
	"strings"

	"github.com/LingByte/CinyuVerse/pkg/story/models"
)

// ExportBookState serializes a book from any BookStore into a portable snapshot.
func ExportBookState(st BookStore, bookID string) (models.BookState, error) {
	cfg, err := st.LoadBookConfig(bookID)
	if err != nil {
		return models.BookState{}, err
	}
	index, err := st.LoadChapterIndex(bookID)
	if err != nil {
		return models.BookState{}, err
	}
	chapters := make([]models.ChapterWithContent, 0, len(index))
	for _, meta := range index {
		content := ""
		if meta.FileName != "" {
			raw, readErr := st.ReadText(bookID, "chapters/"+meta.FileName)
			if readErr == nil {
				content = stripChapterHeading(raw, meta.Title)
			}
		}
		chapters = append(chapters, models.ChapterWithContent{Meta: meta, Content: content})
	}
	docs := map[string]string{}
	if files, err := st.ListTruthFiles(bookID); err == nil {
		for _, rel := range files {
			if text, readErr := st.ReadText(bookID, rel); readErr == nil {
				docs[rel] = text
			}
		}
	}
	for _, rel := range []string{"story/author_intent.md", "story/current_focus.md"} {
		if text, readErr := st.ReadText(bookID, rel); readErr == nil {
			docs[rel] = text
		}
	}
	var runtime *models.RuntimeStateSnapshot
	if snap, err := st.LoadRuntimeSnapshot(bookID, cfg.Language); err == nil {
		runtime = &snap
	}
	return models.BookState{
		Config:    cfg,
		Chapters:  chapters,
		Documents: docs,
		Runtime:   runtime,
	}, nil
}

// ApplyBookState hydrates a BookStore from a client-provided snapshot.
func ApplyBookState(st BookStore, state models.BookState) error {
	if state.Config.ID == "" {
		return fmt.Errorf("book id required in state")
	}
	bookID := state.Config.ID
	if err := st.EnsureBookLayout(bookID); err != nil {
		return err
	}
	if err := st.SaveBookConfig(state.Config); err != nil {
		return err
	}
	_ = st.EnsureControlDocuments(bookID, state.Config.Title, state.Config.Language)
	for rel, content := range state.Documents {
		if err := st.WriteText(bookID, rel, content); err != nil {
			return err
		}
	}
	for _, ch := range state.Chapters {
		meta := ch.Meta
		if err := st.SaveChapter(bookID, meta, ch.Content); err != nil {
			return err
		}
	}
	if state.Runtime != nil {
		if err := st.SaveRuntimeSnapshot(bookID, *state.Runtime); err != nil {
			return err
		}
	}
	return nil
}

func stripChapterHeading(raw, title string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	if strings.HasPrefix(raw, "# ") {
		lines := strings.SplitN(raw, "\n", 2)
		if len(lines) == 2 {
			return strings.TrimSpace(lines[1])
		}
		return ""
	}
	return raw
}
