package store

import "github.com/LingByte/CinyuVerse/pkg/story/models"

// BookStore abstracts book project storage so the pipeline can run against
// disk (ProjectStore) or in-memory (MemoryStore) without creating folders.
type BookStore interface {
	Root() string

	SaveBookConfig(cfg models.BookConfig) error
	LoadBookConfig(bookID string) (models.BookConfig, error)
	ListBooks() ([]models.BookConfig, error)

	EnsureBookLayout(bookID string) error
	EnsureControlDocuments(bookID, title string, lang models.Language) error

	WriteText(bookID, relPath, content string) error
	ReadText(bookID, relPath string) (string, error)
	ReadTextOrDefault(bookID, relPath, defaultContent string) string

	WriteJSON(bookID, relPath string, v any) error
	ReadJSON(bookID, relPath string, dest any) error

	WriteProjectText(relPath, content string) error
	WriteProjectJSON(relPath string, v any) error
	ReadProjectJSON(relPath string, dest any) error

	LoadProjectConfig() (models.ProjectConfig, error)
	SaveProjectConfig(cfg models.ProjectConfig) error

	NextChapterNumber(bookID string) (int, error)
	LoadChapterIndex(bookID string) ([]models.ChapterMeta, error)
	SaveChapterIndex(bookID string, index []models.ChapterMeta) error
	SaveChapter(bookID string, meta models.ChapterMeta, content string) error
	DeleteChapter(bookID string, chapterNum int) error

	LoadRuntimeSnapshot(bookID string, lang models.Language) (models.RuntimeStateSnapshot, error)
	SaveRuntimeSnapshot(bookID string, snap models.RuntimeStateSnapshot) error
	SaveChapterSnapshot(bookID string, chapterNum int) error
	RestoreChapterSnapshot(bookID string, chapterNum int) error

	ListTruthFiles(bookID string) ([]string, error)
}
