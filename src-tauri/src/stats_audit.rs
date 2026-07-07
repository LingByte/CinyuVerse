//! Writing statistics and plot logic audit reports.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use crate::project_meta::{ensure_meta_dir, load_bundle, OutlineNode};

const META_DIR: &str = ".cinyuverse";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChapterStat {
    pub path: String,
    pub title: String,
    pub chars: u64,
    pub words: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VolumeStat {
    pub volume_id: String,
    pub title: String,
    pub chars: u64,
    pub chapters: Vec<ChapterStat>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WritingStatsResult {
    pub total_chars: u64,
    pub total_chapters: u64,
    pub volumes: Vec<VolumeStat>,
    pub daily: HashMap<String, u64>,
    pub target_words: u64,
    pub progress_percent: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlotAuditIssue {
    pub severity: String,
    pub category: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlotAuditReport {
    pub generated_at: String,
    pub issues: Vec<PlotAuditIssue>,
    pub summary: String,
    pub markdown: String,
}

fn count_chars(text: &str) -> u64 {
    text.chars().count() as u64
}

fn scan_md_files(root: &Path, skip: &Path) -> Vec<PathBuf> {
    let mut out = vec![];
    if !root.is_dir() {
        return out;
    }
    let Ok(entries) = fs::read_dir(root) else {
        return out;
    };
    for entry in entries.flatten() {
        let p = entry.path();
        if p.starts_with(skip) {
            continue;
        }
        if p.is_dir() {
            let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
            if name == "node_modules" || name == "target" || name == ".git" {
                continue;
            }
            out.extend(scan_md_files(&p, skip));
        } else if p.extension().and_then(|e| e.to_str()) == Some("md") {
            out.push(p);
        }
    }
    out
}

fn stat_file(path: &Path) -> ChapterStat {
    let content = fs::read_to_string(path).unwrap_or_default();
    let title = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("章节")
        .to_string();
    ChapterStat {
        path: path.to_string_lossy().to_string(),
        title,
        chars: count_chars(&content),
        words: count_chars(&content),
    }
}

#[tauri::command]
pub fn cv_get_writing_stats(workspace_root: String) -> Result<WritingStatsResult, String> {
    let root = Path::new(&workspace_root);
    let meta_skip = root.join(META_DIR);
    let bundle = load_bundle(&workspace_root)?;
    let target = bundle.project.target_words;

    let mut volumes: Vec<VolumeStat> = vec![];
    let mut total_chars = 0u64;
    let mut total_chapters = 0u64;
    let mut daily: HashMap<String, u64> = HashMap::new();

    for vol in &bundle.outline.volume_nodes {
        let mut chapters = vec![];
        let mut vol_chars = 0u64;
        if let Some(children) = &vol.children {
            for ch in children {
                if let Some(fp) = &ch.file_path {
                    let p = Path::new(fp);
                    if p.exists() {
                        let st = stat_file(p);
                        vol_chars += st.chars;
                        total_chars += st.chars;
                        total_chapters += 1;
                        if let Ok(meta) = fs::metadata(p) {
                            if let Ok(modified) = meta.modified() {
                                if let Ok(duration) = modified.duration_since(std::time::UNIX_EPOCH) {
                                    let day = chrono::DateTime::<chrono::Utc>::from(
                                        std::time::UNIX_EPOCH + duration,
                                    )
                                    .format("%Y-%m-%d")
                                    .to_string();
                                    *daily.entry(day).or_insert(0) += st.chars;
                                }
                            }
                        }
                        chapters.push(st);
                    }
                }
            }
        }
        volumes.push(VolumeStat {
            volume_id: vol.id.clone(),
            title: vol.title.clone(),
            chars: vol_chars,
            chapters,
        });
    }

    if total_chapters == 0 {
        for path in scan_md_files(root, &meta_skip) {
            let st = stat_file(&path);
            total_chars += st.chars;
            total_chapters += 1;
        }
    }

    let progress = if target > 0 {
        (total_chars as f64 / target as f64 * 100.0).min(100.0)
    } else {
        0.0
    };

    Ok(WritingStatsResult {
        total_chars,
        total_chapters,
        volumes,
        daily,
        target_words: target,
        progress_percent: progress,
    })
}

#[tauri::command]
pub fn cv_run_plot_audit_rules(workspace_root: String) -> Result<PlotAuditReport, String> {
    build_plot_audit_report(&workspace_root)
}

#[tauri::command]
pub async fn cv_run_plot_audit(
    workspace_root: String,
    deep: Option<bool>,
) -> Result<PlotAuditReport, String> {
    let mut report = build_plot_audit_report(&workspace_root)?;
    if deep.unwrap_or(false) {
        let outline_ctx = load_outline_context(&workspace_root)?;
        let user_prompt = format!(
            "以下为本项目大纲摘要与规则检测结果。请从人物弧光、伏笔回收、时间线逻辑、节奏与冲突设计等维度做深度分析，\
             指出规则检测未覆盖的潜在问题，并给出可操作的修改建议。用 Markdown 分节输出。\n\n\
             ## 大纲摘要\n\n{outline_ctx}\n\n## 规则检测结果\n\n{}",
            report.markdown
        );
        match crate::llm_runtime::llm_chat_completion(
            "你是资深网文剧情审校编辑，擅长发现结构性叙事问题并给出具体修改建议。",
            &user_prompt,
            None,
        )
        .await
        {
            Ok(llm_text) if !llm_text.trim().is_empty() => {
                report.markdown.push_str("\n\n## AI 深度分析\n\n");
                report.markdown.push_str(&llm_text);
                report.summary = format!("{}；已附加 AI 深度分析", report.summary);
                report.issues.push(PlotAuditIssue {
                    severity: "info".to_string(),
                    category: "llm".to_string(),
                    message: "AI 深度分析已完成，详见报告「AI 深度分析」章节".to_string(),
                });
                let report_path = ensure_meta_dir(&workspace_root)?
                    .join("plot_audit_latest.md");
                fs::write(&report_path, &report.markdown).map_err(|e| e.to_string())?;
            }
            Ok(_) => {
                report.issues.push(PlotAuditIssue {
                    severity: "warning".to_string(),
                    category: "llm".to_string(),
                    message: "AI 深度分析返回空内容，请检查 API 配置".to_string(),
                });
            }
            Err(e) => {
                report.issues.push(PlotAuditIssue {
                    severity: "warning".to_string(),
                    category: "llm".to_string(),
                    message: format!("AI 深度分析失败：{}", e),
                });
            }
        }
    }
    Ok(report)
}

fn load_outline_context(workspace_root: &str) -> Result<String, String> {
    let bundle = load_bundle(workspace_root)?;
    let mut lines = vec![format!("# {}", bundle.project.book_name)];
    for vol in &bundle.outline.volume_nodes {
        lines.push(format!("\n## {}", vol.title));
        if let Some(children) = &vol.children {
            for ch in children {
                lines.push(format!("- **{}**：{}", ch.title, ch.content.chars().take(200).collect::<String>()));
            }
        }
    }
    for ev in bundle.outline.timeline.iter().take(20) {
        lines.push(format!("- [{}] {}", ev.date_label, ev.title));
    }
    Ok(lines.join("\n"))
}

fn build_plot_audit_report(workspace_root: &str) -> Result<PlotAuditReport, String> {
    let bundle = load_bundle(&workspace_root)?;
    let mut issues = vec![];

    let mut date_map: HashMap<String, Vec<String>> = HashMap::new();
    for ev in &bundle.outline.timeline {
        if ev.date_label.is_empty() {
            issues.push(PlotAuditIssue {
                severity: "info".to_string(),
                category: "timeline".to_string(),
                message: format!("时间线事件「{}」未填写时间标签", ev.title),
            });
        } else {
            date_map
                .entry(ev.date_label.clone())
                .or_default()
                .push(ev.title.clone());
        }
    }

    for (date, titles) in &date_map {
        if titles.len() > 1 {
            issues.push(PlotAuditIssue {
                severity: "warning".to_string(),
                category: "timeline".to_string(),
                message: format!("时间「{}」存在 {} 个事件：{}", date, titles.len(), titles.join("、")),
            });
        }
    }

    fn walk_nodes(nodes: &[OutlineNode], issues: &mut Vec<PlotAuditIssue>) {
        for n in nodes {
            if let Some(children) = &n.children {
                for ch in children {
                    if ch.file_path.is_none() || ch.file_path.as_ref().map(|p| p.is_empty()).unwrap_or(true) {
                        issues.push(PlotAuditIssue {
                            severity: "warning".to_string(),
                            category: "outline".to_string(),
                            message: format!("章节「{}」未绑定正文文件", ch.title),
                        });
                    } else if let Some(fp) = &ch.file_path {
                        if !Path::new(fp).exists() {
                            issues.push(PlotAuditIssue {
                                severity: "error".to_string(),
                                category: "outline".to_string(),
                                message: format!("章节「{}」绑定文件不存在：{}", ch.title, fp),
                            });
                        }
                    }
                    if ch.content.trim().is_empty() {
                        issues.push(PlotAuditIssue {
                            severity: "info".to_string(),
                            category: "foreshadow".to_string(),
                            message: format!("章节「{}」细纲为空，可能遗漏伏笔规划", ch.title),
                        });
                    }
                }
                walk_nodes(children, issues);
            }
        }
    }
    walk_nodes(&bundle.outline.volume_nodes, &mut issues);

    let warn_count = issues.iter().filter(|i| i.severity == "warning" || i.severity == "error").count();
    let summary = format!(
        "共 {} 项问题（{} 项需关注）",
        issues.len(),
        warn_count
    );

    let mut md = format!(
        "# 剧情审校报告\n\n生成时间：{}\n\n## 摘要\n\n{}\n\n## 明细\n\n",
        chrono::Utc::now().format("%Y-%m-%d %H:%M UTC"),
        summary
    );
    for issue in &issues {
        md.push_str(&format!(
            "- **[{}][{}]** {}\n",
            issue.severity, issue.category, issue.message
        ));
    }

    let report_path = ensure_meta_dir(&workspace_root)?
        .join("plot_audit_latest.md");
    fs::write(&report_path, &md).map_err(|e| e.to_string())?;

    Ok(PlotAuditReport {
        generated_at: chrono::Utc::now().to_rfc3339(),
        issues,
        summary,
        markdown: md,
    })
}
