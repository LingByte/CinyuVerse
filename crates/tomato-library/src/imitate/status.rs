use std::{
    fs,
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

use super::imitate_root;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ImitatePhase {
    Idle,
    Queued,
    Running,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImitateStatus {
    pub phase: ImitatePhase,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub progress: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    pub updated_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub conversation_id: Option<String>,
}

impl ImitateStatus {
    pub fn idle() -> Self {
        Self {
            phase: ImitatePhase::Idle,
            progress: None,
            error: None,
            updated_at: now_rfc3339(),
            conversation_id: None,
        }
    }
}

pub fn read_status(book_dir: &Path) -> Result<ImitateStatus> {
    let path = imitate_root(book_dir).join("status.json");
    if !path.is_file() {
        return Ok(ImitateStatus::idle());
    }
    let raw = fs::read_to_string(&path)
        .with_context(|| format!("Failed to read {}", path.display()))?;
    serde_json::from_str(&raw).context("Invalid status.json")
}

pub fn write_status(book_dir: &Path, status: &ImitateStatus) -> Result<()> {
    let root = super::ensure_imitate_dir(book_dir)?;
    super::write_json(&root.join("status.json"), status)
}

pub fn now_rfc3339() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // Compact UTC timestamp without pulling chrono into tomato-library.
    format!("{secs}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn roundtrip_status() {
        let tmp = tempfile::tempdir().unwrap();
        let book = tmp.path().join("b");
        fs::create_dir_all(book.join("chapters")).unwrap();
        fs::write(
            book.join("book.json"),
            r#"{"title":"t","author":"a","chapters":[]}"#,
        )
        .unwrap();
        write_status(
            &book,
            &ImitateStatus {
                phase: ImitatePhase::Failed,
                progress: None,
                error: Some("boom".into()),
                updated_at: "1".into(),
                conversation_id: None,
            },
        )
        .unwrap();
        let loaded = read_status(&book).unwrap();
        assert_eq!(loaded.phase, ImitatePhase::Failed);
        assert_eq!(loaded.error.as_deref(), Some("boom"));
    }
}
