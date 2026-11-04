//! Tomato download platform client + local library storage.

mod book_dir;
mod client;
mod config;
mod download;
mod epub;
mod local;

pub use book_dir::{
    delete_book, ensure_book_dir, import_epub_as_book_dir, open_book, read_chapter,
};
pub use client::{PreviewResponse, SearchItem, SearchResponse, TomatoClient, cover_url_from_raw};
pub use config::{TomatoLibraryConfig, TomatoLibraryConfigManager, default_library_path};
pub use download::{DownloadRequest, DownloadResult, download_book_to_library};
pub use epub::{EpubBook, EpubChapter, EpubChapterMeta};
pub use local::{LocalBook, list_local_books, read_local_text, write_cover_bytes};
