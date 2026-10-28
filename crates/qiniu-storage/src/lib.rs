//! Qiniu Cloud object storage integration for Cinyuverse.
//!
//! Provides upload, list, download, and delete operations against a Qiniu
//! bucket using the official `qiniu-sdk`. Credentials are persisted to a
//! local config file.
//!
//! The crate is Tauri-agnostic — the Tauri command layer in `src-tauri`
//! wraps these functions.

mod client;
mod config;

pub use client::{DOWNLOAD_CONCURRENCY, ListResult, NovelInfo, QiniuClient};
pub use config::{QiniuConfig, QiniuConfigManager};
