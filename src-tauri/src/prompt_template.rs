//! Custom prompt template library under `.cinyuverse/prompt_templates.json`.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

use crate::project_meta::ensure_meta_dir;

const TEMPLATES_FILE: &str = "prompt_templates.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptTemplate {
    pub id: String,
    pub name: String,
    pub category: String,
    pub system_prompt: String,
    pub user_prompt: String,
    pub created_at: String,
    pub updated_at: String,
}

fn templates_path(workspace_root: &str) -> Result<PathBuf, String> {
    Ok(ensure_meta_dir(workspace_root)?.join(TEMPLATES_FILE))
}

fn load_templates(workspace_root: &str) -> Result<Vec<PromptTemplate>, String> {
    let path = templates_path(workspace_root)?;
    if !path.exists() {
        let defaults = vec![PromptTemplate {
            id: "expand_scene".into(),
            name: "场景扩写".into(),
            category: "writing".into(),
            system_prompt: "你是专业网文作者，擅长扩写场景与细节。".into(),
            user_prompt: "请扩写以下内容，保持文风一致：\n{{selection}}".into(),
            created_at: chrono::Utc::now().to_rfc3339(),
            updated_at: chrono::Utc::now().to_rfc3339(),
        }];
        fs::write(&path, serde_json::to_string_pretty(&defaults).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
        return Ok(defaults);
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

fn save_all(workspace_root: &str, templates: &[PromptTemplate]) -> Result<(), String> {
    let path = templates_path(workspace_root)?;
    fs::write(&path, serde_json::to_string_pretty(templates).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cv_list_prompt_templates(workspace_root: String) -> Result<Vec<PromptTemplate>, String> {
    load_templates(&workspace_root)
}

#[tauri::command]
pub fn cv_save_prompt_template(
    workspace_root: String,
    template: PromptTemplate,
) -> Result<PromptTemplate, String> {
    let mut templates = load_templates(&workspace_root)?;
    let now = chrono::Utc::now().to_rfc3339();
    if let Some(existing) = templates.iter_mut().find(|t| t.id == template.id) {
        existing.name = template.name;
        existing.category = template.category;
        existing.system_prompt = template.system_prompt;
        existing.user_prompt = template.user_prompt;
        existing.updated_at = now;
        let out = existing.clone();
        save_all(&workspace_root, &templates)?;
        return Ok(out);
    }
    let mut t = template;
    if t.created_at.is_empty() {
        t.created_at = now.clone();
    }
    t.updated_at = now;
    templates.push(t.clone());
    save_all(&workspace_root, &templates)?;
    Ok(t)
}

#[tauri::command]
pub fn cv_delete_prompt_template(workspace_root: String, template_id: String) -> Result<(), String> {
    let mut templates = load_templates(&workspace_root)?;
    templates.retain(|t| t.id != template_id);
    save_all(&workspace_root, &templates)
}
