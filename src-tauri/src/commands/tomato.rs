//! Tauri commands for the Tomato download platform + local book library.

use std::{path::PathBuf, sync::Arc};

use futures::stream::{FuturesUnordered, StreamExt};
use serde::{Deserialize, Serialize};
use tomato_library::{
    DownloadRequest, DownloadResult, EpubBook, EpubChapter, LocalBook, TomatoClient,
    TomatoLibraryConfig, TomatoLibraryConfigManager, cover_url_from_raw, default_library_path,
    delete_book, download_book_to_library, ensure_book_dir, list_local_books, open_book,
    read_chapter, read_local_text,
};

use crate::error::AppError;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySettingsView {
    pub api_base: String,
    pub api_password: String,
    pub library_path: String,
    pub default_library_path: String,
    pub password_configured: bool,
}

fn load_cfg() -> Result<TomatoLibraryConfig, String> {
    TomatoLibraryConfigManager::load().map_err(|e| e.to_string())
}

fn to_settings_view(cfg: TomatoLibraryConfig) -> Result<LibrarySettingsView, String> {
    let default_path = default_library_path()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_default();
    let library_path = cfg
        .resolve_library_path()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|_| default_path.clone());
    let password_configured = cfg.resolve_api_password().is_ok();
    Ok(LibrarySettingsView {
        api_base: cfg.resolve_api_base(),
        api_password: cfg.api_password,
        library_path,
        default_library_path: default_path,
        password_configured,
    })
}

#[tauri::command]
pub async fn library_get_settings() -> Result<LibrarySettingsView, String> {
    to_settings_view(load_cfg()?)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySettingsInput {
    pub api_base: String,
    pub api_password: String,
    pub library_path: String,
}

#[tauri::command]
pub async fn library_set_settings(
    settings: LibrarySettingsInput,
) -> Result<LibrarySettingsView, String> {
    let cfg = TomatoLibraryConfig {
        api_base: settings.api_base.trim().to_string(),
        api_password: settings.api_password,
        library_path: settings.library_path.trim().to_string(),
    };
    cfg.ensure_library_dir().map_err(|e| e.to_string())?;
    TomatoLibraryConfigManager::save(&cfg).map_err(|e| e.to_string())?;
    to_settings_view(cfg)
}

#[tauri::command]
pub async fn library_list_local() -> Result<Vec<LocalBook>, String> {
    let cfg = load_cfg()?;
    let path = cfg.ensure_library_dir().map_err(|e| e.to_string())?;
    list_local_books(&path).map_err(|e| e.to_string())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySearchItemView {
    pub title: String,
    pub author: String,
    pub book_id: String,
    pub cover_url: Option<String>,
    /// Authenticated / fetched cover for list rendering (`data:image/...;base64,...`).
    pub cover_data_url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySearchResponseView {
    pub items: Vec<LibrarySearchItemView>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryPreviewView {
    pub book_id: String,
    pub book_name: String,
    pub original_book_name: String,
    pub author: String,
    pub chapter_count: u64,
    pub finished: bool,
    pub word_count: u64,
    pub category: String,
    pub description: String,
    pub cover_url: String,
    /// Authenticated cover as a data URL for the webview (`data:image/...;base64,...`).
    pub cover_data_url: Option<String>,
}

fn encode_data_url(bytes: &[u8], content_type: &str) -> String {
    use base64::Engine as _;
    let mime = content_type
        .split(';')
        .next()
        .unwrap_or("image/jpeg")
        .trim();
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
    format!("data:{mime};base64,{encoded}")
}

async fn resolve_search_cover(
    client: &TomatoClient,
    item: &tomato_library::SearchItem,
) -> (Option<String>, Option<String>) {
    let mut cover_url = cover_url_from_raw(&item.raw);

    if let Some(ref url) = cover_url {
        match client.fetch_authenticated_bytes(url).await {
            Ok((bytes, content_type)) => {
                return (cover_url, Some(encode_data_url(&bytes, &content_type)));
            }
            Err(err) => {
                tracing::warn!(
                    book_id = %item.book_id,
                    "search raw cover fetch failed: {err}"
                );
            }
        }
    }

    match client.preview(&item.book_id).await {
        Ok(preview) => {
            let url = preview.cover_url.trim().to_string();
            let data = if url.is_empty() {
                None
            } else {
                match client.fetch_authenticated_bytes(&url).await {
                    Ok((bytes, content_type)) => Some(encode_data_url(&bytes, &content_type)),
                    Err(err) => {
                        tracing::warn!(
                            book_id = %item.book_id,
                            "preview cover fetch failed: {err}"
                        );
                        None
                    }
                }
            };
            let _ = client.preview_cleanup(&item.book_id).await;
            if cover_url.is_none() && !url.is_empty() {
                cover_url = Some(url);
            }
            (cover_url, data)
        }
        Err(err) => {
            tracing::warn!(book_id = %item.book_id, "preview for cover failed: {err}");
            (cover_url, None)
        }
    }
}

#[tauri::command]
pub async fn library_search(query: String) -> Result<LibrarySearchResponseView, String> {
    let cfg = load_cfg()?;
    let client = Arc::new(
        TomatoClient::new(
            cfg.resolve_api_base(),
            cfg.resolve_api_password().map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?,
    );
    let search = client
        .search(query.trim())
        .await
        .map_err(|e| e.to_string())?;

    // Enrich covers from search `raw` (thumb_url) first; fall back to preview.
    // Cap concurrency so a long result list does not stampede the Tomato API.
    const COVER_CONCURRENCY: usize = 6;
    let mut items = Vec::with_capacity(search.items.len());
    let mut pending = FuturesUnordered::new();
    let mut iter = search.items.into_iter();

    let spawn_one = |item: tomato_library::SearchItem, client: Arc<TomatoClient>| async move {
        let (cover_url, cover_data_url) = resolve_search_cover(&client, &item).await;
        LibrarySearchItemView {
            title: item.title,
            author: item.author,
            book_id: item.book_id,
            cover_url,
            cover_data_url,
        }
    };

    for _ in 0..COVER_CONCURRENCY {
        let Some(item) = iter.next() else { break };
        pending.push(spawn_one(item, Arc::clone(&client)));
    }

    while let Some(view) = pending.next().await {
        items.push(view);
        if let Some(item) = iter.next() {
            pending.push(spawn_one(item, Arc::clone(&client)));
        }
    }

    Ok(LibrarySearchResponseView { items })
}

#[tauri::command]
pub async fn library_preview(book_id: String) -> Result<LibraryPreviewView, String> {
    let cfg = load_cfg()?;
    let client = TomatoClient::new(
        cfg.resolve_api_base(),
        cfg.resolve_api_password().map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    let preview = client
        .preview(book_id.trim())
        .await
        .map_err(|e| e.to_string())?;
    let cover_data_url = if preview.cover_url.trim().is_empty() {
        None
    } else {
        match client.fetch_authenticated_bytes(&preview.cover_url).await {
            Ok((bytes, content_type)) => Some(encode_data_url(&bytes, &content_type)),
            Err(err) => {
                tracing::warn!("library cover fetch failed: {err}");
                None
            }
        }
    };
    let _ = client.preview_cleanup(book_id.trim()).await;
    Ok(LibraryPreviewView {
        book_id: preview.book_id,
        book_name: preview.book_name,
        original_book_name: preview.original_book_name,
        author: preview.author,
        chapter_count: preview.chapter_count,
        finished: preview.finished,
        word_count: preview.word_count,
        category: preview.category,
        description: preview.description,
        cover_url: preview.cover_url,
        cover_data_url,
    })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryDownloadArgs {
    pub book_id: String,
    pub preferred_name: Option<String>,
    pub range_start: Option<u32>,
    pub range_end: Option<u32>,
}

#[tauri::command]
pub async fn library_download(args: LibraryDownloadArgs) -> Result<DownloadResult, String> {
    let cfg = load_cfg()?;
    download_book_to_library(
        &cfg,
        DownloadRequest {
            book_id: args.book_id.trim().to_string(),
            preferred_name: args.preferred_name,
            range_start: args.range_start,
            range_end: args.range_end,
        },
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn library_read_local(path: String, max_chars: Option<usize>) -> Result<String, String> {
    let path = PathBuf::from(path);
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let max = max_chars.unwrap_or(0);
    match ext.as_str() {
        "txt" => read_local_text(&path, max).map_err(|e| e.to_string()),
        _ => Err("该格式请用章节阅读接口打开".into()),
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryOpenBookView {
    pub book: EpubBook,
    /// Resolved book folder path (EPUB files are converted here on first open).
    pub path: String,
}

#[tauri::command]
pub async fn library_open_epub(path: String) -> Result<LibraryOpenBookView, String> {
    let cfg = load_cfg()?;
    let library_root = cfg.ensure_library_dir().map_err(|e| e.to_string())?;
    let path = PathBuf::from(path);
    let book_dir = tokio::task::spawn_blocking(move || ensure_book_dir(&path, &library_root))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
    let book = open_book(&book_dir).map_err(|e| e.to_string())?;
    Ok(LibraryOpenBookView {
        book,
        path: book_dir.to_string_lossy().into_owned(),
    })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryEpubChapterArgs {
    pub path: String,
    pub index: u32,
}

#[tauri::command]
pub async fn library_read_epub_chapter(
    args: LibraryEpubChapterArgs,
) -> Result<EpubChapter, String> {
    read_chapter(&PathBuf::from(args.path), args.index).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn library_delete_local(path: String) -> Result<(), String> {
    delete_book(&PathBuf::from(path)).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn library_reveal_local(path: String) -> Result<(), String> {
    crate::commands::filesystem::reveal_in_file_manager(path)
        .await
        .map_err(|e: AppError| e.to_string())
}

#[tauri::command]
pub async fn library_open_local(path: String) -> Result<(), String> {
    let path = PathBuf::from(path);
    if !path.exists() {
        return Err(format!("文件不存在: {}", path.display()));
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &path.to_string_lossy()])
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}
