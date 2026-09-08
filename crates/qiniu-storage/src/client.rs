//! Qiniu HTTP client — upload, list, download, delete operations.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use tracing::debug;

use crate::auth::QiniuAuth;
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

/// List response from Qiniu list API.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListResult {
    pub items: Vec<NovelInfo>,
    pub total: usize,
}

/// Qiniu API response for list operations.
#[derive(Debug, Deserialize)]
struct QiniuListResponse {
    items: Vec<QiniuListItem>,
    marker: Option<String>,
}

#[derive(Debug, Deserialize)]
struct QiniuListItem {
    key: String,
    fsize: u64,
    #[serde(rename = "putTime")]
    put_time: u64,
    #[serde(default)]
    mimeType: Option<String>,
}

/// Qiniu client wrapping HTTP calls with auth.
#[derive(Clone)]
pub struct QiniuClient {
    config: QiniuConfig,
    auth: QiniuAuth,
    http: reqwest::Client,
}

impl QiniuClient {
    pub fn new(config: QiniuConfig) -> Self {
        let auth = QiniuAuth::from_config(&config);
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .expect("Failed to build HTTP client");
        Self { config, auth, http }
    }

    /// Upload text content to a key in the bucket.
    ///
    /// Uses the Qiniu upload API with a simple form-encoded POST (no multipart
    /// feature needed — we base64-encode the file content).
    pub async fn upload_text(&self, key: &str, content: &str) -> Result<()> {
        let token = self.auth.upload_token(&self.config.bucket, Some(key), 3600);
        let url = "https://upload.qiniup.com/putb64";

        // Qiniu's base64 upload endpoint: POST /putb64/<fsize>/key/<encoded-key>
        let encoded_key = url_safe_base64(key);
        let fsize = content.len();
        let upload_url = format!("{url}/{fsize}/key/{encoded_key}");

        let b64_content = {
            use base64::Engine;
            base64::engine::general_purpose::STANDARD.encode(content.as_bytes())
        };

        let resp = self
            .http
            .post(&upload_url)
            .header("Authorization", format!("UpToken {token}"))
            .header("Content-Type", "application/octet-stream")
            .body(b64_content)
            .send()
            .await
            .context("Upload request failed")?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            anyhow::bail!("Upload failed: {status} — {body}");
        }
        debug!("Uploaded {} ({} bytes)", key, content.len());
        Ok(())
    }

    /// List items in the bucket with a given prefix.
    pub async fn list(&self, prefix: &str, limit: u32) -> Result<ListResult> {
        // Qiniu list API: GET https://rs.qiniuapi.com/list?bucket=<bucket>&prefix=<prefix>&limit=<limit>
        // Simpler approach: use the management API at https://<rs>.qbox.me/list
        // The standard endpoint is: https://rs.qiniuapi.com/v2/list?bucket=<bucket>&prefix=<prefix>&limit=<limit>
        let path = format!(
            "/v2/list?bucket={}&prefix={}&limit={}",
            self.config.bucket, prefix, limit
        );
        let url = format!("https://rs.qiniuapi.com{}", path);
        let signed = self.auth.sign_download_url(&url, 60);

        let resp = self
            .http
            .get(&signed)
            .send()
            .await
            .context("List request failed")?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            anyhow::bail!("List failed: {status} — {body}");
        }

        let qiniu_resp: QiniuListResponse = resp.json().await.context("Parse list response")?;
        let items: Vec<NovelInfo> = qiniu_resp
            .items
            .into_iter()
            .filter(|i| i.key.ends_with(".md") || i.key.ends_with(".txt"))
            .map(|i| {
                // Parse metadata from the key path: novels/<category>/<title>.md
                let title = i
                    .key
                    .rsplit('/')
                    .next()
                    .unwrap_or(&i.key)
                    .trim_end_matches(".md")
                    .trim_end_matches(".txt")
                    .to_string();
                let category = i
                    .key
                    .split('/')
                    .nth(1)
                    .unwrap_or("未分类")
                    .to_string();
                NovelInfo {
                    key: i.key.clone(),
                    title,
                    author: String::new(),
                    category,
                    word_count: 0,
                    chapter_count: 0,
                    status: String::new(),
                    source_url: String::new(),
                    uploaded_at: format!("{}", i.put_time / 10_000_000), // Qiniu putTime is in 100ns units
                    size: i.fsize,
                }
            })
            .collect();

        let total = items.len();
        Ok(ListResult { items, total })
    }

    /// Download text content from a key. If `max_chars > 0`, only the first
    /// `max_chars` characters are returned (for preview).
    pub async fn download_text(&self, key: &str, max_chars: usize) -> Result<String> {
        let domain = self.config.domain_host();
        let download_url = format!("https://{domain}/{key}");
        let signed = self.auth.sign_download_url(&download_url, 3600);

        let resp = self
            .http
            .get(&signed)
            .send()
            .await
            .context("Download request failed")?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            anyhow::bail!("Download failed: {status} — {body}");
        }

        let text = resp.text().await.context("Read download body")?;
        if max_chars > 0 && text.len() > max_chars {
            Ok(text.chars().take(max_chars).collect())
        } else {
            Ok(text)
        }
    }

    /// Delete a key from the bucket.
    pub async fn delete(&self, key: &str) -> Result<()> {
        let encoded_key = url_safe_base64(key);
        let path = format!("/delete/{}/{}", self.config.bucket, encoded_key);
        let url = format!("https://rs.qiniuapi.com{}", path);
        let signed = self.auth.sign_download_url(&url, 60);

        let resp = self
            .http
            .post(&signed)
            .send()
            .await
            .context("Delete request failed")?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            anyhow::bail!("Delete failed: {status} — {body}");
        }
        Ok(())
    }
}

/// URL-safe base64 encoding (with padding) for Qiniu entry encoding.
fn url_safe_base64(data: &str) -> String {
    use base64::Engine;
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(data.as_bytes())
}
