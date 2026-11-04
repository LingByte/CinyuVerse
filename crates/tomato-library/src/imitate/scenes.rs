use serde::{Deserialize, Serialize};

use super::sample::SamplePlan;

const MIN_SCENE_CHARS: usize = 80;
const MAX_SCENE_CHARS: usize = 200;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneSample {
    pub scene_type: String,
    pub chapter_index: u32,
    pub text: String,
}

pub fn extract_scenes(
    chapters: &[(u32, String, String)],
    plan: &SamplePlan,
) -> Vec<SceneSample> {
    let mut out = Vec::new();
    for &index in &plan.sample_indexes {
        let Some((_, _, text)) = chapters.iter().find(|(i, _, _)| *i == index) else {
            continue;
        };
        for (scene_type, snippet) in classify_snippets(text) {
            out.push(SceneSample {
                scene_type,
                chapter_index: index,
                text: snippet,
            });
            if out.len() >= 24 {
                return out;
            }
        }
    }
    out
}

fn classify_snippets(text: &str) -> Vec<(String, String)> {
    let mut out = Vec::new();
    for para in text.split("\n\n").map(str::trim).filter(|p| !p.is_empty()) {
        let snippet = take_window(para);
        if snippet.chars().count() < MIN_SCENE_CHARS {
            continue;
        }
        let scene_type = if looks_like_confrontation(para) {
            "confrontation"
        } else if looks_like_dialogue(para) {
            "dialogue"
        } else if looks_like_hook(para) {
            "hook"
        } else {
            "narration"
        };
        out.push((scene_type.into(), redact_proper_nouns(&snippet)));
        if out.len() >= 4 {
            break;
        }
    }
    out
}

fn take_window(para: &str) -> String {
    let count = para.chars().count();
    if count <= MAX_SCENE_CHARS {
        return para.to_string();
    }
    para.chars().take(MAX_SCENE_CHARS).collect()
}

fn looks_like_dialogue(para: &str) -> bool {
    para.contains('「') || para.contains('"') || para.contains('“')
}

fn looks_like_confrontation(para: &str) -> bool {
    looks_like_dialogue(para)
        && (para.contains('？')
            || para.contains('?')
            || para.contains('！')
            || para.contains('!'))
}

fn looks_like_hook(para: &str) -> bool {
    para.contains('…')
        || para.ends_with('。') && para.chars().count() <= 40
        || para.contains("忽然")
        || para.contains("却")
}

/// Light heuristic: replace runs of 2+ CJK chars that look like names after honorifics.
fn redact_proper_nouns(text: &str) -> String {
    let mut out = text.to_string();
    for (pattern, replacement) in [
        ("他说", "角色A说"),
        ("她说", "角色B说"),
        ("他问", "角色A问"),
        ("她问", "角色B问"),
    ] {
        out = out.replace(pattern, replacement);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::imitate::sample::SamplePlan;

    #[test]
    fn extracts_dialogue_scenes() {
        let long = "「你到底想怎样？」他往前一步。桌子上的杯子晃了一下，水溅到她的袖口。走廊尽头的灯忽明忽暗，脚步声越来越近，谁也没有先开口。风从窗缝挤进来，把烛火压得很低，纸页沙沙响着，像有人在门外来回踱步。";
        assert!(
            long.chars().count() >= MIN_SCENE_CHARS,
            "got {}",
            long.chars().count()
        );
        let chapters = vec![(0u32, "t".into(), format!("{long}\n\n天亮了，城门开了。"))];
        let plan = SamplePlan {
            sample_indexes: vec![0],
            holdout_index: None,
        };
        let scenes = extract_scenes(&chapters, &plan);
        assert!(!scenes.is_empty());
        assert!(
            scenes
                .iter()
                .any(|s| s.scene_type == "confrontation" || s.scene_type == "dialogue")
        );
    }
}
