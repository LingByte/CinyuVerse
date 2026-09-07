use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use strum_macros::{Display, EnumString};
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum StoryGraphError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error(transparent)]
    Serde(#[from] serde_json::Error),
    #[error("beat not found: {0}")]
    BeatNotFound(String),
    #[error("invalid beat type: {0}")]
    InvalidBeatType(String),
    #[error("invalid edge type: {0}")]
    InvalidEdgeType(String),
}

/// Type of a story beat (node in the graph).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS, Display, EnumString)]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
#[ts(export, export_to = "../shared/types.ts")]
pub enum BeatType {
    PlotPoint,
    CharacterArc,
    HookPlant,
    HookAdvance,
    HookResolve,
    WorldChange,
    RelationshipShift,
    Climax,
    TurningPoint,
}

impl Default for BeatType {
    fn default() -> Self {
        Self::PlotPoint
    }
}

/// Status of a story beat in the writing lifecycle.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS, Display, EnumString)]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
#[ts(export, export_to = "../shared/types.ts")]
pub enum BeatStatus {
    Planned,
    Current,
    Completed,
    Skipped,
    Revised,
}

impl Default for BeatStatus {
    fn default() -> Self {
        Self::Planned
    }
}

/// Type of edge connecting two story beats.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS, Display, EnumString)]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
#[ts(export, export_to = "../shared/types.ts")]
pub enum BeatEdgeType {
    Sequential,
    Causal,
    Foreshadow,
    Parallel,
    Alternative,
    CharacterArc,
    ItemFlow,
}

impl Default for BeatEdgeType {
    fn default() -> Self {
        Self::Sequential
    }
}

/// A story beat — a node in the story graph representing an event that
/// should happen at some point in the novel.
#[derive(Debug, Clone, Serialize, Deserialize, FromRow, TS)]
#[ts(export, export_to = "../shared/types.ts")]
pub struct StoryBeat {
    pub id: String,
    pub project_id: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub beat_type: String,
    pub chapter_hint: Option<i64>,
    pub completed_chapter: Option<i64>,
    pub characters: Option<String>,
    pub hooks: Option<String>,
    pub status: String,
    pub volume: Option<i64>,
    pub arc: Option<String>,
    pub sort_order: i64,
    pub completion_criteria: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// A directed edge between two story beats.
#[derive(Debug, Clone, Serialize, Deserialize, FromRow, TS)]
#[ts(export, export_to = "../shared/types.ts")]
pub struct StoryBeatEdge {
    pub from_beat: String,
    pub to_beat: String,
    pub edge_type: String,
    pub note: Option<String>,
}

/// The complete story graph for a project: all beats + all edges.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../shared/types.ts")]
pub struct StoryGraph {
    pub beats: Vec<StoryBeat>,
    pub edges: Vec<StoryBeatEdge>,
}

/// Input for creating a new beat.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../shared/types.ts")]
pub struct CreateBeatInput {
    pub project_id: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub beat_type: Option<String>,
    pub chapter_hint: Option<i64>,
    pub characters: Option<Vec<String>>,
    pub hooks: Option<Vec<String>>,
    pub volume: Option<i64>,
    pub arc: Option<String>,
    pub sort_order: Option<i64>,
    pub completion_criteria: Option<Vec<String>>,
}

/// Input for updating an existing beat.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../shared/types.ts")]
pub struct UpdateBeatInput {
    pub title: Option<String>,
    pub description: Option<String>,
    pub beat_type: Option<String>,
    pub chapter_hint: Option<i64>,
    pub completed_chapter: Option<i64>,
    pub characters: Option<Vec<String>>,
    pub hooks: Option<Vec<String>>,
    pub status: Option<String>,
    pub volume: Option<i64>,
    pub arc: Option<String>,
    pub sort_order: Option<i64>,
    pub completion_criteria: Option<Vec<String>>,
}

/// Input for creating a new edge.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../shared/types.ts")]
pub struct CreateBeatEdgeInput {
    pub from_beat: String,
    pub to_beat: String,
    pub edge_type: Option<String>,
    pub note: Option<String>,
}

/// Context for a specific beat, used when invoking an agent to infer or
/// write the beat. Includes the beat itself, its predecessors, successors,
/// relevant character cards, hooks, and the current world state.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../shared/types.ts")]
pub struct BeatContext {
    pub beat: StoryBeat,
    pub predecessors: Vec<StoryBeat>,
    pub successors: Vec<StoryBeat>,
    pub related_hooks: Vec<String>,
    pub characters: Vec<String>,
}

impl StoryBeat {
    pub fn characters_list(&self) -> Vec<String> {
        self.characters
            .as_deref()
            .and_then(|s| serde_json::from_str::<Vec<String>>(s).ok())
            .unwrap_or_default()
    }

    pub fn hooks_list(&self) -> Vec<String> {
        self.hooks
            .as_deref()
            .and_then(|s| serde_json::from_str::<Vec<String>>(s).ok())
            .unwrap_or_default()
    }

    pub fn completion_criteria_list(&self) -> Vec<String> {
        self.completion_criteria
            .as_deref()
            .and_then(|s| serde_json::from_str::<Vec<String>>(s).ok())
            .unwrap_or_default()
    }
}

pub async fn get_story_graph(
    pool: &SqlitePool,
    project_id: Uuid,
) -> Result<StoryGraph, StoryGraphError> {
    let beats = sqlx::query_as::<_, StoryBeat>(
        "SELECT * FROM story_beat WHERE project_id = ? ORDER BY sort_order ASC, chapter_hint ASC",
    )
    .bind(project_id)
    .fetch_all(pool)
    .await?;

    let beat_ids: Vec<&str> = beats.iter().map(|b| b.id.as_str()).collect();
    let edges = if beat_ids.is_empty() {
        Vec::new()
    } else {
        sqlx::query_as::<_, StoryBeatEdge>(
            "SELECT * FROM story_beat_edge WHERE from_beat IN (SELECT id FROM story_beat WHERE project_id = ?) OR to_beat IN (SELECT id FROM story_beat WHERE project_id = ?)",
        )
        .bind(project_id)
        .bind(project_id)
        .fetch_all(pool)
        .await?
    };

    Ok(StoryGraph { beats, edges })
}

pub async fn create_beat(
    pool: &SqlitePool,
    input: CreateBeatInput,
) -> Result<StoryBeat, StoryGraphError> {
    let id = format!("beat-{}", uuid::Uuid::new_v4().simple());
    let beat_type = input
        .beat_type
        .unwrap_or_else(|| BeatType::default().to_string());
    let characters = input
        .characters
        .map(|c| serde_json::to_string(&c).unwrap_or_else(|_| "[]".to_string()));
    let hooks = input
        .hooks
        .map(|h| serde_json::to_string(&h).unwrap_or_else(|_| "[]".to_string()));
    let completion_criteria = input
        .completion_criteria
        .map(|c| serde_json::to_string(&c).unwrap_or_else(|_| "[]".to_string()));
    let sort_order = input.sort_order.unwrap_or(0);

    sqlx::query(
        "INSERT INTO story_beat (id, project_id, title, description, beat_type, chapter_hint, characters, hooks, status, volume, arc, sort_order, completion_criteria)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'planned', ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(input.project_id)
    .bind(&input.title)
    .bind(&input.description)
    .bind(&beat_type)
    .bind(input.chapter_hint)
    .bind(&characters)
    .bind(&hooks)
    .bind(input.volume)
    .bind(&input.arc)
    .bind(sort_order)
    .bind(&completion_criteria)
    .execute(pool)
    .await?;

    let beat = sqlx::query_as::<_, StoryBeat>("SELECT * FROM story_beat WHERE id = ?")
        .bind(&id)
        .fetch_one(pool)
        .await?;

    Ok(beat)
}

pub async fn update_beat(
    pool: &SqlitePool,
    beat_id: &str,
    input: UpdateBeatInput,
) -> Result<StoryBeat, StoryGraphError> {
    let characters = input
        .characters
        .map(|c| serde_json::to_string(&c).unwrap_or_else(|_| "[]".to_string()));
    let hooks = input
        .hooks
        .map(|h| serde_json::to_string(&h).unwrap_or_else(|_| "[]".to_string()));
    let completion_criteria = input
        .completion_criteria
        .map(|c| serde_json::to_string(&c).unwrap_or_else(|_| "[]".to_string()));

    sqlx::query(
        "UPDATE story_beat SET
            title = COALESCE(?, title),
            description = COALESCE(?, description),
            beat_type = COALESCE(?, beat_type),
            chapter_hint = COALESCE(?, chapter_hint),
            completed_chapter = COALESCE(?, completed_chapter),
            characters = COALESCE(?, characters),
            hooks = COALESCE(?, hooks),
            status = COALESCE(?, status),
            volume = COALESCE(?, volume),
            arc = COALESCE(?, arc),
            sort_order = COALESCE(?, sort_order),
            completion_criteria = COALESCE(?, completion_criteria),
            updated_at = datetime('now')
         WHERE id = ?",
    )
    .bind(&input.title)
    .bind(&input.description)
    .bind(&input.beat_type)
    .bind(input.chapter_hint)
    .bind(input.completed_chapter)
    .bind(&characters)
    .bind(&hooks)
    .bind(&input.status)
    .bind(input.volume)
    .bind(&input.arc)
    .bind(input.sort_order)
    .bind(&completion_criteria)
    .bind(beat_id)
    .execute(pool)
    .await?;

    let beat = sqlx::query_as::<_, StoryBeat>("SELECT * FROM story_beat WHERE id = ?")
        .bind(beat_id)
        .fetch_one(pool)
        .await
        .map_err(|_| StoryGraphError::BeatNotFound(beat_id.to_string()))?;

    Ok(beat)
}

pub async fn delete_beat(pool: &SqlitePool, beat_id: &str) -> Result<(), StoryGraphError> {
    sqlx::query("DELETE FROM story_beat WHERE id = ?")
        .bind(beat_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn create_beat_edge(
    pool: &SqlitePool,
    input: CreateBeatEdgeInput,
) -> Result<StoryBeatEdge, StoryGraphError> {
    let edge_type = input
        .edge_type
        .unwrap_or_else(|| BeatEdgeType::default().to_string());

    sqlx::query(
        "INSERT INTO story_beat_edge (from_beat, to_beat, edge_type, note)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(from_beat, to_beat, edge_type) DO UPDATE SET note = excluded.note",
    )
    .bind(&input.from_beat)
    .bind(&input.to_beat)
    .bind(&edge_type)
    .bind(&input.note)
    .execute(pool)
    .await?;

    Ok(StoryBeatEdge {
        from_beat: input.from_beat,
        to_beat: input.to_beat,
        edge_type,
        note: input.note,
    })
}

pub async fn delete_beat_edge(
    pool: &SqlitePool,
    from_beat: &str,
    to_beat: &str,
    edge_type: &str,
) -> Result<(), StoryGraphError> {
    sqlx::query(
        "DELETE FROM story_beat_edge WHERE from_beat = ? AND to_beat = ? AND edge_type = ?",
    )
    .bind(from_beat)
    .bind(to_beat)
    .bind(edge_type)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn build_beat_context(
    pool: &SqlitePool,
    beat_id: &str,
) -> Result<BeatContext, StoryGraphError> {
    let beat = sqlx::query_as::<_, StoryBeat>("SELECT * FROM story_beat WHERE id = ?")
        .bind(beat_id)
        .fetch_one(pool)
        .await
        .map_err(|_| StoryGraphError::BeatNotFound(beat_id.to_string()))?;

    // Predecessors: beats that have an edge pointing TO this beat
    let predecessors = sqlx::query_as::<_, StoryBeat>(
        "SELECT b.* FROM story_beat b
         JOIN story_beat_edge e ON e.from_beat = b.id
         WHERE e.to_beat = ?
         ORDER BY b.sort_order ASC",
    )
    .bind(beat_id)
    .fetch_all(pool)
    .await?;

    // Successors: beats that this beat points TO
    let successors = sqlx::query_as::<_, StoryBeat>(
        "SELECT b.* FROM story_beat b
         JOIN story_beat_edge e ON e.to_beat = b.id
         WHERE e.from_beat = ?
         ORDER BY b.sort_order ASC",
    )
    .bind(beat_id)
    .fetch_all(pool)
    .await?;

    Ok(BeatContext {
        characters: beat.characters_list(),
        related_hooks: beat.hooks_list(),
        beat,
        predecessors,
        successors,
    })
}
