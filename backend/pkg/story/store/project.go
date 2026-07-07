package store

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/LingByte/CinyuVerse/pkg/story/models"
)

const (
	dirBooks    = "books"
	dirChapters = "chapters"
	dirStory    = "story"
	dirState    = "state"
	dirRuntime  = "runtime"
	fileBook    = "book.json"
	fileIndex   = "chapters.json"
)

// ProjectStore manages on-disk book projects (InkOS books/<id>/ layout).
type ProjectStore struct {
	root string
}

// NewProjectStore creates a store rooted at projectRoot.
func NewProjectStore(projectRoot string) *ProjectStore {
	return &ProjectStore{root: projectRoot}
}

// Root returns the project root directory.
func (s *ProjectStore) Root() string { return s.root }

func (s *ProjectStore) bookDir(bookID string) string {
	return filepath.Join(s.root, dirBooks, bookID)
}

func (s *ProjectStore) storyDir(bookID string) string {
	return filepath.Join(s.bookDir(bookID), dirStory)
}

func (s *ProjectStore) stateDir(bookID string) string {
	return filepath.Join(s.storyDir(bookID), dirState)
}

func (s *ProjectStore) runtimeDir(bookID string) string {
	return filepath.Join(s.storyDir(bookID), dirRuntime)
}

func (s *ProjectStore) chaptersDir(bookID string) string {
	return filepath.Join(s.bookDir(bookID), dirChapters)
}

// EnsureBookLayout creates standard directories for a book.
func (s *ProjectStore) EnsureBookLayout(bookID string) error {
	for _, d := range []string{
		s.bookDir(bookID),
		s.chaptersDir(bookID),
		s.storyDir(bookID),
		s.stateDir(bookID),
		s.runtimeDir(bookID),
	} {
		if err := os.MkdirAll(d, 0o755); err != nil {
			return err
		}
	}
	return nil
}

// SaveBookConfig persists book.json.
func (s *ProjectStore) SaveBookConfig(cfg models.BookConfig) error {
	if err := s.EnsureBookLayout(cfg.ID); err != nil {
		return err
	}
	return writeJSON(filepath.Join(s.bookDir(cfg.ID), fileBook), cfg)
}

// LoadBookConfig reads book.json.
func (s *ProjectStore) LoadBookConfig(bookID string) (models.BookConfig, error) {
	var cfg models.BookConfig
	err := readJSON(filepath.Join(s.bookDir(bookID), fileBook), &cfg)
	return cfg, err
}

// ListBooks returns all book configs under the project root.
func (s *ProjectStore) ListBooks() ([]models.BookConfig, error) {
	root := filepath.Join(s.root, dirBooks)
	entries, err := os.ReadDir(root)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var books []models.BookConfig
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		cfg, err := s.LoadBookConfig(e.Name())
		if err != nil {
			continue
		}
		books = append(books, cfg)
	}
	return books, nil
}

// WriteText writes a UTF-8 text file under the book directory.
func (s *ProjectStore) WriteText(bookID, relPath, content string) error {
	path := filepath.Join(s.bookDir(bookID), relPath)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return os.WriteFile(path, []byte(content), 0o644)
}

// WriteProjectText writes a UTF-8 file relative to project root (shorts/, play/, etc.).
func (s *ProjectStore) WriteProjectText(relPath, content string) error {
	path := filepath.Join(s.root, relPath)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return os.WriteFile(path, []byte(content), 0o644)
}

// WriteProjectJSON writes JSON relative to project root.
func (s *ProjectStore) WriteProjectJSON(relPath string, v any) error {
	path := filepath.Join(s.root, relPath)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return writeJSON(path, v)
}

// ReadProjectJSON reads JSON relative to project root.
func (s *ProjectStore) ReadProjectJSON(relPath string, dest any) error {
	return readJSON(filepath.Join(s.root, relPath), dest)
}

// ReadText reads a UTF-8 text file under the book directory.
func (s *ProjectStore) ReadText(bookID, relPath string) (string, error) {
	data, err := os.ReadFile(filepath.Join(s.bookDir(bookID), relPath))
	if err != nil {
		return "", err
	}
	return string(data), nil
}

// ReadTextOrDefault returns defaultContent when the file is missing.
func (s *ProjectStore) ReadTextOrDefault(bookID, relPath, defaultContent string) string {
	content, err := s.ReadText(bookID, relPath)
	if err != nil {
		return defaultContent
	}
	return content
}

// WriteJSON writes JSON under bookDir/relPath.
func (s *ProjectStore) WriteJSON(bookID, relPath string, v any) error {
	path := filepath.Join(s.bookDir(bookID), relPath)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return writeJSON(path, v)
}

// ReadJSON reads JSON under bookDir/relPath.
func (s *ProjectStore) ReadJSON(bookID, relPath string, dest any) error {
	return readJSON(filepath.Join(s.bookDir(bookID), relPath), dest)
}

// EnsureControlDocuments creates author_intent.md and current_focus.md if absent.
func (s *ProjectStore) EnsureControlDocuments(bookID, title string, lang models.Language) error {
	if err := s.EnsureBookLayout(bookID); err != nil {
		return err
	}
	intentPath := "story/author_intent.md"
	focusPath := "story/current_focus.md"
	if _, err := os.Stat(filepath.Join(s.bookDir(bookID), intentPath)); os.IsNotExist(err) {
		body := defaultAuthorIntent(title, lang)
		if err := s.WriteText(bookID, intentPath, body); err != nil {
			return err
		}
	}
	if _, err := os.Stat(filepath.Join(s.bookDir(bookID), focusPath)); os.IsNotExist(err) {
		body := defaultCurrentFocus(lang)
		if err := s.WriteText(bookID, focusPath, body); err != nil {
			return err
		}
	}
	return nil
}

func defaultAuthorIntent(title string, lang models.Language) string {
	if lang == models.LanguageEN {
		return fmt.Sprintf("# Author Intent\n\nLong-form direction for **%s**.\n", title)
	}
	return fmt.Sprintf("# 作者意图\n\n《%s》的长期创作方向。\n", title)
}

func defaultCurrentFocus(lang models.Language) string {
	if lang == models.LanguageEN {
		return "# Current Focus\n\nWhat the next 1-3 chapters should emphasize.\n"
	}
	return "# 当前焦点\n\n最近 1-3 章要把注意力拉回哪里。\n"
}

// NextChapterNumber returns the next chapter number (1-based).
func (s *ProjectStore) NextChapterNumber(bookID string) (int, error) {
	index, err := s.LoadChapterIndex(bookID)
	if err != nil {
		if os.IsNotExist(err) {
			return 1, nil
		}
		return 0, err
	}
	if len(index) == 0 {
		return 1, nil
	}
	max := 0
	for _, ch := range index {
		if ch.Number > max {
			max = ch.Number
		}
	}
	return max + 1, nil
}

// LoadChapterIndex reads chapters.json.
func (s *ProjectStore) LoadChapterIndex(bookID string) ([]models.ChapterMeta, error) {
	var index []models.ChapterMeta
	err := s.ReadJSON(bookID, fileIndex, &index)
	if err != nil {
		if os.IsNotExist(err) {
			return []models.ChapterMeta{}, nil
		}
		return nil, err
	}
	return index, nil
}

// SaveChapterIndex writes chapters.json.
func (s *ProjectStore) SaveChapterIndex(bookID string, index []models.ChapterMeta) error {
	sort.Slice(index, func(i, j int) bool { return index[i].Number < index[j].Number })
	return s.WriteJSON(bookID, fileIndex, index)
}

// ChapterFileName builds a standard chapter filename.
func ChapterFileName(number int, title string) string {
	safe := sanitizeFileName(title)
	if safe == "" {
		safe = "untitled"
	}
	return fmt.Sprintf("%04d-%s.md", number, safe)
}

func sanitizeFileName(title string) string {
	title = strings.TrimSpace(title)
	if title == "" {
		return ""
	}
	var b strings.Builder
	for _, r := range title {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9':
			b.WriteRune(r)
		case r >= '\u4e00' && r <= '\u9fff':
			b.WriteRune(r)
		default:
			b.WriteRune('-')
		}
	}
	out := strings.Trim(b.String(), "-")
	if len(out) > 48 {
		out = out[:48]
	}
	return out
}

// SaveChapter persists chapter markdown and updates the index.
func (s *ProjectStore) SaveChapter(bookID string, meta models.ChapterMeta, content string) error {
	if meta.FileName == "" {
		meta.FileName = ChapterFileName(meta.Number, meta.Title)
	}
	meta.UpdatedAt = time.Now().UTC()
	body := fmt.Sprintf("# %s\n\n%s", meta.Title, strings.TrimSpace(content))
	if err := s.WriteText(bookID, filepath.Join(dirChapters, meta.FileName), body); err != nil {
		return err
	}
	index, err := s.LoadChapterIndex(bookID)
	if err != nil && !os.IsNotExist(err) {
		return err
	}
	replaced := false
	for i, ch := range index {
		if ch.Number == meta.Number {
			index[i] = meta
			replaced = true
			break
		}
	}
	if !replaced {
		index = append(index, meta)
	}
	return s.SaveChapterIndex(bookID, index)
}

func writeJSON(path string, v any) error {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}

func readJSON(path string, dest any) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	return json.Unmarshal(data, dest)
}
