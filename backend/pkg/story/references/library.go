package references

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const (
	DirName         = "references"
	CorpusFile      = "style_corpus.md"
	IndexFile       = "style_index.json"
	ReadmeFile      = "README.md"
	maxFileBytes    = 2 << 20 // 2MB per reference novel
	maxCorpusRunes  = 6000
)

// Index tracks synced reference files.
type Index struct {
	UpdatedAt time.Time          `json:"updatedAt"`
	Files     map[string]FileMeta `json:"files"`
}

// FileMeta is one reference source file.
type FileMeta struct {
	Name      string    `json:"name"`
	SHA256    string    `json:"sha256"`
	Size      int64     `json:"size"`
	SyncedAt  time.Time `json:"syncedAt"`
	Excerpt   string    `json:"excerpt,omitempty"`
}

// Library manages project-level reference novels folder.
type Library struct {
	Root string
}

func NewLibrary(projectRoot string) *Library {
	return &Library{Root: projectRoot}
}

func (l *Library) Dir() string {
	return filepath.Join(l.Root, DirName)
}

// EnsureLayout creates references/ with README.
func (l *Library) EnsureLayout() error {
	dir := l.Dir()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	readme := filepath.Join(dir, ReadmeFile)
	if _, err := os.Stat(readme); os.IsNotExist(err) {
		body := `# 参考小说库

把你喜欢的小说文本（.txt / .md）放在这个文件夹里。

系统会自动分析其中的写法、节奏、对话、修辞手法，压缩写入 ` + "`style_corpus.md`" + `，
写作时会注入到 Writer / Composer 规则栈，用于仿写文笔（不是抄剧情）。

建议：
- 每个文件一种风格参考，文件名用书名即可
- 单文件建议 5 万字以内片段（过长会自动截取）
- 放完文件后调用 POST /api/v1/references/sync 或写章时会自动同步
`
		return os.WriteFile(readme, []byte(body), 0o644)
	}
	return nil
}

// ListSourceFiles returns .txt/.md files excluding generated artifacts.
func (l *Library) ListSourceFiles() ([]string, error) {
	dir := l.Dir()
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var files []string
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		lower := strings.ToLower(name)
		if lower == strings.ToLower(ReadmeFile) || lower == strings.ToLower(CorpusFile) || lower == strings.ToLower(IndexFile) {
			continue
		}
		if strings.HasSuffix(lower, ".txt") || strings.HasSuffix(lower, ".md") {
			files = append(files, name)
		}
	}
	return files, nil
}

// ReadSource reads one reference file with size cap.
func (l *Library) ReadSource(name string) (string, error) {
	path := filepath.Join(l.Dir(), name)
	info, err := os.Stat(path)
	if err != nil {
		return "", err
	}
	if info.Size() > maxFileBytes {
		f, err := os.Open(path)
		if err != nil {
			return "", err
		}
		defer f.Close()
		buf := make([]byte, maxFileBytes)
		n, _ := f.Read(buf)
		return string(buf[:n]), nil
	}
	data, err := os.ReadFile(path)
	return string(data), err
}

// LoadIndex reads style_index.json.
func (l *Library) LoadIndex() (Index, error) {
	path := filepath.Join(l.Dir(), IndexFile)
	var idx Index
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return Index{Files: map[string]FileMeta{}}, nil
		}
		return Index{}, err
	}
	if err := json.Unmarshal(data, &idx); err != nil {
		return Index{}, err
	}
	if idx.Files == nil {
		idx.Files = map[string]FileMeta{}
	}
	return idx, nil
}

// SaveIndex writes style_index.json.
func (l *Library) SaveIndex(idx Index) error {
	idx.UpdatedAt = time.Now().UTC()
	path := filepath.Join(l.Dir(), IndexFile)
	data, err := json.MarshalIndent(idx, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}

// LoadCorpus reads generated style_corpus.md.
func (l *Library) LoadCorpus() (string, error) {
	data, err := os.ReadFile(filepath.Join(l.Dir(), CorpusFile))
	if err != nil {
		if os.IsNotExist(err) {
			return "", nil
		}
		return "", err
	}
	return string(data), nil
}

// SaveCorpus writes style_corpus.md.
func (l *Library) SaveCorpus(content string) error {
	if len([]rune(content)) > maxCorpusRunes {
		content = string([]rune(content)[:maxCorpusRunes]) + "\n\n…（已截断）"
	}
	return os.WriteFile(filepath.Join(l.Dir(), CorpusFile), []byte(content), 0o644)
}

// NeedsSync returns file names whose hash changed since last sync.
func (l *Library) NeedsSync() ([]string, error) {
	names, err := l.ListSourceFiles()
	if err != nil {
		return nil, err
	}
	idx, err := l.LoadIndex()
	if err != nil {
		return names, nil
	}
	var pending []string
	for _, name := range names {
		h, err := l.fileHash(name)
		if err != nil {
			continue
		}
		if meta, ok := idx.Files[name]; !ok || meta.SHA256 != h {
			pending = append(pending, name)
		}
	}
	return pending, nil
}

func (l *Library) fileHash(name string) (string, error) {
	data, err := os.ReadFile(filepath.Join(l.Dir(), name))
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:]), nil
}

// UpdateFileMeta records sync metadata for one file.
func (l *Library) UpdateFileMeta(idx *Index, name, excerpt string) error {
	h, err := l.fileHash(name)
	if err != nil {
		return err
	}
	info, _ := os.Stat(filepath.Join(l.Dir(), name))
	idx.Files[name] = FileMeta{
		Name: name, SHA256: h, SyncedAt: time.Now().UTC(), Excerpt: excerpt,
	}
	if info != nil {
		idx.Files[name] = FileMeta{
			Name: name, SHA256: h, Size: info.Size(), SyncedAt: time.Now().UTC(), Excerpt: excerpt,
		}
	}
	return nil
}

// CorpusHeading is the markdown section title for injection.
func CorpusHeading() string {
	return "reference_style_corpus"
}

// FormatCorpusSection wraps corpus for rule-stack / context.
func FormatCorpusSection(corpus string) string {
	if strings.TrimSpace(corpus) == "" {
		return ""
	}
	return fmt.Sprintf("# 参考文笔库（压缩摘要）\n\n%s", strings.TrimSpace(corpus))
}
