use super::{AnalysisPack, fingerprint::BookFingerprint};

pub fn build_analysis_prompt(pack: &AnalysisPack) -> String {
    let mut body = String::new();
    body.push_str(
        "你是长篇网文的「可模仿拆解器」。\n\
         任务：拆出 **真实可用** 的故事线、人物卡、写法，方便写新书时借鉴模仿。\n\n\
         ## 硬规矩（之前翻车点）\n\
         - 人物必须用书中**真实姓名**（如「米汤」「甘露婷」），禁止「角色A/配角F/对手B」。\n\
         - 故事线、节拍、经历必须写**书里真实发生过的具体事**（人名+地点+事件），禁止万能鸡汤空壳。\n\
         - 写法写「怎么学它写」，禁止「每1000字几个问号」等计量条款。\n\
         - antiPlagiarism 可有可无、点到为止；不要写成半本书的禁令清单。\n\n\
         ## 要产出\n\
         1. 故事线：主线一句话点出本书独特冲突；幕内 beatPatterns 写真实情节节拍。\n\
         2. 人物卡：真名；欲望/恐惧；声口特征；短口吻样本；keyEvents 写此人真实经历。\n\
         3. 写法：howToImitate + 叙述/对白手法，带短取证。\n\n\
         ## 输出\n\
         只输出一个 JSON；schemaVersion=5；双引号；无尾逗号。\n\n",
    );
    body.push_str("JSON schema:\n");
    body.push_str(
        r#"{
  "schemaVersion": 5,
  "storyline": {
    "throughline": "一句话主线，必须含本书独特设定/人物冲突（可写真名）",
    "signatureDevices": ["本书独特装置/设定至少3条"],
    "acts": [
      {
        "name": "第一幕",
        "function": "本幕实际推进了什么",
        "beatPatterns": [
          "真实情节：谁在哪做了什么→结果（可写真名）",
          "另一条真实节拍"
        ]
      }
    ],
    "escalationLadder": ["按本书真实升级阶梯写"],
    "foreshadowCadence": "本书伏笔怎么埋/揭",
    "chapterEngines": [
      { "pattern": "常见章法", "purpose": "效果", "placement": "opening|mid|end" }
    ],
    "mustMutate": ["可选，少写"]
  },
  "characters": [
    {
      "name": "米汤",
      "roleFunction": "在故事里干什么",
      "desire": "短",
      "costOrFear": "短",
      "voiceTraits": ["听得出来的口吻"],
      "voiceSamples": ["≤40字口吻样本"],
      "voiceRules": [],
      "keyEvents": ["此人真实经历1", "经历2"],
      "arcStages": ["变化阶段"],
      "relationships": [{ "toName": "甘露婷", "tension": "关系" }],
      "tags": ["标签"]
    }
  ],
  "craft": {
    "narrationStance": "叙述立场与语气",
    "howToImitate": ["怎么学它写"],
    "proseEngines": [
      {
        "rule": "可模仿的叙述手法",
        "why": "效果",
        "evidence": { "chapterIndex": 0, "quote": "≤80字取证" }
      }
    ],
    "dialogueEngines": [
      {
        "rule": "可模仿的对白手法",
        "why": "效果",
        "evidence": { "chapterIndex": 0, "quote": "string" }
      }
    ],
    "infoControl": ["信息披露"],
    "chapterEndingHooks": ["章末钩子"],
    "forbiddenHabits": ["坏习惯，短"]
  },
  "setting": {
    "conflictAxes": ["冲突轴"],
    "worldframeType": "世界框",
    "powerSystemType": "力量/异变规则",
    "stakesCurrency": ["赌注"],
    "tabooTransfers": [],
    "notes": []
  },
  "antiPlagiarism": {
    "bannedNames": [],
    "bannedSetpieces": [],
    "rewriteMandates": [],
    "reviewChecklist": []
  }
}
"#,
    );
    body.push('\n');
    body.push_str(&format_fingerprint_hint(&pack.fingerprint));
    if !pack.scenes.is_empty() {
        body.push_str("\n场景抽样：\n");
        for scene in pack.scenes.iter().take(12) {
            body.push_str(&format!(
                "- [{}] ch{}: {}\n",
                scene.scene_type, scene.chapter_index, scene.text
            ));
        }
    }
    body.push_str("\n抽样章节（用真名拆剧情、人物与写法）：\n");
    for sample in &pack.samples {
        body.push_str(&format!(
            "\n--- 第{}章 {} ---\n{}\n",
            sample.index, sample.title, sample.text
        ));
    }
    body
}

fn format_fingerprint_hint(fp: &BookFingerprint) -> String {
    format!(
        "Host 节奏参考（禁止写进 craft）：chapters={} avgSentence={:.1} dialogueRatio={:.3}\n",
        fp.chapter_count, fp.avg_sentence_chars, fp.dialogue_ratio
    )
}
