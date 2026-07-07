//! Chapter version snapshots under `.cinyuverse/history/`.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

use crate::project_meta::{ensure_meta_dir, HISTORY_DIR};
use crate::cinyuverse_fs::is_editable_file;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionEntry {
    pub id: String,
    pub file_path: String,
    pub created_at: String,
    pub label: String,
    pub size: u64,
}

fn history_dir(workspace_root: &str, file_path: &str) -> Result<PathBuf, String> {
    let meta = ensure_meta_dir(workspace_root)?;
    let key = file_path.replace(['\\', '/', ':'], "_");
    let dir = meta.join(HISTORY_DIR).join(key);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

#[tauri::command]
pub fn cv_snapshot_version(
    workspace_root: String,
    file_path: String,
    content: String,
    label: Option<String>,
) -> Result<VersionEntry, String> {
    let dir = history_dir(&workspace_root, &file_path)?;
    let id = format!(
        "{}",
        chrono::Utc::now().format("%Y%m%d-%H%M%S-%f")
    );
    let path = dir.join(format!("{}.md", id));
    fs::write(&path, &content).map_err(|e| e.to_string())?;
    let entry = VersionEntry {
        id,
        file_path,
        created_at: chrono::Utc::now().to_rfc3339(),
        label: label.unwrap_or_else(|| "自动快照".to_string()),
        size: content.len() as u64,
    };
    let meta_path = dir.join(format!("{}.json", entry.id));
    let json = serde_json::to_string_pretty(&entry).map_err(|e| e.to_string())?;
    fs::write(meta_path, json).map_err(|e| e.to_string())?;
    Ok(entry)
}

#[tauri::command]
pub fn cv_list_versions(
    workspace_root: String,
    file_path: String,
) -> Result<Vec<VersionEntry>, String> {
    let dir = history_dir(&workspace_root, &file_path)?;
    let mut entries = vec![];
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("json") {
            if let Ok(s) = fs::read_to_string(&path) {
                if let Ok(v) = serde_json::from_str::<VersionEntry>(&s) {
                    entries.push(v);
                }
            }
        }
    }
    entries.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(entries)
}

#[tauri::command]
pub fn cv_restore_version(
    workspace_root: String,
    file_path: String,
    version_id: String,
) -> Result<String, String> {
    let dir = history_dir(&workspace_root, &file_path)?;
    let content_path = dir.join(format!("{}.md", version_id));
    if !content_path.exists() {
        return Err("版本不存在".to_string());
    }
    fs::read_to_string(&content_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cv_write_file_with_snapshot(
    workspace_root: String,
    file_path: String,
    content: String,
) -> Result<(), String> {
    let path = Path::new(&file_path);
    if path.exists() {
        if let Ok(old) = fs::read_to_string(path) {
            if old != content {
                let _ = cv_snapshot_version(
                    workspace_root.clone(),
                    file_path.clone(),
                    old,
                    Some("保存前快照".to_string()),
                );
            }
        }
    }
    if !is_editable_file(&file_path) {
        return Err("无法写入该文件".to_string());
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(path, content).map_err(|e| e.to_string())?;
    Ok(())
}
