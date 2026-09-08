//! Qiniu Cloud object storage integration for Cinyuverse.
//!
//! Provides upload, list, download, and delete operations against a Qiniu
//! bucket using the official `qiniu-sdk`. Credentials are persisted to a
//! local config file.
//!
//! The crate is Tauri-agnostic — the Tauri command layer in `src-tauri`
//! wraps these functions.

mod config;
mod client;

pub use config::{QiniuConfig, QiniuConfigManager};
pub use client::{QiniuClient, NovelInfo, ListResult};
