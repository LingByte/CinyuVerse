//! Style sample extraction for unified tone correction.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

use crate::project_meta::{load_bundle, save_meta_file, ProjectInfo};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StyleExtractRequest {
    pub workspace_root: String,
    pub max_samples: u32,
    pub max_chars: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StyleExtractResult {
    pub sample_text: String,
    pub source_paths: Vec<String>,
    pub saved: bool,
}

fn read_excerpt(path: &Path, max_chars: usize) -> Option<String> {
    let content = fs::read_to_string(path).ok()?;
    let trimmed: String = content.chars().take(max_chars).collect();
    if trimmed.trim().is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

#[tauri::command]
pub fn cv_extract_style_sample(req: StyleExtractRequest) -> Result<StyleExtractResult, String> {
    let bundle = load_bundle(&req.workspace_root)?;
    let max_samples = req.max_samples.max(1).min(10) as usize;
    let max_chars = req.max_chars.max(500).min(4000) as usize;
    let mut parts = vec![];
    let mut paths = vec![];

    if !bundle.project.style_sample.is_empty() {
        parts.push(bundle.project.style_sample.clone());
    }

    'outer: for vol in &bundle.outline.volume_nodes {
        if let Some(children) = &vol.children {
            for ch in children {
                if parts.len() >= max_samples {
                    break 'outer;
                }
                if let Some(fp) = &ch.file_path {
                    let p = Path::new(fp);
                    if p.exists() {
                        if let Some(excerpt) = read_excerpt(p, max_chars) {
                            parts.push(format!("【{}】\n{}", ch.title, excerpt));
                            paths.push(fp.clone());
                        }
                    }
                }
            }
        }
    }

    let sample_text = parts.join("\n\n---\n\n");
    let mut saved = false;
    if !sample_text.is_empty() {
        let mut project: ProjectInfo = bundle.project;
        project.style_sample = sample_text.clone();
        project.updated_at = chrono::Utc::now().to_rfc3339();
        let json = serde_json::to_string_pretty(&project).map_err(|e| e.to_string())?;
        save_meta_file(&req.workspace_root, "project", &json)?;
        saved = true;
    }

    Ok(StyleExtractResult {
        sample_text,
        source_paths: paths,
        saved,
    })
}

#[tauri::command]
pub fn cv_get_style_sample(workspace_root: String) -> Result<String, String> {
    let bundle = load_bundle(&workspace_root)?;
    Ok(bundle.project.style_sample)
}
