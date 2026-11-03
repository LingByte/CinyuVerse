//! Tomato library settings: API endpoint + local storage path.

use std::path::PathBuf;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

const DEFAULT_API_BASE: &str = "http://101.34.86.192:18423";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TomatoLibraryConfig {
    /// Tomato download platform base URL.
    #[serde(default = "default_api_base")]
    pub api_base: String,
    /// Password for `x-tomato-password`. Empty means fall back to env.
    #[serde(default)]
    pub api_password: String,
    /// Absolute path where downloaded books are stored.
    #[serde(default)]
    pub library_path: String,
}

fn default_api_base() -> String {
    DEFAULT_API_BASE.to_string()
}

impl Default for TomatoLibraryConfig {
    fn default() -> Self {
        Self {
            api_base: default_api_base(),
            api_password: String::new(),
            library_path: String::new(),
        }
    }
}

impl TomatoLibraryConfig {
    pub fn resolve_api_base(&self) -> String {
        let from_env = std::env::var("TOMATO_API_BASE").ok();
        let value = if !self.api_base.trim().is_empty() {
            self.api_base.trim().to_string()
        } else if let Some(env) = from_env.filter(|v| !v.trim().is_empty()) {
            env.trim().to_string()
        } else {
            DEFAULT_API_BASE.to_string()
        };
        value.trim_end_matches('/').to_string()
    }

    pub fn resolve_api_password(&self) -> Result<String> {
        if !self.api_password.trim().is_empty() {
            return Ok(self.api_password.trim().to_string());
        }
        std::env::var("TOMATO_API_PASSWORD")
            .map(|v| v.trim().to_string())
            .context("TOMATO_API_PASSWORD is not set and no password is saved in settings")
    }

    pub fn resolve_library_path(&self) -> Result<PathBuf> {
        if !self.library_path.trim().is_empty() {
            return Ok(PathBuf::from(self.library_path.trim()));
        }
        Ok(default_library_path()?)
    }

    pub fn ensure_library_dir(&self) -> Result<PathBuf> {
        let path = self.resolve_library_path()?;
        std::fs::create_dir_all(&path)
            .with_context(|| format!("Failed to create library directory {}", path.display()))?;
        Ok(path)
    }
}

pub fn default_library_path() -> Result<PathBuf> {
    let docs = dirs::document_dir().context("Cannot determine Documents directory")?;
    Ok(docs.join("Cinyuverse").join("Library"))
}

pub struct TomatoLibraryConfigManager;

impl TomatoLibraryConfigManager {
    fn config_path() -> Result<PathBuf> {
        let base = dirs::config_dir().context("Cannot determine config directory")?;
        Ok(base.join("cinyuverse").join("tomato-library.json"))
    }

    pub fn load() -> Result<TomatoLibraryConfig> {
        let path = Self::config_path()?;
        if !path.exists() {
            return Ok(TomatoLibraryConfig::default());
        }
        let data = std::fs::read_to_string(&path)
            .with_context(|| format!("Failed to read {}", path.display()))?;
        let cfg: TomatoLibraryConfig = serde_json::from_str(&data)
            .with_context(|| format!("Failed to parse {}", path.display()))?;
        Ok(cfg)
    }

    pub fn save(cfg: &TomatoLibraryConfig) -> Result<()> {
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
