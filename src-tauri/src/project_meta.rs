//! Workspace metadata under `.cinyuverse/` — project.json, characters, outline, rules.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

pub const META_DIR: &str = ".cinyuverse";
pub const HISTORY_DIR: &str = "history";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInfo {
    pub book_name: String,
    pub genre: String,
    pub tags: Vec<String>,
    pub author: String,
    pub status: String,
    pub world_view: String,
    pub style: String,
    pub style_sample: String,
    pub target_words: u64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterCard {
    pub id: String,
    pub name: String,
    pub age: String,
    pub identity: String,
    pub personality: String,
    pub relations: String,
    pub storyline: String,
    pub dialogue_style: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GlossaryEntry {
    pub id: String,
    pub term: String,
    pub category: String,
    pub definition: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct OutlineNode {
    pub id: String,
    pub title: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chapter_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vol_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<OutlineNode>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TimelineEvent {
    pub id: String,
    pub title: String,
    pub date_label: String,
    pub description: String,
    #[serde(default)]
    pub characters: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProjectOutline {
    pub book_outline: String,
    pub volume_nodes: Vec<OutlineNode>,
    #[serde(default)]
    pub timeline: Vec<TimelineEvent>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct WritingRules {
    pub rules: Vec<String>,
    pub tone: String,
    pub pov: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProjectMetaBundle {
    pub project: ProjectInfo,
    pub characters: Vec<CharacterCard>,
    pub glossary: Vec<GlossaryEntry>,
    pub outline: ProjectOutline,
    pub banned_words: Vec<String>,
    pub writing_rules: WritingRules,
}

pub fn meta_root(workspace_root: &str) -> PathBuf {
    Path::new(workspace_root).join(META_DIR)
}

fn read_json<T: for<'de> Deserialize<'de>>(path: &Path, default: T) -> T {
    if !path.exists() {
        return default;
    }
    fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(default)
}

fn write_json(path: &Path, value: &impl Serialize) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn ensure_meta_dir(workspace_root: &str) -> Result<PathBuf, String> {
    let root = meta_root(workspace_root);
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    fs::create_dir_all(root.join(HISTORY_DIR)).map_err(|e| e.to_string())?;
    fs::create_dir_all(root.join("drafts")).map_err(|e| e.to_string())?;
    fs::create_dir_all(root.join("final")).map_err(|e| e.to_string())?;
    fs::create_dir_all(root.join("backups")).map_err(|e| e.to_string())?;

    let folder_name = Path::new(workspace_root)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("未命名");

    let project_path = root.join("project.json");
    if !project_path.exists() {
        let now = chrono::Utc::now().to_rfc3339();
        let project = ProjectInfo {
            book_name: folder_name.to_string(),
            genre: String::new(),
            tags: vec![],
            author: String::new(),
            status: "draft".to_string(),
            world_view: String::new(),
            style: String::new(),
            style_sample: String::new(),
            target_words: 0,
            created_at: now.clone(),
            updated_at: now,
        };
        write_json(&project_path, &project)?;
    }

    if !root.join("characters.json").exists() {
        write_json(&root.join("characters.json"), &Vec::<CharacterCard>::new())?;
    }
    if !root.join("glossary.json").exists() {
        write_json(&root.join("glossary.json"), &Vec::<GlossaryEntry>::new())?;
    }
    if !root.join("outline.json").exists() {
        write_json(&root.join("outline.json"), &ProjectOutline::default())?;
    }
    if !root.join("banned_words.json").exists() {
        write_json(&root.join("banned_words.json"), &Vec::<String>::new())?;
    }
    if !root.join("writing_rules.json").exists() {
        write_json(&root.join("writing_rules.json"), &WritingRules::default())?;
    }

    Ok(root)
}

pub fn load_bundle(workspace_root: &str) -> Result<ProjectMetaBundle, String> {
    let root = ensure_meta_dir(workspace_root)?;
    Ok(ProjectMetaBundle {
        project: read_json(&root.join("project.json"), ProjectInfo::default()),
        characters: read_json(&root.join("characters.json"), vec![]),
        glossary: read_json(&root.join("glossary.json"), vec![]),
        outline: read_json(&root.join("outline.json"), ProjectOutline::default()),
        banned_words: read_json(&root.join("banned_words.json"), vec![]),
        writing_rules: read_json(&root.join("writing_rules.json"), WritingRules::default()),
    })
}

pub fn save_meta_file(workspace_root: &str, file_key: &str, json_content: &str) -> Result<(), String> {
    let root = ensure_meta_dir(workspace_root)?;
    let rel = match file_key {
        "project" => "project.json",
        "characters" => "characters.json",
        "glossary" => "glossary.json",
        "outline" => "outline.json",
        "banned_words" => "banned_words.json",
        "writing_rules" => "writing_rules.json",
        other if other.ends_with(".json") => other,
        _ => return Err(format!("未知元数据键: {}", file_key)),
    };
    let path = root.join(rel);
    let _: serde_json::Value = serde_json::from_str(json_content)
        .map_err(|e| format!("JSON 无效: {}", e))?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, json_content).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn cv_ensure_project_meta(workspace_root: String) -> Result<(), String> {
    ensure_meta_dir(&workspace_root)?;
    Ok(())
}

#[tauri::command]
pub fn cv_load_project_meta(workspace_root: String) -> Result<ProjectMetaBundle, String> {
    load_bundle(&workspace_root)
}

#[tauri::command]
pub fn cv_save_project_meta(
    workspace_root: String,
    file_key: String,
    json_content: String,
) -> Result<(), String> {
    save_meta_file(&workspace_root, &file_key, &json_content)
}

#[tauri::command]
pub fn cv_move_outline_file(from_path: String, to_path: String) -> Result<String, String> {
    let from = Path::new(&from_path);
    let to = Path::new(&to_path);
    if !from.exists() {
        return Err("源文件不存在".to_string());
    }
    if to.exists() {
        return Err("目标路径已存在".to_string());
    }
    if let Some(parent) = to.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::rename(from, to).map_err(|e| e.to_string())?;
    Ok(to.to_string_lossy().to_string())
}

#[tauri::command]
pub fn cv_rename_outline_file(file_path: String, new_name: String) -> Result<String, String> {
    let path = Path::new(&file_path);
    if !path.exists() {
        return Err("文件不存在".to_string());
    }
    let safe = Path::new(&new_name)
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "无效文件名".to_string())?;
    let parent = path.parent().ok_or_else(|| "无效路径".to_string())?;
    let new_path = parent.join(safe);
    if new_path.exists() {
        return Err("目标文件已存在".to_string());
    }
    fs::rename(path, &new_path).map_err(|e| e.to_string())?;
    Ok(new_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn cv_generate_summary_md(workspace_root: String) -> Result<String, String> {
    let bundle = load_bundle(&workspace_root)?;
    let mut lines = vec![
        format!("# {}", bundle.project.book_name),
        String::new(),
        bundle.outline.book_outline.clone(),
        String::new(),
    ];
    for vol in &bundle.outline.volume_nodes {
        lines.push(format!("## {}", vol.title));
        if !vol.content.is_empty() {
            lines.push(vol.content.clone());
        }
        if let Some(children) = &vol.children {
            for ch in children {
                lines.push(format!("### {}", ch.title));
                if !ch.content.is_empty() {
                    lines.push(ch.content.clone());
                }
            }
        }
    }
    let content = lines.join("\n");
    let summary_path = Path::new(&workspace_root).join("SUMMARY.md");
    fs::write(&summary_path, &content).map_err(|e| e.to_string())?;
    Ok(summary_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn cv_backup_workspace(workspace_root: String, dest_zip: String) -> Result<String, String> {
    use std::io::Write;
    let root = Path::new(&workspace_root);
    if !root.is_dir() {
        return Err("工作区路径无效".to_string());
    }
    let file = fs::File::create(&dest_zip).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(file);
    let options =
        zip::write::FileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    fn add_dir(
        zip: &mut zip::ZipWriter<fs::File>,
        base: &Path,
        path: &Path,
        options: zip::write::FileOptions,
    ) -> Result<(), String> {
        if path.is_dir() {
            for entry in fs::read_dir(path).map_err(|e| e.to_string())? {
                let entry = entry.map_err(|e| e.to_string())?;
                let p = entry.path();
                let name = entry.file_name().to_string_lossy().to_string();
                if name == "node_modules" || name == "target" || name == ".git" {
                    continue;
                }
                add_dir(zip, base, &p, options)?;
            }
        } else {
            let rel = path
                .strip_prefix(base)
                .unwrap_or(path)
                .to_string_lossy()
                .replace('\\', "/");
            zip.start_file(rel, options).map_err(|e| e.to_string())?;
            let data = fs::read(path).map_err(|e| e.to_string())?;
            zip.write_all(&data).map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    add_dir(&mut zip, root, root, options)?;
    zip.finish().map_err(|e| e.to_string())?;
    Ok(dest_zip)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupEntry {
    pub path: String,
    pub file_name: String,
    pub size_bytes: u64,
    pub created_at: String,
    pub incremental: bool,
}

#[tauri::command]
pub fn cv_list_backups(workspace_root: String) -> Result<Vec<BackupEntry>, String> {
    let dir = ensure_meta_dir(&workspace_root)?.join("backups");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let mut out = vec![];
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("zip") {
            continue;
        }
        let meta = fs::metadata(&path).map_err(|e| e.to_string())?;
        let created = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| {
                chrono::DateTime::<chrono::Utc>::from(std::time::UNIX_EPOCH + d).to_rfc3339()
            })
            .unwrap_or_default();
        out.push(BackupEntry {
            path: path.to_string_lossy().to_string(),
            file_name: entry.file_name().to_string_lossy().to_string(),
            size_bytes: meta.len(),
            created_at: created,
            incremental: entry.file_name().to_string_lossy().contains("incr"),
        });
    }
    out.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(out)
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct BackupManifest {
    files: HashMap<String, ManifestEntry>,
    updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ManifestEntry {
    mtime_secs: u64,
    size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IncrementalBackupResult {
    pub path: String,
    pub changed_files: u64,
    pub total_tracked: u64,
    pub skipped: bool,
}

fn backup_manifest_path(workspace_root: &str) -> Result<PathBuf, String> {
    Ok(ensure_meta_dir(workspace_root)?.join("backups").join("manifest.json"))
}

fn load_backup_manifest(workspace_root: &str) -> Result<BackupManifest, String> {
    let path = backup_manifest_path(workspace_root)?;
    if !path.exists() {
        return Ok(BackupManifest::default());
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

fn save_backup_manifest(workspace_root: &str, manifest: &BackupManifest) -> Result<(), String> {
    let path = backup_manifest_path(workspace_root)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(
        &path,
        serde_json::to_string_pretty(manifest).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
}

fn collect_workspace_files(base: &Path, path: &Path, skip: &Path, out: &mut Vec<PathBuf>) -> Result<(), String> {
    if path.is_dir() {
        for entry in fs::read_dir(path).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let p = entry.path();
            if p.starts_with(skip) {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            if name == "node_modules" || name == "target" || name == ".git" {
                continue;
            }
            collect_workspace_files(base, &p, skip, out)?;
        }
    } else {
        out.push(path.to_path_buf());
    }
    Ok(())
}

fn file_manifest_entry(path: &Path) -> Result<ManifestEntry, String> {
    let meta = fs::metadata(path).map_err(|e| e.to_string())?;
    let mtime_secs = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    Ok(ManifestEntry {
        mtime_secs,
        size: meta.len(),
    })
}

#[tauri::command]
pub fn cv_backup_workspace_incremental(
    workspace_root: String,
    dest_zip: Option<String>,
) -> Result<IncrementalBackupResult, String> {
    use std::io::Write;
    let root = Path::new(&workspace_root);
    if !root.is_dir() {
        return Err("工作区路径无效".to_string());
    }
    let backup_dir = ensure_meta_dir(&workspace_root)?.join("backups");
    fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;
    let dest = dest_zip.unwrap_or_else(|| {
        backup_dir
            .join(format!(
                "incr_{}.zip",
                chrono::Utc::now().format("%Y%m%d_%H%M%S")
            ))
            .to_string_lossy()
            .to_string()
    });

    let meta_skip = root.join(META_DIR);
    let mut all_files = vec![];
    collect_workspace_files(root, root, &meta_skip, &mut all_files)?;

    let old_manifest = load_backup_manifest(&workspace_root)?;
    let mut changed = vec![];
    let mut new_entries: HashMap<String, ManifestEntry> = HashMap::new();

    for path in &all_files {
        let rel = path
            .strip_prefix(root)
            .unwrap_or(path)
            .to_string_lossy()
            .replace('\\', "/");
        let entry = file_manifest_entry(path)?;
        new_entries.insert(rel.clone(), entry.clone());
        let is_changed = match old_manifest.files.get(&rel) {
            None => true,
            Some(prev) => prev.mtime_secs != entry.mtime_secs || prev.size != entry.size,
        };
        if is_changed {
            changed.push(path.clone());
        }
    }

    if changed.is_empty() {
        return Ok(IncrementalBackupResult {
            path: dest,
            changed_files: 0,
            total_tracked: new_entries.len() as u64,
            skipped: true,
        });
    }

    let file = fs::File::create(&dest).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(file);
    let options =
        zip::write::FileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    for path in &changed {
        let rel = path
            .strip_prefix(root)
            .unwrap_or(path)
            .to_string_lossy()
            .replace('\\', "/");
        zip.start_file(rel, options).map_err(|e| e.to_string())?;
        let data = fs::read(path).map_err(|e| e.to_string())?;
        zip.write_all(&data).map_err(|e| e.to_string())?;
    }

    let manifest_note = format!(
        "incremental backup\nchanged_files={}\ntotal_tracked={}\n",
        changed.len(),
        new_entries.len()
    );
    zip.start_file("_backup_manifest.txt", options)
        .map_err(|e| e.to_string())?;
    zip.write_all(manifest_note.as_bytes())
        .map_err(|e| e.to_string())?;
    zip.finish().map_err(|e| e.to_string())?;

    save_backup_manifest(
        &workspace_root,
        &BackupManifest {
            files: new_entries,
            updated_at: chrono::Utc::now().to_rfc3339(),
        },
    )?;

    Ok(IncrementalBackupResult {
        path: dest,
        changed_files: changed.len() as u64,
        total_tracked: all_files.len() as u64,
        skipped: false,
    })
}

#[tauri::command]
pub fn cv_get_character_by_name(
    workspace_root: String,
    name: String,
) -> Result<Option<CharacterCard>, String> {
    let bundle = load_bundle(&workspace_root)?;
    Ok(bundle
        .characters
        .into_iter()
        .find(|c| c.name.trim() == name.trim()))
}

#[tauri::command]
pub fn cv_get_glossary_item(
    workspace_root: String,
    term: String,
) -> Result<Option<GlossaryEntry>, String> {
    let bundle = load_bundle(&workspace_root)?;
    Ok(bundle
        .glossary
        .into_iter()
        .find(|g| g.term.trim() == term.trim()))
}
