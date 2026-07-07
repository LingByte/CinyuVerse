//! Draft / final chapter storage under `.cinyuverse/`.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

use crate::project_meta::ensure_meta_dir;

pub const DRAFTS_SUBDIR: &str = "drafts";
pub const FINAL_SUBDIR: &str = "final";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelocateResult {
    pub old_path: String,
    pub new_path: String,
    pub storage: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchFileResult {
    pub path: String,
    pub ok: bool,
    pub error: Option<String>,
}

fn storage_root(workspace_root: &str, storage: &str) -> Result<PathBuf, String> {
    let meta = ensure_meta_dir(workspace_root)?;
    match storage {
        "draft" | "drafts" => Ok(meta.join(DRAFTS_SUBDIR)),
        "final" => Ok(meta.join(FINAL_SUBDIR)),
        "workspace" => Ok(PathBuf::from(workspace_root)),
        other => Err(format!("未知存储类型: {}", other)),
    }
}

fn relative_to_workspace(workspace_root: &Path, file_path: &Path) -> Result<PathBuf, String> {
    file_path
        .strip_prefix(workspace_root)
        .map(|p| p.to_path_buf())
        .map_err(|_| "文件不在工作区根目录内".to_string())
}

#[tauri::command]
pub fn cv_relocate_chapter(
    workspace_root: String,
    file_path: String,
    storage: String,
) -> Result<RelocateResult, String> {
    let ws = Path::new(&workspace_root);
    let src = Path::new(&file_path);
    if !src.exists() || !src.is_file() {
        return Err("源文件不存在".to_string());
    }
    let rel = relative_to_workspace(ws, src)?;
    let dest_root = storage_root(&workspace_root, &storage)?;
    let dest = dest_root.join(&rel);
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    if dest.exists() {
        return Err("目标路径已存在".to_string());
    }
    fs::rename(src, &dest).map_err(|e| e.to_string())?;
    Ok(RelocateResult {
        old_path: file_path,
        new_path: dest.to_string_lossy().to_string(),
        storage,
    })
}

#[tauri::command]
pub fn cv_batch_move_files(
    file_paths: Vec<String>,
    dest_dir: String,
) -> Result<Vec<BatchFileResult>, String> {
    let dest = Path::new(&dest_dir);
    fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    let mut out = vec![];
    for path in file_paths {
        let src = Path::new(&path);
        let name = src
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("file.md");
        let target = dest.join(name);
        match fs::rename(src, &target) {
            Ok(()) => out.push(BatchFileResult {
                path: target.to_string_lossy().to_string(),
                ok: true,
                error: None,
            }),
            Err(e) => out.push(BatchFileResult {
                path: path.clone(),
                ok: false,
                error: Some(e.to_string()),
            }),
        }
    }
    Ok(out)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenamePair {
    from: String,
    to: String,
}

#[tauri::command]
pub fn cv_batch_rename_files(renames: Vec<RenamePair>) -> Result<Vec<BatchFileResult>, String> {
    let mut out = vec![];
    for RenamePair { from, to } in renames {
        let src = Path::new(&from);
        let dst = Path::new(&to);
        if !src.exists() {
            out.push(BatchFileResult {
                path: from.clone(),
                ok: false,
                error: Some("源文件不存在".to_string()),
            });
            continue;
        }
        if dst.exists() {
            out.push(BatchFileResult {
                path: from.clone(),
                ok: false,
                error: Some("目标已存在".to_string()),
            });
            continue;
        }
        if let Some(parent) = dst.parent() {
            let _ = fs::create_dir_all(parent);
        }
        match fs::rename(src, dst) {
            Ok(()) => out.push(BatchFileResult {
                path: to.clone(),
                ok: true,
                error: None,
            }),
            Err(e) => out.push(BatchFileResult {
                path: from.clone(),
                ok: false,
                error: Some(e.to_string()),
            }),
        }
    }
    Ok(out)
}
