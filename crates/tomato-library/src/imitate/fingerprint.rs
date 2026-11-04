use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookFingerprint {
    pub chapter_count: u32,
    pub total_chars: u64,
    pub avg_chapter_chars: f64,
    pub avg_sentence_chars: f64,
    pub dialogue_ratio: f64,
    pub avg_paragraph_chars: f64,
    pub question_mark_per_1k: f64,
    pub ellipsis_per_1k: f64,
    pub short_sentence_ratio: f64,
}

pub fn compute_fingerprint(chapters: &[(u32, String, String)]) -> BookFingerprint {
    let chapter_count = chapters.len() as u32;
    let mut total_chars = 0u64;
    let mut sentence_lens = Vec::new();
    let mut paragraph_lens = Vec::new();
    let mut dialogue_chars = 0u64;
    let mut question_marks = 0u64;
    let mut ellipses = 0u64;

    for (_, _, text) in chapters {
        let chars = text.chars().count() as u64;
        total_chars = total_chars.saturating_add(chars);

        for para in text.split("\n\n").map(str::trim).filter(|p| !p.is_empty()) {
            paragraph_lens.push(para.chars().count());
            let is_dialogue = para.contains('「')
                || para.contains('」')
                || para.contains('"')
                || para.contains('“')
                || para.contains('”');
            if is_dialogue {
                dialogue_chars = dialogue_chars.saturating_add(para.chars().count() as u64);
            }
            for sentence in split_sentences(para) {
                let len = sentence.chars().count();
                if len > 0 {
                    sentence_lens.push(len);
                }
            }
        }

        question_marks += text.chars().filter(|c| *c == '？' || *c == '?').count() as u64;
        ellipses += count_ellipses(text);
    }

    let avg_chapter_chars = if chapter_count == 0 {
        0.0
    } else {
        total_chars as f64 / chapter_count as f64
    };
    let avg_sentence_chars = mean(&sentence_lens);
    let avg_paragraph_chars = mean(&paragraph_lens);
    let dialogue_ratio = if total_chars == 0 {
        0.0
    } else {
        dialogue_chars as f64 / total_chars as f64
    };
    let per_1k = if total_chars == 0 {
        0.0
    } else {
        1000.0 / total_chars as f64
    };
    let short_sentence_ratio = if sentence_lens.is_empty() {
        0.0
    } else {
        sentence_lens.iter().filter(|&&len| len <= 12).count() as f64 / sentence_lens.len() as f64
    };

    BookFingerprint {
        chapter_count,
        total_chars,
        avg_chapter_chars,
        avg_sentence_chars,
        dialogue_ratio,
        avg_paragraph_chars,
        question_mark_per_1k: question_marks as f64 * per_1k,
        ellipsis_per_1k: ellipses as f64 * per_1k,
        short_sentence_ratio,
    }
}

fn mean(values: &[usize]) -> f64 {
    if values.is_empty() {
        return 0.0;
    }
    values.iter().sum::<usize>() as f64 / values.len() as f64
}

fn split_sentences(para: &str) -> Vec<&str> {
    let mut out = Vec::new();
    let mut start = 0;
    for (idx, ch) in para.char_indices() {
        if matches!(ch, '。' | '！' | '？' | '!' | '?' | '…') {
            let end = idx + ch.len_utf8();
            let piece = para[start..end].trim();
            if !piece.is_empty() {
                out.push(piece);
            }
            start = end;
        }
    }
    let rest = para[start..].trim();
    if !rest.is_empty() {
        out.push(rest);
    }
    out
}

fn count_ellipses(text: &str) -> u64 {
    let mut count = 0u64;
    let chars: Vec<char> = text.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '…' {
            count += 1;
            i += 1;
            continue;
        }
        if chars[i] == '.' {
            let mut n = 0;
            while i + n < chars.len() && chars[i + n] == '.' {
                n += 1;
            }
            if n >= 3 {
                count += 1;
                i += n;
                continue;
            }
        }
        i += 1;
    }
    count
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn computes_dialogue_ratio() {
        let chapters = vec![(
            0u32,
            "t".into(),
            "「你好。」他说。\n\n夜色很深。".into(),
        )];
        let fp = compute_fingerprint(&chapters);
        assert_eq!(fp.chapter_count, 1);
        assert!(fp.dialogue_ratio > 0.0);
        assert!(fp.total_chars > 0);
    }
}
