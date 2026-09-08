//! Qiniu authentication — generates upload tokens and signs requests.
//!
//! Qiniu uses HMAC-SHA1 over a policy JSON to produce upload tokens, and
//! HMAC-SHA1 over the request path+query for signed downloads.

use base64::Engine;
use hmac::{Hmac, Mac};
use sha1::Sha1;
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::config::QiniuConfig;

type HmacSha1 = Hmac<Sha1>;

/// Upload policy — controls what the token holder can do.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UploadPolicy {
    pub scope: String,        // e.g. "bucket" or "bucket:key"
    pub deadline: u64,        // Unix timestamp expiry
}

impl UploadPolicy {
    pub fn new(bucket: &str, key: Option<&str>, ttl_secs: u64) -> Self {
        let scope = match key {
            Some(k) => format!("{bucket}:{k}"),
            None => bucket.to_string(),
        };
        let deadline = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs() + ttl_secs)
            .unwrap_or(ttl_secs);
        Self { scope, deadline }
    }
}

/// Qiniu auth helper — holds credentials and produces signed tokens.
#[derive(Clone)]
pub struct QiniuAuth {
    access_key: String,
    secret_key: String,
}

impl QiniuAuth {
    pub fn new(access_key: String, secret_key: String) -> Self {
        Self { access_key, secret_key }
    }

    pub fn from_config(cfg: &QiniuConfig) -> Self {
        Self::new(cfg.access_key.clone(), cfg.secret_key.clone())
    }

    /// Generate an upload token for the given bucket and optional key.
    pub fn upload_token(&self, bucket: &str, key: Option<&str>, ttl_secs: u64) -> String {
        let policy = UploadPolicy::new(bucket, key, ttl_secs);
        let policy_json = serde_json::to_string(&policy).unwrap_or_default();
        let encoded = url_safe_base64_encode(policy_json.as_bytes());
        let signature = self.hmac_sha1_sign(encoded.as_bytes());
        let token = format!("{}:{}", self.access_key, signature);
        format!("{}:{}", token, encoded)
    }

    /// Sign a download URL with an optional expiry (in seconds).
    /// `raw_url` should be the full download URL without auth params.
    pub fn sign_download_url(&self, raw_url: &str, ttl_secs: u64) -> String {
        let deadline = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs() + ttl_secs)
            .unwrap_or(ttl_secs);
        let url_with_e = if raw_url.contains('?') {
            format!("{raw_url}&e={deadline}")
        } else {
            format!("{raw_url}?e={deadline}")
        };
        let signature = self.hmac_sha1_sign(url_with_e.as_bytes());
        let signed = format!("{}:{}", self.access_key, signature);
        let encoded = url_safe_base64_encode(signed.as_bytes());
        format!("{url_with_e}&token={encoded}")
    }

    fn hmac_sha1_sign(&self, data: &[u8]) -> String {
        let mut mac = HmacSha1::new_from_slice(self.secret_key.as_bytes())
            .expect("HMAC key length is valid");
        mac.update(data);
        let result = mac.finalize().into_bytes();
        // Qiniu expects URL-safe base64 of the raw HMAC bytes
        url_safe_base64_encode(&result)
    }
}

/// URL-safe base64 encoding (no padding) as Qiniu requires.
fn url_safe_base64_encode(data: &[u8]) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(data)
}
