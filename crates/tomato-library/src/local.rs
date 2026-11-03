//! Scan locally downloaded books.

use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

const ALLOWED_EXTS: &[&str] = &["epub", "txt", "mp3", "wav"];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalBook {
    pub name: String,
    pub path: String,
    pub ext: String,
    pub size: u64,
    pub modified_ms: u64,
}

pub fn list_local_books(library_root: &Path) -> Result<Vec<LocalBook>> {
    if !library_root.exists() {
        return Ok(Vec::new());
    }
    let mut books = Vec::new();
    collect_books(library_root, library_root, &mut books)?;
    books.sort_by(|a, b| b.modified_ms.cmp(&a.modified_ms).then(a.name.cmp(&b.name)));
    Ok(books)
}

fn collect_books(root: &Path, dir: &Path, out: &mut Vec<LocalBook>) -> Result<()> {
    let entries = std::fs::read_dir(dir)
        .with_context(|| format!("Failed to read {}", dir.display()))?;
    for entry in entries {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            collect_books(root, &path, out)?;
            continue;
        }
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if !ALLOWED_EXTS.contains(&ext.as_str()) {
            continue;
        }
        let meta = entry.metadata()?;
        let modified_ms = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| path.display().to_string());
        out.push(LocalBook {
            name,
            path: path.to_string_lossy().into_owned(),
            ext,
            size: meta.len(),
            modified_ms,
        });
    }
    Ok(())
}

pub fn read_local_text(path: &Path, max_chars: usize) -> Result<String> {
    let data = std::fs::read(path).with_context(|| format!("Failed to read {}", path.display()))?;
    let text = String::from_utf8_lossy(&data).into_owned();
    if max_chars == 0 || text.chars().count() <= max_chars {
        return Ok(text);
    }
    Ok(text.chars().take(max_chars).collect())
}

pub fn sanitize_filename(name: &str) -> String {
    let mut out = String::new();
    for ch in name.chars() {
        match ch {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => out.push('_'),
            c if c.is_control() => {}
            c => out.push(c),
        }
    }
    let trimmed = out.trim().trim_matches('.');
    if trimmed.is_empty() {
        "book".to_string()
    } else {
        trimmed.to_string()
    }
}

pub fn unique_target_path(dir: &Path, filename: &str) -> PathBuf {
    let candidate = dir.join(filename);
    if !candidate.exists() {
        return candidate;
    }
    let stem = Path::new(filename)
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "book".to_string());
    let ext = Path::new(filename)
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy()))
        .unwrap_or_default();
    for i in 2..10_000 {
        let next = dir.join(format!("{stem}-{i}{ext}"));
        if !next.exists() {
            return next;
        }
    }
    dir.join(format!("{stem}-dup{ext}"))
}
