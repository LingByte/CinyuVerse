use anyhow::{Result, bail};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImitateCards {
    pub setting: SettingCard,
    pub style: StyleCard,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingCard {
    #[serde(default, alias = "conflict_axes")]
    pub conflict_axes: Vec<String>,
    #[serde(default, alias = "worldframe_type")]
    pub worldframe_type: String,
    #[serde(default, alias = "relationship_tensions")]
    pub relationship_tensions: Vec<String>,
    #[serde(default, alias = "taboo_transfers")]
    pub taboo_transfers: Vec<String>,
    #[serde(default)]
    pub notes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StyleCard {
    #[serde(default)]
    pub rules: Vec<StyleRule>,
    #[serde(default)]
    pub forbidden: Vec<String>,
    #[serde(default, alias = "dialogue_vs_narration")]
    pub dialogue_vs_narration: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StyleRule {
    pub rule: String,
    pub evidence: StyleEvidence,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StyleEvidence {
    #[serde(alias = "chapter_index")]
    pub chapter_index: u32,
    pub quote: String,
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
    serde_json::from_str::<ImitateCards>(&cleaned).map_err(|e| e.to_string())
}

fn validate_cards(cards: ImitateCards) -> Result<ImitateCards> {
    if cards.style.rules.is_empty() {
        bail!("style.rules 不能为空");
    }
    for rule in &cards.style.rules {
        if rule.rule.trim().is_empty() {
            bail!("存在空的 style rule");
        }
        if rule.evidence.quote.chars().count() > 80 {
            bail!("evidence.quote 过长");
        }
        if is_fluff_rule(&rule.rule) {
            bail!("手法规则不能是空话: {}", rule.rule);
        }
    }
    Ok(cards)
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
    // Fallback: first `{` .. last `}`
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

/// Brace-balanced object extraction so trailing prose after JSON is ignored.
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

/// Common LLM JSON cleanup: BOM, trailing commas, smart quotes.
fn sanitize_llm_json(input: &str) -> String {
    let mut s = input.trim().trim_start_matches('\u{feff}').to_string();
    s = s.replace(['\u{201c}', '\u{201d}'], "\"");
    s = s.replace(['\u{2018}', '\u{2019}'], "'");
    // Remove trailing commas before } or ]
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
    ];
    let trimmed = rule.trim();
    FLUFF
        .iter()
        .any(|f| trimmed == *f || (trimmed.contains(f) && trimmed.chars().count() <= 12))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_fenced_json() {
        let raw = r#"```json
{"setting":{"conflictAxes":["权斗"],"worldframeType":"都市异能","relationshipTensions":[],"tabooTransfers":[],"notes":[]},"style":{"rules":[{"rule":"冲突段短句≤12字","evidence":{"chapterIndex":1,"quote":"「你到底想怎样？」"}}],"forbidden":[],"dialogueVsNarration":"对峙以对话推进"}}
```"#;
        let cards = parse_imitate_cards_json(raw).unwrap();
        assert_eq!(cards.style.rules.len(), 1);
    }

    #[test]
    fn rejects_fluff_rules() {
        let raw = r#"{"setting":{"conflictAxes":[],"worldframeType":"","relationshipTensions":[],"tabooTransfers":[],"notes":[]},"style":{"rules":[{"rule":"文笔细腻","evidence":{"chapterIndex":0,"quote":"abc"}}],"forbidden":[],"dialogueVsNarration":""}}"#;
        assert!(parse_imitate_cards_json(raw).is_err());
    }

    #[test]
    fn tolerates_trailing_comma_and_prose() {
        let raw = r#"好的，这是结果：
{
  "setting": {
    "conflictAxes": ["身份对立"],
    "worldframeType": "都市异能",
    "relationshipTensions": ["师徒"],
    "tabooTransfers": [],
    "notes": [],
  },
  "style": {
    "rules": [
      {
        "rule": "对峙用短对话打断叙述",
        "evidence": { "chapterIndex": 2, "quote": "「你到底想怎样？」" },
      },
    ],
    "forbidden": ["大段心理旁白"],
    "dialogueVsNarration": "冲突以对话推进",
  }
}
以上仅供参考。"#;
        let cards = parse_imitate_cards_json(raw).unwrap();
        assert_eq!(cards.style.rules.len(), 1);
        assert_eq!(cards.setting.worldframe_type, "都市异能");
    }

    #[test]
    fn tolerates_smart_quotes_in_wrapper() {
        let raw = "{\n  \"setting\": {\n    \"conflictAxes\": [\"a\"],\n    \"worldframeType\": \"x\",\n    \"relationshipTensions\": [],\n    \"tabooTransfers\": [],\n    \"notes\": []\n  },\n  \"style\": {\n    \"rules\": [{\n      \"rule\": \"章末用未完成动作收束\",\n      \"evidence\": {\"chapterIndex\": 0, \"quote\": \"门没有关严\"}\n    }],\n    \"forbidden\": [],\n    \"dialogueVsNarration\": \"叙述略多于对话\"\n  }\n}";
        assert!(parse_imitate_cards_json(raw).is_ok());
    }
}
