//! Tomato download platform client + local library storage.

mod client;
mod config;
mod download;
mod local;

pub use client::{
    cover_url_from_raw, PreviewResponse, SearchItem, SearchResponse, TomatoClient,
};
pub use config::{
    default_library_path, TomatoLibraryConfig, TomatoLibraryConfigManager,
};
pub use download::{download_book_to_library, DownloadRequest, DownloadResult};
pub use local::{list_local_books, read_local_text, LocalBook};
