//! Tomato download platform client + local library storage.

mod book_dir;
mod client;
mod config;
mod download;
mod epub;
mod imitate;
mod local;
mod runtime;

pub use book_dir::{
    delete_book, ensure_book_dir, import_epub_as_book_dir, open_book, read_chapter,
};
pub use client::{PreviewResponse, SearchItem, SearchResponse, TomatoClient, cover_url_from_raw};
pub use config::{
    LOCAL_API_BASE, TomatoLibraryConfig, TomatoLibraryConfigManager, default_library_path,
    local_api_base,
};
pub use download::{
    DownloadProgressEvent, DownloadRequest, DownloadResult, download_book_to_library,
    download_book_to_library_with_progress,
};
pub use epub::{EpubBook, EpubChapter, EpubChapterMeta};
pub use imitate::{
    AnalysisPack, ImitateCards, ImitateMeta, ImitatePhase, ImitateStatus, build_analysis_prompt,
    ensure_imitate_dir, imitate_root, parse_imitate_cards_json, prepare_analysis_pack, read_status,
    resolve_book_dir_for_imitate, write_cards, write_status,
};
pub use local::{LocalBook, list_local_books, read_local_text, write_cover_bytes};
pub use runtime::{
    DownloaderPhase, DownloaderStatus, TomatoDownloaderRuntime, runtime,
};
