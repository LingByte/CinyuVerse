//! Plugin loader — scans `.cinyuverse/plugins/*/plugin.json`.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

use crate::project_meta::ensure_meta_dir;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub entry: String,
    pub enabled: bool,
    pub path: String,
}

fn plugins_root(workspace_root: &str) -> Result<PathBuf, String> {
    let root = ensure_meta_dir(workspace_root)?.join("plugins");
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    Ok(root)
}

#[tauri::command]
pub fn cv_list_plugins(workspace_root: String) -> Result<Vec<PluginManifest>, String> {
    let root = plugins_root(&workspace_root)?;
    let mut out = vec![];
    for entry in fs::read_dir(&root).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let dir = entry.path();
        if !dir.is_dir() {
            continue;
        }
        let manifest_path = dir.join("plugin.json");
        if !manifest_path.exists() {
            continue;
        }
        let raw = fs::read_to_string(&manifest_path).map_err(|e| e.to_string())?;
        let mut manifest: PluginManifest = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
        manifest.path = dir.to_string_lossy().to_string();
        out.push(manifest);
    }
    Ok(out)
}

#[tauri::command]
pub fn cv_set_plugin_enabled(
    workspace_root: String,
    plugin_id: String,
    enabled: bool,
) -> Result<(), String> {
    let root = plugins_root(&workspace_root)?;
    for entry in fs::read_dir(&root).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let dir = entry.path();
        let manifest_path = dir.join("plugin.json");
        if !manifest_path.exists() {
            continue;
        }
        let raw = fs::read_to_string(&manifest_path).map_err(|e| e.to_string())?;
        let mut manifest: PluginManifest = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
        if manifest.id == plugin_id {
            manifest.enabled = enabled;
            fs::write(&manifest_path, serde_json::to_string_pretty(&manifest).map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?;
            return Ok(());
        }
    }
    Err("插件不存在".to_string())
}
