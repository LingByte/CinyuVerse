//! Qiniu credential configuration, persisted to a local JSON file.

use std::path::PathBuf;
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct QiniuConfig {
    pub access_key: String,
    pub secret_key: String,
    pub bucket: String,
    /// CDN or origin domain, e.g. `https://cdn.example.com`
    pub domain: String,
}

impl QiniuConfig {
    pub fn is_configured(&self) -> bool {
        !self.access_key.is_empty()
            && !self.secret_key.is_empty()
            && !self.bucket.is_empty()
    }

    /// Strip the scheme from the domain for use in upload tokens.
    pub fn domain_host(&self) -> &str {
        self.domain
            .strip_prefix("https://")
            .or_else(|| self.domain.strip_prefix("http://"))
            .unwrap_or(&self.domain)
    }
}

pub struct QiniuConfigManager;

impl QiniuConfigManager {
    /// Return the path to the config file.
    fn config_path() -> Result<PathBuf> {
        let base = dirs::config_dir()
            .context("Cannot determine config directory")?;
        Ok(base.join("cinyuverse").join("qiniu.json"))
    }

    /// Load config from disk; returns an empty (unconfigured) config if the
    /// file does not exist.
    pub fn load() -> Result<QiniuConfig> {
        let path = Self::config_path()?;
        if !path.exists() {
            return Ok(QiniuConfig::default());
        }
        let data = std::fs::read_to_string(&path)
            .with_context(|| format!("Failed to read {}", path.display()))?;
        let cfg: QiniuConfig = serde_json::from_str(&data)
            .with_context(|| format!("Failed to parse {}", path.display()))?;
        Ok(cfg)
    }

    /// Save config to disk, creating parent directories as needed.
    pub fn save(cfg: &QiniuConfig) -> Result<()> {
        let path = Self::config_path()?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .with_context(|| format!("Failed to create {}", parent.display()))?;
        }
        let data = serde_json::to_string_pretty(cfg)?;
        std::fs::write(&path, data)
            .with_context(|| format!("Failed to write {}", path.display()))?;
        Ok(())
    }
}
