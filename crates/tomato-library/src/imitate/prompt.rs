use super::{AnalysisPack, fingerprint::BookFingerprint};

pub fn build_analysis_prompt(pack: &AnalysisPack) -> String {
    let mut body = String::new();
    body.push_str(
        "你是长篇网文的「结构与人物拆解器」。\n\
         任务：从抽样正文抽出可迁移的 **故事线骨架 + 人物卡 + 写法引擎**，\
         用来开一本新书——不是让模型「照着范文仿写」。\n\n\
         ## 为什么禁止范文仿写\n\
         - 把原文段落当 style sample 喂给 LLM，生成物仍是 AI 腔，学不到作者结构实力。\n\
         - evidence.quote 只用于**证明某条引擎存在**，禁止写成「请模仿这段文字」。\n\
         - 可迁移的是：故事线阶梯、人物欲望/声音规则、信息控制与对白机械——不是词藻。\n\n\
         ## 硬性要求\n\
         1. 只输出一个 JSON 对象；不要围栏外解释。严格 JSON，双引号，无尾逗号。\n\
         2. 人物一律用 角色A/对手B/配角C 等 slot，原名放进 antiPlagiarism.bannedNames。\n\
         3. storyline 写模式与节拍型，禁止章对章剧情复述，禁止可直接照抄的事件表。\n\
         4. characters ≥ 2；每人要有 desire、voiceRules（可执行）或 arcStages。\n\
         5. craft.proseEngines / dialogueEngines 的 rule 必须可执行（有数字、对比、禁止项），\
            禁止「文笔细腻」「节奏紧凑」；每条带 ≤40 字 quote 取证。\n\
         6. antiPlagiarism 必须有 rewriteMandates 与 reviewChecklist。\n\n",
    );
    body.push_str("JSON schema:\n");
    body.push_str(
        r#"{
  "schemaVersion": 3,
  "storyline": {
    "throughline": "string — 可迁移主线模式，无人名地名",
    "acts": [
      { "name": "第一幕", "function": "string", "beatPatterns": ["string — 节拍型"] }
    ],
    "escalationLadder": ["string"],
    "foreshadowCadence": "string",
    "chapterEngines": [
      { "pattern": "string", "purpose": "string", "placement": "opening|mid|end" }
    ],
    "mustMutate": ["string — 新书必须改掉的维度"]
  },
  "characters": [
    {
      "slot": "角色A",
      "roleFunction": "string",
      "desire": "string",
      "costOrFear": "string",
      "voiceRules": ["string — 可执行的说话/沉默规则"],
      "arcStages": ["string"],
      "relationships": [{ "toSlot": "对手B", "tension": "string" }],
      "tags": ["string"]
    }
  ],
  "craft": {
    "proseEngines": [
      {
        "rule": "string — 可执行",
        "why": "string",
        "evidence": { "chapterIndex": 0, "quote": "≤40字取证，非范文" }
      }
    ],
    "dialogueEngines": [
      {
        "rule": "string",
        "why": "string",
        "evidence": { "chapterIndex": 0, "quote": "string" }
      }
    ],
    "infoControl": ["string"],
    "chapterEndingHooks": ["string"],
    "forbiddenHabits": ["string — 含AI腔与原作不可学的坏习惯"],
    "narrationStance": "string"
  },
  "setting": {
    "conflictAxes": ["string"],
    "worldframeType": "string",
    "powerSystemType": "string",
    "stakesCurrency": ["string"],
    "tabooTransfers": ["string"],
    "notes": ["string"]
  },
  "antiPlagiarism": {
    "bannedNames": ["string"],
    "bannedSetpieces": ["string"],
    "rewriteMandates": ["string"],
    "reviewChecklist": ["string"]
  }
}
"#,
    );
    body.push('\n');
    body.push_str(&format_fingerprint(&pack.fingerprint));
    if !pack.scenes.is_empty() {
        body.push_str("\n场景类型抽样（已脱敏，只看类型配比）：\n");
        for scene in pack.scenes.iter().take(12) {
            body.push_str(&format!(
                "- [{}] ch{}: {}\n",
                scene.scene_type, scene.chapter_index, scene.text
            ));
        }
    }
    body.push_str(
        "\n抽样章节（供你拆结构与人物；不要输出仿写范文，不要鼓励模仿原文词句）：\n",
    );
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
        "Host 计量指纹（约束 craft，勿改写成空话）：\n\
         - chapters: {}\n\
         - avgSentenceChars: {:.1}\n\
         - dialogueRatio: {:.3}\n\
         - shortSentenceRatio: {:.3}\n\
         - questionMarkPer1k: {:.2}\n\
         - ellipsisPer1k: {:.2}\n\
         写法引擎应能解释这些数字，而不是无视它们。\n",
        fp.chapter_count,
        fp.avg_sentence_chars,
        fp.dialogue_ratio,
        fp.short_sentence_ratio,
        fp.question_mark_per_1k,
        fp.ellipsis_per_1k
    )
}
