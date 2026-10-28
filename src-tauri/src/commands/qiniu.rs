//! Tauri commands for Qiniu object storage integration.

use qiniu_storage::{QiniuClient, QiniuConfig, QiniuConfigManager, ListResult};
use futures::StreamExt as _;
use serde::{Deserialize, Serialize};
use tauri::State;
use tokio::sync::Mutex;

/// Serializable config for the frontend. The secret key never crosses IPC:
/// `secret_key` is always empty and `secret_key_set` reports presence.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QiniuConfigResponse {
    pub access_key: String,
    pub secret_key: String,
    pub secret_key_set: bool,
    pub bucket: String,
    pub domain: String,
    pub is_configured: bool,
}

impl From<QiniuConfig> for QiniuConfigResponse {
    fn from(cfg: QiniuConfig) -> Self {
        let is_configured = cfg.is_configured();
        Self {
            access_key: cfg.access_key.clone(),
            secret_key: String::new(),
            secret_key_set: !cfg.secret_key.is_empty(),
            bucket: cfg.bucket.clone(),
            domain: cfg.domain.clone(),
            is_configured,
        }
    }
}

/// Cached Qiniu client — `qiniu_set_config` clears it, so a cached client
/// always matches the persisted config.
#[derive(Default)]
pub struct QiniuState {
    client: Mutex<Option<QiniuClient>>,
}

async fn get_or_build_client(state: &QiniuState) -> Result<QiniuClient, String> {
    let mut guard = state.client.lock().await;
    if let Some(client) = guard.as_ref() {
        return Ok(client.clone());
    }
    let cfg = QiniuConfigManager::load().map_err(|e| e.to_string())?;
    if !cfg.is_configured() {
        return Err("七牛云未配置，请先在书库页面设置 Access Key / Secret Key / Bucket".into());
    }
    let client = QiniuClient::new(cfg).map_err(|e| e.to_string())?;
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
    // An empty secret key means "keep the stored one", so a masked config
    // round-trip never wipes credentials.
    let secret_key = if secret_key.trim().is_empty() {
        QiniuConfigManager::load()
            .map(|existing| existing.secret_key)
            .unwrap_or_default()
    } else {
        secret_key
    };
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
pub async fn qiniu_list_chapters(
    book_key: String,
    state: State<'_, QiniuState>,
) -> Result<Vec<String>, String> {
    let client = get_or_build_client(&state).await?;
    client
        .list_chapters(&book_key)
        .await
        .map_err(|e| e.to_string())
}

/// A downloaded book: the concatenated Markdown and the chapter keys that
/// failed to download (skipped from `content`). Chapters missing from an
/// import are data loss for the author, so the caller must be able to see
/// them instead of a silently incomplete "success".
#[derive(Debug, Clone, Serialize)]
pub struct QiniuDownloadBookResult {
    pub content: String,
    pub failed_chapters: Vec<String>,
}

/// Download an entire book: fetches _meta.json + all chapter files,
/// concatenates them into a single Markdown string.
#[tauri::command]
pub async fn qiniu_download_book(
    book_key: String,
    max_chars: usize,
    state: State<'_, QiniuState>,
) -> Result<QiniuDownloadBookResult, String> {
    let client = get_or_build_client(&state).await?;

    // 1. Download metadata
    let meta_key = format!("{}/_meta.json", book_key);
    let meta_json = client.download_text(&meta_key, 0).await.map_err(|e| e.to_string())?;
    let meta: serde_json::Value =
        serde_json::from_str(&meta_json).map_err(|e| format!("Parse meta: {e}"))?;

    let title = meta["title"].as_str().unwrap_or("").to_string();
    let author = meta["author"].as_str().unwrap_or("").to_string();
    let category = meta["category"].as_str().unwrap_or("").to_string();
    let description = meta["description"].as_str().unwrap_or("").to_string();
    let chapter_count = meta["chapter_count"].as_u64().unwrap_or(0);

    // 2. List chapter files
    let chapters = client
        .list_chapters(&book_key)
        .await
        .map_err(|e| e.to_string())?;

    // 3. Build header
    let mut parts = Vec::new();
    parts.push(format!(
        "---\ntitle: \"{title}\"\nauthor: \"{author}\"\ncategory: \"{category}\"\nchapter_count: {chapter_count}\n---\n\n# {title}\n\n**作者**: {author}\n\n**简介**:\n\n{description}\n"
    ));

    // 4. Download chapters, append. Budgets count characters (CJK text is
    // ~3 bytes per char, so byte budgets would return ~⅓ of the request).
    // Preview (max_chars > 0) stops as soon as the budget is filled; full
    // imports download every chapter with bounded concurrency, order preserved
    // by `buffered` so chapters concatenate in sequence.
    let chapter_texts: Vec<Result<String, String>> = if max_chars > 0 {
        let mut acc = Vec::with_capacity(chapters.len());
        let mut total_chars = 0usize;
        for ch_key in &chapters {
            if total_chars >= max_chars {
                break;
            }
            match client.download_text(ch_key, 0).await {
                Ok(content) => {
                    total_chars += content.chars().count();
                    acc.push(Ok(content));
                }
                Err(e) => {
                    tracing::warn!("Failed to download chapter {ch_key}: {e}");
                    acc.push(Err(ch_key.clone()));
                }
            }
        }
        acc
    } else {
        futures::stream::iter(chapters)
            .map(|ch_key| {
                let client = client.clone();
                async move {
                    client
                        .download_text(&ch_key, 0)
                        .await
                        .map_err(|e| {
                            tracing::warn!("Failed to download chapter {ch_key}: {e}");
                            ch_key
                        })
                }
            })
            .buffered(qiniu_storage::DOWNLOAD_CONCURRENCY)
            .collect()
            .await
    };

    let mut failed_chapters = Vec::new();
    let mut total_chars = 0usize;
    for content in chapter_texts {
        let content = match content {
            Ok(content) => content,
            Err(ch_key) => {
                failed_chapters.push(ch_key);
                continue;
            }
        };
        let remaining = if max_chars > 0 {
            max_chars.saturating_sub(total_chars)
        } else {
            usize::MAX
        };
        let char_count = content.chars().count();
        let chunk: String = if char_count > remaining {
            content.chars().take(remaining).collect()
        } else {
            content
        };
        total_chars += chunk.chars().count();
        parts.push(chunk);
    }

    Ok(QiniuDownloadBookResult {
        content: parts.join("\n\n---\n\n"),
        failed_chapters,
    })
}

#[tauri::command]
pub async fn qiniu_delete(
    key: String,
    state: State<'_, QiniuState>,
) -> Result<(), String> {
    let client = get_or_build_client(&state).await?;
    client.delete(&key).await.map_err(|e| e.to_string())
}
