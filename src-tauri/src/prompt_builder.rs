//! Assemble writing prompts from `.cinyuverse` metadata + editor context.

use serde::{Deserialize, Serialize};

use crate::project_meta::{load_bundle, ProjectMetaBundle};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PromptBuildRequest {
    pub workspace_root: String,
    pub user_instruction: String,
    #[serde(default)]
    pub selection: Option<String>,
    #[serde(default)]
    pub context_before: Option<String>,
    #[serde(default)]
    pub context_after: Option<String>,
    #[serde(default)]
    pub outline_snippet: Option<String>,
    #[serde(default)]
    pub character_names: Vec<String>,
    #[serde(default)]
    pub chapter_path: Option<String>,
    #[serde(default)]
    pub action: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptBuildResult {
    pub system_prompt: String,
    pub user_prompt: String,
    pub context_summary: String,
}

fn truncate(s: &str, max_chars: usize) -> String {
    if s.chars().count() <= max_chars {
        return s.to_string();
    }
    let mut out: String = s.chars().take(max_chars).collect();
    out.push_str("…[截断]");
    out
}

fn build_system_prompt(meta: &ProjectMetaBundle) -> String {
    let mut parts = vec![
        "你是 CinyuVerse 小说创作助手，帮助作者规划大纲、撰写正文、审校人设与文风。".to_string(),
    ];

    if !meta.project.world_view.is_empty() {
        parts.push(format!("【世界观】\n{}", meta.project.world_view));
    }
    if !meta.project.style.is_empty() {
        parts.push(format!("【文风要求】\n{}", meta.project.style));
    }
    if !meta.project.style_sample.is_empty() {
        parts.push(format!(
            "【文风样本】\n{}",
            truncate(&meta.project.style_sample, 2000)
        ));
    }
    if !meta.writing_rules.rules.is_empty() {
        parts.push(format!(
            "【写作规则】\n{}",
            meta.writing_rules.rules.join("\n")
        ));
    }
    if !meta.writing_rules.tone.is_empty() {
        parts.push(format!("叙事基调：{}", meta.writing_rules.tone));
    }
    if !meta.writing_rules.pov.is_empty() {
        parts.push(format!("视角：{}", meta.writing_rules.pov));
    }
    if !meta.banned_words.is_empty() {
        parts.push(format!(
            "【禁词表】请勿使用：{}",
            meta.banned_words.join("、")
        ));
    }

    if !meta.characters.is_empty() {
        let mut chars = String::from("【角色设定】\n");
        for c in meta.characters.iter().take(12) {
            chars.push_str(&format!(
                "- {}（{}）：性格{}；说话风格{}；关系{}；剧情线{}。\n",
                c.name,
                c.identity,
                c.personality,
                c.dialogue_style,
                c.relations,
                c.storyline
            ));
        }
        parts.push(chars);
    }

    if !meta.glossary.is_empty() {
        let mut gl = String::from("【设定词条】\n");
        for g in meta.glossary.iter().take(20) {
            gl.push_str(&format!("- {}（{}）：{}\n", g.term, g.category, g.definition));
        }
        parts.push(gl);
    }

  if !meta.outline.book_outline.is_empty() {
        parts.push(format!("【全书大纲】\n{}", truncate(&meta.outline.book_outline, 1500)));
    }

    parts.join("\n\n")
}

fn action_instruction(action: &str, selection: &str) -> String {
    match action {
        "expand" => format!(
            "请扩写以下选中片段，保持前后文风格一致，只输出扩写后的替换文本：\n\n{}",
            selection
        ),
        "shorten" => format!(
            "请精简以下选中片段，保留核心信息与文风，只输出精简后的替换文本：\n\n{}",
            selection
        ),
        "dialogue" => format!(
            "请将以下片段改写为更生动的对话，只输出改写后的替换文本：\n\n{}",
            selection
        ),
        "persona" => format!(
            "请修正以下片段中的人设与台词一致性，只输出修正后的替换文本：\n\n{}",
            selection
        ),
        "style" => format!(
            "请调整以下片段的文风使其与全书风格一致，只输出调整后的替换文本：\n\n{}",
            selection
        ),
        "polish" => format!(
            "请润色以下片段，修正语病并提升可读性，只输出润色后的替换文本：\n\n{}",
            selection
        ),
        "hook" => format!(
            "请在以下片段末尾增加悬念钩子，只输出修改后的完整片段：\n\n{}",
            selection
        ),
        _ => selection.to_string(),
    }
}

pub fn build_writing_prompt(req: &PromptBuildRequest) -> Result<PromptBuildResult, String> {
    let meta = load_bundle(&req.workspace_root)?;
    let system = build_system_prompt(&meta);

    let mut user_parts = vec![];

    if let Some(action) = &req.action {
        if let Some(sel) = &req.selection {
            user_parts.push(action_instruction(action, sel));
        }
    } else if !req.user_instruction.is_empty() {
        user_parts.push(req.user_instruction.clone());
    }

    if let Some(snippet) = &req.outline_snippet {
        if !snippet.is_empty() {
            user_parts.push(format!("【当前大纲细纲】\n{}", snippet));
        }
    }

    if !req.character_names.is_empty() {
        user_parts.push(format!("【本章出场角色】{}", req.character_names.join("、")));
    }

    if let Some(before) = &req.context_before {
        if !before.is_empty() {
            user_parts.push(format!(
                "【前文上下文（节选）】\n{}",
                truncate(before, 1200)
            ));
        }
    }

    if let Some(sel) = &req.selection {
        if req.action.is_none() {
            user_parts.push(format!("【选中内容】\n{}", sel));
        }
    }

    if let Some(after) = &req.context_after {
        if !after.is_empty() {
            user_parts.push(format!(
                "【后文上下文（节选）】\n{}",
                truncate(after, 600)
            ));
        }
    }

    if let Some(path) = &req.chapter_path {
        user_parts.push(format!("当前章节文件：{}", path));
    }

    let context_summary = format!(
        "角色{}个 · 词条{}个 · 禁词{}个",
        meta.characters.len(),
        meta.glossary.len(),
        meta.banned_words.len()
    );

    Ok(PromptBuildResult {
        system_prompt: system,
        user_prompt: user_parts.join("\n\n"),
        context_summary,
    })
}

#[tauri::command]
pub fn cv_build_writing_prompt(request: PromptBuildRequest) -> Result<PromptBuildResult, String> {
    build_writing_prompt(&request)
}
