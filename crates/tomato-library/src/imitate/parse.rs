use anyhow::{Result, bail};
use serde::{Deserialize, Serialize};

/// Deep-analysis transfer pack.
///
/// Goal: extract **imitable** plot devices, character voice, and craft —
/// not empty universal templates, and not fingerprint-metric quotas.
/// Banned: source proper nouns and trademark setpieces. Allowed: structure & craft imitation.
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
    5
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct StorylineCard {
    #[serde(default)]
    pub throughline: String,
    /// Book-specific inventions (setting devices / unique plot machines).
    #[serde(default)]
    pub signature_devices: Vec<String>,
    #[serde(default)]
    pub acts: Vec<StoryAct>,
    #[serde(default)]
    pub escalation_ladder: Vec<String>,
    #[serde(default)]
    pub foreshadow_cadence: String,
    #[serde(default)]
    pub chapter_engines: Vec<ChapterEngine>,
    #[serde(default)]
    pub must_mutate: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct StoryAct {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub function: String,
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
    /// Real name from the book (e.g. 米汤). Legacy JSON used `slot`.
    #[serde(default, alias = "slot")]
    pub name: String,
    #[serde(default)]
    pub role_function: String,
    #[serde(default)]
    pub desire: String,
    #[serde(default)]
    pub cost_or_fear: String,
    #[serde(default)]
    pub voice_traits: Vec<String>,
    #[serde(default)]
    pub voice_samples: Vec<String>,
    #[serde(default)]
    pub voice_rules: Vec<String>,
    /// Concrete experiences from the source book.
    #[serde(default)]
    pub key_events: Vec<String>,
    #[serde(default)]
    pub arc_stages: Vec<String>,
    #[serde(default)]
    pub relationships: Vec<CharacterRelation>,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CharacterRelation {
    #[serde(default, alias = "toSlot")]
    pub to_name: String,
    #[serde(default)]
    pub tension: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CraftCard {
    #[serde(default)]
    pub narration_stance: String,
    /// Practical "how to imitate this book" notes.
    #[serde(default)]
    pub how_to_imitate: Vec<String>,
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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CraftRule {
    pub rule: String,
    #[serde(default)]
    pub why: String,
    pub evidence: CraftEvidence,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CraftEvidence {
    #[serde(alias = "chapter_index")]
    pub chapter_index: u32,
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
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&cleaned) {
        if v.get("storyline").is_none() || v.get("characters").is_none() || v.get("craft").is_none()
        {
            return Err(
                "需要 storyline / characters / craft（旧版 setting+style 已废弃）".into(),
            );
        }
    }
    serde_json::from_str::<ImitateCards>(&cleaned).map_err(|e| e.to_string())
}

fn validate_cards(mut cards: ImitateCards) -> Result<ImitateCards> {
    if cards.schema_version < 5 {
        cards.schema_version = 5;
    }
    if cards.storyline.throughline.trim().is_empty() {
        bail!("storyline.throughline 不能为空");
    }
    if is_generic_throughline(&cards.storyline.throughline) {
        bail!(
            "throughline 过于空泛，请写本书真实主线（可含人名/设定）: {}",
            cards.storyline.throughline.chars().take(40).collect::<String>()
        );
    }
    if cards.storyline.signature_devices.len() < 3 {
        bail!("storyline.signatureDevices 至少 3 条本书独特装置");
    }
    if cards.storyline.acts.len() < 3 {
        bail!("storyline.acts 至少 3 幕");
    }
    for act in &cards.storyline.acts {
        if act.beat_patterns.is_empty() {
            bail!("幕「{}」缺少 beatPatterns", act.name);
        }
        for beat in &act.beat_patterns {
            if is_generic_beat(beat) {
                bail!("节拍过于万能，请写书中真实情节: {}", beat);
            }
        }
    }
    if cards.characters.len() < 2 {
        bail!("characters 至少需要 2 张人物卡");
    }
    if cards.characters.len() > 12 {
        bail!("人物卡过多（{}），请收敛到主要人物", cards.characters.len());
    }
    for ch in &cards.characters {
        if ch.name.trim().is_empty() {
            bail!("人物卡缺少 name（请用书中真名）");
        }
        if is_placeholder_name(&ch.name) {
            bail!(
                "禁止占位名「{}」，请用书中真实姓名（如米汤）",
                ch.name
            );
        }
        let has_substance = !ch.voice_traits.is_empty()
            || !ch.voice_samples.is_empty()
            || !ch.key_events.is_empty()
            || !ch.arc_stages.is_empty()
            || !ch.voice_rules.is_empty();
        if !has_substance {
            bail!(
                "人物卡 {} 需要 voiceTraits / voiceSamples / keyEvents / arcStages 之一",
                ch.name
            );
        }
        for rule in &ch.voice_rules {
            if is_metric_or_compliance_rule(rule) {
                bail!("人物声音禁止计量/合规清单: {}", rule);
            }
        }
        for sample in &ch.voice_samples {
            if sample.chars().count() > 40 {
                bail!("voiceSamples 过长（≤40 字）: {}", ch.name);
            }
        }
        for rel in &ch.relationships {
            if is_placeholder_name(&rel.to_name) {
                bail!("关系对象禁止占位名: {}", rel.to_name);
            }
        }
    }
    let craft_rules = cards.craft.prose_engines.len() + cards.craft.dialogue_engines.len();
    if craft_rules == 0 && cards.craft.how_to_imitate.is_empty() {
        bail!("craft 需要 proseEngines/dialogueEngines 或 howToImitate");
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
        if rule.evidence.quote.chars().count() > 120 {
            bail!("evidence.quote 过长（≤120 字取证）");
        }
        if is_fluff_rule(&rule.rule) {
            bail!("写法不能是空话: {}", rule.rule);
        }
        if is_metric_or_compliance_rule(&rule.rule) {
            bail!("写法禁止计量指纹条款: {}", rule.rule);
        }
    }
    // antiPlagiarism is optional — user treats it as low priority.
    Ok(cards)
}

fn is_placeholder_name(name: &str) -> bool {
    let s = name.trim();
    s.starts_with("角色")
        || s.starts_with("对手")
        || s.starts_with("配角")
        || s.starts_with("引路")
        || s.starts_with("反派")
        || s.starts_with("男主")
        || s.starts_with("女主")
        || s.eq_ignore_ascii_case("character")
        || s.eq_ignore_ascii_case("slot")
}

fn is_metric_or_compliance_rule(text: &str) -> bool {
    let t = text.trim();
    const NEEDLES: &[&str] = &[
        "每100",
        "每1000",
        "每500",
        "每150",
        "每250",
        "每300",
        "每800",
        "每千字",
        "问号",
        "省略号",
        "shortSentence",
        "dialogueRatio",
        "连续三次",
        "最多两次",
        "每轮发言不超过",
    ];
    if NEEDLES.iter().any(|n| t.contains(n)) {
        return true;
    }
    // 「每N句/每N字」密度条款
    let chars: Vec<char> = t.chars().collect();
    for i in 0..chars.len() {
        if chars[i] == '每' {
            let mut j = i + 1;
            let mut saw_digit = false;
            while j < chars.len() && chars[j].is_ascii_digit() {
                saw_digit = true;
                j += 1;
            }
            if saw_digit && j < chars.len() && (chars[j] == '字' || chars[j] == '句') {
                return true;
            }
        }
    }
    false
}

fn is_generic_throughline(text: &str) -> bool {
    const GENERIC: &[&str] = &[
        "扩大视野",
        "不可逆的选择",
        "个人安全、群体责任",
        "资源枯竭",
        "最终必须在",
        "普通人在灾难中成长",
    ];
    let t = text.trim();
    if t.chars().count() > 80 && GENERIC.iter().any(|g| t.contains(g)) {
        return true;
    }
    GENERIC.iter().filter(|g| t.contains(*g)).count() >= 2
}

fn is_generic_beat(beat: &str) -> bool {
    const GENERIC: &[&str] = &[
        "日常资源盘点被突发威胁打断",
        "暂时脱险却暴露更大的空间漏洞",
        "队伍必须在两个坏选项中制造第三个选项",
        "外部世界仍在呼唤",
        "聚落建立稳定日常",
    ];
    GENERIC.iter().any(|g| beat.contains(g))
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
    // NEVER map Chinese curly quotes to ASCII " — that splits JSON string values
    // (e.g. quote: "……从“贩人”变成了“造怪”……"). Use corner brackets instead.
    s = s.replace('\u{201c}', "「").replace('\u{201d}', "」");
    s = s.replace('\u{2018}', "'").replace('\u{2019}', "'");
    let mut out = String::with_capacity(s.len());
    let chars: Vec<char> = s.chars().collect();
    let mut i = 0;
    let mut in_string = false;
    let mut escape = false;
    while i < chars.len() {
        let ch = chars[i];
        if in_string {
            // Escape raw newlines/tabs that LLMs sometimes emit inside strings.
            if !escape && (ch == '\n' || ch == '\r' || ch == '\t') {
                out.push_str(match ch {
                    '\n' => "\\n",
                    '\r' => "\\r",
                    _ => "\\t",
                });
                i += 1;
                continue;
            }
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

    fn v5_json() -> &'static str {
        r#"{
  "schemaVersion": 5,
  "storyline": {
    "throughline": "米汤带着甘露婷等人在阳京尸潮里求生，发现肾化异变可被组织收编利用",
    "signatureDevices": ["肾化异变可被收编", "日常物件改战具", "半真审讯逼供"],
    "acts": [
      { "name": "一", "function": "立足", "beatPatterns": ["米汤用火腿肠比划撤离路线", "新幸存者换空间主权"] },
      { "name": "二", "function": "人祸", "beatPatterns": ["敌方用通道人质诱饵", "牺牲边缘成员清场"] },
      { "name": "三", "function": "异变", "beatPatterns": ["追踪矛盾痕迹", "低成本实验验证肾化规则"] }
    ],
    "escalationLadder": ["缺水缺武器", "庇护所失守", "组织收编异变体"],
    "foreshadowCadence": "异常表型先当怪谈，隔章用实验打脸",
    "chapterEngines": [
      { "pattern": "搜刮中途改计划", "purpose": "关系或风险跳变", "placement": "mid" }
    ],
    "mustMutate": []
  },
  "characters": [
    {
      "name": "米汤",
      "roleFunction": "一线决策",
      "desire": "保住身边人活下去",
      "costOrFear": "亲人被当成材料",
      "voiceTraits": ["先报动作再补理由", "粗口夹在行动里"],
      "voiceSamples": ["那怎么办？走楼梯？"],
      "voiceRules": [],
      "keyEvents": ["高层住宅突围", "拒绝北上广播"],
      "arcStages": ["躲灾", "算计", "拒当新支配者"],
      "relationships": [{ "toName": "甘露婷", "tension": "伴侣与并肩作战" }],
      "tags": ["口语"]
    },
    {
      "name": "甘露婷",
      "roleFunction": "近身伙伴",
      "desire": "不被当附属",
      "costOrFear": "失去退出权",
      "voiceTraits": ["先说失败条件"],
      "voiceSamples": [],
      "voiceRules": [],
      "keyEvents": ["与米汤共同验证方案"],
      "arcStages": ["保持距离", "主动分担风险"],
      "relationships": [],
      "tags": []
    }
  ],
  "craft": {
    "narrationStance": "第一人称近身，口语怀疑",
    "howToImitate": ["战斗微节拍：感官→身体→选择→反馈"],
    "proseEngines": [
      {
        "rule": "冲突段动作先于评价，物件至少改一次路线",
        "why": "现场可读",
        "evidence": { "chapterIndex": 1, "quote": "我拿起一根火腿肠，在地上比划着。" }
      }
    ],
    "dialogueEngines": [
      {
        "rule": "战术对白按提案→追问→反例→修正",
        "why": "计划当场变形",
        "evidence": { "chapterIndex": 1, "quote": "那怎么办？走楼梯？" }
      }
    ],
    "infoControl": ["异常先给可见特征"],
    "chapterEndingHooks": ["目标改道或代价确认"],
    "forbiddenHabits": ["段末金句"]
  },
  "setting": {
    "conflictAxes": ["异变体当资源"],
    "worldframeType": "灾后求生",
    "powerSystemType": "肾化感染",
    "stakesCurrency": ["撤离路线"],
    "tabooTransfers": [],
    "notes": []
  },
  "antiPlagiarism": {
    "bannedNames": [],
    "bannedSetpieces": [],
    "rewriteMandates": [],
    "reviewChecklist": []
  }
}"#
    }

    #[test]
    fn parses_v5_real_names() {
        let cards = parse_imitate_cards_json(v5_json()).unwrap();
        assert_eq!(cards.schema_version, 5);
        assert_eq!(cards.characters[0].name, "米汤");
        assert!(!cards.characters[0].key_events.is_empty());
    }

    #[test]
    fn accepts_legacy_slot_as_name() {
        let mut raw = v5_json().to_string();
        raw = raw.replace("\"name\": \"米汤\"", "\"slot\": \"米汤\"");
        let cards = parse_imitate_cards_json(&raw).unwrap();
        assert_eq!(cards.characters[0].name, "米汤");
    }

    #[test]
    fn rejects_legacy_setting_style_only() {
        let raw = r#"{"setting":{"conflictAxes":["a"],"worldframeType":"x","relationshipTensions":[],"tabooTransfers":[],"notes":[]},"style":{"rules":[{"rule":"短对话","evidence":{"chapterIndex":0,"quote":"够了"}}],"forbidden":[],"dialogueVsNarration":""}}"#;
        assert!(parse_imitate_cards_json(raw).is_err());
    }

    #[test]
    fn rejects_placeholder_names() {
        let mut bad = v5_json().to_string();
        bad = bad.replace("\"name\": \"米汤\"", "\"name\": \"配角F\"");
        assert!(parse_imitate_cards_json(&bad).is_err());
    }

    #[test]
    fn rejects_fluff_craft() {
        let mut bad = v5_json().to_string();
        bad = bad.replace(
            "冲突段动作先于评价，物件至少改一次路线",
            "文笔细腻",
        );
        assert!(parse_imitate_cards_json(&bad).is_err());
    }

    #[test]
    fn rejects_metric_craft() {
        let mut bad = v5_json().to_string();
        bad = bad.replace(
            "冲突段动作先于评价，物件至少改一次路线",
            "每1000字使用4至6个问号",
        );
        assert!(parse_imitate_cards_json(&bad).is_err());
    }

    #[test]
    fn rejects_generic_throughline() {
        let mut bad = v5_json().to_string();
        bad = bad.replace(
            "米汤带着甘露婷等人在阳京尸潮里求生，发现肾化异变可被组织收编利用",
            "一个只想保住身边小群体的普通生存者，在资源枯竭中不断被迫扩大视野，最终必须在个人安全、群体责任与亲人自主权之间做出不可逆的选择。",
        );
        assert!(parse_imitate_cards_json(&bad).is_err());
    }

    #[test]
    fn parses_chinese_curly_quotes_inside_strings() {
        let raw = r#"{
  "schemaVersion": 5,
  "storyline": {
    "throughline": "米汤对抗把活人变成“造怪”材料的势力",
    "signatureDevices": ["肾化收编", "物件改战具", "半真审讯"],
    "acts": [
      { "name": "一", "function": "立足", "beatPatterns": ["米汤突围"] },
      { "name": "二", "function": "人祸", "beatPatterns": ["人质诱饵"] },
      { "name": "三", "function": "异变", "beatPatterns": ["实验验规则"] }
    ],
    "escalationLadder": ["缺水"],
    "foreshadowCadence": "隔章",
    "chapterEngines": [],
    "mustMutate": []
  },
  "characters": [
    {"name":"米汤","roleFunction":"决策","desire":"保住身边人","costOrFear":"材料化","voiceTraits":["先动作"],"voiceSamples":[],"keyEvents":["突围"],"voiceRules":[],"arcStages":["躲"],"relationships":[],"tags":[]},
    {"name":"甘露婷","roleFunction":"伙伴","desire":"自主","costOrFear":"失退出权","voiceTraits":["冷静"],"voiceSamples":[],"keyEvents":["并肩"],"voiceRules":[],"arcStages":["并肩"],"relationships":[],"tags":[]}
  ],
  "craft": {
    "narrationStance": "近身",
    "howToImitate": ["动作先"],
    "proseEngines": [{
      "rule": "动作先于评价",
      "why": "压迫",
      "evidence": { "chapterIndex": 194, "quote": "把这个魔窟从“贩人”变成了“造怪”而已！" }
    }],
    "dialogueEngines": [],
    "infoControl": [],
    "chapterEndingHooks": [],
    "forbiddenHabits": []
  },
  "setting": {"conflictAxes":["异变"],"worldframeType":"灾后","powerSystemType":"肾化","stakesCurrency":[],"tabooTransfers":[],"notes":[]},
  "antiPlagiarism": {"bannedNames":[],"bannedSetpieces":[],"rewriteMandates":[],"reviewChecklist":[]}
}"#;
        let cards = parse_imitate_cards_json(raw).unwrap();
        assert!(cards.craft.prose_engines[0].evidence.quote.contains("造怪"));
        assert!(!cards.craft.prose_engines[0].evidence.quote.contains('"'));
    }
}
