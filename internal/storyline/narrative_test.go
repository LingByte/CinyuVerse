package storyline

import (
	"testing"

	"github.com/LingByte/CinyuVerse/internal/models"
)

func TestBuildNarrativeContext_explicitSpineAndDetail(t *testing.T) {
	sl := &models.Storyline{
		BaseModel:     models.BaseModel{ID: 1},
		NovelID:       10,
		SpineSummary:  "王子击败怪兽，夺回王国。",
		CurrentNodeID: "n1",
	}
	nodes := []*models.StorylineNode{
		{NodeID: "n1", Title: "遇险", Summary: "s1", Type: "event", Status: "approved", ChapterNo: 1, VolumeNo: 1, Props: `{"spineOrder":1}`},
		{NodeID: "n2", Title: "得剑", Summary: "s2", Type: "event", Status: "draft", ChapterNo: 2, VolumeNo: 1, Props: `{"spineOrder":2}`},
	}
	nodes = append(nodes, &models.StorylineNode{
		NodeID: "d1", Title: "细化试炼", Summary: "细化", Type: "event", ChapterNo: 1, VolumeNo: 1,
		Props: `{"detail":true,"detailOf":"n1"}`,
	})
	edges := []*models.StorylineEdge{
		{FromNodeID: "n1", ToNodeID: "n2", Relation: "cause", Status: "active"},
	}
	facts := []*models.StorylineFact{
		{FactKey: "hero.name", FactValue: "阿岚", SourceNodeID: "n1", ValidFromChap: 1, ValidToChap: 0, Confidence: 100},
	}
	ctx := BuildNarrativeContext(sl, nodes, edges, facts, 1, 3)
	if ctx.SpineResolvedMode != ModeSpineExplicit {
		t.Fatalf("mode=%s", ctx.SpineResolvedMode)
	}
	if len(ctx.SpineBeats) != 2 {
		t.Fatalf("spine beats=%d", len(ctx.SpineBeats))
	}
	if ctx.CurrentSpineIndex != 0 {
		t.Fatalf("current idx=%d", ctx.CurrentSpineIndex)
	}
	if len(ctx.NextBeats) != 1 || ctx.NextBeats[0].NodeID != "n2" {
		t.Fatalf("next=%v", ctx.NextBeats)
	}
	if len(ctx.DetailClusters) != 1 || ctx.DetailClusters[0].AnchorNodeID != "n1" {
		t.Fatalf("clusters=%v", ctx.DetailClusters)
	}
	if ctx.BridgeText == "" {
		t.Fatal("empty bridge")
	}
}

func TestBuildNarrativeContext_timelineFallback(t *testing.T) {
	sl := &models.Storyline{BaseModel: models.BaseModel{ID: 2}, NovelID: 1, Promise: "一句话卖点"}
	nodes := []*models.StorylineNode{
		{NodeID: "a", Title: "后发生", Type: "event", ChapterNo: 5, VolumeNo: 1, Priority: 1, Props: "{}"},
		{NodeID: "b", Title: "先发生", Type: "event", ChapterNo: 1, VolumeNo: 1, Priority: 1, Props: "{}"},
	}
	ctx := BuildNarrativeContext(sl, nodes, nil, nil, 0, 2)
	if ctx.SpineResolvedMode != ModeSpineTimeline {
		t.Fatalf("mode=%s", ctx.SpineResolvedMode)
	}
	if len(ctx.SpineBeats) != 2 || ctx.SpineBeats[0].NodeID != "b" {
		t.Fatalf("order=%v", ctx.SpineBeats)
	}
}
