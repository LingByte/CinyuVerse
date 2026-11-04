use super::{AnalysisPack, fingerprint::BookFingerprint};

pub fn build_analysis_prompt(pack: &AnalysisPack) -> String {
    let mut body = String::new();
    body.push_str(
        "你是小说仿写分析器。根据抽样章节抽出可迁移的「设定卡」与「手法/风格卡」。\n\
         硬性要求：\n\
         1. 只输出一个 JSON 对象；不要前言、后记、markdown 围栏外的解释。\n\
         1b. 必须是严格 JSON：双引号键名、禁止尾逗号、禁止注释。\n\
         2. 设定卡只保留可迁移轴（冲突类型、力量体系类型、关系张力类型等），专名用角色A/地点B 等占位。\n\
         3. 手法规则必须可执行（句式、信息释放、对话配比、禁忌），禁止「文笔细腻」「节奏紧凑」等空话当结论。\n\
         4. 每条 style.rules[] 必须带 evidence：{ chapterIndex, quote }，quote ≤40 字，来自抽样原文。\n\
         5. 不要复述完整剧情，不要抄大段原文到设定卡。\n\n",
    );
    body.push_str("JSON schema:\n");
    body.push_str(
        r#"{
  "setting": {
    "conflictAxes": ["string"],
    "worldframeType": "string",
    "relationshipTensions": ["string"],
    "tabooTransfers": ["string"],
    "notes": ["string"]
  },
  "style": {
    "rules": [
      {
        "rule": "string",
        "evidence": { "chapterIndex": 0, "quote": "string" }
      }
    ],
    "forbidden": ["string"],
    "dialogueVsNarration": "string"
  }
}
"#,
    );
    body.push('\n');
    body.push_str(&format_fingerprint(&pack.fingerprint));
    body.push_str("\n抽样章节：\n");
    for sample in &pack.samples {
        body.push_str(&format!(
            "\n--- 第{}章 {} ---\n{}\n",
            sample.index, sample.title, sample.text
        ));
    }
    body
}

fn format_fingerprint(fp: &BookFingerprint) -> String {
    format!(
        "计量指纹（Host 计算，供约束，勿改写成空话）：\n\
         - chapters: {}\n\
         - avgSentenceChars: {:.1}\n\
         - dialogueRatio: {:.3}\n\
         - shortSentenceRatio: {:.3}\n\
         - questionMarkPer1k: {:.2}\n\
         - ellipsisPer1k: {:.2}\n",
        fp.chapter_count,
        fp.avg_sentence_chars,
        fp.dialogue_ratio,
        fp.short_sentence_ratio,
        fp.question_mark_per_1k,
        fp.ellipsis_per_1k
    )
}
