//! Render imitate cards into `.cinyuverse/` seed files for a new project.
//! Never seeds "style sample paragraphs" for the LLM to imitate.

use std::{
    fs,
    path::{Path, PathBuf},
};

use anyhow::{Context, Result, bail};

use super::{
    AntiPlagiarismCard, CharacterCard, CraftCard, ImitateCards, SettingCard, StorylineCard,
    ensure_imitate_dir, imitate_root, parse_imitate_cards_json, resolve_book_dir_for_imitate,
    write_json,
};

#[derive(Debug, Clone)]
pub struct SeedFiles {
    pub world_view_md: String,
    pub writing_rules_md: String,
    pub outline_md: String,
    pub anti_plagiarism_md: String,
    pub transfer_pack_json: String,
    pub character_files: Vec<(String, String)>,
}

pub fn read_cards(book_dir: &Path) -> Result<ImitateCards> {
    let book_dir = resolve_book_dir_for_imitate(book_dir)?;
    let root = imitate_root(&book_dir);
    let pack_path = root.join("pack.json");
    if !pack_path.is_file() {
        bail!("尚未完成深度分析（缺少 pack.json）。请重新点击「分析」。");
    }
    let raw = fs::read_to_string(&pack_path)
        .with_context(|| format!("Failed to read {}", pack_path.display()))?;
    parse_imitate_cards_json(&raw)
}

pub fn render_seed_files(cards: &ImitateCards, new_title: &str) -> Result<SeedFiles> {
    if cards.schema_version < 5 {
        bail!("分析结果过旧，请重新深度分析（需 v5：真名人物卡 + 真实情节）。");
    }
    let mut character_files = Vec::new();
    for ch in &cards.characters {
        let filename = format!("{}.md", sanitize_filename(&ch.name));
        character_files.push((filename, render_character_md(ch)));
    }
    Ok(SeedFiles {
        world_view_md: render_world_view(&cards.setting, new_title),
        writing_rules_md: render_writing_rules(&cards.craft),
        outline_md: render_outline(&cards.storyline, new_title),
        anti_plagiarism_md: render_anti_plagiarism(&cards.anti_plagiarism),
        transfer_pack_json: serde_json::to_string_pretty(cards)?,
        character_files,
    })
}

pub fn apply_seed_to_project(
    book_dir: &Path,
    project_repo: &Path,
    new_title: &str,
) -> Result<PathBuf> {
    let cards = read_cards(book_dir)?;
    let seed = render_seed_files(&cards, new_title)?;
    let meta = project_repo.join(".cinyuverse");
    fs::create_dir_all(&meta).with_context(|| format!("Failed to create {}", meta.display()))?;
    let characters_dir = meta.join("characters");
    fs::create_dir_all(&characters_dir)?;
    fs::create_dir_all(project_repo.join("chapters"))?;

    write_text(&meta.join("world-view.md"), &seed.world_view_md)?;
    write_text(&meta.join("writing-rules.md"), &seed.writing_rules_md)?;
    write_text(&meta.join("outline.md"), &seed.outline_md)?;
    if !seed.anti_plagiarism_md.trim().is_empty() {
        write_text(&meta.join("anti-plagiarism.md"), &seed.anti_plagiarism_md)?;
    }
    write_text(&meta.join("transfer-pack.json"), &seed.transfer_pack_json)?;
    write_text(
        &meta.join("hooks.md"),
        "# 伏笔账本\n\n| 钩子 | 埋设章 | 回收章 | 状态 |\n| --- | --- | --- | --- |\n",
    )?;
    write_text(
        &meta.join("current-state.md"),
        "# 当前状态\n\n- 阶段：立项\n- 来源：书库深度分析（故事线 / 人物 / 写法）\n",
    )?;
    write_text(
        &meta.join("style-sample.md"),
        "# 文风样本\n\n写法见 `writing-rules.md`；人物口吻见 `characters/`。\n",
    )?;

    for (name, body) in &seed.character_files {
        write_text(&characters_dir.join(name), body)?;
    }

    let provenance = format!(
        "# 分析来源\n\n- sourceBookDir: {}\n- newTitle: {}\n- schemaVersion: {}\n\n\
         含真实人名与情节拆解，供借鉴模仿；开新书时自行决定换皮程度。\n",
        book_dir.display(),
        new_title,
        cards.schema_version
    );
    write_text(&meta.join("transfer-source.md"), &provenance)?;
    Ok(meta)
}

pub fn write_cards_bundle(
    book_dir: &Path,
    cards: &ImitateCards,
    agent_id: &str,
    conversation_id: Option<&str>,
) -> Result<()> {
    let book_dir = resolve_book_dir_for_imitate(book_dir)?;
    let root = ensure_imitate_dir(&book_dir)?;
    write_json(&root.join("pack.json"), cards)?;
    write_json(&root.join("storyline.json"), &cards.storyline)?;
    write_json(&root.join("characters.json"), &cards.characters)?;
    write_json(&root.join("craft.json"), &cards.craft)?;
    write_json(&root.join("setting.json"), &cards.setting)?;
    write_json(&root.join("anti-plagiarism.json"), &cards.anti_plagiarism)?;

    let meta_path = root.join("meta.json");
    let mut meta: super::ImitateMeta = if meta_path.is_file() {
        serde_json::from_str(&fs::read_to_string(&meta_path)?)?
    } else {
        let manifest = crate::book_dir::load_manifest(&book_dir)?;
        super::ImitateMeta {
            schema_version: super::SCHEMA_VERSION,
            title: manifest.title,
            author: manifest.author,
            sample_chapter_indexes: Vec::new(),
            holdout_chapter_index: None,
            agent_id: None,
            conversation_id: None,
        }
    };
    meta.schema_version = cards.schema_version.max(super::SCHEMA_VERSION);
    meta.agent_id = Some(agent_id.to_string());
    meta.conversation_id = conversation_id.map(str::to_string);
    write_json(&meta_path, &meta)?;
    Ok(())
}

fn write_text(path: &Path, content: &str) -> Result<()> {
    fs::write(path, content).with_context(|| format!("Failed to write {}", path.display()))?;
    Ok(())
}

fn sanitize_filename(name: &str) -> String {
    let s = name.trim().replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "_");
    if s.is_empty() { "character".into() } else { s }
}

fn render_character_md(ch: &CharacterCard) -> String {
    let mut out = format!("# {}\n\n", ch.name);
    out.push_str(&format!("- 叙事功能：{}\n", or_dash(&ch.role_function)));
    out.push_str(&format!("- 欲望：{}\n", or_dash(&ch.desire)));
    out.push_str(&format!("- 代价/恐惧：{}\n", or_dash(&ch.cost_or_fear)));
    if !ch.tags.is_empty() {
        out.push_str(&format!("- 标签：{}\n", ch.tags.join("、")));
    }
    out.push_str("\n## 声口特征\n\n");
    push_bullets(&mut out, &ch.voice_traits);
    if !ch.voice_samples.is_empty() {
        out.push_str("\n## 口吻样本\n\n");
        push_bullets(&mut out, &ch.voice_samples);
    }
    if !ch.voice_rules.is_empty() {
        out.push_str("\n## 声音约束\n\n");
        push_bullets(&mut out, &ch.voice_rules);
    }
    out.push_str("\n## 关键经历\n\n");
    push_bullets(&mut out, &ch.key_events);
    out.push_str("\n## 弧光阶段\n\n");
    push_bullets(&mut out, &ch.arc_stages);
    out.push_str("\n## 关系\n\n");
    if ch.relationships.is_empty() {
        out.push_str("- （无）\n");
    } else {
        for rel in &ch.relationships {
            out.push_str(&format!("- → {}：{}\n", rel.to_name, or_dash(&rel.tension)));
        }
    }
    out
}

fn render_world_view(setting: &SettingCard, new_title: &str) -> String {
    let mut out = format!("# 《{new_title}》世界观壳（转置）\n\n");
    out.push_str("> 只保留类型与规则壳，专名必须全换。\n\n");
    out.push_str(&format!("## 世界框\n\n{}\n\n", or_dash(&setting.worldframe_type)));
    out.push_str(&format!(
        "## 力量/规则壳\n\n{}\n\n",
        or_dash(&setting.power_system_type)
    ));
    out.push_str("## 冲突轴\n\n");
    push_bullets(&mut out, &setting.conflict_axes);
    out.push_str("\n## 代价货币\n\n");
    push_bullets(&mut out, &setting.stakes_currency);
    out.push_str("\n## 禁忌\n\n");
    push_bullets(&mut out, &setting.taboo_transfers);
    out
}

fn render_writing_rules(craft: &CraftCard) -> String {
    let mut out = String::from(
        "# 写法（可模仿）\n\n\
         学手法与节奏；不要整段粘贴原书。evidence 是取证短句。\n\n",
    );
    out.push_str(&format!(
        "## 叙述立场\n\n{}\n\n",
        or_dash(&craft.narration_stance)
    ));
    if !craft.how_to_imitate.is_empty() {
        out.push_str("## 怎么学它写\n\n");
        push_bullets(&mut out, &craft.how_to_imitate);
        out.push('\n');
    }
    out.push_str("## 叙述手法\n\n");
    for rule in &craft.prose_engines {
        out.push_str(&format!(
            "- {}{}\n  - 取证 ch{}「{}」\n",
            rule.rule,
            if rule.why.is_empty() {
                String::new()
            } else {
                format!(" — {}", rule.why)
            },
            rule.evidence.chapter_index,
            rule.evidence.quote
        ));
    }
    out.push_str("\n## 对白手法\n\n");
    for rule in &craft.dialogue_engines {
        out.push_str(&format!(
            "- {}{}\n  - 取证 ch{}「{}」\n",
            rule.rule,
            if rule.why.is_empty() {
                String::new()
            } else {
                format!(" — {}", rule.why)
            },
            rule.evidence.chapter_index,
            rule.evidence.quote
        ));
    }
    out.push_str("\n## 信息控制\n\n");
    push_bullets(&mut out, &craft.info_control);
    out.push_str("\n## 章末钩子类型\n\n");
    push_bullets(&mut out, &craft.chapter_ending_hooks);
    out.push_str("\n## 禁止习惯（含 AI 腔）\n\n");
    push_bullets(&mut out, &craft.forbidden_habits);
    out
}

fn render_outline(story: &StorylineCard, new_title: &str) -> String {
    let mut out = format!("# 《{new_title}》故事线\n\n");
    out.push_str("> 来自原书拆解：可含真名与真实情节，开新书时自行决定借鉴范围。\n\n");
    out.push_str(&format!("## 主线\n\n{}\n\n", or_dash(&story.throughline)));
    if !story.signature_devices.is_empty() {
        out.push_str("## 独特装置\n\n");
        push_bullets(&mut out, &story.signature_devices);
        out.push('\n');
    }
    out.push_str("## 幕结构\n\n");
    for act in &story.acts {
        out.push_str(&format!(
            "### {}\n\n- 功能：{}\n- 节拍型：\n",
            or_dash(&act.name),
            or_dash(&act.function)
        ));
        for beat in &act.beat_patterns {
            out.push_str(&format!("  - {beat}\n"));
        }
        out.push('\n');
    }
    out.push_str("## 升级阶梯\n\n");
    for (i, step) in story.escalation_ladder.iter().enumerate() {
        out.push_str(&format!("{}. {step}\n", i + 1));
    }
    out.push_str(&format!(
        "\n## 伏笔节奏\n\n{}\n\n",
        or_dash(&story.foreshadow_cadence)
    ));
    out.push_str("## 章节引擎\n\n");
    for eng in &story.chapter_engines {
        out.push_str(&format!(
            "- [{}] {} — {}\n",
            or_dash(&eng.placement),
            or_dash(&eng.pattern),
            or_dash(&eng.purpose)
        ));
    }
    out.push_str("\n## 必须改写\n\n");
    push_bullets(&mut out, &story.must_mutate);
    out
}

fn render_anti_plagiarism(anti: &AntiPlagiarismCard) -> String {
    let empty = anti.banned_names.is_empty()
        && anti.banned_setpieces.is_empty()
        && anti.rewrite_mandates.is_empty()
        && anti.review_checklist.is_empty();
    if empty {
        return String::new();
    }
    let mut out = String::from("# 参考备注（次要）\n\n");
    if !anti.banned_names.is_empty() {
        out.push_str("## 专名\n\n");
        push_bullets(&mut out, &anti.banned_names);
        out.push('\n');
    }
    if !anti.banned_setpieces.is_empty() {
        out.push_str("## 招牌场景\n\n");
        push_bullets(&mut out, &anti.banned_setpieces);
        out.push('\n');
    }
    if !anti.rewrite_mandates.is_empty() {
        out.push_str("## 改写提示\n\n");
        push_bullets(&mut out, &anti.rewrite_mandates);
        out.push('\n');
    }
    if !anti.review_checklist.is_empty() {
        out.push_str("## 自检\n\n");
        push_bullets(&mut out, &anti.review_checklist);
    }
    out
}

fn push_bullets(out: &mut String, items: &[String]) {
    if items.is_empty() {
        out.push_str("- （无）\n");
        return;
    }
    for item in items {
        out.push_str(&format!("- {item}\n"));
    }
}

fn or_dash(s: &str) -> &str {
    if s.trim().is_empty() { "（待补）" } else { s }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seed_writes_character_files_not_style_sample_prose() {
        let cards = parse_imitate_cards_json(
            r#"{
  "schemaVersion": 5,
  "storyline": {"throughline":"米汤发现肾化异变可被收编","signatureDevices":["肾化收编","物件改战具","半真审讯"],"acts":[{"name":"一","function":"立足","beatPatterns":["米汤火腿肠比划"]},{"name":"二","function":"人祸","beatPatterns":["人质诱饵"]},{"name":"三","function":"异变","beatPatterns":["实验验规则"]}],"escalationLadder":["缺水"],"foreshadowCadence":"隔章","chapterEngines":[],"mustMutate":[]},
  "characters": [
    {"name":"米汤","roleFunction":"决策","desire":"保住身边人","costOrFear":"材料化","voiceTraits":["先动作"],"voiceSamples":["走楼梯？"],"keyEvents":["高层突围"],"voiceRules":[],"arcStages":["躲"],"relationships":[],"tags":[]},
    {"name":"甘露婷","roleFunction":"伙伴","desire":"自主","costOrFear":"失退出权","voiceTraits":["先说失败条件"],"voiceSamples":[],"keyEvents":["并肩验证"],"voiceRules":[],"arcStages":["并肩"],"relationships":[],"tags":[]}
  ],
  "craft": {"narrationStance":"近身","howToImitate":["理念落到伤口"],"proseEngines":[{"rule":"动作先于评价","why":"压迫","evidence":{"chapterIndex":0,"quote":"杯子晃了"}}],"dialogueEngines":[],"infoControl":[],"chapterEndingHooks":[],"forbiddenHabits":["段末金句"]},
  "setting": {"conflictAxes":["异变资源"],"worldframeType":"灾后","powerSystemType":"肾化","stakesCurrency":[],"tabooTransfers":[],"notes":[]},
  "antiPlagiarism": {"bannedNames":[],"bannedSetpieces":[],"rewriteMandates":[],"reviewChecklist":[]}
}"#,
        )
        .unwrap();
        let seed = render_seed_files(&cards, "新书").unwrap();
        assert!(seed.outline_md.contains("米汤") || seed.outline_md.contains("肾化"));
        assert!(seed.character_files.iter().any(|(n, _)| n == "米汤.md"));
        assert!(!seed.character_files.iter().any(|(n, _)| n.contains("配角")));
        assert!(seed.writing_rules_md.contains("怎么学它写") || seed.writing_rules_md.contains("写法"));
    }
}
