/**
 * Novel-writing prompt templates for ACP agent sessions.
 *
 * These templates are sent to ACP agents (Claude Code, Codex, etc.) as
 * user-message prompts. The agent reads `.cinyuverse/` metadata files
 * (auto-injected via CLAUDE.md) to gain novel-writing context.
 *
 * Each template is a function that returns a string prompt. Templates
 * can be used as:
 *   - `initial_prompt` when creating a new session
 *   - Inline messages in an existing conversation
 *   - Quick-action buttons in the writing panel (future)
 */

export type WritingPromptCategory =
  | 'foundation'
  | 'chapter'
  | 'review'
  | 'character'
  | 'worldbuilding'
  | 'meta';

export interface WritingPromptTemplate {
  id: string;
  category: WritingPromptCategory;
  /** Short label shown in UI (i18n key fallback: `writingPrompts.<id>.label`) */
  label: string;
  /** Longer description for tooltip / subtitle */
  description: string;
  /** Build the prompt text. Placeholders are filled from user input. */
  build: (input: WritingPromptInput) => string;
}

export interface WritingPromptInput {
  /** Book / project name */
  bookName?: string;
  /** Genre (e.g. 玄幻, 都市, xuanhuan) */
  genre?: string;
  /** Target chapter number (1-based) */
  chapterNumber?: number;
  /** Target word count for the chapter */
  wordCount?: number;
  /** Free-form guidance / instruction from the author */
  guidance?: string;
  /** Character name to focus on */
  characterName?: string;
  /** Volume number (1-based) */
  volumeNumber?: number;
  /** Story beat ID (for beat-level prompts) */
  beatId?: string;
  /** Story beat title */
  beatTitle?: string;
  /** Story beat description */
  beatDescription?: string;
  /** The full story graph JSON (beats + edges) for AI to reason over */
  fullGraph?: string;
  /** The selected beat's local context (predecessors, successors, characters, hooks) */
  beatContext?: string;
}

// ---------------------------------------------------------------------------
// Style rhythm baseline
//
// Write prompts, the audit checklist, and the .cinyuverse/writing-rules.md
// scaffold all project from this single table so the thresholds never drift.
// The rules target the statistical fingerprints AI detectors key on: uniform
// cadence, dense similes, frequent one-line paragraphs, punchy section ends.
// ---------------------------------------------------------------------------

export interface StyleRhythmRule {
  /** Constraint line injected into write prompts and the rules scaffold. */
  constraint: string;
  /** Counting item injected into the audit checklist. */
  audit: string;
}

export const STYLE_RHYTHM_RULES: StyleRhythmRule[] = [
  {
    constraint:
      '单句成段（短句独立成段）全章不超过 6 处；开头 500 字内与悬念揭示、反转段落中一处也不许有',
    audit:
      '单句成段总处数及位置分布，重点核对开头 500 字和揭示/反转段落（阈值：全章 6 处，开头与揭示/反转段为 0）',
  },
  {
    constraint: '「不X，不Y，不Z」式三项排比每章不超过 2 处',
    audit: '三项排比（如「不X，不Y，不Z」）处数（阈值：每章 2 处）',
  },
  {
    constraint:
      '明喻（像/仿佛/如同/宛如/好似）每千字不超过 3 个，能用白描就不用比喻，揭示、反转节点一律白描',
    audit: '明喻词（像/仿佛/如同/宛如/好似）出现次数（阈值：每千字 3 个）',
  },
  {
    constraint: '段落长度要有起伏，长段与短段并存，不要全文段落长度雷同',
    audit: '段落长度分布：最短/最长/中位段长，相邻段落是否高度雷同',
  },
  {
    constraint: '各节结尾不刻意压短句「金句」，允许平实收尾',
    audit: '逐节结尾模式：各节末句是否都收在短句金句上',
  },
  {
    constraint: '章节开头 500 字内禁用一切比喻和排比，用平实叙述开场',
    audit: '开头 500 字内明喻词与排比结构的数量（阈值：0）',
  },
  {
    constraint: '悬念揭示、反转等关键节点必须用连贯长句叙述，禁止单句成段堆叠',
    audit: '揭示/反转段落中的单句成段堆叠处数（阈值：0）',
  },
];

// 从复测报告中提炼的真实超标句式，写作 prompt 原样列出让模型避开。
export const STYLE_RHYTHM_FORBIDDEN_PATTERNS: string[] = [
  '「像X」「仿佛X」式明喻串讲',
  '「一呼。一应。」「一呼。一吸。」式对仗断行',
  '「不X，不Y，不Z」三项排比',
  '「他愣住了。」「人呢。」「喂。」式单句悬念独立成段',
];

// ---------------------------------------------------------------------------
// Foundation templates — initialize the book's core metadata
// ---------------------------------------------------------------------------

const initFoundation: WritingPromptTemplate = {
  id: 'init-foundation',
  category: 'foundation',
  label: '初始化作品基础',
  description: '生成故事圣经、卷大纲、写作规则、初始伏笔和当前状态',
  build: (input) =>
    [
      `请为《${input.bookName ?? '未命名作品'}》初始化创作基础。`,
      '',
      '## 任务',
      '',
      '1. 读取 `.cinyuverse/project.json` 了解已有设定',
      `2. 根据题材「${input.genre ?? '未指定'}」生成以下内容：`,
      '   - **故事圣经**：核心设定、力量体系、世界观框架，写入 `.cinyuverse/world-view.md`',
      '   - **卷大纲**：第一卷的章节结构（至少 10 章），每章用三句话描述主要事件，写入 `.cinyuverse/outline.md`',
      '   - **写作规则**：叙事基调、视角、禁词表，以及「文风节奏」一节（单句成段、三项排比、明喻密度、段落起伏、结尾模式、开头与揭示节点约束的量化阈值，可按题材微调但必须有），写入 `.cinyuverse/writing-rules.md`',
      '   - **初始伏笔**：至少 3 个伏笔条目，写入 `.cinyuverse/hooks.md`（保持表格格式）',
      '   - **当前状态**：故事开篇的世界状态事实，写入 `.cinyuverse/current-state.md`',
      '',
      '## 要求',
      '',
      '- 所有文件使用 Markdown 格式',
      '- 大纲按卷/章层级组织，每章标注出场角色和情节目标',
      '- 伏笔池表格保持 `| hook_id | 起始章节 | 类型 | 状态 | 预期回收 | 备注 |` 格式',
      '- 当前状态表格保持 `| 字段 | 值 | 章节 |` 格式',
      input.guidance ? `\n## 作者补充\n\n${input.guidance}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
};

const reviseFoundation: WritingPromptTemplate = {
  id: 'revise-foundation',
  category: 'foundation',
  label: '修订作品基础',
  description: '根据反馈修订故事圣经、大纲或写作规则',
  build: (input) =>
    [
      '请根据以下反馈修订作品基础设定。',
      '',
      '## 任务',
      '',
      '1. 读取 `.cinyuverse/` 下的 world-view.md、outline.md、writing-rules.md',
      '2. 根据反馈调整对应文件内容',
      '3. 保持其他未提及的设定不变',
      '4. 更新 `.cinyuverse/project.json` 的 `updatedAt` 字段',
      '',
      '## 反馈',
      '',
      input.guidance ?? '（请描述需要调整的内容）',
    ].join('\n'),
};

// ---------------------------------------------------------------------------
// Chapter templates — plan, write, audit, revise
// ---------------------------------------------------------------------------

const planChapter: WritingPromptTemplate = {
  id: 'plan-chapter',
  category: 'chapter',
  label: '规划章节',
  description: '为目标章节生成备忘录和写作意图',
  build: (input) => {
    const ch = input.chapterNumber ?? 1;
    return [
      `请为第 ${ch} 章生成写作备忘录。`,
      '',
      '## 任务',
      '',
      '1. 读取 `.cinyuverse/outline.md` 找到第 ' + ch + ' 章的细纲',
      '2. 读取 `.cinyuverse/chapter-summaries.md` 了解前文摘要',
      '3. 读取 `.cinyuverse/hooks.md` 查看未回收的伏笔',
      '4. 读取 `.cinyuverse/current-state.md` 了解当前世界状态',
      '5. 读取 `.cinyuverse/characters/` 下的角色卡了解出场角色',
      '',
      '## 输出',
      '',
      '生成章节备忘录，包含：',
      '- **章节标题**（贴合内容）',
      '- **主要事件**（3-5 个关键情节节点）',
      '- **出场角色**（列出角色名和在本章的作用）',
      '- **伏笔推进**（本章需要推进或回收的伏笔）',
      '- **节奏设计**（开篇、发展、高潮、收尾的节奏安排）',
      '- **字数目标**：' + (input.wordCount ?? 3000) + ' 字',
      '',
      '将备忘录写入 `chapters/chapter-' +
        String(ch).padStart(2, '0') +
        '-memo.md`',
      input.guidance ? `\n## 作者指导\n\n${input.guidance}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  },
};

const writeChapter: WritingPromptTemplate = {
  id: 'write-chapter',
  category: 'chapter',
  label: '撰写章节',
  description: '根据备忘录撰写章节正文',
  build: (input) => {
    const ch = input.chapterNumber ?? 1;
    const padded = String(ch).padStart(2, '0');
    return [
      `请撰写第 ${ch} 章正文。`,
      '',
      '## 任务',
      '',
      `1. 读取 \`chapters/chapter-${padded}-memo.md\` 获取章节备忘录`,
      '2. 读取 `.cinyuverse/characters/` 下本章出场角色的角色卡',
      '3. 读取 `.cinyuverse/writing-rules.md` 遵循写作规则和禁词表',
      '4. 读取 `.cinyuverse/style-sample.md` 参考文风',
      '5. 读取 `.cinyuverse/chapter-summaries.md` 中最近 3 章的摘要保持连贯',
      `6. 若 \`chapters/chapter-${padded}.md\` 已有旧稿，本次为重写：只依据备忘录与设定从零撰写并覆盖，不参照、不修补旧稿（微调旧文无法消除文风问题）`,
      '',
      '## 要求',
      '',
      `- 目标字数：${input.wordCount ?? 3000} 字`,
      '- 章节开头用一级标题标注章节名',
      '- 保持角色性格和说话方式一致',
      '- 推进备忘录中规划的伏笔',
      '- 避免使用禁词表中的词汇',
      '- 文风贴近 style-sample.md 的样本',
      '',
      '## 文风节奏约束',
      '',
      '以下阈值与审校模板的计数审计一致，超标会被要求修订；写到后半段也不许松懈：',
      '',
      ...STYLE_RHYTHM_RULES.map((rule) => `- ${rule.constraint}`),
      '',
      '禁止句式示例（原样避开，也不要换汤不换药地复刻）：',
      '',
      ...STYLE_RHYTHM_FORBIDDEN_PATTERNS.map((pattern) => `- ${pattern}`),
      '',
      '写入文件前逐项自查（单句成段处数、排比处数、明喻数、开头 500 字内容），超标先自行修订再交付。',
      '',
      `将正文写入 \`chapters/chapter-${padded}.md\``,
      input.guidance ? `\n## 作者指导\n\n${input.guidance}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  },
};

const auditChapter: WritingPromptTemplate = {
  id: 'audit-chapter',
  category: 'review',
  label: '审校章节',
  description: '从多个维度审计章节质量',
  build: (input) => {
    const ch = input.chapterNumber ?? 1;
    const padded = String(ch).padStart(2, '0');
    return [
      `请审校第 ${ch} 章正文。`,
      '',
      '## 任务',
      '',
      `1. 读取 \`chapters/chapter-${padded}.md\` 获取正文`,
      '2. 读取 `.cinyuverse/characters/` 下相关角色卡核对人设一致性',
      '3. 读取 `.cinyuverse/hooks.md` 检查伏笔回收情况',
      '4. 读取 `.cinyuverse/current-state.md` 检查时间线/状态连贯性',
      '5. 读取 `.cinyuverse/writing-rules.md` 检查禁词和规则遵守',
      '',
      '## 审计维度',
      '',
      '- **人物弧光**：角色行为是否符合性格发展',
      '- **伏笔回收**：该回收的伏笔是否回收，是否有遗漏',
      '- **时间线逻辑**：事件顺序是否合理，有无矛盾',
      '- **节奏**：开篇、发展、高潮、收尾节奏是否得当',
      '- **冲突设计**：冲突是否充分，是否有张力',
      '- **文风一致性**：是否符合写作规则和文风样本',
      '- **禁词检查**：是否使用了禁词表中的词汇',
      '- **AI 痕迹（计数式审计）**：逐项统计下列文风节奏指标，实测值填入「文风节奏统计」表，任何一项超阈值即列入问题列表：',
      ...STYLE_RHYTHM_RULES.map((rule) => `  - ${rule.audit}`),
      '',
      '## 输出格式',
      '',
      '输出审校报告，格式：',
      '',
      '### 总评',
      '（总体评价，1-2 段）',
      '',
      '### 文风节奏统计',
      '| 指标 | 实测值 | 阈值 | 是否超标 |',
      '| --- | --- | --- | --- |',
      '（每项指标一行，实测值必须是从正文中数出来的数字，不许凭印象写「未见明显问题」）',
      '',
      '### 问题列表',
      '| # | 维度 | 严重程度 | 问题描述 | 建议修改 |',
      '| --- | --- | --- | --- | --- |',
      '',
      '### 通过建议',
      '（通过 / 需修订 / 需重写）',
      '',
      `将报告写入 \`chapters/chapter-${padded}-audit.md\``,
      input.guidance ? `\n## 特别关注\n\n${input.guidance}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  },
};

const reviseChapter: WritingPromptTemplate = {
  id: 'revise-chapter',
  category: 'review',
  label: '修订章节',
  description: '根据审校报告修订章节正文',
  build: (input) => {
    const ch = input.chapterNumber ?? 1;
    const padded = String(ch).padStart(2, '0');
    return [
      `请根据审校报告修订第 ${ch} 章正文。`,
      '',
      '## 任务',
      '',
      `1. 读取 \`chapters/chapter-${padded}.md\` 获取当前正文`,
      `2. 读取 \`chapters/chapter-${padded}-audit.md\` 获取审校报告`,
      '3. 根据报告中的问题列表逐条修订',
      '4. 保持未提及问题的段落不变',
      '5. 修订后再次检查禁词表和文风一致性',
      '',
      '## 修订原则',
      '',
      '- 优先修复严重程度高的问题',
      '- 「文风节奏」超标属于结构性问题：禁止逐句微调修补，必须依据备忘录/节拍信息整段重写受影响的章节内容（微调旧文无法降低 AI 痕迹）',
      '- 其余问题修订时保持章节整体结构稳定',
      '- 如果问题涉及伏笔或时间线，同步更新 `.cinyuverse/hooks.md` 和 `.cinyuverse/current-state.md`',
      '',
      `将修订后的正文写回 \`chapters/chapter-${padded}.md\``,
      input.guidance ? `\n## 修订指导\n\n${input.guidance}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  },
};

const updateState: WritingPromptTemplate = {
  id: 'update-state',
  category: 'chapter',
  label: '更新章节状态',
  description: '章节完成后更新摘要、伏笔池和当前状态',
  build: (input) => {
    const ch = input.chapterNumber ?? 1;
    const padded = String(ch).padStart(2, '0');
    return [
      `第 ${ch} 章已完成，请更新项目状态。`,
      '',
      '## 任务',
      '',
      `1. 读取 \`chapters/chapter-${padded}.md\` 提取本章关键事实`,
      '2. 在 `.cinyuverse/chapter-summaries.md` 追加本章摘要（格式：## 第' +
        ch +
        '章 — 标题）',
      '   - 摘要应包含：主要事件、角色变化、伏笔推进',
      '   - 保持在 200 字以内',
      '3. 更新 `.cinyuverse/hooks.md`：',
      '   - 本章新埋的伏笔 → 新增行，状态 open',
      '   - 本章推进的伏笔 → 更新状态为 progressing，更新 last_advanced',
      '   - 本章回收的伏笔 → 更新状态为 resolved',
      '4. 更新 `.cinyuverse/current-state.md`：',
      '   - 本章发生的世界状态变化 → upsert 对应字段',
      '   - 标注章节号',
      '5. 更新 `.cinyuverse/project.json` 的 `updatedAt` 字段',
      '',
      '## 要求',
      '',
      '- 摘要要精炼，不要照抄正文',
      '- 伏笔池表格格式不变',
      '- 当前状态表格格式不变',
      input.guidance ? `\n## 补充\n\n${input.guidance}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  },
};

// ---------------------------------------------------------------------------
// Character templates
// ---------------------------------------------------------------------------

const createCharacter: WritingPromptTemplate = {
  id: 'create-character',
  category: 'character',
  label: '创建角色卡',
  description: '生成角色设定卡',
  build: (input) =>
    [
      `请创建角色「${input.characterName ?? '新角色'}」的角色卡。`,
      '',
      '## 任务',
      '',
      '1. 读取 `.cinyuverse/world-view.md` 了解世界观',
      '2. 读取 `.cinyuverse/outline.md` 了解角色在故事中的定位',
      '3. 读取 `.cinyuverse/characters/` 下已有角色卡保持风格统一',
      '',
      '## 角色卡内容',
      '',
      '生成包含以下维度的角色卡：',
      '- **基本信息**：姓名、年龄、身份、外貌',
      '- **性格**：核心性格特征、优点、缺点',
      '- **人际关系**：与其他角色的关系',
      '- **故事线**：角色在故事中的成长弧线',
      '- **对话风格**：说话方式、口头禅、语气特征',
      '- **动机**：核心驱动力和目标',
      '',
      `将角色卡写入 \`.cinyuverse/characters/${input.characterName ?? '新角色'}.md\``,
      input.guidance ? `\n## 角色补充\n\n${input.guidance}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
};

const refineCharacter: WritingPromptTemplate = {
  id: 'refine-character',
  category: 'character',
  label: '完善角色卡',
  description: '根据反馈完善已有角色设定',
  build: (input) =>
    [
      `请完善角色「${input.characterName ?? '指定角色'}」的角色卡。`,
      '',
      '## 任务',
      '',
      `1. 读取 \`.cinyuverse/characters/${input.characterName ?? '指定角色'}.md\``,
      '2. 根据反馈调整角色设定',
      '3. 检查与 `.cinyuverse/outline.md` 的一致性',
      '4. 检查与 `.cinyuverse/chapter-summaries.md` 中已出现章节的一致性',
      '',
      '## 反馈',
      '',
      input.guidance ?? '（请描述需要完善的方面）',
    ].join('\n'),
};

// ---------------------------------------------------------------------------
// Worldbuilding templates
// ---------------------------------------------------------------------------

const expandWorldView: WritingPromptTemplate = {
  id: 'expand-world-view',
  category: 'worldbuilding',
  label: '扩展世界观',
  description: '深化世界观设定',
  build: (input) =>
    [
      '请扩展世界观设定。',
      '',
      '## 任务',
      '',
      '1. 读取 `.cinyuverse/world-view.md` 了解现有设定',
      '2. 读取 `.cinyuverse/outline.md` 了解故事需求',
      '3. 根据指导扩展世界观内容',
      '',
      '## 扩展方向',
      '',
      input.guidance ??
        '（请描述需要扩展的方面，如：力量体系细节、地理环境、社会结构、历史背景等）',
      '',
      '将更新后的内容写回 `.cinyuverse/world-view.md`',
    ].join('\n'),
};

const addGlossary: WritingPromptTemplate = {
  id: 'add-glossary',
  category: 'worldbuilding',
  label: '补充设定词条',
  description: '为专有名词创建解释词条',
  build: (input) =>
    [
      '请为故事中的专有名词补充设定词条。',
      '',
      '## 任务',
      '',
      '1. 读取 `.cinyuverse/world-view.md` 和 `.cinyuverse/outline.md`',
      '2. 扫描 `chapters/` 下已有章节，找出未解释的专有名词',
      '3. 为每个名词生成简明解释',
      '',
      '## 输出',
      '',
      '在 `.cinyuverse/glossary.md` 中以表格形式列出：',
      '',
      '| 词条 | 类别 | 解释 |',
      '| --- | --- | --- |',
      '',
      '类别包括：地名、组织、物品、技能、种族、其他',
      input.guidance ? `\n## 补充\n\n${input.guidance}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
};

// ---------------------------------------------------------------------------
// Meta templates — statistics, export prep, continuity check
// ---------------------------------------------------------------------------

const continuityCheck: WritingPromptTemplate = {
  id: 'continuity-check',
  category: 'meta',
  label: '全书连贯性检查',
  description: '检查全书时间线、伏笔、角色一致性',
  build: () =>
    [
      '请对全书进行连贯性检查。',
      '',
      '## 任务',
      '',
      '1. 读取 `.cinyuverse/chapter-summaries.md` 获取所有章节摘要',
      '2. 读取 `.cinyuverse/hooks.md` 检查伏笔状态',
      '3. 读取 `.cinyuverse/current-state.md` 检查世界状态',
      '4. 读取 `.cinyuverse/characters/` 下所有角色卡',
      '5. 扫描 `chapters/` 下所有章节文件',
      '',
      '## 检查维度',
      '',
      '- **时间线**：事件先后顺序是否合理',
      '- **伏笔完整性**：是否有 open 状态超过 20 章未推进的伏笔',
      '- **角色一致性**：角色行为是否与角色卡设定矛盾',
      '- **状态连贯**：current-state.md 是否与正文描述一致',
      '- **遗漏章节**：大纲中规划但未撰写的章节',
      '',
      '## 输出',
      '',
      '生成连贯性报告，写入 `.cinyuverse/continuity-report.md`',
      '报告应包含问题列表和修复建议。',
    ].join('\n'),
};

const writingStats: WritingPromptTemplate = {
  id: 'writing-stats',
  category: 'meta',
  label: '写作统计',
  description: '统计字数、章节进度、伏笔回收率',
  build: () =>
    [
      '请生成写作统计报告。',
      '',
      '## 任务',
      '',
      '1. 扫描 `chapters/` 下所有 `.md` 文件（排除 *-memo.md、*-audit.md）',
      '2. 统计每章字数（中文字符数）',
      '3. 读取 `.cinyuverse/outline.md` 统计规划章节数',
      '4. 读取 `.cinyuverse/hooks.md` 统计伏笔状态分布',
      '',
      '## 输出',
      '',
      '在对话中输出统计报告，包含：',
      '- 总字数、总章节数、平均每章字数',
      '- 完成进度（已写/规划）',
      '- 伏笔回收率（resolved / total）',
      '- 各章节字数列表',
    ].join('\n'),
};

const exportPrep: WritingPromptTemplate = {
  id: 'export-prep',
  category: 'meta',
  label: '导出准备',
  description: '整理章节顺序、生成目录和简介',
  build: (input) =>
    [
      '请为导出做准备。',
      '',
      '## 任务',
      '',
      '1. 读取 `chapters/` 下所有章节文件，按章节号排序',
      '2. 读取 `.cinyuverse/project.json` 获取书名和作者',
      '3. 读取 `.cinyuverse/outline.md` 生成卷结构',
      '',
      '## 输出',
      '',
      '1. 生成 `chapters/_order.txt`：章节文件名按顺序列出',
      '2. 生成 `chapters/_toc.md`：目录（卷/章标题）',
      '3. 生成 `chapters/_intro.md`：书籍简介（200 字以内）',
      '',
      input.guidance ? `\n## 导出要求\n\n${input.guidance}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
};

// ---------------------------------------------------------------------------
// Humanize template — guided by the vendored humanizer-chinese skill
// (frontend/src/lib/humanizer-chinese.SKILL.md, MIT, scaffolding into
// `.cinyuverse/skills/humanizer-chinese/` on project creation). The skill
// supplies the rewriting methodology; STYLE_RHYTHM_RULES supply the
// measurable pass/fail targets.
// ---------------------------------------------------------------------------

const humanizeChapter: WritingPromptTemplate = {
  id: 'humanize-chapter',
  category: 'review',
  label: '去AI化润稿',
  description: '按 humanizer-chinese 模式清单整章重写，压低 AI 文风指纹',
  build: (input) => {
    const ch = input.chapterNumber ?? 1;
    const padded = String(ch).padStart(2, '0');
    return [
      `请对第 ${ch} 章正文做「去 AI 化」润稿重写。`,
      '',
      '## 任务',
      '',
      `1. 读取 \`chapters/chapter-${padded}.md\` 获取正文`,
      '2. 读取 `.cinyuverse/skills/humanizer-chinese/SKILL.md`——这是中文去 AI 味的完整方法论。',
      '   若该文件不存在，向用户说明需先把 humanizer-chinese 的 SKILL.md 放入',
      '   `.cinyuverse/skills/humanizer-chinese/`（新建项目会自动生成），不要凭印象改写。',
      '3. 按 SKILL.md 的「通用要点」与小说最相关的模式执行，重点是「节奏三件套」',
      '   （SKILL.md §12 排比对仗堆砌、§20 均匀节奏、§23 单句断句造势——检测权重最高的',
      '   特征组）以及 §29-31 标点模式',
      `4. 若存在 \`.cinyuverse/aigc/chapter-${padded}.json\` 检测报告，优先整段重写其中`,
      '   label≠0（AI / 疑似 AI）的段落——那是检测器实测的高危段，改写时按序号与引文定位；',
      '   报告对应旧稿，只用于定位，不据此删改情节',
      '5. 读取 `.cinyuverse/writing-rules.md` 的「文风节奏」阈值，改写结果必须全部达标：',
      ...STYLE_RHYTHM_RULES.map((rule) => `   - ${rule.constraint}`),
      '',
      '## 改写原则（来自 SKILL.md，必须遵守）',
      '',
      '- 改的是节奏和信息密度，不是词汇：逐词替换无效，要拆并重组句子、合并拆分段落',
      '- 保信息不保形状：情节事实、人设、对白的实际内容、伏笔全部保留；句式结构放开重写',
      '- 信息密度不均匀：核心场景铺开写，过渡一笔带过，不要每段均匀发力',
      '- 句长锯齿化：连续中长句后插短句，或把长句掰开；段落长短错落',
      '- 防过度纠偏：紧张、动作段落本就该短句密集，不为拉句长硬塞长句；不编造新情节',
      '- 禁止句式示例（原样避开，也不要换汤不换药地复刻）：',
      ...STYLE_RHYTHM_FORBIDDEN_PATTERNS.map((pattern) => `  - ${pattern}`),
      '',
      '## 交付',
      '',
      `- 改写后的正文写回 \`chapters/chapter-${padded}.md\``,
      '- 写回前按「文风节奏」阈值逐项计数自查，超标先修订再交付',
      `- 提示用户重新运行「AIGC 检测」复检：\`.cinyuverse/aigc/chapter-${padded}.json\` 对应的是旧稿`,
      input.guidance ? `\n## 作者补充\n\n${input.guidance}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  },
};

// ---------------------------------------------------------------------------
// AIGC detection template — guided by the scaffolded aigc-check skill
// (frontend/src/lib/aigc-check.SKILL.md, written into
// `.cinyuverse/skills/aigc-check/` on project creation). The skill owns the
// API contract (endpoint, .env key, report schema); this template only
// sequences the task.
// ---------------------------------------------------------------------------

const checkAigc: WritingPromptTemplate = {
  id: 'check-aigc',
  category: 'review',
  label: 'AIGC 检测',
  description: '调用朱雀模型检测章节 AI 生成占比，逐段标注并落盘报告',
  build: (input) => {
    const ch = input.chapterNumber ?? 1;
    const padded = String(ch).padStart(2, '0');
    return [
      `请检测第 ${ch} 章正文的 AIGC（AI 生成）占比。`,
      '',
      '## 任务',
      '',
      `1. 读取 \`chapters/chapter-${padded}.md\` 获取正文`,
      '2. 读取 `.cinyuverse/skills/aigc-check/SKILL.md`——这是检测的完整调用契约',
      '   （密钥、接口、报告格式），严格按它执行。若该文件不存在，向用户说明需把',
      '   aigc-check 的 SKILL.md 放入 `.cinyuverse/skills/aigc-check/`（新建项目会自动生成），',
      '   不要凭印象调用',
      `3. 先检查 \`.cinyuverse/aigc/chapter-${padded}.json\` 旧报告：按 SKILL.md 的省额度规则，`,
      '   正文未变则直接引用旧报告输出摘要，不再调用接口',
      '4. 确认密钥可用：项目根 `.env` 或 `~/.cinyuverse/.env` 中存在 `ZHUQUE_API_KEY`；',
      '   缺失则按 SKILL.md 指导用户配置后停止，不要编造密钥',
      '5. 去掉章标题行，正文写入临时 payload 文件，`is_merge: false` 调用检测接口，',
      '   密钥只通过环境变量引用，绝不回显其值',
      `6. 按 SKILL.md 的报告契约把结果写入 \`.cinyuverse/aigc/chapter-${padded}.json\``,
      '',
      '## 输出',
      '',
      '- 整体占比：人工 / AI / 疑似 AI 三类占比与 ai_ratio（= AI + 疑似）',
      '- AI 与疑似段落清单：段落序号 + 该段开头引文（约 30 字）',
      '- 本次消耗 token 数；若引用的是旧报告，注明「正文未变，引用旧报告」',
      '- 结尾提示：可运行「去AI化润稿」针对上述段落定向改写，完成后复检刷新报告',
      input.guidance ? `\n## 作者补充\n\n${input.guidance}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  },
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Story graph templates — generate / infer / write story beats
// ---------------------------------------------------------------------------

const generateStoryGraph: WritingPromptTemplate = {
  id: 'generate-story-graph',
  category: 'foundation',
  label: '生成故事节拍图',
  description: '根据世界观、大纲和伏笔池，规划完整的故事节拍图（节点+关系）',
  build: (input) =>
    [
      `请为《${input.bookName ?? '未命名作品'}》规划故事节拍图（Story Beat Graph）。`,
      '',
      '## 这是什么',
      '',
      '故事节拍图是一个**有向图**，用于规划整个故事的推进路线。它是创作的纲领，',
      '不是写完章节后的总结。每个节点（beat）是一个故事事件，每条边（edge）是',
      '事件之间的关系。AI 后续会根据这张图来推演和撰写每个节拍对应的章节。',
      '',
      '## 任务',
      '',
      '1. 读取以下文件了解已有设定：',
      '   - `.cinyuverse/project.json` — 书籍信息',
      '   - `.cinyuverse/world-view.md` — 世界观设定',
      '   - `.cinyuverse/outline.md` — 大纲',
      '   - `.cinyuverse/hooks.md` — 伏笔池',
      '   - `.cinyuverse/characters/` — 角色卡',
      '',
      '2. 设计故事节拍图，遵循以下图结构语义：',
      '',
      '### 节点（beat）',
      '每个节点是一个故事事件，字段含义：',
      '- `id`: 唯一标识，格式 `beat-NNN`',
      '- `title`: 事件标题（简短，10字以内）',
      '- `description`: 事件描述（发生了什么、为什么重要）',
      '- `beat_type`: 节拍类型，决定节点在故事中的功能：',
      '  - `plot_point` — 主线情节点（推动故事前进的核心事件）',
      '  - `character_arc` — 角色弧光节点（角色发生内心变化或成长）',
      '  - `hook_plant` — 埋设伏笔（在此节点埋下一个未解之谜或暗示）',
      '  - `hook_advance` — 推进伏笔（伏笔线索再次出现，加深悬念）',
      '  - `hook_resolve` — 回收伏笔（伏笔真相揭晓）',
      '  - `world_change` — 世界变化（世界观层面发生重大改变）',
      '  - `relationship_shift` — 关系转变（角色间关系发生质变）',
      '  - `climax` — 高潮（冲突最激烈的节点）',
      '  - `turning_point` — 转折点（故事方向发生根本性改变）',
      '- `chapter_hint`: 预估章节号（整数）',
      '- `status`: 节拍状态',
      '  - `planned` — 已规划但未开始',
      '  - `current` — 当前正在推进的节点（只能有一个）',
      '  - `completed` — 已完成（对应的章节已写完）',
      '  - `skipped` — 跳过（不再使用此节拍）',
      '- `characters`: 涉及的角色名列表（必须与角色卡文件名对应）',
      '- `hooks`: 关联的伏笔ID列表（对应 hooks.md 中的 hook_id）',
      '- `volume`: 卷号（整数）',
      '- `arc`: 所属故事弧（如"第一幕"、"第二幕"）',
      '- `sort_order`: 排序序号（按故事推进顺序递增，从0开始）',
      '- `completion_criteria`: 完成条件列表（写完此节拍对应章节后应满足的条件）',
      '',
      '### 边（edge）',
      '每条边表示两个节拍之间的关系，字段：',
      '- `from_beat`: 起始节拍ID',
      '- `to_beat`: 目标节拍ID',
      '- `edge_type`: 关系类型：',
      '  - `sequential` — 顺序关系（A 完成后 B 自然发生，主线推进）',
      '  - `causal` — 因果关系（A 导致 B 发生，B 是 A 的直接后果）',
      '  - `foreshadow` — 伏笔关系（A 埋下的伏笔在 B 处回收或推进，可跨越大距离）',
      '  - `parallel` — 并行关系（A 和 B 在同一时间线并行发生）',
      '  - `alternative` — 备选关系（B 是 A 的替代走向，非确定路径）',
      '  - `character_arc` — 角色弧光线（同一角色的成长轨迹串联）',
      '  - `item_flow` — 物品/信息流（某物品或关键信息从 A 流转到 B）',
      '',
      '3. 将结果写入 `.cinyuverse/story-graph.json`，格式如下：',
      '```json',
      '{',
      '  "beats": [',
      '    {',
      '      "id": "beat-001",',
      '      "title": "故事开端",',
      '      "description": "主角的日常世界，引出核心矛盾",',
      '      "beat_type": "plot_point",',
      '      "chapter_hint": 1,',
      '      "status": "planned",',
      '      "characters": ["主角"],',
      '      "hooks": ["H-001"],',
      '      "volume": 1,',
      '      "arc": "第一幕",',
      '      "sort_order": 0,',
      '      "completion_criteria": ["引出主角", "建立日常世界"]',
      '    }',
      '  ],',
      '  "edges": [',
      '    { "from_beat": "beat-001", "to_beat": "beat-002", "edge_type": "sequential" }',
      '  ]',
      '}',
      '```',
      '',
      '## 图结构设计要求',
      '',
      '- 节拍数量不少于 15 个，覆盖整个故事弧线（从开端到高潮到收束）',
      '- **主线骨架**：用 `sequential` 和 `causal` 边构成从第一个节拍到最后一个节拍的',
      '  有向路径，这是故事的主干',
      '- **伏笔线**：每个伏笔必须有完整的 `hook_plant` → `hook_advance`（可选）→ ',
      '  `hook_resolve` 节点链，并用 `foreshadow` 边连接它们。伏笔线可以跨越多个',
      '  主线节拍，形成长距离的伏笔弧',
      '- **角色弧线**：主要角色应有 `character_arc` 节点，用 `character_arc` 边串联',
      '  同一角色的成长轨迹。角色弧线应与主线交织但不完全重合',
      '- **关系网**：重要的人际关系变化用 `relationship_shift` 节点标记',
      '- **世界变迁**：世界观层面的重大变化用 `world_change` 节点标记',
      '- **高潮与转折**：故事中至少有一个 `climax` 节点和若干 `turning_point` 节点',
      '- 角色弧光节点必须在 `characters` 字段标注相关角色',
      '- 因果关系用 `causal` 边，伏笔关系用 `foreshadow` 边，不要混用',
      '- 第一个节拍状态设为 `current`，其余为 `planned`',
      '- `sort_order` 按故事推进顺序递增',
      '- `completion_criteria` 要具体可验证（写完章节后能判断是否满足）',
      input.guidance ? `\n## 作者补充\n\n${input.guidance}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
};

const inferBeat: WritingPromptTemplate = {
  id: 'infer-beat',
  category: 'chapter',
  label: '推演节拍',
  description: '推演当前节拍的发展方向和具体内容',
  build: (input) =>
    [
      `请推演故事节拍「${input.beatTitle ?? '未命名节拍'}」的发展方向。`,
      '',
      '## 当前节拍',
      '',
      `- ID：${input.beatId ?? '未知'}`,
      `- 标题：${input.beatTitle ?? '未命名'}`,
      input.beatDescription ? `- 描述：${input.beatDescription}` : '',
      '',
      '## 完整故事节拍图',
      '',
      '以下是完整的故事节拍图（JSON 格式）。请先理解整张图的结构，',
      '再推演当前节拍。注意分析当前节拍在图中的位置、哪些边连接到它、',
      '哪些伏笔线和角色弧线经过它。',
      '',
      input.fullGraph
        ? `\`\`\`json\n${input.fullGraph}\n\`\`\``
        : '请读取 `.cinyuverse/story-graph.json` 获取完整故事节拍图。',
      '',
      '## 推演方法',
      '',
      '1. **定位**：在图中找到当前节拍，分析它的 `beat_type` 决定了它在故事中的功能',
      '2. **追溯前驱**：沿 `sequential`/`causal` 边回溯，理解哪些事件导致了当前节拍',
      '3. **展望后继**：沿 `sequential`/`causal` 边前看，理解当前节拍需要为后续事件做什么铺垫',
      '4. **伏笔分析**：检查当前节拍的 `hooks` 字段，沿 `foreshadow` 边找到对应的',
      '   `hook_plant`/`hook_advance`/`hook_resolve` 节点，判断本节拍应该埋设、推进还是回收伏笔',
      '5. **角色弧线**：检查当前节拍的 `characters` 字段，沿 `character_arc` 边找到',
      '   同一角色的其他弧光节点，判断本节拍在角色成长轨迹中的位置',
      '6. **读取设定**：读取 `.cinyuverse/` 下的世界观、大纲、角色卡、伏笔池、当前状态，',
      '   将图结构映射到具体的故事内容',
      '',
      '## 推演输出',
      '',
      '用 Markdown 输出，包含：',
      '',
      '### 图中定位',
      '- 本节拍在图中的位置（第几幕、哪条故事线）',
      '- 连接到本节拍的边（列出 from/to 和 edge_type）',
      '- 经过的伏笔线和角色弧线',
      '',
      '### 场景设计',
      '- 具体场景描述（时间、地点、氛围）',
      '- 核心冲突或事件',
      '',
      '### 角色行动',
      '- 各出场角色的行为、动机、对话要点',
      '- 角色弧光在本节拍的体现',
      '',
      '### 伏笔处理',
      '- 本节拍涉及的伏笔（ID、处理方式：埋设/推进/回收）',
      '- 与伏笔线上其他节点的呼应关系',
      '',
      '### 衔接分析',
      '- 与前驱节拍的衔接方式',
      '- 为后继节拍做的铺垫',
      '',
      '### 写作建议',
      '- 叙事视角、节奏、情绪基调',
      '- 字数建议',
      input.guidance ? `\n## 作者补充\n\n${input.guidance}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
};

const writeBeat: WritingPromptTemplate = {
  id: 'write-beat',
  category: 'chapter',
  label: '撰写节拍',
  description: '根据节拍推演结果，撰写对应的章节正文',
  build: (input) =>
    [
      `请撰写故事节拍「${input.beatTitle ?? '未命名节拍'}」对应的章节正文。`,
      '',
      '## 当前节拍',
      '',
      `- ID：${input.beatId ?? '未知'}`,
      `- 标题：${input.beatTitle ?? '未命名'}`,
      input.beatDescription ? `- 描述：${input.beatDescription}` : '',
      input.chapterNumber ? `- 目标章节：第 ${input.chapterNumber} 章` : '',
      input.wordCount ? `- 目标字数：${input.wordCount} 字` : '',
      '',
      '## 完整故事节拍图',
      '',
      '以下是完整的故事节拍图。撰写前请理解当前节拍在图中的位置和关系，',
      '确保正文与图结构一致：伏笔在正确的节拍埋设/回收，角色弧光在正确的',
      '节拍体现，与前驱节拍的内容衔接、为后继节拍做铺垫。',
      '',
      input.fullGraph
        ? `\`\`\`json\n${input.fullGraph}\n\`\`\``
        : '请读取 `.cinyuverse/story-graph.json` 获取完整故事节拍图。',
      '',
      '## 撰写要求',
      '',
      '1. 读取 `.cinyuverse/` 下的所有设定文件（世界观、角色卡、写作规则、伏笔池、当前状态）',
      '2. 读取 `chapters/` 下已有的章节正文，保持人设、设定与情节连贯；句式节奏不要向已有章节看齐——那正是要避免的',
      '3. **对照图结构撰写**：',
      '   - 检查当前节拍的 `completion_criteria`，正文必须满足所有条件',
      '   - 检查 `hooks` 字段，正文中要自然融入对应的伏笔操作（埋设/推进/回收）',
      '   - 检查 `characters` 字段，所有标注角色都应在正文中出场',
      '   - 沿 `foreshadow` 边检查伏笔线的其他节点，确保伏笔处理与图一致',
      '   - 沿 `character_arc` 边检查角色弧线的其他节点，确保角色成长连贯',
      '   - 若目标章节已有旧稿，只依据节拍图与设定从零撰写并覆盖，不参照、不修补旧稿',
      '4. 将正文写入 `chapters/chapter-NN.md`（NN 为章节号补零）',
      '5. 撰写完成后更新项目状态：',
      '   - 更新 `.cinyuverse/chapter-summaries.md`（追加本章摘要）',
      '   - 更新 `.cinyuverse/current-state.md`（世界状态变化）',
      '   - 更新 `.cinyuverse/hooks.md`（伏笔状态变化）',
      '   - 更新 `.cinyuverse/story-graph.json` 中本节拍的 `status` 为 `completed`',
      '',
      '## 文风要求',
      '',
      '- 文风参考 `.cinyuverse/style-sample.md`',
      '- 禁词表见 `.cinyuverse/writing-rules.md`',
      '- 保持角色人设一致',
      '- 自然融入伏笔，不要生硬',
      '- 节奏基线（与审校模板的计数审计一致，超标会被要求修订；写到后半段也不许松懈）：',
      ...STYLE_RHYTHM_RULES.map((rule) => `  - ${rule.constraint}`),
      '- 禁止句式示例（原样避开，也不要换汤不换药地复刻）：',
      ...STYLE_RHYTHM_FORBIDDEN_PATTERNS.map((pattern) => `  - ${pattern}`),
      '- 写入文件前按节奏基线逐项自查，超标先自行修订再交付',
      input.guidance ? `\n## 作者补充\n\n${input.guidance}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
};

export const WRITING_PROMPT_TEMPLATES: WritingPromptTemplate[] = [
  initFoundation,
  reviseFoundation,
  generateStoryGraph,
  inferBeat,
  writeBeat,
  planChapter,
  writeChapter,
  auditChapter,
  reviseChapter,
  checkAigc,
  humanizeChapter,
  updateState,
  createCharacter,
  refineCharacter,
  expandWorldView,
  addGlossary,
  continuityCheck,
  writingStats,
  exportPrep,
];

export const WRITING_PROMPTS_BY_ID = new Map(
  WRITING_PROMPT_TEMPLATES.map((tpl) => [tpl.id, tpl])
);

export const WRITING_PROMPTS_BY_CATEGORY = WRITING_PROMPT_TEMPLATES.reduce(
  (acc, tpl) => {
    (acc[tpl.category] ??= []).push(tpl);
    return acc;
  },
  {} as Record<WritingPromptCategory, WritingPromptTemplate[]>
);

export function getWritingPrompt(
  id: string
): WritingPromptTemplate | undefined {
  return WRITING_PROMPTS_BY_ID.get(id);
}

export function buildWritingPrompt(
  id: string,
  input: WritingPromptInput
): string | null {
  const tpl = getWritingPrompt(id);
  return tpl ? tpl.build(input) : null;
}

export const WRITING_PROMPT_CATEGORY_LABELS: Record<
  WritingPromptCategory,
  string
> = {
  foundation: '作品基础',
  chapter: '章节创作',
  review: '审校修订',
  character: '角色管理',
  worldbuilding: '世界观',
  meta: '工具',
};
