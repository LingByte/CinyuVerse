use serde::{Deserialize, Serialize};

const FULL_SAMPLE_THRESHOLD: usize = 15;
const TARGET_SAMPLES: usize = 10;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SamplePlan {
    pub sample_indexes: Vec<u32>,
    pub holdout_index: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChapterSample {
    pub index: u32,
    pub title: String,
    pub text: String,
}

pub fn select_sample_plan(chapters: &[(u32, String, String)]) -> SamplePlan {
    if chapters.is_empty() {
        return SamplePlan {
            sample_indexes: Vec::new(),
            holdout_index: None,
        };
    }

    let indexes: Vec<u32> = chapters.iter().map(|(i, _, _)| *i).collect();
    if chapters.len() <= FULL_SAMPLE_THRESHOLD {
        let holdout = if chapters.len() >= 3 {
            Some(indexes[chapters.len() / 2])
        } else {
            None
        };
        let samples = indexes
            .into_iter()
            .filter(|i| Some(*i) != holdout)
            .collect();
        return SamplePlan {
            sample_indexes: samples,
            holdout_index: holdout,
        };
    }

    let holdout = indexes[chapters.len() / 2];
    let mut ranked: Vec<(u32, f64)> = chapters
        .iter()
        .map(|(index, _, text)| (*index, dialogue_density(text)))
        .collect();
    ranked.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

    let mut selected = Vec::new();
    // Head / middle-adjacent / tail anchors.
    for candidate in [
        indexes.first().copied(),
        indexes.get(chapters.len() / 3).copied(),
        indexes.get((chapters.len() * 2) / 3).copied(),
        indexes.last().copied(),
    ]
    .into_iter()
    .flatten()
    {
        push_unique(&mut selected, candidate, holdout);
    }

    for (index, _) in ranked {
        if selected.len() >= TARGET_SAMPLES {
            break;
        }
        push_unique(&mut selected, index, holdout);
    }

    selected.sort_unstable();
    SamplePlan {
        sample_indexes: selected,
        holdout_index: Some(holdout),
    }
}

fn dialogue_density(text: &str) -> f64 {
    let total = text.chars().count().max(1) as f64;
    let dialogue = text
        .chars()
        .filter(|c| matches!(c, '「' | '」' | '"' | '“' | '”'))
        .count() as f64;
    dialogue / total
}

fn push_unique(selected: &mut Vec<u32>, index: u32, holdout: u32) {
    if index == holdout || selected.contains(&index) {
        return;
    }
    selected.push(index);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn small_books_keep_holdout_out_of_samples() {
        let chapters: Vec<(u32, String, String)> = (0..5)
            .map(|i| (i, format!("c{i}"), format!("text {i} 「对话」")))
            .collect();
        let plan = select_sample_plan(&chapters);
        assert!(plan.holdout_index.is_some());
        assert!(!plan
            .sample_indexes
            .contains(&plan.holdout_index.unwrap()));
    }

    #[test]
    fn large_books_cap_sample_count() {
        let chapters: Vec<(u32, String, String)> = (0..40)
            .map(|i| {
                let dialogue = if i % 3 == 0 { "「多对话」".repeat(20) } else { "叙述。".into() };
                (i, format!("c{i}"), dialogue)
            })
            .collect();
        let plan = select_sample_plan(&chapters);
        assert!(plan.sample_indexes.len() <= TARGET_SAMPLES);
        assert!(plan.holdout_index.is_some());
    }
}
