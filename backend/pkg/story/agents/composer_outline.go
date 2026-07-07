package agents

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/LingByte/CinyuVerse/pkg/protocol"
	"github.com/LingByte/CinyuVerse/pkg/story/agent"
	"github.com/LingByte/CinyuVerse/pkg/story/models"
	"github.com/LingByte/CinyuVerse/pkg/story/store"
)

type outlineSection struct {
	Source  string
	Heading string
	Content string
	Kind    string // story-frame | volume-map | volume-outline
}

type outlineSelectionHints struct {
	goal      string
	mustKeep  []string
	scenePlan string
}

// selectOutlineSections picks relevant outline sections for compose context.
func selectOutlineSections(st store.BookStore, bookID string, plan models.PlanChapterOutput, lang models.Language, selector func(context.Context, []outlineSection, outlineSelectionHints) ([]outlineSection, error), ctx context.Context) []models.ContextEntry {
	candidates := collectOutlineCandidates(st, bookID)
	if len(candidates) == 0 {
		return nil
	}
	hints := outlineSelectionHints{
		goal: plan.Intent.Goal, mustKeep: plan.Intent.MustKeep, scenePlan: plan.Memo.ScenePlan,
	}
	selected := deterministicOutlineSelection(candidates, hints)
	if len(candidates) > 1 && selector != nil && ctx != nil {
		if llmSel, err := selector(ctx, candidates, hints); err == nil && len(llmSel) > 0 {
			selected = llmSel
		}
	}
	var entries []models.ContextEntry
	for _, s := range selected {
		src := models.ContextVolumeOutline
		if s.Kind == "story-frame" {
			src = models.ContextStoryBible
		}
		entries = append(entries, models.ContextEntry{
			Source: src, Heading: s.Heading, Content: s.Content, Tokens: estimateTokens(s.Content),
		})
	}
	return entries
}

func collectOutlineCandidates(st store.BookStore, bookID string) []outlineSection {
	paths := []struct {
		path, kind string
	}{
		{"story/outline/story_frame.md", "story-frame"},
		{"story/outline/volume_map.md", "volume-map"},
		{"story/volume_outline.md", "volume-outline"},
	}
	var out []outlineSection
	for _, p := range paths {
		content := strings.TrimSpace(st.ReadTextOrDefault(bookID, p.path, ""))
		if content == "" {
			continue
		}
		for _, sec := range splitMarkdownSections(content) {
			out = append(out, outlineSection{
				Source:  p.path + "#" + slugHeading(sec.heading),
				Heading: sec.heading,
				Content: sec.body,
				Kind:    p.kind,
			})
		}
	}
	return out
}

type mdSection struct {
	heading string
	body    string
}

func splitMarkdownSections(md string) []mdSection {
	lines := strings.Split(md, "\n")
	var sections []mdSection
	var cur *mdSection
	for _, line := range lines {
		if strings.HasPrefix(line, "## ") {
			if cur != nil {
				sections = append(sections, *cur)
			}
			cur = &mdSection{heading: strings.TrimSpace(strings.TrimPrefix(line, "## "))}
			continue
		}
		if cur == nil {
			cur = &mdSection{heading: "overview", body: line + "\n"}
		} else {
			cur.body += line + "\n"
		}
	}
	if cur != nil {
		sections = append(sections, *cur)
	}
	if len(sections) == 0 && strings.TrimSpace(md) != "" {
		return []mdSection{{heading: "overview", body: md}}
	}
	return sections
}

func slugHeading(h string) string {
	h = strings.TrimSpace(h)
	h = strings.ReplaceAll(h, " ", "-")
	return h
}

func deterministicOutlineSelection(candidates []outlineSection, hints outlineSelectionHints) []outlineSection {
	terms := append([]string{hints.goal, hints.scenePlan}, hints.mustKeep...)
	var selected []outlineSection
	for _, c := range candidates {
		if matchesOutlineHints(c, terms) {
			selected = append(selected, c)
		}
	}
	if len(selected) == 0 && len(candidates) > 0 {
		seen := map[string]bool{}
		for _, c := range candidates {
			if seen[c.Kind] {
				continue
			}
			seen[c.Kind] = true
			selected = append(selected, c)
		}
	}
	return selected
}

func matchesOutlineHints(sec outlineSection, terms []string) bool {
	hard := []string{"世界观", "铁律", "核心冲突", "world", "rules", "conflict", "主角"}
	text := sec.Heading + " " + sec.Content
	lower := strings.ToLower(text)
	for _, h := range hard {
		if strings.Contains(lower, strings.ToLower(h)) {
			return true
		}
	}
	for _, t := range terms {
		if len([]rune(t)) < 2 {
			continue
		}
		if strings.Contains(lower, strings.ToLower(t)) {
			return true
		}
	}
	return false
}

// LLMOutlineSectionSelector uses Composer agent to pick outline sections.
func LLMOutlineSectionSelector(ctx agent.Context) func(context.Context, []outlineSection, outlineSelectionHints) ([]outlineSection, error) {
	return func(callCtx context.Context, candidates []outlineSection, hints outlineSelectionHints) ([]outlineSection, error) {
		var b strings.Builder
		b.WriteString("Goal: " + hints.goal + "\nCandidates:\n")
		for _, c := range candidates {
			fmt.Fprintf(&b, "- source=%s heading=%s excerpt=%s\n", c.Source, c.Heading, truncate(c.Content, 200))
		}
		resp, err := ctx.Chat(callCtx, []protocol.Message{
			protocol.SystemMessage(`Select outline sections for chapter writing. Output JSON only: {"selectedSources":["path#anchor",...]}`),
			protocol.UserMessage(b.String()),
		}, 0.1)
		if err != nil {
			return nil, err
		}
		var parsed struct {
			SelectedSources []string `json:"selectedSources"`
		}
		if err := json.Unmarshal([]byte(extractJSON(resp.FirstContent())), &parsed); err != nil {
			return nil, err
		}
		allow := map[string]outlineSection{}
		for _, c := range candidates {
			allow[c.Source] = c
		}
		var out []outlineSection
		for _, src := range parsed.SelectedSources {
			if c, ok := allow[src]; ok {
				out = append(out, c)
			}
		}
		return out, nil
	}
}
