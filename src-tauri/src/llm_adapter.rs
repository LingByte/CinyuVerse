//! Multi-LLM provider profiles.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

use crate::project_meta::ensure_meta_dir;

const PROFILES_FILE: &str = "llm_profiles.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmProviderProfile {
    pub id: String,
    pub label: String,
    pub provider: String,
    pub base_url: String,
    pub model: String,
    pub api_key_env: Option<String>,
    pub active: bool,
}

fn default_providers() -> Vec<LlmProviderProfile> {
    vec![
        LlmProviderProfile {
            id: "dashscope".into(),
            label: "通义千问".into(),
            provider: "openai_compat".into(),
            base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1".into(),
            model: "qwen-plus".into(),
            api_key_env: Some("AI_API_KEY".into()),
            active: true,
        },
        LlmProviderProfile {
            id: "ollama".into(),
            label: "Ollama".into(),
            provider: "ollama".into(),
            base_url: "http://127.0.0.1:11434/v1".into(),
            model: "llama3".into(),
            api_key_env: None,
            active: false,
        },
        LlmProviderProfile {
            id: "doubao".into(),
            label: "豆包".into(),
            provider: "openai_compat".into(),
            base_url: "https://ark.cn-beijing.volces.com/api/v3".into(),
            model: "doubao-pro".into(),
            api_key_env: Some("DOUBAO_API_KEY".into()),
            active: false,
        },
        LlmProviderProfile {
            id: "openai".into(),
            label: "OpenAI".into(),
            provider: "openai".into(),
            base_url: "https://api.openai.com/v1".into(),
            model: "gpt-4o-mini".into(),
            api_key_env: Some("OPENAI_API_KEY".into()),
            active: false,
        },
    ]
}

fn profiles_path(workspace_root: &str) -> Result<PathBuf, String> {
    Ok(ensure_meta_dir(workspace_root)?.join(PROFILES_FILE))
}

fn load_profiles(workspace_root: &str) -> Result<Vec<LlmProviderProfile>, String> {
    let path = profiles_path(workspace_root)?;
    if !path.exists() {
        return Ok(default_providers());
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cv_list_llm_providers(workspace_root: String) -> Result<Vec<LlmProviderProfile>, String> {
    load_profiles(&workspace_root)
}

#[tauri::command]
pub fn cv_save_llm_profiles(
    workspace_root: String,
    profiles: Vec<LlmProviderProfile>,
) -> Result<(), String> {
    let path = profiles_path(&workspace_root)?;
    fs::write(&path, serde_json::to_string_pretty(&profiles).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cv_set_active_llm_provider(
    workspace_root: String,
    provider_id: String,
) -> Result<LlmProviderProfile, String> {
    let mut profiles = load_profiles(&workspace_root)?;
    let mut active_profile = None;
    for p in &mut profiles {
        p.active = p.id == provider_id;
        if p.active {
            active_profile = Some(p.clone());
        }
    }
    cv_save_llm_profiles(workspace_root, profiles)?;
    active_profile.ok_or_else(|| "未找到该模型配置".to_string())
}
