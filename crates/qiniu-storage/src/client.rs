//! Qiniu client — uses the official `qiniu-sdk` for all operations.
//!
//! All signing logic is handled by the SDK; we no longer hand-roll
//! HMAC-SHA1 tokens.

use std::time::Duration;

use anyhow::{Context, Result, anyhow};
use futures::stream::TryStreamExt;
use qiniu_sdk::objects::apis::credential::Credential;
use qiniu_sdk::objects::ObjectsManager;
use qiniu_sdk::upload::{ObjectParams, UploadManager, UploadTokenSigner};
use qiniu_sdk::prelude::SinglePartUploader;
use serde::{Deserialize, Serialize};

use crate::config::QiniuConfig;

/// Metadata for a stored novel.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NovelInfo {
    pub key: String,
    pub title: String,
    pub author: String,
    pub category: String,
    pub word_count: u64,
    pub chapter_count: u32,
    pub status: String,
    pub source_url: String,
    pub uploaded_at: String,
    pub size: u64,
}

/// Raw JSON structure of `_meta.json` stored in the bucket.
#[derive(Debug, Clone, Deserialize)]
struct NovelMetaJson {
    title: String,
    author: String,
    category: String,
    word_count: u64,
    chapter_count: u32,
    uploaded_chapters: u32,
    status: String,
    source: String,
}

/// Result of a list operation.
#[derive(Debug, Clone, Serialize)]
pub struct ListResult {
    pub items: Vec<NovelInfo>,
    pub total: usize,
}

/// Qiniu client wrapping the official SDK.
#[derive(Clone)]
pub struct QiniuClient {
    config: QiniuConfig,
    credential: Credential,
}

impl QiniuClient {
    /// Create a new client from a loaded config.
    pub fn new(config: QiniuConfig) -> Result<Self> {
        if config.access_key.is_empty() || config.secret_key.is_empty() {
            return Err(anyhow!("Qiniu access_key or secret_key is empty"));
        }
        let credential = Credential::new(&config.access_key, &config.secret_key);
        Ok(Self { config, credential })
    }

    /// Upload text content to the bucket under the given key.
    pub async fn upload_text(&self, key: &str, content: &str) -> Result<()> {
        // Write content to a temp file, then use the SDK's path-based upload.
        let tmp = tempfile::NamedTempFile::new().context("Create temp file for upload")?;
        std::fs::write(tmp.path(), content.as_bytes())
            .context("Write content to temp file")?;

        let upload_manager = UploadManager::builder(UploadTokenSigner::new_credential_provider(
            self.credential.to_owned(),
            &self.config.bucket,
            Duration::from_secs(3600),
        ))
        .build();

        let params = ObjectParams::builder()
            .object_name(key)
            .file_name(key)
            .build();

        let uploader = upload_manager.form_uploader();
        uploader
            .async_upload_path(tmp.path(), params)
            .await
            .map_err(|e| anyhow!("Upload failed: {e}"))?;

        tracing::debug!("Uploaded {} ({} bytes)", key, content.len());
        Ok(())
    }

    /// List novels in the bucket. Scans for `_meta.json` files under the
    /// given prefix, downloads each one, and returns parsed book metadata.
    pub async fn list(&self, prefix: &str, _limit: u32) -> Result<ListResult> {
        let object_manager = ObjectsManager::new(self.credential.to_owned());
        let bucket = object_manager.bucket(&self.config.bucket);

        // No total limit — let the stream paginate through all objects.
        // (Setting `.limit(N)` caps the TOTAL count, not the page size.)
        let mut list_builder = bucket.list();
        list_builder.prefix(prefix);
        let mut stream = list_builder.stream();

        let mut meta_keys: Vec<String> = Vec::new();
        while let Some(object) = stream.try_next().await.map_err(|e| anyhow!("List failed: {e}"))? {
            let key = object.get_key_as_str().to_string();
            if key.ends_with("_meta.json") {
                meta_keys.push(key);
            }
        }

        // Download each meta.json and parse it
        let mut items = Vec::new();
        for key in meta_keys {
            match self.download_text(&key, 0).await {
                Ok(json_str) => {
                    if let Ok(meta) = serde_json::from_str::<NovelMetaJson>(&json_str) {
                        let book_key = key.trim_end_matches("/_meta.json").to_string();
                        items.push(NovelInfo {
                            key: book_key,
                            title: meta.title,
                            author: meta.author,
                            category: meta.category,
                            word_count: meta.word_count,
                            chapter_count: meta.chapter_count,
                            status: meta.status,
                            source_url: meta.source,
                            uploaded_at: String::new(),
                            size: meta.uploaded_chapters as u64,
                        });
                    }
                }
                Err(e) => {
                    tracing::warn!("Failed to download meta {}: {}", key, e);
                }
            }
        }

        let total = items.len();
        Ok(ListResult { items, total })
    }

    /// List chapter files (NNNN.md) within a book directory.
    pub async fn list_chapters(&self, book_key: &str) -> Result<Vec<String>> {
        let prefix = format!("{}/", book_key);
        let object_manager = ObjectsManager::new(self.credential.to_owned());
        let bucket = object_manager.bucket(&self.config.bucket);

        let mut list_builder = bucket.list();
        list_builder.prefix(&prefix);
        let mut stream = list_builder.stream();

        let mut chapters: Vec<String> = Vec::new();
        while let Some(object) = stream.try_next().await.map_err(|e| anyhow!("List chapters failed: {e}"))? {
            let key = object.get_key_as_str().to_string();
            let name = key.rsplit('/').next().unwrap_or("");
            if name.ends_with(".md") && name != "_meta.json" {
                chapters.push(key);
            }
        }
        chapters.sort();
        Ok(chapters)
    }

    /// Download text content from a key. If `max_chars > 0`, only the first
    /// `max_chars` characters are returned (for preview).
    pub async fn download_text(&self, key: &str, max_chars: usize) -> Result<String> {
        let domain = self.config.domain_host();
        // Append a cache-busting timestamp to the URL
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let download_url = format!("https://{domain}/{key}?_t={ts}");

        let resp = reqwest::get(&download_url)
            .await
            .context("Download request failed")?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            anyhow::bail!("Download failed: {status} — {body}");
        }

        let text = resp.text().await.context("Read download response")?;

        if max_chars > 0 && text.len() > max_chars {
            Ok(text.chars().take(max_chars).collect())
        } else {
            Ok(text)
        }
    }

    /// Delete a key from the bucket.
    pub async fn delete(&self, key: &str) -> Result<()> {
        let object_manager = ObjectsManager::new(self.credential.to_owned());
        let bucket = object_manager.bucket(&self.config.bucket);

        bucket
            .delete_object(key)
            .async_call()
            .await
            .map_err(|e| anyhow!("Delete failed: {e}"))?;

        tracing::debug!("Deleted {}", key);
        Ok(())
    }
}
