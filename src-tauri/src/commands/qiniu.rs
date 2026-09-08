//! Tauri commands for Qiniu object storage integration.

use qiniu_storage::{QiniuClient, QiniuConfig, QiniuConfigManager, ListResult};
use serde::{Deserialize, Serialize};
use tauri::State;
use tokio::sync::Mutex;

/// Serializable config for the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QiniuConfigResponse {
    pub access_key: String,
    pub secret_key: String,
    pub bucket: String,
    pub domain: String,
    pub is_configured: bool,
}

impl From<QiniuConfig> for QiniuConfigResponse {
    fn from(cfg: QiniuConfig) -> Self {
        let is_configured = cfg.is_configured();
        Self {
            access_key: cfg.access_key.clone(),
            secret_key: cfg.secret_key.clone(),
            bucket: cfg.bucket.clone(),
            domain: cfg.domain.clone(),
            is_configured,
        }
    }
}

/// Cached Qiniu client — rebuilt when config changes.
#[derive(Default)]
pub struct QiniuState {
    client: Mutex<Option<QiniuClient>>,
}

async fn get_or_build_client(state: &QiniuState) -> Result<QiniuClient, String> {
    let mut guard = state.client.lock().await;
    if guard.is_some() {
        // Always rebuild from disk to pick up config changes.
    }
    let cfg = QiniuConfigManager::load().map_err(|e| e.to_string())?;
    if !cfg.is_configured() {
        return Err("七牛云未配置，请先在词库页面设置 Access Key / Secret Key / Bucket".into());
    }
    let client = QiniuClient::new(cfg);
    *guard = Some(client.clone());
    Ok(client)
}

#[tauri::command]
pub async fn qiniu_get_config() -> Result<QiniuConfigResponse, String> {
    let cfg = QiniuConfigManager::load().map_err(|e| e.to_string())?;
    Ok(cfg.into())
}

#[tauri::command]
pub async fn qiniu_set_config(
    access_key: String,
    secret_key: String,
    bucket: String,
    domain: String,
    state: State<'_, QiniuState>,
) -> Result<(), String> {
    let cfg = QiniuConfig {
        access_key,
        secret_key,
        bucket,
        domain,
    };
    QiniuConfigManager::save(&cfg).map_err(|e| e.to_string())?;
    // Invalidate cached client
    *state.client.lock().await = None;
    Ok(())
}

#[tauri::command]
pub async fn qiniu_list_novels(
    prefix: String,
    limit: u32,
    state: State<'_, QiniuState>,
) -> Result<ListResult, String> {
    let client = get_or_build_client(&state).await?;
    client.list(&prefix, limit).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn qiniu_download_text(
    key: String,
    max_chars: usize,
    state: State<'_, QiniuState>,
) -> Result<String, String> {
    let client = get_or_build_client(&state).await?;
    client.download_text(&key, max_chars).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn qiniu_upload_text(
    key: String,
    content: String,
    state: State<'_, QiniuState>,
) -> Result<(), String> {
    let client = get_or_build_client(&state).await?;
    client.upload_text(&key, &content).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn qiniu_delete(
    key: String,
    state: State<'_, QiniuState>,
) -> Result<(), String> {
    let client = get_or_build_client(&state).await?;
    client.delete(&key).await.map_err(|e| e.to_string())
}
