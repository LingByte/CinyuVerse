package store

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/LingByte/CinyuVerse/pkg/story/models"
	"github.com/LingByte/CinyuVerse/pkg/story/state"
)

// MemoryStore holds book projects in RAM — no filesystem layout is created.
type MemoryStore struct {
	mu            sync.RWMutex
	root          string
	books         map[string]*memBook
	projectConfig models.ProjectConfig
	projectTexts  map[string]string
	projectJSON   map[string][]byte
}

type memBook struct {
	config    models.BookConfig
	texts     map[string]string
	jsonBlobs map[string][]byte
	chapters  []models.ChapterMeta
	snapshots map[int]map[string][]byte
}

// NewMemoryStore creates an empty in-memory store.
func NewMemoryStore(root string) *MemoryStore {
	return &MemoryStore{
		root:          root,
		books:         map[string]*memBook{},
		projectConfig: models.DefaultProjectConfig(),
		projectTexts:  map[string]string{},
		projectJSON:   map[string][]byte{},
	}
}

func (s *MemoryStore) Root() string { return s.root }

func (s *MemoryStore) book(bookID string) *memBook {
	if s.books[bookID] == nil {
		s.books[bookID] = &memBook{
			texts:     map[string]string{},
			jsonBlobs: map[string][]byte{},
			snapshots: map[int]map[string][]byte{},
		}
	}
	return s.books[bookID]
}

func (s *MemoryStore) EnsureBookLayout(bookID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.book(bookID)
	return nil
}

func (s *MemoryStore) SaveBookConfig(cfg models.BookConfig) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	b := s.book(cfg.ID)
	b.config = cfg
	return s.writeBookJSON(cfg.ID, fileBook, cfg)
}

func (s *MemoryStore) LoadBookConfig(bookID string) (models.BookConfig, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	b, ok := s.books[bookID]
	if !ok || b.config.ID == "" {
		var cfg models.BookConfig
		if err := s.readBookJSONLocked(bookID, fileBook, &cfg); err != nil {
			return models.BookConfig{}, err
		}
		return cfg, nil
	}
	return b.config, nil
}

func (s *MemoryStore) ListBooks() ([]models.BookConfig, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var books []models.BookConfig
	for id, b := range s.books {
		cfg := b.config
		if cfg.ID == "" {
			cfg.ID = id
			_ = s.readBookJSONLocked(id, fileBook, &cfg)
		}
		if cfg.ID != "" {
			books = append(books, cfg)
		}
	}
	sort.Slice(books, func(i, j int) bool { return books[i].ID < books[j].ID })
	return books, nil
}

func (s *MemoryStore) WriteText(bookID, relPath, content string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.book(bookID).texts[normRel(relPath)] = content
	return nil
}

func (s *MemoryStore) ReadText(bookID, relPath string) (string, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	b, ok := s.books[bookID]
	if !ok {
		return "", os.ErrNotExist
	}
	content, ok := b.texts[normRel(relPath)]
	if !ok {
		return "", os.ErrNotExist
	}
	return content, nil
}

func (s *MemoryStore) ReadTextOrDefault(bookID, relPath, defaultContent string) string {
	content, err := s.ReadText(bookID, relPath)
	if err != nil {
		return defaultContent
	}
	return content
}

func (s *MemoryStore) WriteJSON(bookID, relPath string, v any) error {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.book(bookID).jsonBlobs[normRel(relPath)] = data
	return nil
}

func (s *MemoryStore) ReadJSON(bookID, relPath string, dest any) error {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.readBookJSONLocked(bookID, relPath, dest)
}

func (s *MemoryStore) readBookJSONLocked(bookID, relPath string, dest any) error {
	b, ok := s.books[bookID]
	if !ok {
		return os.ErrNotExist
	}
	data, ok := b.jsonBlobs[normRel(relPath)]
	if !ok {
		return os.ErrNotExist
	}
	return json.Unmarshal(data, dest)
}

func (s *MemoryStore) writeBookJSON(bookID, relPath string, v any) error {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	s.book(bookID).jsonBlobs[normRel(relPath)] = data
	return nil
}

func (s *MemoryStore) WriteProjectText(relPath, content string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.projectTexts[normRel(relPath)] = content
	return nil
}

func (s *MemoryStore) WriteProjectJSON(relPath string, v any) error {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.projectJSON[normRel(relPath)] = data
	return nil
}

func (s *MemoryStore) ReadProjectJSON(relPath string, dest any) error {
	s.mu.RLock()
	defer s.mu.RUnlock()
	data, ok := s.projectJSON[normRel(relPath)]
	if !ok {
		return os.ErrNotExist
	}
	return json.Unmarshal(data, dest)
}

func (s *MemoryStore) LoadProjectConfig() (models.ProjectConfig, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.projectConfig, nil
}

func (s *MemoryStore) SaveProjectConfig(cfg models.ProjectConfig) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	cfg.UpdatedAt = time.Now().UTC()
	s.projectConfig = cfg
	return nil
}

func (s *MemoryStore) EnsureControlDocuments(bookID, title string, lang models.Language) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	b := s.book(bookID)
	intentPath := "story/author_intent.md"
	focusPath := "story/current_focus.md"
	if _, ok := b.texts[intentPath]; !ok {
		b.texts[intentPath] = defaultAuthorIntent(title, lang)
	}
	if _, ok := b.texts[focusPath]; !ok {
		b.texts[focusPath] = defaultCurrentFocus(lang)
	}
	return nil
}

func (s *MemoryStore) NextChapterNumber(bookID string) (int, error) {
	index, err := s.LoadChapterIndex(bookID)
	if err != nil {
		return 1, nil
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

func (s *MemoryStore) LoadChapterIndex(bookID string) ([]models.ChapterMeta, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	b, ok := s.books[bookID]
	if !ok {
		return []models.ChapterMeta{}, nil
	}
	if len(b.chapters) > 0 {
		out := append([]models.ChapterMeta(nil), b.chapters...)
		sort.Slice(out, func(i, j int) bool { return out[i].Number < out[j].Number })
		return out, nil
	}
	var index []models.ChapterMeta
	if err := s.readBookJSONLocked(bookID, fileIndex, &index); err != nil {
		if os.IsNotExist(err) {
			return []models.ChapterMeta{}, nil
		}
		return nil, err
	}
	return index, nil
}

func (s *MemoryStore) SaveChapterIndex(bookID string, index []models.ChapterMeta) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	sort.Slice(index, func(i, j int) bool { return index[i].Number < index[j].Number })
	s.book(bookID).chapters = append([]models.ChapterMeta(nil), index...)
	return s.writeBookJSON(bookID, fileIndex, index)
}

func (s *MemoryStore) SaveChapter(bookID string, meta models.ChapterMeta, content string) error {
	if meta.FileName == "" {
		meta.FileName = ChapterFileName(meta.Number, meta.Title)
	}
	meta.UpdatedAt = time.Now().UTC()
	body := fmt.Sprintf("# %s\n\n%s", meta.Title, strings.TrimSpace(content))
	rel := filepath.Join(dirChapters, meta.FileName)
	if err := s.WriteText(bookID, rel, body); err != nil {
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

func (s *MemoryStore) DeleteChapter(bookID string, chapterNum int) error {
	index, err := s.LoadChapterIndex(bookID)
	if err != nil {
		return err
	}
	var kept []models.ChapterMeta
	var removedFile string
	for _, ch := range index {
		if ch.Number == chapterNum {
			removedFile = ch.FileName
			continue
		}
		kept = append(kept, ch)
	}
	if removedFile == "" {
		return fmt.Errorf("chapter %d not found", chapterNum)
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.book(bookID).texts, filepath.Join(dirChapters, removedFile))
	s.book(bookID).chapters = kept
	return s.writeBookJSON(bookID, fileIndex, kept)
}

func (s *MemoryStore) SaveChapterSnapshot(bookID string, chapterNum int) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	b := s.book(bookID)
	snap := map[string][]byte{}
	prefix := dirStory + "/" + dirState + "/"
	for rel, data := range b.jsonBlobs {
		if strings.HasPrefix(rel, prefix) || strings.HasPrefix(rel, "story/state/") {
			name := strings.TrimPrefix(rel, "story/state/")
			if name != rel {
				snap[name] = append([]byte(nil), data...)
			}
		}
	}
	for rel, text := range b.texts {
		if strings.HasPrefix(rel, "story/state/") {
			name := strings.TrimPrefix(rel, "story/state/")
			snap[name] = []byte(text)
		}
	}
	b.snapshots[chapterNum] = snap
	return nil
}

func (s *MemoryStore) RestoreChapterSnapshot(bookID string, chapterNum int) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	b := s.book(bookID)
	snap, ok := b.snapshots[chapterNum]
	if !ok {
		return fmt.Errorf("snapshot for chapter %d not found", chapterNum)
	}
	for rel := range b.texts {
		if strings.HasPrefix(rel, "story/state/") {
			delete(b.texts, rel)
		}
	}
	for rel := range b.jsonBlobs {
		if strings.HasPrefix(rel, "story/state/") {
			delete(b.jsonBlobs, rel)
		}
	}
	for name, data := range snap {
		if strings.HasSuffix(name, ".md") {
			b.texts["story/state/"+name] = string(data)
		} else {
			b.jsonBlobs["story/state/"+name] = append([]byte(nil), data...)
		}
	}
	return nil
}

func (s *MemoryStore) ListTruthFiles(bookID string) ([]string, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	b, ok := s.books[bookID]
	if !ok {
		return nil, nil
	}
	seen := map[string]struct{}{}
	var files []string
	for rel := range b.texts {
		if strings.HasPrefix(rel, "story/") && rel != fileIndex {
			ext := filepath.Ext(rel)
			if ext == ".md" || ext == ".json" || ext == ".yaml" || ext == ".yml" {
				files = append(files, rel)
				seen[rel] = struct{}{}
			}
		}
	}
	for rel := range b.jsonBlobs {
		if strings.HasPrefix(rel, "story/") {
			ext := filepath.Ext(rel)
			if ext == ".json" || ext == ".yaml" || ext == ".yml" {
				if _, ok := seen[rel]; !ok {
					files = append(files, rel)
				}
			}
		}
	}
	sort.Strings(files)
	return files, nil
}

func normRel(p string) string {
	return filepath.ToSlash(strings.TrimPrefix(filepath.Clean(p), "./"))
}

func (s *MemoryStore) LoadRuntimeSnapshot(bookID string, lang models.Language) (models.RuntimeStateSnapshot, error) {
	in := state.LoadSnapshotInput{}
	if err := s.ReadJSON(bookID, relManifest, &in.Manifest); err != nil && !os.IsNotExist(err) {
		return models.RuntimeStateSnapshot{}, err
	}
	if err := s.ReadJSON(bookID, relHooks, &in.Hooks); err != nil && !os.IsNotExist(err) {
		return models.RuntimeStateSnapshot{}, err
	}
	if err := s.ReadJSON(bookID, relCurrentStateJSON, &in.CurrentState); err != nil && !os.IsNotExist(err) {
		return models.RuntimeStateSnapshot{}, err
	}
	if err := s.ReadJSON(bookID, relSummariesJSON, &in.ChapterSummaries); err != nil && !os.IsNotExist(err) {
		return models.RuntimeStateSnapshot{}, err
	}
	return state.MergeLoadInput(in, lang), nil
}

func (s *MemoryStore) SaveRuntimeSnapshot(bookID string, snap models.RuntimeStateSnapshot) error {
	writeJSON := func(rel string, v any) error { return s.WriteJSON(bookID, rel, v) }
	writeText := func(rel, content string) error { return s.WriteText(bookID, rel, content) }
	return state.PersistSnapshot(writeJSON, writeText, snap)
}

// Compile-time check.
var _ BookStore = (*MemoryStore)(nil)
