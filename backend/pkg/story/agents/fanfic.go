package agents

import (
	"context"
	"fmt"
	"time"

	"github.com/LingByte/CinyuVerse/pkg/protocol"
	"github.com/LingByte/CinyuVerse/pkg/story/agent"
	"github.com/LingByte/CinyuVerse/pkg/story/models"
	"github.com/LingByte/CinyuVerse/pkg/story/store"
)

// FanficCanonImporter extracts canon from source material.
type FanficCanonImporter struct {
	ctx agent.Context
}

func NewFanficCanonImporter(ctx agent.Context) *FanficCanonImporter {
	return &FanficCanonImporter{ctx: ctx}
}

// ImportCanon generates fanfic_canon.md content from source text.
func (f *FanficCanonImporter) ImportCanon(ctx context.Context, sourceText, sourceName string, mode models.FanficMode, lang models.Language) (string, error) {
	sys := fmt.Sprintf(`Extract fanfic canon from source (%s mode). Output markdown with: Characters, World Rules, Timeline, Information Boundaries.`, mode)
	if lang == models.LanguageZH {
		sys = fmt.Sprintf(`从原作提取同人正典（模式 %s）。输出 Markdown：角色、世界规则、时间线、信息边界。`, mode)
	}
	user := fmt.Sprintf("Source: %s\n\n%s", sourceName, truncate(sourceText, 120000))
	resp, err := f.ctx.Chat(ctx, []protocol.Message{
		protocol.SystemMessage(sys),
		protocol.UserMessage(user),
	}, 0.3)
	if err != nil {
		return "", err
	}
	return resp.FirstContent(), nil
}

// InitFanficBook creates a fanfic book with imported canon and architect foundation.
func InitFanficBook(ctx context.Context, st store.BookStore, router agent.Router, cfg models.BookConfig, sourceText, sourceName string, mode models.FanficMode) error {
	if cfg.Language == "" {
		cfg.Language = models.LanguageZH
	}
	if cfg.ChapterWordCount <= 0 {
		cfg.ChapterWordCount = models.DefaultChapterWordCountZH
	}
	now := time.Now().UTC()
	cfg.CreatedAt = now
	cfg.UpdatedAt = now
	if cfg.Status == "" {
		cfg.Status = models.BookStatusDraft
	}
	if err := st.SaveBookConfig(cfg); err != nil {
		return err
	}
	_ = st.EnsureControlDocuments(cfg.ID, cfg.Title, cfg.Language)
	importerCtx, err := router.ContextFor(agent.NameFanficCanonImporter, st.Root(), cfg.ID)
	if err != nil {
		return err
	}
	canon, err := NewFanficCanonImporter(importerCtx).ImportCanon(ctx, sourceText, sourceName, mode, cfg.Language)
	if err != nil {
		return err
	}
	if err := st.WriteText(cfg.ID, "story/fanfic_canon.md", canon); err != nil {
		return err
	}
	archCtx, err := router.ContextFor(agent.NameArchitect, st.Root(), cfg.ID)
	if err != nil {
		return err
	}
	arch := NewArchitectAgent(archCtx)
	out, err := arch.GenerateFoundation(ctx, InitBookInput{
		Book: cfg, ExternalContext: "Fanfic mode: " + string(mode) + "\n\n" + canon,
	})
	if err != nil {
		return err
	}
	return WriteFoundationFiles(st, cfg.ID, out, cfg.Language)
}
