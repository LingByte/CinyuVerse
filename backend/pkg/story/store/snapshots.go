package store

import (
	"fmt"
	"io"
	"os"
	"path/filepath"

	"github.com/LingByte/CinyuVerse/pkg/story/models"
)

func chapterSnapshotRel(chapterNum int) string {
	return fmt.Sprintf("snapshots/chapter-%04d", chapterNum)
}

// SaveChapterSnapshot copies authoritative state JSON before writing a chapter.
func (s *ProjectStore) SaveChapterSnapshot(bookID string, chapterNum int) error {
	src := s.stateDir(bookID)
	dst := filepath.Join(s.bookDir(bookID), chapterSnapshotRel(chapterNum))
	_ = os.RemoveAll(dst)
	if err := os.MkdirAll(dst, 0o755); err != nil {
		return err
	}
	entries, err := os.ReadDir(src)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		if err := copyFile(filepath.Join(src, e.Name()), filepath.Join(dst, e.Name())); err != nil {
			return err
		}
	}
	return nil
}

// RestoreChapterSnapshot rolls runtime state back to the pre-chapter snapshot.
func (s *ProjectStore) RestoreChapterSnapshot(bookID string, chapterNum int) error {
	src := filepath.Join(s.bookDir(bookID), chapterSnapshotRel(chapterNum))
	dst := s.stateDir(bookID)
	entries, err := os.ReadDir(src)
	if err != nil {
		return fmt.Errorf("snapshot for chapter %d not found: %w", chapterNum, err)
	}
	if err := os.MkdirAll(dst, 0o755); err != nil {
		return err
	}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		if err := copyFile(filepath.Join(src, e.Name()), filepath.Join(dst, e.Name())); err != nil {
			return err
		}
	}
	return nil
}

// DeleteChapter removes a chapter file and index entry.
func (s *ProjectStore) DeleteChapter(bookID string, chapterNum int) error {
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
	if err := s.SaveChapterIndex(bookID, kept); err != nil {
		return err
	}
	_ = os.Remove(filepath.Join(s.chaptersDir(bookID), removedFile))
	return nil
}

// ListTruthFiles discovers markdown/json truth files under story/.
func (s *ProjectStore) ListTruthFiles(bookID string) ([]string, error) {
	root := s.storyDir(bookID)
	var files []string
	err := filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return err
		}
		rel, err := filepath.Rel(s.bookDir(bookID), path)
		if err != nil {
			return err
		}
		rel = filepath.ToSlash(rel)
		if rel == "chapters.json" {
			return nil
		}
		ext := filepath.Ext(rel)
		if ext == ".md" || ext == ".json" || ext == ".yaml" || ext == ".yml" {
			files = append(files, rel)
		}
		return nil
	})
	if os.IsNotExist(err) {
		return nil, nil
	}
	return files, err
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return err
	}
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, in)
	return err
}
