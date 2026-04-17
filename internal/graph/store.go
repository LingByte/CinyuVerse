package graph

import "context"

type DebugNode struct {
	ID      string         `json:"id"`
	Label   string         `json:"label"`
	Type    string         `json:"type"`
	Status  string         `json:"status"`
	NovelID uint           `json:"novelId"`
	Props   map[string]any `json:"props,omitempty"`
}

type DebugEdge struct {
	ID       string         `json:"id"`
	From     string         `json:"from"`
	To       string         `json:"to"`
	Relation string         `json:"relation"`
	Props    map[string]any `json:"props,omitempty"`
}

// Store defines minimal graph storage lifecycle.
type Store interface {
	Ping(ctx context.Context) error
	InitSchema(ctx context.Context) error
	UpsertNode(ctx context.Context, node *DebugNode) error
	UpsertEdge(ctx context.Context, edge *DebugEdge) error
	DeleteNode(ctx context.Context, id string) error
	DeleteEdge(ctx context.Context, id string) error
	GetNode(ctx context.Context, id string) (*DebugNode, error)
	ListNodes(ctx context.Context, novelID uint, limit int) ([]*DebugNode, error)
	ListEdges(ctx context.Context, novelID uint, limit int) ([]*DebugEdge, error)
	Close(ctx context.Context) error
}
