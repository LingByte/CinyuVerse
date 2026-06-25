package memory

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"

	_ "github.com/glebarez/go-sqlite"
	"github.com/LingByte/CinyuVerse/pkg/story/models"
)

// DB is the SQLite acceleration index at books/<id>/story/memory.db.
type DB struct {
	conn *sql.DB
	path string
}

// Open opens or creates the memory database for a book.
func Open(bookDir string) (*DB, error) {
	dbPath := filepath.Join(bookDir, "story", "memory.db")
	if err := os.MkdirAll(filepath.Dir(dbPath), 0o755); err != nil {
		return nil, err
	}
	conn, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, err
	}
	db := &DB{conn: conn, path: dbPath}
	if err := db.migrate(); err != nil {
		_ = conn.Close()
		return nil, err
	}
	_, _ = db.conn.Exec("PRAGMA journal_mode = WAL")
	return db, nil
}

func (db *DB) migrate() error {
	_, err := db.conn.Exec(`
CREATE TABLE IF NOT EXISTS facts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject TEXT NOT NULL,
  predicate TEXT NOT NULL,
  object TEXT NOT NULL,
  valid_from_chapter INTEGER NOT NULL,
  valid_until_chapter INTEGER,
  source_chapter INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS chapter_summaries (
  chapter INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  characters TEXT NOT NULL DEFAULT '',
  events TEXT NOT NULL DEFAULT '',
  state_changes TEXT NOT NULL DEFAULT '',
  hook_activity TEXT NOT NULL DEFAULT '',
  mood TEXT NOT NULL DEFAULT '',
  chapter_type TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS hooks (
  hook_id TEXT PRIMARY KEY,
  start_chapter INTEGER NOT NULL DEFAULT 0,
  type TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  last_advanced_chapter INTEGER NOT NULL DEFAULT 0,
  expected_payoff TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_facts_subject ON facts(subject);
CREATE INDEX IF NOT EXISTS idx_facts_valid ON facts(valid_from_chapter, valid_until_chapter);
CREATE INDEX IF NOT EXISTS idx_hooks_status ON hooks(status);
`)
	return err
}

// Close releases the database connection.
func (db *DB) Close() error {
	if db.conn == nil {
		return nil
	}
	return db.conn.Close()
}

// Path returns the on-disk database path.
func (db *DB) Path() string { return db.path }

// ChapterCount returns stored summary count.
func (db *DB) ChapterCount() (int, error) {
	var n int
	err := db.conn.QueryRow(`SELECT COUNT(*) FROM chapter_summaries`).Scan(&n)
	return n, err
}

// ReplaceSummaries replaces all chapter summary rows.
func (db *DB) ReplaceSummaries(rows []models.ChapterSummaryRow) error {
	tx, err := db.conn.Begin()
	if err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM chapter_summaries`); err != nil {
		_ = tx.Rollback()
		return err
	}
	stmt, err := tx.Prepare(`INSERT INTO chapter_summaries(chapter, title, events) VALUES(?,?,?)`)
	if err != nil {
		_ = tx.Rollback()
		return err
	}
	defer stmt.Close()
	for _, r := range rows {
		if _, err := stmt.Exec(r.Chapter, r.Title, r.Summary); err != nil {
			_ = tx.Rollback()
			return err
		}
	}
	return tx.Commit()
}

// ReplaceCurrentFacts replaces fact rows from structured state.
func (db *DB) ReplaceCurrentFacts(facts []models.CurrentStateFact) error {
	tx, err := db.conn.Begin()
	if err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM facts`); err != nil {
		_ = tx.Rollback()
		return err
	}
	stmt, err := tx.Prepare(`INSERT INTO facts(subject, predicate, object, valid_from_chapter, valid_until_chapter, source_chapter) VALUES(?,?,?,?,?,?)`)
	if err != nil {
		_ = tx.Rollback()
		return err
	}
	defer stmt.Close()
	for _, f := range facts {
		ch := f.Chapter
		if ch <= 0 {
			ch = 1
		}
		parts := splitFactKey(f.Key)
		if _, err := stmt.Exec(parts[0], parts[1], f.Value, ch, nil, ch); err != nil {
			_ = tx.Rollback()
			return err
		}
	}
	return tx.Commit()
}

func splitFactKey(key string) [2]string {
	// key like "location" or "character:林烬"
	for i, r := range key {
		if r == ':' || r == '.' {
			return [2]string{key[:i], key[i+1:]}
		}
	}
	return [2]string{"state", key}
}

// StoredSummary is a row from chapter_summaries.
type StoredSummary struct {
	Chapter      int
	Title        string
	Events       string
	StateChanges string
	HookActivity string
}

// GetSummaries returns summaries in chapter range [from, to].
func (db *DB) GetSummaries(from, to int) ([]StoredSummary, error) {
	rows, err := db.conn.Query(`SELECT chapter, title, events, state_changes, hook_activity FROM chapter_summaries WHERE chapter >= ? AND chapter <= ? ORDER BY chapter`, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []StoredSummary
	for rows.Next() {
		var s StoredSummary
		if err := rows.Scan(&s.Chapter, &s.Title, &s.Events, &s.StateChanges, &s.HookActivity); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// StoredFact is a temporal fact row.
type StoredFact struct {
	Subject           string
	Predicate         string
	Object            string
	ValidFromChapter  int
	ValidUntilChapter *int
	SourceChapter     int
}

// GetCurrentFacts returns facts valid at the latest chapter.
func (db *DB) GetCurrentFacts() ([]StoredFact, error) {
	rows, err := db.conn.Query(`SELECT subject, predicate, object, valid_from_chapter, valid_until_chapter, source_chapter FROM facts ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []StoredFact
	for rows.Next() {
		var f StoredFact
		var until sql.NullInt64
		if err := rows.Scan(&f.Subject, &f.Predicate, &f.Object, &f.ValidFromChapter, &until, &f.SourceChapter); err != nil {
			return nil, err
		}
		if until.Valid {
			v := int(until.Int64)
			f.ValidUntilChapter = &v
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

// GetFactsAt returns facts valid at a specific chapter.
func (db *DB) GetFactsAt(subject string, chapter int) ([]StoredFact, error) {
	rows, err := db.conn.Query(`
SELECT subject, predicate, object, valid_from_chapter, valid_until_chapter, source_chapter
FROM facts WHERE subject = ? AND valid_from_chapter <= ? AND (valid_until_chapter IS NULL OR valid_until_chapter >= ?)
ORDER BY valid_from_chapter`, subject, chapter, chapter)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanFacts(rows)
}

func scanFacts(rows *sql.Rows) ([]StoredFact, error) {
	var out []StoredFact
	for rows.Next() {
		var f StoredFact
		var until sql.NullInt64
		if err := rows.Scan(&f.Subject, &f.Predicate, &f.Object, &f.ValidFromChapter, &until, &f.SourceChapter); err != nil {
			return nil, err
		}
		if until.Valid {
			v := int(until.Int64)
			f.ValidUntilChapter = &v
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

// FormatFact renders a fact for context injection.
func FormatFact(f StoredFact) string {
	return fmt.Sprintf("%s %s %s (ch%d)", f.Subject, f.Predicate, f.Object, f.ValidFromChapter)
}
