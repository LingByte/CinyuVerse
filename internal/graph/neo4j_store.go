package graph

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/LingByte/CinyuVerse/pkg/config"
	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
)

type Neo4jStore struct {
	driver   neo4j.DriverWithContext
	database string
}

func NewNeo4jStore(cfg config.Neo4jConfig) (*Neo4jStore, error) {
	if cfg.URI == "" {
		return nil, errors.New("neo4j uri is empty")
	}
	driver, err := neo4j.NewDriverWithContext(
		cfg.URI,
		neo4j.BasicAuth(cfg.Username, cfg.Password, ""),
	)
	if err != nil {
		return nil, fmt.Errorf("create neo4j driver: %w", err)
	}
	return &Neo4jStore{
		driver:   driver,
		database: cfg.Database,
	}, nil
}

func (s *Neo4jStore) Ping(ctx context.Context) error {
	if s == nil || s.driver == nil {
		return errors.New("neo4j driver is nil")
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	return s.driver.VerifyConnectivity(ctx)
}

func (s *Neo4jStore) InitSchema(ctx context.Context) error {
	if s == nil || s.driver == nil {
		return errors.New("neo4j driver is nil")
	}
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	session := s.driver.NewSession(ctx, neo4j.SessionConfig{DatabaseName: s.database})
	defer session.Close(ctx)

	queries := []string{
		"CREATE CONSTRAINT story_node_id_unique IF NOT EXISTS FOR (n:StoryNode) REQUIRE n.id IS UNIQUE",
		"CREATE CONSTRAINT story_edge_id_unique IF NOT EXISTS FOR ()-[r:STORY_EDGE]-() REQUIRE r.id IS UNIQUE",
		"CREATE INDEX story_node_novel_id IF NOT EXISTS FOR (n:StoryNode) ON (n.novelId)",
		"CREATE INDEX story_node_type IF NOT EXISTS FOR (n:StoryNode) ON (n.type)",
		"CREATE INDEX story_node_status IF NOT EXISTS FOR (n:StoryNode) ON (n.status)",
		"CREATE INDEX story_edge_novel_id IF NOT EXISTS FOR ()-[r:STORY_EDGE]-() ON (r.novelId)",
	}

	for _, q := range queries {
		_, err := session.ExecuteWrite(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
			_, runErr := tx.Run(ctx, q, nil)
			return nil, runErr
		})
		if err != nil {
			return fmt.Errorf("init schema query failed: %s: %w", q, err)
		}
	}
	return nil
}

func (s *Neo4jStore) UpsertNode(ctx context.Context, node *DebugNode) error {
	if node == nil || node.ID == "" {
		return errors.New("node id is required")
	}
	session := s.driver.NewSession(ctx, neo4j.SessionConfig{DatabaseName: s.database})
	defer session.Close(ctx)
	_, err := session.ExecuteWrite(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		query := `
MERGE (n:StoryNode {id: $id})
SET n.label = $label, n.type = $type, n.status = $status, n.novelId = $novelId, n.updatedAt = timestamp()
SET n += $props
RETURN n.id AS id`
		_, runErr := tx.Run(ctx, query, map[string]any{
			"id":      node.ID,
			"label":   node.Label,
			"type":    node.Type,
			"status":  node.Status,
			"novelId": int64(node.NovelID),
			"props":   safeMap(node.Props),
		})
		return nil, runErr
	})
	return err
}

func (s *Neo4jStore) UpsertEdge(ctx context.Context, edge *DebugEdge) error {
	if edge == nil || edge.ID == "" || edge.From == "" || edge.To == "" {
		return errors.New("edge id/from/to are required")
	}
	session := s.driver.NewSession(ctx, neo4j.SessionConfig{DatabaseName: s.database})
	defer session.Close(ctx)
	_, err := session.ExecuteWrite(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		query := `
MATCH (a:StoryNode {id: $from}), (b:StoryNode {id: $to})
MERGE (a)-[r:STORY_EDGE {id: $id}]->(b)
SET r.relation = $relation, r.novelId = $novelId, r.updatedAt = timestamp()
SET r += $props
RETURN r.id AS id`
		_, runErr := tx.Run(ctx, query, map[string]any{
			"id":       edge.ID,
			"from":     edge.From,
			"to":       edge.To,
			"relation": edge.Relation,
			"novelId":  int64(edgeNovelID(edge)),
			"props":    safeMap(edge.Props),
		})
		return nil, runErr
	})
	return err
}

func (s *Neo4jStore) DeleteNode(ctx context.Context, id string) error {
	session := s.driver.NewSession(ctx, neo4j.SessionConfig{DatabaseName: s.database})
	defer session.Close(ctx)
	_, err := session.ExecuteWrite(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		_, runErr := tx.Run(ctx, "MATCH (n:StoryNode {id: $id}) DETACH DELETE n", map[string]any{"id": id})
		return nil, runErr
	})
	return err
}

func (s *Neo4jStore) DeleteEdge(ctx context.Context, id string) error {
	session := s.driver.NewSession(ctx, neo4j.SessionConfig{DatabaseName: s.database})
	defer session.Close(ctx)
	_, err := session.ExecuteWrite(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		_, runErr := tx.Run(ctx, "MATCH ()-[r:STORY_EDGE {id: $id}]-() DELETE r", map[string]any{"id": id})
		return nil, runErr
	})
	return err
}

func (s *Neo4jStore) GetNode(ctx context.Context, id string) (*DebugNode, error) {
	session := s.driver.NewSession(ctx, neo4j.SessionConfig{DatabaseName: s.database})
	defer session.Close(ctx)
	out, err := session.ExecuteRead(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		res, runErr := tx.Run(ctx, `
MATCH (n:StoryNode {id: $id})
RETURN n.id AS id, n.label AS label, n.type AS type, n.status AS status, n.novelId AS novelId, properties(n) AS props`, map[string]any{"id": id})
		if runErr != nil {
			return nil, runErr
		}
		if !res.Next(ctx) {
			return nil, errors.New("node not found")
		}
		rec := res.Record()
		return &DebugNode{
			ID:      strVal(rec.Values[0]),
			Label:   strVal(rec.Values[1]),
			Type:    strVal(rec.Values[2]),
			Status:  strVal(rec.Values[3]),
			NovelID: uint(intVal(rec.Values[4])),
			Props:   mapVal(rec.Values[5]),
		}, nil
	})
	if err != nil {
		return nil, err
	}
	return out.(*DebugNode), nil
}

func (s *Neo4jStore) ListNodes(ctx context.Context, novelID uint, limit int) ([]*DebugNode, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	session := s.driver.NewSession(ctx, neo4j.SessionConfig{DatabaseName: s.database})
	defer session.Close(ctx)
	out, err := session.ExecuteRead(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		query := `MATCH (n:StoryNode) `
		params := map[string]any{"limit": int64(limit)}
		if novelID > 0 {
			query += `WHERE n.novelId = $novelId `
			params["novelId"] = int64(novelID)
		}
		query += `RETURN n.id AS id, n.label AS label, n.type AS type, n.status AS status, n.novelId AS novelId, properties(n) AS props ORDER BY n.updatedAt DESC LIMIT $limit`
		res, runErr := tx.Run(ctx, query, params)
		if runErr != nil {
			return nil, runErr
		}
		nodes := make([]*DebugNode, 0)
		for res.Next(ctx) {
			rec := res.Record()
			nodes = append(nodes, &DebugNode{
				ID:      strVal(rec.Values[0]),
				Label:   strVal(rec.Values[1]),
				Type:    strVal(rec.Values[2]),
				Status:  strVal(rec.Values[3]),
				NovelID: uint(intVal(rec.Values[4])),
				Props:   mapVal(rec.Values[5]),
			})
		}
		return nodes, res.Err()
	})
	if err != nil {
		return nil, err
	}
	return out.([]*DebugNode), nil
}

func (s *Neo4jStore) ListEdges(ctx context.Context, novelID uint, limit int) ([]*DebugEdge, error) {
	if limit <= 0 || limit > 500 {
		limit = 200
	}
	session := s.driver.NewSession(ctx, neo4j.SessionConfig{DatabaseName: s.database})
	defer session.Close(ctx)
	out, err := session.ExecuteRead(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		query := `MATCH (a:StoryNode)-[r:STORY_EDGE]->(b:StoryNode) `
		params := map[string]any{"limit": int64(limit)}
		if novelID > 0 {
			query += `WHERE r.novelId = $novelId `
			params["novelId"] = int64(novelID)
		}
		query += `RETURN r.id AS id, a.id AS from, b.id AS to, r.relation AS relation, properties(r) AS props ORDER BY r.updatedAt DESC LIMIT $limit`
		res, runErr := tx.Run(ctx, query, params)
		if runErr != nil {
			return nil, runErr
		}
		edges := make([]*DebugEdge, 0)
		for res.Next(ctx) {
			rec := res.Record()
			edges = append(edges, &DebugEdge{
				ID:       strVal(rec.Values[0]),
				From:     strVal(rec.Values[1]),
				To:       strVal(rec.Values[2]),
				Relation: strVal(rec.Values[3]),
				Props:    mapVal(rec.Values[4]),
			})
		}
		return edges, res.Err()
	})
	if err != nil {
		return nil, err
	}
	return out.([]*DebugEdge), nil
}

func (s *Neo4jStore) Close(ctx context.Context) error {
	if s == nil || s.driver == nil {
		return nil
	}
	return s.driver.Close(ctx)
}

func safeMap(m map[string]any) map[string]any {
	if m == nil {
		return map[string]any{}
	}
	cp := map[string]any{}
	for k, v := range m {
		cp[k] = v
	}
	return cp
}

func edgeNovelID(edge *DebugEdge) uint {
	if edge == nil || edge.Props == nil {
		return 0
	}
	v, ok := edge.Props["novelId"]
	if !ok {
		return 0
	}
	switch x := v.(type) {
	case float64:
		return uint(x)
	case int:
		return uint(x)
	case int64:
		return uint(x)
	}
	return 0
}

func strVal(v any) string {
	if v == nil {
		return ""
	}
	s, ok := v.(string)
	if ok {
		return s
	}
	return fmt.Sprint(v)
}

func intVal(v any) int64 {
	switch x := v.(type) {
	case int64:
		return x
	case int:
		return int64(x)
	case float64:
		return int64(x)
	default:
		return 0
	}
}

func mapVal(v any) map[string]any {
	if v == nil {
		return map[string]any{}
	}
	m, ok := v.(map[string]any)
	if ok {
		return m
	}
	return map[string]any{}
}
