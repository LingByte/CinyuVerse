use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FsNode {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<FsNode>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileContent {
    pub content: String,
    pub encoding: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanFileEntry {
    pub name: String,
    pub path: String,
    pub relative_path: String,
    pub content: String,
}

const VIEWABLE_EXTS: &[&str] = &[
    ".md", ".txt", ".markdown", ".mdown",
    ".json", ".xml", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".conf",
    ".js", ".ts", ".jsx", ".tsx", ".vue", ".svelte",
    ".html", ".htm", ".css", ".scss", ".less",
    ".py", ".rb", ".go", ".rs", ".java", ".kt", ".swift",
    ".c", ".cpp", ".h", ".hpp", ".cs",
    ".sh", ".bash", ".zsh", ".ps1",
    ".sql", ".graphql",
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico",
    ".pdf", ".csv", ".tsv", ".xlsx", ".xls",
    ".env", ".gitignore", ".editorconfig", ".prettierrc", ".eslintrc",
];

const EDITABLE_EXTS: &[&str] = &[
    ".md", ".txt", ".markdown", ".mdown",
    ".json", ".xml", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".conf",
    ".js", ".ts", ".jsx", ".tsx", ".vue", ".svelte",
    ".html", ".htm", ".css", ".scss", ".less",
    ".py", ".rb", ".go", ".rs", ".java", ".kt", ".swift",
    ".c", ".cpp", ".h", ".hpp", ".cs",
    ".sh", ".bash", ".zsh", ".ps1",
    ".sql", ".graphql", ".csv", ".tsv",
    ".env", ".gitignore", ".editorconfig", ".prettierrc", ".eslintrc",
];

const BINARY_EXTS: &[&str] = &[
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico",
    ".pdf", ".xlsx", ".xls",
];

const SKIP_DIRS: &[&str] = &["node_modules", "__pycache__", ".git", "dist", "dist-electron", "target", ".cinyuverse"];

fn ext_lower(path: &str) -> String {
    Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| format!(".{}", e.to_lowercase()))
        .unwrap_or_default()
}

fn should_skip_dir(name: &str) -> bool {
    name.starts_with('.') || SKIP_DIRS.contains(&name)
}

fn is_viewable_file(path: &Path) -> bool {
    let ext = ext_lower(path.to_string_lossy().as_ref());
    VIEWABLE_EXTS.contains(&ext.as_str())
}

pub fn is_editable_file(path: &str) -> bool {
    EDITABLE_EXTS.contains(&ext_lower(path).as_str())
}

pub fn is_binary_file(path: &str) -> bool {
    BINARY_EXTS.contains(&ext_lower(path).as_str())
}

fn build_dir_tree(dir_path: &Path) -> FsNode {
    let name = dir_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string();

    let mut node = FsNode {
        name,
        path: dir_path.to_string_lossy().to_string(),
        is_directory: true,
        children: Some(Vec::new()),
    };

    let mut entries: Vec<_> = match fs::read_dir(dir_path) {
        Ok(rd) => rd.flatten().collect(),
        Err(_) => return node,
    };

    entries.sort_by(|a, b| {
        let ad = a.path().is_dir();
        let bd = b.path().is_dir();
        if ad != bd {
            return if ad { std::cmp::Ordering::Less } else { std::cmp::Ordering::Greater };
        }
        a.file_name().cmp(&b.file_name())
    });

    for entry in entries {
        let full_path = entry.path();
        let entry_name = entry.file_name().to_string_lossy().to_string();
        if entry.path().is_dir() {
            if should_skip_dir(&entry_name) {
                continue;
            }
            node.children.as_mut().unwrap().push(build_dir_tree(&full_path));
        } else if entry.path().is_file() && is_viewable_file(&full_path) {
            node.children.as_mut().unwrap().push(FsNode {
                name: entry_name,
                path: full_path.to_string_lossy().to_string(),
                is_directory: false,
                children: None,
            });
        }
    }

    node
}

#[tauri::command]
pub fn cv_list_dir_tree(folder_path: String) -> Result<Option<FsNode>, String> {
    let path = Path::new(&folder_path);
    if !path.exists() || !path.is_dir() {
        return Ok(None);
    }
    Ok(Some(build_dir_tree(path)))
}

#[tauri::command]
pub fn cv_read_file(file_path: String) -> Result<FileContent, String> {
    let path = Path::new(&file_path);
    if !path.exists() {
        return Err("文件不存在".to_string());
    }
    if is_binary_file(&file_path) {
        use base64::{engine::general_purpose, Engine as _};
        let bytes = fs::read(path).map_err(|e| e.to_string())?;
        return Ok(FileContent {
            content: general_purpose::STANDARD.encode(bytes),
            encoding: "base64".to_string(),
        });
    }
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    Ok(FileContent {
        content,
        encoding: "utf8".to_string(),
    })
}

#[tauri::command]
pub fn cv_write_file(file_path: String, content: String) -> Result<(), String> {
    if !is_editable_file(&file_path) {
        return Err("无法写入该文件".to_string());
    }
    if let Some(parent) = Path::new(&file_path).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&file_path, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cv_create_file(parent_path: String, file_name: String) -> Result<String, String> {
    let safe_name = Path::new(&file_name)
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "无效的文件名".to_string())?;
    if parent_path.is_empty() {
        return Err("无效的路径".to_string());
    }
    let full_path = PathBuf::from(&parent_path).join(safe_name);
    if full_path.exists() {
        return Err("文件已存在".to_string());
    }
    if let Some(parent) = full_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&full_path, "").map_err(|e| e.to_string())?;
    Ok(full_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn cv_create_dir(parent_path: String, dir_name: String) -> Result<String, String> {
    let safe_name = Path::new(&dir_name)
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "无效的文件夹名".to_string())?;
    let full_path = PathBuf::from(&parent_path).join(safe_name);
    if full_path.exists() {
        return Err("文件夹已存在".to_string());
    }
    fs::create_dir(&full_path).map_err(|e| e.to_string())?;
    Ok(full_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn cv_delete_path(target_path: String) -> Result<(), String> {
    let path = Path::new(&target_path);
    if !path.exists() {
        return Ok(());
    }
    if path.is_dir() {
        fs::remove_dir(path).map_err(|e| e.to_string())
    } else {
        fs::remove_file(path).map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn cv_dirname(file_path: String) -> Result<String, String> {
    Ok(Path::new(&file_path)
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default())
}

#[tauri::command]
pub fn cv_scan_folder(folder_path: String) -> Result<Vec<ScanFileEntry>, String> {
    let base = Path::new(&folder_path);
    if !base.exists() || !base.is_dir() {
        return Ok(vec![]);
    }

    let mut results = Vec::new();

    fn walk(dir: &Path, base: &Path, out: &mut Vec<ScanFileEntry>) {
        let entries = match fs::read_dir(dir) {
            Ok(v) => v,
            Err(_) => return,
        };
        let mut entries: Vec<_> = entries.flatten().collect();
        entries.sort_by(|a, b| {
            let ad = a.path().is_dir();
            let bd = b.path().is_dir();
            if ad != bd {
                return if ad { std::cmp::Ordering::Less } else { std::cmp::Ordering::Greater };
            }
            a.file_name().cmp(&b.file_name())
        });

        for entry in entries {
            let full_path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            if full_path.is_dir() {
                if !should_skip_dir(&name) {
                    walk(&full_path, base, out);
                }
            } else if full_path.is_file() {
                let ext = ext_lower(full_path.to_string_lossy().as_ref());
                if ext == ".md" || ext == ".txt" {
                    if let Ok(content) = fs::read_to_string(&full_path) {
                        let relative = full_path
                            .strip_prefix(base)
                            .unwrap_or(&full_path)
                            .to_string_lossy()
                            .replace('\\', "/");
                        out.push(ScanFileEntry {
                            name,
                            path: full_path.to_string_lossy().to_string(),
                            relative_path: relative,
                            content,
                        });
                    }
                }
            }
        }
    }

    walk(base, base, &mut results);
    Ok(results)
}
