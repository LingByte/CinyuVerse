//! Offline deep-analysis assets for a book directory.
//!
//! Layout under `<book>/imitate/v1/`:
//!   status.json / fingerprint.json / scenes.json / meta.json /
//!   pack.json / storyline.json / characters.json / craft.json /
//!   setting.json / anti-plagiarism.json
//!
//! Transfer engines (storyline + character cards + craft), not prose samples.

mod fingerprint;
mod parse;
mod prompt;
mod sample;
mod scenes;
mod seed;
mod status;

use std::{
    fs,
    path::{Path, PathBuf},
};

use anyhow::{Context, Result, bail};
use serde::{Deserialize, Serialize};

use crate::book_dir::{is_book_dir, load_manifest, read_chapter};

pub use fingerprint::{BookFingerprint, compute_fingerprint};
pub use parse::{
    AntiPlagiarismCard, CharacterCard, CraftCard, ImitateCards, SettingCard, StorylineCard,
    parse_imitate_cards_json,
};
pub use prompt::build_analysis_prompt;
pub use sample::{ChapterSample, SamplePlan, select_sample_plan};
pub use scenes::{SceneSample, extract_scenes};
pub use seed::{apply_seed_to_project, read_cards, write_cards_bundle};
pub use status::{
    ImitatePhase, ImitateStatus, STEP_AGENT_RUNNING, STEP_HOST_EXTRACT, STEP_PARSE_SAVE,
    STEP_QUEUED, STEP_START_AGENT, STEP_TOTAL, read_status, write_status,
};

pub const IMITATE_DIR: &str = "imitate";
pub const IMITATE_VERSION: &str = "v1";
pub const SCHEMA_VERSION: u32 = 3;

const MAX_CHAPTER_CHARS: usize = 6_000;
const MAX_PROMPT_CHAPTERS: usize = 10;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImitateMeta {
    pub schema_version: u32,
    pub title: String,
    pub author: String,
    pub sample_chapter_indexes: Vec<u32>,
    pub holdout_chapter_index: Option<u32>,
    pub agent_id: Option<String>,
    pub conversation_id: Option<String>,
}

#[derive(Debug, Clone)]
pub struct AnalysisPack {
    pub title: String,
    pub author: String,
    pub plan: SamplePlan,
    pub samples: Vec<ChapterSample>,
    pub fingerprint: BookFingerprint,
    pub scenes: Vec<SceneSample>,
}

pub fn imitate_root(book_dir: &Path) -> PathBuf {
    book_dir.join(IMITATE_DIR).join(IMITATE_VERSION)
}

pub fn ensure_imitate_dir(book_dir: &Path) -> Result<PathBuf> {
    if !is_book_dir(book_dir) {
        bail!("不是书库目录（缺少 book.json）: {}", book_dir.display());
    }
    let root = imitate_root(book_dir);
    fs::create_dir_all(&root)
        .with_context(|| format!("Failed to create {}", root.display()))?;
    Ok(root)
}

pub fn resolve_book_dir_for_imitate(path: &Path) -> Result<PathBuf> {
    if is_book_dir(path) {
        return Ok(path.to_path_buf());
    }
    bail!("仿写分析仅支持已转换的书库目录: {}", path.display())
}

/// Host-side extraction: fingerprint, scenes, chapter samples. Writes fingerprint/scenes/meta skeleton.
pub fn prepare_analysis_pack(book_dir: &Path) -> Result<AnalysisPack> {
    let book_dir = resolve_book_dir_for_imitate(book_dir)?;
    let manifest = load_manifest(&book_dir)?;
    if manifest.chapters.is_empty() {
        bail!("书没有章节，无法分析");
    }

    let mut chapter_texts = Vec::with_capacity(manifest.chapters.len());
    for chapter in &manifest.chapters {
        let loaded = read_chapter(&book_dir, chapter.index)?;
        chapter_texts.push((chapter.index, chapter.title.clone(), loaded.text));
    }

    let fingerprint = compute_fingerprint(&chapter_texts);
    let plan = select_sample_plan(&chapter_texts);
    let scenes = extract_scenes(&chapter_texts, &plan);

    let mut samples = Vec::new();
    for &index in &plan.sample_indexes {
        let Some((_, title, text)) = chapter_texts.iter().find(|(i, _, _)| *i == index) else {
            continue;
        };
        samples.push(ChapterSample {
            index,
            title: title.clone(),
            text: truncate_chars(text, MAX_CHAPTER_CHARS),
        });
    }
    samples.truncate(MAX_PROMPT_CHAPTERS);

    let root = ensure_imitate_dir(&book_dir)?;
    write_json(&root.join("fingerprint.json"), &fingerprint)?;
    write_json(&root.join("scenes.json"), &scenes)?;

    let meta = ImitateMeta {
        schema_version: SCHEMA_VERSION,
        title: manifest.title.clone(),
        author: manifest.author.clone(),
        sample_chapter_indexes: plan.sample_indexes.clone(),
        holdout_chapter_index: plan.holdout_index,
        agent_id: None,
        conversation_id: None,
    };
    write_json(&root.join("meta.json"), &meta)?;

    write_status(
        &book_dir,
        &ImitateStatus::with_step(
            ImitatePhase::Running,
            status::STEP_HOST_EXTRACT,
            "已完成指纹与场景抽取",
            None,
        ),
    )?;

    Ok(AnalysisPack {
        title: manifest.title,
        author: manifest.author,
        plan,
        samples,
        fingerprint,
        scenes,
    })
}

pub fn write_cards(
    book_dir: &Path,
    cards: &ImitateCards,
    agent_id: &str,
    conversation_id: Option<&str>,
) -> Result<()> {
    write_cards_bundle(book_dir, cards, agent_id, conversation_id)
}

pub fn write_json<T: Serialize>(path: &Path, value: &T) -> Result<()> {
    let raw = serde_json::to_string_pretty(value)?;
    fs::write(path, raw).with_context(|| format!("Failed to write {}", path.display()))?;
    Ok(())
}

fn truncate_chars(text: &str, max: usize) -> String {
    let count = text.chars().count();
    if count <= max {
        return text.to_string();
    }
    let truncated: String = text.chars().take(max).collect();
    format!("{truncated}\n…(截断)")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn write_test_book(root: &Path) -> PathBuf {
        let book = root.join("demo");
        fs::create_dir_all(book.join("chapters")).unwrap();
        let chapters = [
            ("开篇", "「你好。」他说。\n\n夜色很深，风从巷口拐进来。她没有回答，只是把灯捻亮。"),
            (
                "对峙",
                "「你到底想怎样？」\n「我想听真话。」\n他往前一步。桌子上的杯子晃了一下。",
            ),
            (
                "收束",
                "天亮了。城门开了。他们没有回头。风停了，尘土落回地面。",
            ),
        ];
        let mut manifest_chapters = Vec::new();
        for (i, (title, text)) in chapters.iter().enumerate() {
            let file = format!("chapters/{i:04}.txt");
            fs::write(book.join(&file), text).unwrap();
            manifest_chapters.push(serde_json::json!({
                "index": i,
                "title": title,
                "file": file,
            }));
        }
        let manifest = serde_json::json!({
            "title": "演示书",
            "author": "测试",
            "chapters": manifest_chapters,
        });
        fs::write(book.join("book.json"), serde_json::to_string_pretty(&manifest).unwrap())
            .unwrap();
        book
    }

    #[test]
    fn prepare_pack_writes_fingerprint_and_scenes() {
        let tmp = tempfile::tempdir().unwrap();
        let book = write_test_book(tmp.path());
        let pack = prepare_analysis_pack(&book).unwrap();
        assert!(!pack.samples.is_empty());
        assert!(imitate_root(&book).join("fingerprint.json").is_file());
        assert!(imitate_root(&book).join("scenes.json").is_file());
        let status = read_status(&book).unwrap();
        assert_eq!(status.phase, ImitatePhase::Running);
    }

    #[test]
    fn rejects_non_book_dir() {
        let tmp = tempfile::tempdir().unwrap();
        let err = resolve_book_dir_for_imitate(tmp.path()).unwrap_err();
        assert!(err.to_string().contains("书库目录"));
    }

    #[test]
    fn write_cards_emits_storyline_characters_craft() {
        let tmp = tempfile::tempdir().unwrap();
        let book = write_test_book(tmp.path());
        let cards = parse_imitate_cards_json(
            r#"{
  "schemaVersion": 3,
  "storyline": {"throughline":"弱势换力","acts":[{"name":"一","function":"建交易","beatPatterns":["试探"]}],"escalationLadder":["试探","反噬"],"foreshadowCadence":"隔章","chapterEngines":[],"mustMutate":["代价"]},
  "characters": [
    {"slot":"角色A","roleFunction":"推手","desire":"议价权","costOrFear":"失控","voiceRules":["短句"],"arcStages":["隐忍"],"relationships":[],"tags":[]},
    {"slot":"对手B","roleFunction":"压手","desire":"不透明","costOrFear":"穿帮","voiceRules":["反问"],"arcStages":["施压"],"relationships":[],"tags":[]}
  ],
  "craft": {"proseEngines":[{"rule":"动作先于评价","why":"压迫","evidence":{"chapterIndex":0,"quote":"杯子晃了"}}],"dialogueEngines":[],"infoControl":[],"chapterEndingHooks":[],"forbiddenHabits":["段末金句"],"narrationStance":"贴近A"},
  "setting": {"conflictAxes":["交易"],"worldframeType":"都市","powerSystemType":"契约","stakesCurrency":[],"tabooTransfers":[],"notes":[]},
  "antiPlagiarism": {"bannedNames":[],"bannedSetpieces":[],"rewriteMandates":["新壳"],"reviewChecklist":["换皮？"]}
}"#,
        )
        .unwrap();
        write_cards(&book, &cards, "claude", Some("conv-1")).unwrap();
        let root = imitate_root(&book);
        assert!(root.join("pack.json").is_file());
        assert!(root.join("storyline.json").is_file());
        assert!(root.join("characters.json").is_file());
        assert!(root.join("craft.json").is_file());
        assert!(!root.join("style.json").is_file());
        let loaded = read_cards(&book).unwrap();
        assert_eq!(loaded.characters.len(), 2);
        assert!(loaded.storyline.throughline.contains("弱势"));
    }
}
