//! Content review: banned words scan + simple OOC heuristics.

use serde::{Deserialize, Serialize};

use crate::project_meta::{load_bundle, CharacterCard};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BannedWordHit {
    pub word: String,
    pub index: usize,
    pub line: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OocWarning {
    pub character: String,
    pub message: String,
    pub snippet: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ContentCheckResult {
    pub banned_hits: Vec<BannedWordHit>,
    pub ooc_warnings: Vec<OocWarning>,
    pub word_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentCheckRequest {
    pub workspace_root: String,
    pub content: String,
    #[serde(default)]
    pub focus_characters: Vec<String>,
}

fn scan_banned(content: &str, words: &[String]) -> Vec<BannedWordHit> {
    let mut hits = vec![];
    let lines: Vec<&str> = content.lines().collect();
    let mut offset = 0;
    for (line_idx, line) in lines.iter().enumerate() {
        for word in words {
            if word.is_empty() {
                continue;
            }
            let mut search_from = 0;
            while let Some(pos) = line[search_from..].find(word) {
                hits.push(BannedWordHit {
                    word: word.clone(),
                    index: offset + search_from + pos,
                    line: line_idx + 1,
                });
                search_from += pos + word.len();
            }
        }
        offset += line.len() + 1;
    }
    hits
}

fn check_ooc(content: &str, characters: &[CharacterCard], focus: &[String]) -> Vec<OocWarning> {
    let mut warnings = vec![];
    let focus_set: Vec<String> = if focus.is_empty() {
        characters.iter().map(|c| c.name.clone()).collect()
    } else {
        focus.to_vec()
    };

    for ch in characters {
        if !focus_set.iter().any(|f| f == &ch.name) {
            continue;
        }
        if ch.name.is_empty() {
            continue;
        }
        // Heuristic: character mentioned but personality keywords absent in nearby dialogue
        if content.contains(&ch.name) && !ch.personality.is_empty() {
            let personality_tokens: Vec<&str> = ch
                .personality
                .split(|c: char| c == '、' || c == ',' || c == '，' || c == ' ')
                .filter(|s| s.len() >= 2)
                .take(3)
                .collect();
            if !personality_tokens.is_empty() {
                let any_match = personality_tokens
                    .iter()
                    .any(|t| content.contains(*t));
                if !any_match && content.len() > 200 {
                    warnings.push(OocWarning {
                        character: ch.name.clone(),
                        message: format!(
                            "片段涉及「{}」但未体现性格关键词（{}），建议核对人设",
                            ch.name,
                            personality_tokens.join("/")
                        ),
                        snippet: truncate_line(content, &ch.name),
                    });
                }
            }
        }
    }
    warnings
}

fn truncate_line(content: &str, name: &str) -> String {
    if let Some(idx) = content.find(name) {
        let start = idx.saturating_sub(40);
        let end = (idx + name.len() + 60).min(content.len());
        content[start..end].to_string()
    } else {
        content.chars().take(80).collect()
    }
}

pub fn check_content(req: &ContentCheckRequest) -> Result<ContentCheckResult, String> {
    let meta = load_bundle(&req.workspace_root)?;
    let banned_hits = scan_banned(&req.content, &meta.banned_words);
    let ooc_warnings = check_ooc(&req.content, &meta.characters, &req.focus_characters);
    Ok(ContentCheckResult {
        banned_hits,
        ooc_warnings,
        word_count: req.content.chars().count(),
    })
}

#[tauri::command]
pub fn cv_check_content(request: ContentCheckRequest) -> Result<ContentCheckResult, String> {
    check_content(&request)
}
