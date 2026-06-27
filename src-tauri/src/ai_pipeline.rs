//! Layered AI pipeline: context truncation, stage dispatch, async task queue, stream checkpoint.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

use crate::project_meta::ensure_meta_dir;
use crate::prompt_builder::{self, PromptBuildRequest};
use crate::project_meta::load_bundle;

const TASKS_DIR: &str = "tasks";
const STREAM_CACHE_DIR: &str = "stream_cache";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ContextTruncateRequest {
    pub workspace_root: String,
    pub chapter_path: String,
    pub max_chars: u64,
    pub locked_snippets: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ContextTruncateResult {
    pub truncated_text: String,
    pub total_chars: u64,
    pub reserved: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelineStageRequest {
    pub workspace_root: String,
    pub stage: String,
    pub instruction: String,
    pub chapter_path: Option<String>,
    pub outline_snippet: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelineStageResult {
    pub stage: String,
    pub model_hint: String,
    pub system_prompt: String,
    pub user_prompt: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AsyncTaskHandle {
    pub task_id: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiTaskRecord {
    pub task_id: String,
    pub kind: String,
    pub status: String,
    pub progress: u32,
    pub total: u32,
    pub message: String,
    pub created_at: String,
    pub updated_at: String,
    pub result_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchChapterItem {
    pub file_path: String,
    pub title: String,
    pub outline_snippet: String,
}

fn collect_chapter_queue(workspace_root: &str) -> Result<Vec<BatchChapterItem>, String> {
    let bundle = load_bundle(workspace_root)?;
    let mut items = vec![];
    for vol in &bundle.outline.volume_nodes {
        if let Some(children) = &vol.children {
            for ch in children {
                if let Some(fp) = &ch.file_path {
                    if !fp.is_empty() {
                        items.push(BatchChapterItem {
                            file_path: fp.clone(),
                            title: ch.title.clone(),
                            outline_snippet: ch.content.clone(),
                        });
                    }
                }
            }
        }
    }
    Ok(items)
}

fn save_batch_queue(workspace_root: &str, task_id: &str, items: &[BatchChapterItem]) -> Result<(), String> {
    let path = tasks_root(workspace_root)?.join(format!("{}_queue.json", task_id));
    fs::write(
        &path,
        serde_json::to_string_pretty(items).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cv_get_batch_queue(workspace_root: String, task_id: String) -> Result<Vec<BatchChapterItem>, String> {
    let path = tasks_root(&workspace_root)?.join(format!("{}_queue.json", task_id));
    if !path.exists() {
        return Ok(vec![]);
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

fn tasks_root(workspace_root: &str) -> Result<PathBuf, String> {
    Ok(ensure_meta_dir(workspace_root)?.join(TASKS_DIR))
}

fn stream_cache_root(workspace_root: &str) -> Result<PathBuf, String> {
    Ok(ensure_meta_dir(workspace_root)?.join(STREAM_CACHE_DIR))
}

fn stage_model(stage: &str) -> String {
    match stage {
        "outline" => std::env::var("AI_OUTLINE_MODEL").unwrap_or_else(|_| "qwen-turbo".to_string()),
        "proofread" => std::env::var("AI_PROOFREAD_MODEL").unwrap_or_else(|_| "qwen-plus".to_string()),
        _ => std::env::var("AI_BODY_MODEL").unwrap_or_else(|_| "qwen-plus".to_string()),
    }
}

#[tauri::command]
pub fn cv_truncate_context(req: ContextTruncateRequest) -> Result<ContextTruncateResult, String> {
    let path = Path::new(&req.chapter_path);
    let full = if path.exists() {
        fs::read_to_string(path).unwrap_or_default()
    } else {
        String::new()
    };
    let total = full.chars().count() as u64;
    let max = req.max_chars.max(500);

    let mut parts: Vec<String> = req.locked_snippets.iter().filter(|s| !s.is_empty()).cloned().collect();
    let locked_len: u64 = parts.iter().map(|p| p.chars().count() as u64).sum();
    let budget = max.saturating_sub(locked_len);

    if budget == 0 && !parts.is_empty() {
        return Ok(ContextTruncateResult {
            truncated_text: parts.join("\n\n---\n\n"),
            total_chars: total,
            reserved: true,
        });
    }

    if full.chars().count() as u64 <= max {
        return Ok(ContextTruncateResult {
            truncated_text: full,
            total_chars: total,
            reserved: !req.locked_snippets.is_empty(),
        });
    }

    let tail: String = full.chars().rev().take(budget as usize).collect::<Vec<_>>().into_iter().rev().collect();
    parts.push(tail);
    Ok(ContextTruncateResult {
        truncated_text: parts.join("\n\n---\n\n"),
        total_chars: total,
        reserved: !req.locked_snippets.is_empty(),
    })
}

#[tauri::command]
pub fn cv_run_pipeline_stage(req: PipelineStageRequest) -> Result<PipelineStageResult, String> {
    let stage = req.stage.to_lowercase();
    let model_hint = stage_model(&stage);
    let action = match stage.as_str() {
        "outline" => "expand",
        "proofread" => "polish",
        _ => "style",
    };
    let built = prompt_builder::build_writing_prompt(&PromptBuildRequest {
        workspace_root: req.workspace_root,
        user_instruction: req.instruction,
        selection: None,
        context_before: None,
        context_after: None,
        outline_snippet: req.outline_snippet,
        character_names: vec![],
        chapter_path: req.chapter_path,
        action: Some(action.to_string()),
    })?;
    Ok(PipelineStageResult {
        stage: req.stage,
        model_hint,
        system_prompt: built.system_prompt,
        user_prompt: built.user_prompt,
    })
}

#[tauri::command]
pub fn cv_enqueue_ai_task(workspace_root: String, kind: String) -> Result<AsyncTaskHandle, String> {
    let root = tasks_root(&workspace_root)?;
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let task_id = format!("task_{}", chrono::Utc::now().timestamp_millis());
    let now = chrono::Utc::now().to_rfc3339();
    let record = AiTaskRecord {
        task_id: task_id.clone(),
        kind: kind.clone(),
        status: "pending".to_string(),
        progress: 0,
        total: 0,
        message: "已入队".to_string(),
        created_at: now.clone(),
        updated_at: now,
        result_path: None,
    };
    let path = root.join(format!("{}.json", task_id));
    fs::write(&path, serde_json::to_string_pretty(&record).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    Ok(AsyncTaskHandle {
        task_id,
        status: "pending".to_string(),
    })
}

#[tauri::command]
pub fn cv_get_ai_task(workspace_root: String, task_id: String) -> Result<AiTaskRecord, String> {
    let path = tasks_root(&workspace_root)?.join(format!("{}.json", task_id));
    if !path.exists() {
        return Err("任务不存在".to_string());
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cv_list_ai_tasks(workspace_root: String) -> Result<Vec<AiTaskRecord>, String> {
    let root = tasks_root(&workspace_root)?;
    if !root.exists() {
        return Ok(vec![]);
    }
    let mut out = vec![];
    for entry in fs::read_dir(&root).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.path().extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if name.ends_with("_queue.json") {
            continue;
        }
        if let Ok(raw) = fs::read_to_string(entry.path()) {
            if let Ok(rec) = serde_json::from_str::<AiTaskRecord>(&raw) {
                out.push(rec);
            }
        }
    }
    out.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(out)
}

#[tauri::command]
pub fn cv_update_ai_task(
    workspace_root: String,
    task_id: String,
    status: String,
    progress: u32,
    total: u32,
    message: String,
) -> Result<(), String> {
    let path = tasks_root(&workspace_root)?.join(format!("{}.json", task_id));
    let mut rec: AiTaskRecord = serde_json::from_str(&fs::read_to_string(&path).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    rec.status = status;
    rec.progress = progress;
    rec.total = total;
    rec.message = message;
    rec.updated_at = chrono::Utc::now().to_rfc3339();
    fs::write(&path, serde_json::to_string_pretty(&rec).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cv_save_stream_checkpoint(
    workspace_root: String,
    task_id: String,
    partial_text: String,
) -> Result<(), String> {
    let root = stream_cache_root(&workspace_root)?;
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    fs::write(root.join(format!("{}.txt", task_id)), partial_text).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cv_resume_stream(workspace_root: String, task_id: String) -> Result<String, String> {
    let path = stream_cache_root(&workspace_root)?.join(format!("{}.txt", task_id));
    if !path.exists() {
        return Ok(String::new());
    }
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cv_clear_stream_checkpoint(workspace_root: String, task_id: String) -> Result<(), String> {
    let path = stream_cache_root(&workspace_root)?.join(format!("{}.txt", task_id));
    if path.exists() {
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn cv_process_ai_task(workspace_root: String, task_id: String) -> Result<AiTaskRecord, String> {
    let path = tasks_root(&workspace_root)?.join(format!("{}.json", task_id));
    let mut rec: AiTaskRecord = serde_json::from_str(&fs::read_to_string(&path).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    rec.status = "running".to_string();
    rec.message = "处理中…".to_string();
    rec.updated_at = chrono::Utc::now().to_rfc3339();

    match rec.kind.as_str() {
        "style_extract" => {
            let _ = crate::style_analyzer::cv_extract_style_sample(crate::style_analyzer::StyleExtractRequest {
                workspace_root: workspace_root.clone(),
                max_samples: 5,
                max_chars: 2000,
            });
            rec.progress = 1;
            rec.total = 1;
            rec.status = "completed".to_string();
            rec.message = "文风样本已提取".to_string();
        }
        "plot_audit" => {
            let report = crate::stats_audit::cv_run_plot_audit_rules(workspace_root.clone())?;
            let report_path = ensure_meta_dir(&workspace_root)?
                .join(format!("plot_audit_{}.md", task_id));
            fs::write(&report_path, &report.markdown).map_err(|e| e.to_string())?;
            rec.result_path = Some(report_path.to_string_lossy().to_string());
            rec.progress = 1;
            rec.total = 1;
            rec.status = "completed".to_string();
            rec.message = report.summary;
        }
        "batch_polish" | "batch_generate" => {
            let queue = collect_chapter_queue(&workspace_root)?;
            let count = queue.len() as u32;
            save_batch_queue(&workspace_root, &task_id, &queue)?;
            rec.total = count.max(1);
            rec.progress = 0;
            rec.status = "awaiting_llm".to_string();
            rec.message = format!("已就绪，待 AI 处理 {} 个章节", count);
        }
        _ => {
            rec.status = "completed".to_string();
            rec.message = "任务已标记完成".to_string();
        }
    }

    rec.updated_at = chrono::Utc::now().to_rfc3339();
    fs::write(&path, serde_json::to_string_pretty(&rec).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    Ok(rec)
}
