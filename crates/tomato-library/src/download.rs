//! End-to-end download: create job → poll → save into the local library.

use std::time::Duration;

use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use tracing::{info, warn};

use crate::client::{
    job_failed_message, pick_preferred_format, unexpected_missing_job, TomatoClient,
};
use crate::config::TomatoLibraryConfig;
use crate::local::{sanitize_filename, unique_target_path};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadRequest {
    pub book_id: String,
    pub range_start: Option<u32>,
    pub range_end: Option<u32>,
    /// Preferred book title used when locating the remote library file.
    pub preferred_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadResult {
    pub job_id: u64,
    pub title: String,
    pub author: String,
    pub local_path: String,
    pub format: String,
    pub size: u64,
}

pub async fn download_book_to_library(
    cfg: &TomatoLibraryConfig,
    request: DownloadRequest,
) -> Result<DownloadResult> {
    let client = TomatoClient::new(cfg.resolve_api_base(), cfg.resolve_api_password()?)?;
    let library_dir = cfg.ensure_library_dir()?;

    let preview = client.preview(&request.book_id).await.ok();
    if preview.is_some() {
        if let Err(err) = client.preview_cleanup(&request.book_id).await {
            warn!("preview cleanup failed: {err}");
        }
    }

    let mut created = None;
    for attempt in 0..30 {
        match client
            .create_job(&request.book_id, request.range_start, request.range_end)
            .await
        {
            Ok(job) => {
                created = Some(job);
                break;
            }
            Err(err) => {
                let msg = err.to_string();
                if msg.contains("busy") || msg.contains("429") {
                    info!("download slot busy, retry {attempt}");
                    tokio::time::sleep(Duration::from_secs(2)).await;
                    continue;
                }
                return Err(err);
            }
        }
    }
    let created = created.context("Timed out waiting for a free download slot")?;
    let job_id = created.id;

    let mut title = preview
        .as_ref()
        .map(|p| p.book_name.clone())
        .filter(|s| !s.trim().is_empty())
        .or(request.preferred_name.clone())
        .unwrap_or_else(|| request.book_id.clone());
    let mut author = preview
        .as_ref()
        .map(|p| p.author.clone())
        .unwrap_or_default();
    let mut chosen_format = "epub".to_string();

    loop {
        let job = client
            .get_job(job_id)
            .await?
            .ok_or_else(|| unexpected_missing_job(job_id))?;

        if let Some(name) = job.title.clone().filter(|s| !s.trim().is_empty()) {
            title = name;
        }
        if let Some(a) = job.author.clone().filter(|s| !s.trim().is_empty()) {
            author = a;
        }

        match job.state.as_str() {
            "queued" | "running" => {
                if let Some(options) = job.book_name_options.as_ref().filter(|o| !o.is_empty()) {
                    let value = options[0].clone();
                    client.set_book_name(job_id, &value).await?;
                    title = value;
                } else if let Some(options) = job.format_options.as_ref().filter(|o| !o.is_empty()) {
                    let value = pick_preferred_format(options).unwrap_or_else(|| "epub".into());
                    client.set_format(job_id, &value).await?;
                    chosen_format = value;
                }
                tokio::time::sleep(Duration::from_secs(2)).await;
            }
            "done" => break,
            "failed" => bail!("{}", job_failed_message(&job)),
            "canceled" => bail!("download canceled"),
            other => bail!("unexpected job state: {other}"),
        }
    }

    let file_item = wait_for_remote_file(&client, &title).await?;
    if !file_item.ext.is_empty() {
        chosen_format = file_item.ext.clone();
    }

    let (bytes, remote_filename) = client.download_file(&file_item.rel_path).await?;
    let filename = remote_filename.unwrap_or_else(|| {
        let base = sanitize_filename(&title);
        format!("{base}.{}", chosen_format.trim_start_matches('.'))
    });
    let filename = sanitize_filename(&filename);
    let target = unique_target_path(&library_dir, &filename);
    std::fs::write(&target, &bytes)
        .with_context(|| format!("Failed to write {}", target.display()))?;

    Ok(DownloadResult {
        job_id,
        title,
        author,
        local_path: target.to_string_lossy().into_owned(),
        format: chosen_format,
        size: bytes.len() as u64,
    })
}

async fn wait_for_remote_file(
    client: &TomatoClient,
    title: &str,
) -> Result<crate::client::LibraryFileItem> {
    for attempt in 0..60 {
        let listing = client.list_library(title, attempt == 0).await?;
        if listing.running {
            tokio::time::sleep(Duration::from_secs(1)).await;
            continue;
        }
        let mut files: Vec<_> = listing
            .items
            .into_iter()
            .filter(|item| item.kind == "file")
            .filter(|item| {
                let ext = item.ext.to_ascii_lowercase();
                matches!(ext.as_str(), "epub" | "txt" | "mp3" | "wav")
            })
            .collect();
        if files.is_empty() {
            tokio::time::sleep(Duration::from_secs(1)).await;
            continue;
        }
        files.sort_by(|a, b| {
            let rank = |ext: &str| match ext.to_ascii_lowercase().as_str() {
                "epub" => 0,
                "txt" => 1,
                _ => 2,
            };
            rank(&a.ext).cmp(&rank(&b.ext)).then(a.name.cmp(&b.name))
        });
        return Ok(files.remove(0));
    }
    bail!("Download finished but no file appeared in remote library")
}
