// Copyright (c) 2026 LingByte
// SPDX-License-Identifier: MIT

// Package storyline builds narrative context for LLM and human authoring:
// spine (主线节拍) + detail nodes (细化挂靠) + open hooks + facts.
package storyline

import (
	"encoding/json"
	"sort"
	"strconv"
	"strings"

	"github.com/LingByte/CinyuVerse/internal/models"
)

const (
	ModeSpineExplicit = "explicit-order"   // props.spineOrder on nodes
	ModeSpineTimeline = "timeline-fallback" // non-detail nodes by volume/chapter/priority
)

// NarrativeContext is the full "circulation" payload for one storyline.
type NarrativeContext struct {
	StorylineID       uint                `json:"storylineId"`
	NovelID           uint                `json:"novelId"`
	SpineSummary      string              `json:"spineSummary"`
	SpineResolvedMode string              `json:"spineResolvedMode"`
	CurrentNodeID     string              `json:"currentNodeId"`
	CurrentSpineIndex int                 `json:"currentSpineIndex"`
	SpineBeats        []NarrativeSpineBeat `json:"spineBeats"`
	NextBeats         []NarrativeSpineBeat `json:"nextBeats"`
	OpenHooks         []NarrativeOpenHook  `json:"openHooks"`
	FactsAtChapter    []NarrativeFact      `json:"factsAtChapter"`
	DetailClusters    []DetailCluster      `json:"detailClusters"`
	BridgeText        string              `json:"bridgeText"`
}

// NarrativeSpineBeat is one step on the main spine (王子遇险 → 得剑 → 斩怪 …).
type NarrativeSpineBeat struct {
	NodeID     string `json:"nodeId"`
	Title      string `json:"title"`
	Summary    string `json:"summary"`
	Type       string `json:"type"`
	Status     string `json:"status"`
	ChapterNo  int    `json:"chapterNo"`
	VolumeNo   int    `json:"volumeNo"`
	SpineOrder int    `json:"spineOrder"`
}

// NarrativeOpenHook is an unresolved clue/twist (no outgoing narrative edge).
type NarrativeOpenHook struct {
	NodeID  string `json:"nodeId"`
	Title   string `json:"title"`
	Summary string `json:"summary"`
	Type    string `json:"type"`
}

// NarrativeFact is a fact relevant at the requested chapter.
type NarrativeFact struct {
	FactKey       string `json:"factKey"`
	FactValue     string `json:"factValue"`
	SourceNodeID  string `json:"sourceNodeId"`
	ValidFromChap int    `json:"validFromChap"`
	ValidToChap   int    `json:"validToChap"`
	Confidence    int    `json:"confidence"`
}

// DetailCluster groups细化节点 under one spine beat (props.detailOf = spine nodeId).
type DetailCluster struct {
	AnchorNodeID string               `json:"anchorNodeId"`
	AnchorTitle  string               `json:"anchorTitle"`
	Details        []NarrativeDetailNode `json:"details"`
}

// NarrativeDetailNode is a non-spine beat used to elaborate a spine step.
type NarrativeDetailNode struct {
	NodeID    string `json:"nodeId"`
	Title     string `json:"title"`
	Summary   string `json:"summary"`
	Type      string `json:"type"`
	Status    string `json:"status"`
	ChapterNo int    `json:"chapterNo"`
	VolumeNo  int    `json:"volumeNo"`
}

var forwardRelations = map[string]struct{}{
	"cause":      {},
	"depends":    {},
	"payoff":     {},
	"reveal":     {},
	"introduces": {},
}

// BuildNarrativeContext assembles spine, next beats, detail clusters, hooks, facts, bridge text.
func BuildNarrativeContext(sl *models.Storyline, nodes []*models.StorylineNode, edges []*models.StorylineEdge, facts []*models.StorylineFact, chapterOrder int, nextBeatLimit int) *NarrativeContext {
	if nextBeatLimit < 1 {
		nextBeatLimit = 3
	}
	nodeByID := make(map[string]*models.StorylineNode, len(nodes))
	for _, n := range nodes {
		if n == nil {
			continue
		}
		nodeByID[strings.TrimSpace(n.NodeID)] = n
	}

	mode := ModeSpineTimeline
	spineNodes := selectSpineNodes(nodes, &mode)

	spineBeats := make([]NarrativeSpineBeat, 0, len(spineNodes))
	for i, n := range spineNodes {
		ord := i + 1
		if mode == ModeSpineExplicit {
			ord = spineOrderFromProps(n.Props)
		}
		spineBeats = append(spineBeats, beatFromModel(n, ord))
	}

	if mode == ModeSpineTimeline {
		sort.Slice(spineBeats, func(i, j int) bool {
			a, b := spineBeats[i], spineBeats[j]
			if a.VolumeNo != b.VolumeNo {
				return a.VolumeNo < b.VolumeNo
			}
			if a.ChapterNo != b.ChapterNo {
				return a.ChapterNo < b.ChapterNo
			}
			return a.SpineOrder < b.SpineOrder
		})
		for i := range spineBeats {
			spineBeats[i].SpineOrder = i + 1
		}
	}

	cur := strings.TrimSpace(sl.CurrentNodeID)
	curIdx := -1
	for i := range spineBeats {
		if spineBeats[i].NodeID == cur {
			curIdx = i
			break
		}
	}

	next := make([]NarrativeSpineBeat, 0, nextBeatLimit)
	if curIdx >= 0 {
		for j := curIdx + 1; j < len(spineBeats) && len(next) < nextBeatLimit; j++ {
			next = append(next, spineBeats[j])
		}
	} else {
		for j := 0; j < len(spineBeats) && len(next) < nextBeatLimit; j++ {
			next = append(next, spineBeats[j])
		}
	}

	openHooks := computeOpenHooks(nodes, edges)
	factsAt := filterFactsAtChapter(facts, chapterOrder)
	detailClusters := buildDetailClusters(nodes, nodeByID, spineBeats)

	summary := strings.TrimSpace(sl.SpineSummary)
	if summary == "" {
		summary = strings.TrimSpace(sl.Promise)
	}
	if summary == "" {
		summary = strings.TrimSpace(sl.Theme)
	}

	ctx := &NarrativeContext{
		StorylineID:       sl.ID,
		NovelID:           sl.NovelID,
		SpineSummary:      summary,
		SpineResolvedMode: mode,
		CurrentNodeID:     cur,
		CurrentSpineIndex: curIdx,
		SpineBeats:        spineBeats,
		NextBeats:         next,
		OpenHooks:         openHooks,
		FactsAtChapter:    factsAt,
		DetailClusters:    detailClusters,
	}
	ctx.BridgeText = buildBridgeText(ctx)
	return ctx
}

func beatFromModel(n *models.StorylineNode, spineOrder int) NarrativeSpineBeat {
	return NarrativeSpineBeat{
		NodeID:     strings.TrimSpace(n.NodeID),
		Title:      strings.TrimSpace(n.Title),
		Summary:    strings.TrimSpace(n.Summary),
		Type:       strings.TrimSpace(n.Type),
		Status:     strings.TrimSpace(n.Status),
		ChapterNo:  n.ChapterNo,
		VolumeNo:   n.VolumeNo,
		SpineOrder: spineOrder,
	}
}

func spineOrderFromProps(raw string) int {
	p := parsePropsObject(raw)
	if v, ok := p["spineOrder"]; ok {
		return int(anyToInt64(v))
	}
	return 0
}

func isDetailNode(raw string) bool {
	p := parsePropsObject(raw)
	if b, ok := p["detail"].(bool); ok && b {
		return true
	}
	if s, ok := p["detailOf"].(string); ok && strings.TrimSpace(s) != "" {
		return true
	}
	if s, ok := p["parentBeat"].(string); ok && strings.TrimSpace(s) != "" {
		return true
	}
	if s, ok := p["layer"].(string); ok && strings.EqualFold(strings.TrimSpace(s), "detail") {
		return true
	}
	return false
}

func detailParentID(raw string) string {
	p := parsePropsObject(raw)
	if s, ok := p["detailOf"].(string); ok {
		return strings.TrimSpace(s)
	}
	if s, ok := p["parentBeat"].(string); ok {
		return strings.TrimSpace(s)
	}
	return ""
}

func selectSpineNodes(nodes []*models.StorylineNode, mode *string) []*models.StorylineNode {
	explicit := make([]*models.StorylineNode, 0)
	for _, n := range nodes {
		if n == nil || isDetailNode(n.Props) {
			continue
		}
		if o := spineOrderFromProps(n.Props); o > 0 {
			explicit = append(explicit, n)
		}
	}
	if len(explicit) > 0 {
		*mode = ModeSpineExplicit
		sort.Slice(explicit, func(i, j int) bool {
			return spineOrderFromProps(explicit[i].Props) < spineOrderFromProps(explicit[j].Props)
		})
		return explicit
	}

	timeline := make([]*models.StorylineNode, 0, len(nodes))
	for _, n := range nodes {
		if n == nil || isDetailNode(n.Props) {
			continue
		}
		timeline = append(timeline, n)
	}
	sort.Slice(timeline, func(i, j int) bool {
		a, b := timeline[i], timeline[j]
		if a.VolumeNo != b.VolumeNo {
			return a.VolumeNo < b.VolumeNo
		}
		if a.ChapterNo != b.ChapterNo {
			return a.ChapterNo < b.ChapterNo
		}
		if a.Priority != b.Priority {
			return a.Priority > b.Priority
		}
		return strings.TrimSpace(a.NodeID) < strings.TrimSpace(b.NodeID)
	})
	return timeline
}

func computeOpenHooks(nodes []*models.StorylineNode, edges []*models.StorylineEdge) []NarrativeOpenHook {
	outDeg := make(map[string]int)
	for _, e := range edges {
		if e == nil || strings.ToLower(strings.TrimSpace(e.Status)) == "disabled" {
			continue
		}
		rel := strings.ToLower(strings.TrimSpace(e.Relation))
		if _, ok := forwardRelations[rel]; !ok {
			continue
		}
		from := strings.TrimSpace(e.FromNodeID)
		if from != "" {
			outDeg[from]++
		}
	}
	var hooks []NarrativeOpenHook
	for _, n := range nodes {
		if n == nil {
			continue
		}
		t := strings.ToLower(strings.TrimSpace(n.Type))
		if (t == "clue" || t == "twist") && outDeg[strings.TrimSpace(n.NodeID)] == 0 {
			hooks = append(hooks, NarrativeOpenHook{
				NodeID:  strings.TrimSpace(n.NodeID),
				Title:   strings.TrimSpace(n.Title),
				Summary: strings.TrimSpace(n.Summary),
				Type:    t,
			})
		}
	}
	return hooks
}

func filterFactsAtChapter(facts []*models.StorylineFact, chapterOrder int) []NarrativeFact {
	if chapterOrder <= 0 {
		out := make([]NarrativeFact, 0, len(facts))
		for _, f := range facts {
			if f == nil {
				continue
			}
			out = append(out, factFromModel(f))
		}
		return out
	}
	out := make([]NarrativeFact, 0)
	for _, f := range facts {
		if f == nil {
			continue
		}
		if f.ValidFromChap > chapterOrder {
			continue
		}
		if f.ValidToChap > 0 && f.ValidToChap < chapterOrder {
			continue
		}
		out = append(out, factFromModel(f))
	}
	return out
}

func factFromModel(f *models.StorylineFact) NarrativeFact {
	return NarrativeFact{
		FactKey:       strings.TrimSpace(f.FactKey),
		FactValue:     strings.TrimSpace(f.FactValue),
		SourceNodeID:  strings.TrimSpace(f.SourceNodeID),
		ValidFromChap: f.ValidFromChap,
		ValidToChap:   f.ValidToChap,
		Confidence:    f.Confidence,
	}
}

func buildDetailClusters(nodes []*models.StorylineNode, nodeByID map[string]*models.StorylineNode, spineBeats []NarrativeSpineBeat) []DetailCluster {
	anchorOrder := make([]string, 0, len(spineBeats))
	anchorTitle := make(map[string]string)
	for _, b := range spineBeats {
		anchorOrder = append(anchorOrder, b.NodeID)
		anchorTitle[b.NodeID] = b.Title
	}
	byAnchor := make(map[string][]NarrativeDetailNode)
	for _, n := range nodes {
		if n == nil || !isDetailNode(n.Props) {
			continue
		}
		parent := detailParentID(n.Props)
		if parent == "" {
			continue
		}
		dn := NarrativeDetailNode{
			NodeID:    strings.TrimSpace(n.NodeID),
			Title:     strings.TrimSpace(n.Title),
			Summary:   strings.TrimSpace(n.Summary),
			Type:      strings.TrimSpace(n.Type),
			Status:    strings.TrimSpace(n.Status),
			ChapterNo: n.ChapterNo,
			VolumeNo:  n.VolumeNo,
		}
		byAnchor[parent] = append(byAnchor[parent], dn)
	}
	var clusters []DetailCluster
	seen := make(map[string]struct{})
	for _, aid := range anchorOrder {
		details, ok := byAnchor[aid]
		if !ok || len(details) == 0 {
			continue
		}
		sort.Slice(details, func(i, j int) bool {
			a, b := details[i], details[j]
			if a.VolumeNo != b.VolumeNo {
				return a.VolumeNo < b.VolumeNo
			}
			if a.ChapterNo != b.ChapterNo {
				return a.ChapterNo < b.ChapterNo
			}
			return a.NodeID < b.NodeID
		})
		clusters = append(clusters, DetailCluster{
			AnchorNodeID: aid,
			AnchorTitle:  anchorTitle[aid],
			Details:      details,
		})
		seen[aid] = struct{}{}
	}
	for aid, details := range byAnchor {
		if _, ok := seen[aid]; ok {
			continue
		}
		if nodeByID[aid] == nil {
			continue
		}
		title := strings.TrimSpace(nodeByID[aid].Title)
		sort.Slice(details, func(i, j int) bool {
			a, b := details[i], details[j]
			if a.VolumeNo != b.VolumeNo {
				return a.VolumeNo < b.VolumeNo
			}
			return a.ChapterNo < b.ChapterNo
		})
		clusters = append(clusters, DetailCluster{
			AnchorNodeID: aid,
			AnchorTitle:  title,
			Details:      details,
		})
	}
	sort.Slice(clusters, func(i, j int) bool {
		return clusters[i].AnchorNodeID < clusters[j].AnchorNodeID
	})
	return clusters
}

func buildBridgeText(ctx *NarrativeContext) string {
	var b strings.Builder
	b.WriteString("【故事主线（一句话）】\n")
	if strings.TrimSpace(ctx.SpineSummary) != "" {
		b.WriteString(ctx.SpineSummary)
	} else {
		b.WriteString("（尚未填写 spineSummary / 卖点 / 主题，建议在故事线元数据中补充「一句话主线」。）")
	}
	b.WriteString("\n\n【当前推进点】\n")
	if ctx.CurrentNodeID == "" {
		b.WriteString("（未设置 currentNodeId）\n")
	} else {
		b.WriteString(ctx.CurrentNodeID)
		if ctx.CurrentSpineIndex >= 0 {
			b.WriteString("（主线第 ")
			b.WriteString(strconv.Itoa(ctx.CurrentSpineIndex + 1))
			b.WriteString(" / ")
			b.WriteString(strconv.Itoa(len(ctx.SpineBeats)))
			b.WriteString(" 拍）\n")
		} else {
			b.WriteString("（不在当前解析出的主线节拍序列上，请检查 props.spineOrder 或卷/章排序。）\n")
		}
	}
	b.WriteString("\n【后续主线节拍（供下一章桥接）】\n")
	if len(ctx.NextBeats) == 0 {
		b.WriteString("（无）\n")
	} else {
		for _, nb := range ctx.NextBeats {
			b.WriteString("- [")
			b.WriteString(nb.NodeID)
			b.WriteString("] ")
			b.WriteString(nb.Title)
			if nb.Summary != "" {
				b.WriteString(" — ")
				b.WriteString(nb.Summary)
			}
			b.WriteString("\n")
		}
	}
	b.WriteString("\n【未闭合伏笔/转折】\n")
	if len(ctx.OpenHooks) == 0 {
		b.WriteString("（无）\n")
	} else {
		for _, h := range ctx.OpenHooks {
			b.WriteString("- [")
			b.WriteString(h.NodeID)
			b.WriteString("] ")
			b.WriteString(h.Title)
			if h.Summary != "" {
				b.WriteString(" — ")
				b.WriteString(h.Summary)
			}
			b.WriteString("\n")
		}
	}
	b.WriteString("\n【细化支线（挂靠主线拍）】\n")
	if len(ctx.DetailClusters) == 0 {
		b.WriteString("（无；可在节点 props 中设置 detailOf 指向主线 nodeId，并设 detail: true 或 layer: detail）\n")
	} else {
		for _, c := range ctx.DetailClusters {
			b.WriteString("- 节拍 [")
			b.WriteString(c.AnchorNodeID)
			b.WriteString("] ")
			b.WriteString(c.AnchorTitle)
			b.WriteString("\n")
			for _, d := range c.Details {
				b.WriteString("  · [")
				b.WriteString(d.NodeID)
				b.WriteString("] ")
				b.WriteString(d.Title)
				if d.Summary != "" {
					b.WriteString(" — ")
					b.WriteString(d.Summary)
				}
				b.WriteString("\n")
			}
		}
	}
	b.WriteString("\n【当前参考事实】\n")
	if len(ctx.FactsAtChapter) == 0 {
		b.WriteString("（无或未按章节过滤）\n")
	} else {
		for _, f := range ctx.FactsAtChapter {
			b.WriteString("- ")
			b.WriteString(f.FactKey)
			b.WriteString(" = ")
			b.WriteString(f.FactValue)
			if f.SourceNodeID != "" {
				b.WriteString(" （来源节点 ")
				b.WriteString(f.SourceNodeID)
				b.WriteString("）")
			}
			b.WriteString("\n")
		}
	}
	b.WriteString("\n—— 主线解析模式：")
	b.WriteString(ctx.SpineResolvedMode)
	b.WriteString("\n")
	return b.String()
}

func parsePropsObject(raw string) map[string]any {
	raw = strings.TrimSpace(raw)
	if raw == "" || raw == "{}" {
		return map[string]any{}
	}
	var m map[string]any
	if err := json.Unmarshal([]byte(raw), &m); err != nil || m == nil {
		return map[string]any{}
	}
	return m
}

func anyToInt64(v any) int64 {
	switch x := v.(type) {
	case float64:
		return int64(x)
	case int:
		return int64(x)
	case int64:
		return x
	case json.Number:
		i, _ := x.Int64()
		return i
	case string:
		i, _ := strconv.ParseInt(strings.TrimSpace(x), 10, 64)
		return i
	default:
		return 0
	}
}
