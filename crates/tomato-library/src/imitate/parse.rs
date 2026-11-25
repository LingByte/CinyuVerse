use anyhow::{Result, bail};
use serde::{Deserialize, Serialize};

/// Transfer pack from deep imitate analysis.
///
/// Transfer **engines**, not prose samples:
/// - storyline skeleton (acts / beat patterns / escalation)
/// - character cards (slots, voice rules, arcs — no real names)
/// - craft engines (executable writing mechanics; quotes are evidence only)
///
/// Feeding LLMs a "style sample paragraph" to imitate is deliberately avoided:
/// it produces AI sludge and still misses the author's structural craft.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImitateCards {
    #[serde(default = "default_schema_version")]
    pub schema_version: u32,
    pub storyline: StorylineCard,
    #[serde(default)]
    pub characters: Vec<CharacterCard>,
    pub craft: CraftCard,
    #[serde(default)]
    pub setting: SettingCard,
    #[serde(default)]
    pub anti_plagiarism: AntiPlagiarismCard,
}

fn default_schema_version() -> u32 {
    3
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct StorylineCard {
    /// One-line transferable throughline (no proper nouns).
    #[serde(default)]
    pub throughline: String,
    #[serde(default)]
    pub acts: Vec<StoryAct>,
    /// Abstract escalation ladder.
    #[serde(default)]
    pub escalation_ladder: Vec<String>,
    /// How foreshadow/hooks are paced (pattern, not events).
    #[serde(default)]
    pub foreshadow_cadence: String,
    /// Chapter-level engines that recur.
    #[serde(default)]
    pub chapter_engines: Vec<ChapterEngine>,
    /// Dimensions a new book must reinvent.
    #[serde(default)]
    pub must_mutate: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct StoryAct {
    #[serde(default)]
    pub name: String,
    /// Dramatic function of this act.
    #[serde(default)]
    pub function: String,
    /// Beat patterns inside the act (e.g. "试探性交易失败").
    #[serde(default)]
    pub beat_patterns: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ChapterEngine {
    #[serde(default)]
    pub pattern: String,
    #[serde(default)]
    pub purpose: String,
    #[serde(default)]
    pub placement: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CharacterCard {
    /// Slot id: 角色A / 对手B / 引路人C — never the source name.
    #[serde(default)]
    pub slot: String,
    /// Narrative job in the machine.
    #[serde(default)]
    pub role_function: String,
    #[serde(default)]
    pub desire: String,
    #[serde(default)]
    pub cost_or_fear: String,
    /// Voice as executable rules, not sample paragraphs.
    #[serde(default)]
    pub voice_rules: Vec<String>,
    #[serde(default)]
    pub arc_stages: Vec<String>,
    #[serde(default)]
    pub relationships: Vec<CharacterRelation>,
    /// Soft tags: 狠厉 / 克制 / 话少等 — still not prose samples.
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CharacterRelation {
    #[serde(default)]
    pub to_slot: String,
    #[serde(default)]
    pub tension: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CraftCard {
    /// Prose/scene mechanics with forensic evidence (evidence ≠ imitation target).
    #[serde(default)]
    pub prose_engines: Vec<CraftRule>,
    #[serde(default)]
    pub dialogue_engines: Vec<CraftRule>,
    #[serde(default)]
    pub info_control: Vec<String>,
    #[serde(default)]
    pub chapter_ending_hooks: Vec<String>,
    #[serde(default)]
    pub forbidden_habits: Vec<String>,
    #[serde(default)]
    pub narration_stance: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CraftRule {
    /// Executable constraint the new book should obey.
    pub rule: String,
    /// Why it matters structurally.
    #[serde(default)]
    pub why: String,
    pub evidence: CraftEvidence,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CraftEvidence {
    #[serde(alias = "chapter_index")]
    pub chapter_index: u32,
    /// Short quote proving the pattern exists — NOT a style sample to copy.
    pub quote: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SettingCard {
    #[serde(default)]
    pub conflict_axes: Vec<String>,
    #[serde(default)]
    pub worldframe_type: String,
    #[serde(default)]
    pub power_system_type: String,
    #[serde(default)]
    pub stakes_currency: Vec<String>,
    #[serde(default)]
    pub taboo_transfers: Vec<String>,
    #[serde(default)]
    pub notes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AntiPlagiarismCard {
    #[serde(default)]
    pub banned_names: Vec<String>,
    #[serde(default)]
    pub banned_setpieces: Vec<String>,
    #[serde(default)]
    pub rewrite_mandates: Vec<String>,
    #[serde(default)]
    pub review_checklist: Vec<String>,
}

pub fn parse_imitate_cards_json(raw: &str) -> Result<ImitateCards> {
    let trimmed = raw.trim();
    let candidates = json_candidates(trimmed);
    if candidates.is_empty() {
        bail!("Agent 输出中未找到 JSON 对象");
    }

    let mut last_err = None;
    for candidate in candidates {
        match try_parse_candidate(&candidate) {
            Ok(cards) => return validate_cards(cards),
            Err(err) => last_err = Some(err),
        }
    }
    let snippet = trimmed.chars().take(240).collect::<String>();
    bail!(
        "无法解析仿写卡 JSON: {}；原文开头: {}",
        last_err.unwrap_or_else(|| "unknown".into()),
        snippet.replace('\n', "\\n")
    )
}

fn try_parse_candidate(candidate: &str) -> Result<ImitateCards, String> {
    let cleaned = sanitize_llm_json(candidate);
    // Reject legacy v1/v2 shapes early with a clear message if they parse as other roots.
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&cleaned) {
        if v.get("storyline").is_none() || v.get("characters").is_none() || v.get("craft").is_none()
        {
            return Err(
                "需要 schema v3：必须包含 storyline / characters / craft（旧版 setting+style 已废弃）"
                    .into(),
            );
        }
    }
    serde_json::from_str::<ImitateCards>(&cleaned).map_err(|e| e.to_string())
}

fn validate_cards(mut cards: ImitateCards) -> Result<ImitateCards> {
    if cards.schema_version < 3 {
        cards.schema_version = 3;
    }
    if cards.storyline.throughline.trim().is_empty()
        && cards.storyline.acts.is_empty()
        && cards.storyline.escalation_ladder.is_empty()
    {
        bail!("storyline 不能为空：需要 throughline / acts / escalationLadder 至少一项");
    }
    if cards.characters.len() < 2 {
        bail!("characters 至少需要 2 张人物卡（用角色A/B 占位，禁止原名）");
    }
    for ch in &cards.characters {
        if ch.slot.trim().is_empty() {
            bail!("人物卡缺少 slot");
        }
        if looks_like_proper_name(&ch.slot) {
            bail!("人物 slot 必须是占位（角色A/对手B），不能是原作姓名: {}", ch.slot);
        }
        if ch.voice_rules.is_empty() && ch.arc_stages.is_empty() {
            bail!("人物卡 {} 需要 voiceRules 或 arcStages", ch.slot);
        }
    }
    let craft_rules = cards.craft.prose_engines.len() + cards.craft.dialogue_engines.len();
    if craft_rules == 0 {
        bail!("craft 需要至少一条 proseEngines 或 dialogueEngines");
    }
    for rule in cards
        .craft
        .prose_engines
        .iter()
        .chain(cards.craft.dialogue_engines.iter())
    {
        if rule.rule.trim().is_empty() {
            bail!("存在空的 craft rule");
        }
        if rule.evidence.quote.chars().count() > 80 {
            bail!("evidence.quote 过长（仅作取证，禁止当仿写范文）");
        }
        if is_fluff_rule(&rule.rule) {
            bail!("写法引擎不能是空话: {}", rule.rule);
        }
    }
    if cards.anti_plagiarism.rewrite_mandates.is_empty()
        && cards.anti_plagiarism.review_checklist.is_empty()
    {
        bail!("antiPlagiarism 需要 rewriteMandates 或 reviewChecklist");
    }
    Ok(cards)
}

fn looks_like_proper_name(slot: &str) -> bool {
    let s = slot.trim();
    if s.starts_with("角色")
        || s.starts_with("对手")
        || s.starts_with("配角")
        || s.starts_with("引路")
        || s.starts_with("反派")
        || s.starts_with("男主")
        || s.starts_with("女主")
        || s.chars().next().is_some_and(|c| c.is_ascii_alphabetic())
            && s.len() <= 2
    {
        return false;
    }
    // Chinese proper-name heuristic: 2–3 chars without role keywords.
    let chars: Vec<char> = s.chars().collect();
    (2..=4).contains(&chars.len())
        && chars.iter().all(|c| *c >= '\u{4e00}' && *c <= '\u{9fff}')
}

fn json_candidates(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    if let Some(fenced) = extract_fenced_json(text) {
        out.push(fenced);
    }
    if let Some(balanced) = extract_balanced_object(text) {
        if !out.iter().any(|existing| existing == &balanced) {
            out.push(balanced);
        }
    }
    if let (Some(start), Some(end)) = (text.find('{'), text.rfind('}')) {
        if end > start {
            let span = text[start..=end].to_string();
            if !out.iter().any(|existing| existing == &span) {
                out.push(span);
            }
        }
    }
    out
}

fn extract_fenced_json(text: &str) -> Option<String> {
    let start = text.find("```")?;
    let after = &text[start + 3..];
    let after = after
        .strip_prefix("json")
        .or_else(|| after.strip_prefix("JSON"))
        .unwrap_or(after);
    let after = after.trim_start_matches(['\r', '\n', ' ']);
    let end = after.find("```")?;
    Some(after[..end].trim().to_string())
}

fn extract_balanced_object(text: &str) -> Option<String> {
    let bytes = text.as_bytes();
    let start = text.find('{')?;
    let mut depth = 0i32;
    let mut in_string = false;
    let mut escape = false;
    for (idx, &b) in bytes.iter().enumerate().skip(start) {
        let ch = b as char;
        if in_string {
            if escape {
                escape = false;
            } else if ch == '\\' {
                escape = true;
            } else if ch == '"' {
                in_string = false;
            }
            continue;
        }
        match ch {
            '"' => in_string = true,
            '{' => depth += 1,
            '}' => {
                depth -= 1;
                if depth == 0 {
                    return Some(text[start..=idx].to_string());
                }
            }
            _ => {}
        }
    }
    None
}

fn sanitize_llm_json(input: &str) -> String {
    let mut s = input.trim().trim_start_matches('\u{feff}').to_string();
    s = s.replace(['\u{201c}', '\u{201d}'], "\"");
    s = s.replace(['\u{2018}', '\u{2019}'], "'");
    let mut out = String::with_capacity(s.len());
    let chars: Vec<char> = s.chars().collect();
    let mut i = 0;
    let mut in_string = false;
    let mut escape = false;
    while i < chars.len() {
        let ch = chars[i];
        if in_string {
            out.push(ch);
            if escape {
                escape = false;
            } else if ch == '\\' {
                escape = true;
            } else if ch == '"' {
                in_string = false;
            }
            i += 1;
            continue;
        }
        if ch == '"' {
            in_string = true;
            out.push(ch);
            i += 1;
            continue;
        }
        if ch == ',' {
            let mut j = i + 1;
            while j < chars.len() && chars[j].is_whitespace() {
                j += 1;
            }
            if j < chars.len() && (chars[j] == '}' || chars[j] == ']') {
                i += 1;
                continue;
            }
        }
        out.push(ch);
        i += 1;
    }
    out
}

fn is_fluff_rule(rule: &str) -> bool {
    const FLUFF: &[&str] = &[
        "文笔细腻",
        "节奏紧凑",
        "人物鲜明",
        "引人入胜",
        "生动形象",
        "感人至深",
        "文风独特",
        "语言优美",
    ];
    let trimmed = rule.trim();
    FLUFF
        .iter()
        .any(|f| trimmed == *f || (trimmed.contains(f) && trimmed.chars().count() <= 12))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn v3_json() -> &'static str {
        r#"{
  "schemaVersion": 3,
  "storyline": {
    "throughline": "弱势者用不可逆代价换阶段性掌控权，最终反噬规则本身",
    "acts": [
      { "name": "第一幕", "function": "建立不对等交易", "beatPatterns": ["试探性出价", "第一次反噬"] },
      { "name": "第二幕", "function": "规则内卷", "beatPatterns": ["加码代价", "同盟裂隙"] }
    ],
    "escalationLadder": ["试探", "兑现代价", "规则反噬", "改写条款"],
    "foreshadowCadence": "每2–3章推进一次长线钩子，不一次说破",
    "chapterEngines": [
      { "pattern": "信息差对峙", "purpose": "逼出隐藏筹码", "placement": "mid" }
    ],
    "mustMutate": ["交易标的", "代价形式", "反转触发条件"]
  },
  "characters": [
    {
      "slot": "角色A",
      "roleFunction": "推动交易发生的弱势方",
      "desire": "夺回议价权",
      "costOrFear": "失去最后一块自主",
      "voiceRules": ["少形容词", "威胁句短于8字", "几乎不解释动机"],
      "arcStages": ["隐忍", "试刀", "撕破脸"],
      "relationships": [{ "toSlot": "对手B", "tension": "利用与依赖" }],
      "tags": ["克制", "狠"]
    },
    {
      "slot": "对手B",
      "roleFunction": "掌握规则解释权的上位者",
      "desire": "维持规则不透明",
      "costOrFear": "被看穿底牌",
      "voiceRules": ["爱用反问", "把命令说成建议"],
      "arcStages": ["施压", "失措", "反扑"],
      "relationships": [{ "toSlot": "角色A", "tension": "猎手与猎物互换" }],
      "tags": ["从容"]
    }
  ],
  "craft": {
    "proseEngines": [
      {
        "rule": "冲突段叙述句≤12字，动作先于评价",
        "why": "保持压迫感，避免AI式总结",
        "evidence": { "chapterIndex": 1, "quote": "他往前一步。杯子晃了。" }
      }
    ],
    "dialogueEngines": [
      {
        "rule": "对峙用短问答打断，禁止一方独白超3句",
        "why": "信息在来回中泄露",
        "evidence": { "chapterIndex": 1, "quote": "「你到底想怎样？」" }
      }
    ],
    "infoControl": ["关键身份信息延后半章", "先给结果再补原因"],
    "chapterEndingHooks": ["未完成动作", "新筹码只露一角"],
    "forbiddenHabits": ["段末金句总结", "大段心理旁白解释局势"],
    "narrationStance": "紧贴角色A感知，不上帝视角全知"
  },
  "setting": {
    "conflictAxes": ["身份不对等交易"],
    "worldframeType": "都市异能",
    "powerSystemType": "契约换外力",
    "stakesCurrency": ["人情债"],
    "tabooTransfers": [],
    "notes": []
  },
  "antiPlagiarism": {
    "bannedNames": [],
    "bannedSetpieces": ["原作招牌对峙的场地+道具组合"],
    "rewriteMandates": ["新世界观壳", "新欲望对象", "新交易规则"],
    "reviewChecklist": ["能否一眼认出是某书换皮？", "人物对白是否在复读原作口吻专名？"]
  }
}"#
    }

    #[test]
    fn parses_v3() {
        let cards = parse_imitate_cards_json(v3_json()).unwrap();
        assert_eq!(cards.characters.len(), 2);
        assert!(!cards.storyline.acts.is_empty());
        assert!(!cards.craft.prose_engines.is_empty());
    }

    #[test]
    fn rejects_legacy_setting_style_only() {
        let raw = r#"{"setting":{"conflictAxes":["a"],"worldframeType":"x","relationshipTensions":[],"tabooTransfers":[],"notes":[]},"style":{"rules":[{"rule":"短对话","evidence":{"chapterIndex":0,"quote":"够了"}}],"forbidden":[],"dialogueVsNarration":""}}"#;
        assert!(parse_imitate_cards_json(raw).is_err());
    }

    #[test]
    fn rejects_real_name_slots() {
        let mut bad = v3_json().to_string();
        bad = bad.replace("\"slot\": \"角色A\"", "\"slot\": \"林深\"");
        assert!(parse_imitate_cards_json(&bad).is_err());
    }

    #[test]
    fn rejects_fluff_craft() {
        let mut bad = v3_json().to_string();
        bad = bad.replace(
            "冲突段叙述句≤12字，动作先于评价",
            "文笔细腻",
        );
        assert!(parse_imitate_cards_json(&bad).is_err());
    }
}
