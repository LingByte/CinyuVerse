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
}

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
      '   - **写作规则**：叙事基调、视角、禁词表，写入 `.cinyuverse/writing-rules.md`',
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
      '将备忘录写入 `chapters/chapter-' + String(ch).padStart(2, '0') + '-memo.md`',
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
      '- **AI 痕迹**：是否有明显的 AI 生成痕迹（重复句式、空洞描写等）',
      '',
      '## 输出格式',
      '',
      '输出审校报告，格式：',
      '',
      '### 总评',
      '（总体评价，1-2 段）',
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
      '- 修订时保持章节整体结构稳定',
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
      '2. 在 `.cinyuverse/chapter-summaries.md` 追加本章摘要（格式：## 第' + ch + '章 — 标题）',
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
// Registry
// ---------------------------------------------------------------------------

export const WRITING_PROMPT_TEMPLATES: WritingPromptTemplate[] = [
  initFoundation,
  reviseFoundation,
  planChapter,
  writeChapter,
  auditChapter,
  reviseChapter,
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
  WRITING_PROMPT_TEMPLATES.map((tpl) => [tpl.id, tpl]),
);

export const WRITING_PROMPTS_BY_CATEGORY = WRITING_PROMPT_TEMPLATES.reduce(
  (acc, tpl) => {
    (acc[tpl.category] ??= []).push(tpl);
    return acc;
  },
  {} as Record<WritingPromptCategory, WritingPromptTemplate[]>,
);

export function getWritingPrompt(id: string): WritingPromptTemplate | undefined {
  return WRITING_PROMPTS_BY_ID.get(id);
}

export function buildWritingPrompt(
  id: string,
  input: WritingPromptInput,
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
