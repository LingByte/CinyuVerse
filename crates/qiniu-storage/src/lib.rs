//! Qiniu Cloud object storage integration for Cinyuverse.
//!
//! Provides upload, list, download, and delete operations against a Qiniu
//! bucket. Credentials are persisted to a local config file under
//! `~/.config/cinyuverse/qiniu.json`.
//!
//! The crate is Tauri-agnostic — the Tauri command layer in `src-tauri`
//! wraps these functions.

mod auth;
mod config;
mod client;

pub use auth::QiniuAuth;
pub use config::{QiniuConfig, QiniuConfigManager};
pub use client::{QiniuClient, NovelInfo, ListResult};
