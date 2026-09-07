-- Story graph: beats (nodes) and beat edges (directed relationships).
-- Each beat is a story event anchored to a project; edges connect beats
-- with typed relationships (sequential, causal, foreshadow, parallel, etc.).
-- The graph is authored upfront (by the Architect agent or the user) and
-- nodes are lit up as chapters are written.

CREATE TABLE story_beat (
    id TEXT PRIMARY KEY,
    project_id BLOB NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    beat_type TEXT NOT NULL DEFAULT 'plot_point'
        CHECK (beat_type IN (
            'plot_point', 'character_arc', 'hook_plant', 'hook_advance',
            'hook_resolve', 'world_change', 'relationship_shift',
            'climax', 'turning_point'
        )),
    chapter_hint INTEGER,
    completed_chapter INTEGER,
    characters TEXT,        -- JSON array of character names
    hooks TEXT,             -- JSON array of hook ids
    status TEXT NOT NULL DEFAULT 'planned'
        CHECK (status IN ('planned', 'current', 'completed', 'skipped', 'revised')),
    volume INTEGER,         -- volume number for hierarchical grouping
    arc TEXT,               -- arc name for grouping (e.g. "第一幕：起步")
    sort_order INTEGER NOT NULL DEFAULT 0,
    completion_criteria TEXT,  -- JSON array of strings
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX idx_story_beat_project ON story_beat(project_id);
CREATE INDEX idx_story_beat_status ON story_beat(status);
CREATE INDEX idx_story_beat_chapter ON story_beat(completed_chapter);
CREATE INDEX idx_story_beat_sort ON story_beat(project_id, sort_order);

CREATE TABLE story_beat_edge (
    from_beat TEXT NOT NULL,
    to_beat TEXT NOT NULL,
    edge_type TEXT NOT NULL DEFAULT 'sequential'
        CHECK (edge_type IN (
            'sequential', 'causal', 'foreshadow', 'parallel', 'alternative',
            'character_arc', 'item_flow'
        )),
    note TEXT,
    PRIMARY KEY (from_beat, to_beat, edge_type),
    FOREIGN KEY (from_beat) REFERENCES story_beat(id) ON DELETE CASCADE,
    FOREIGN KEY (to_beat) REFERENCES story_beat(id) ON DELETE CASCADE
);

CREATE INDEX idx_story_beat_edge_from ON story_beat_edge(from_beat);
CREATE INDEX idx_story_beat_edge_to ON story_beat_edge(to_beat);
CREATE INDEX idx_story_beat_edge_type ON story_beat_edge(edge_type);
