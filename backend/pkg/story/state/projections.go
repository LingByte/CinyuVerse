package state

import (
	"fmt"
	"strings"

	"github.com/LingByte/CinyuVerse/pkg/story/models"
)

// RenderHooksProjection renders hooks as Markdown for humans.
func RenderHooksProjection(hooks models.HooksState, lang models.Language) string {
	var b strings.Builder
	if lang == models.LanguageEN {
		b.WriteString("# Pending Hooks\n\n")
		b.WriteString("| hook_id | start | type | status | last_advanced | expected_payoff | notes |\n")
		b.WriteString("| --- | --- | --- | --- | --- | --- | --- |\n")
	} else {
		b.WriteString("# 伏笔池\n\n")
		b.WriteString("| hook_id | 起始章节 | 类型 | 状态 | 最近推进 | 预期回收 | 备注 |\n")
		b.WriteString("| --- | --- | --- | --- | --- | --- | --- |\n")
	}
	for _, h := range hooks.Hooks {
		fmt.Fprintf(&b, "| %s | %d | %s | %s | %d | %s | %s |\n",
			h.HookID, h.StartChapter, h.Type, h.Status, h.LastAdvancedChapter,
			escapePipe(h.ExpectedPayoff), escapePipe(h.Notes))
	}
	b.WriteByte('\n')
	return b.String()
}

// RenderCurrentStateProjection renders current state facts as Markdown.
func RenderCurrentStateProjection(state models.CurrentStateState, lang models.Language) string {
	var b strings.Builder
	if lang == models.LanguageEN {
		b.WriteString("# Current State\n\n| Key | Value | Chapter |\n| --- | --- | --- |\n")
	} else {
		b.WriteString("# 当前状态\n\n| 字段 | 值 | 章节 |\n| --- | --- | --- |\n")
	}
	for _, f := range state.Facts {
		fmt.Fprintf(&b, "| %s | %s | %d |\n", escapePipe(f.Key), escapePipe(f.Value), f.Chapter)
	}
	b.WriteByte('\n')
	return b.String()
}

// RenderChapterSummariesProjection renders chapter summaries as Markdown.
func RenderChapterSummariesProjection(summaries models.ChapterSummariesState, lang models.Language) string {
	var b strings.Builder
	if lang == models.LanguageEN {
		b.WriteString("# Chapter Summaries\n\n")
	} else {
		b.WriteString("# 章节摘要\n\n")
	}
	for _, row := range summaries.Rows {
		if lang == models.LanguageEN {
			fmt.Fprintf(&b, "## Chapter %d — %s\n\n%s\n\n", row.Chapter, row.Title, row.Summary)
		} else {
			fmt.Fprintf(&b, "## 第%d章 — %s\n\n%s\n\n", row.Chapter, row.Title, row.Summary)
		}
	}
	return b.String()
}

func escapePipe(s string) string {
	return strings.ReplaceAll(strings.ReplaceAll(s, "|", "\\|"), "\n", " ")
}

// PersistSnapshot writes authoritative JSON and Markdown projections.
func PersistSnapshot(writeJSON func(rel string, v any) error, writeText func(rel, content string) error, snap models.RuntimeStateSnapshot) error {
	if err := writeJSON("story/state/manifest.json", snap.Manifest); err != nil {
		return err
	}
	if err := writeJSON("story/state/hooks.json", snap.Hooks); err != nil {
		return err
	}
	if err := writeJSON("story/state/current_state.json", snap.CurrentState); err != nil {
		return err
	}
	if err := writeJSON("story/state/chapter_summaries.json", snap.ChapterSummaries); err != nil {
		return err
	}
	lang := snap.Manifest.Language
	if err := writeText("story/pending_hooks.md", RenderHooksProjection(snap.Hooks, lang)); err != nil {
		return err
	}
	if err := writeText("story/current_state.md", RenderCurrentStateProjection(snap.CurrentState, lang)); err != nil {
		return err
	}
	if err := writeText("story/chapter_summaries.md", RenderChapterSummariesProjection(snap.ChapterSummaries, lang)); err != nil {
		return err
	}
	return nil
}
