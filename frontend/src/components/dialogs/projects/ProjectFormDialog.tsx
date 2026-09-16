import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { TextArea } from '@astryxdesign/core/TextArea';
import { TextInput } from '@astryxdesign/core/TextInput';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import aigcCheckSkillMd from '@/lib/aigc-check.SKILL.md?raw';
import humanizerSkillMd from '@/lib/humanizer-chinese.SKILL.md?raw';
import { pickHostDirectory } from '@/lib/hostFs';
import { AlertCircle, FolderOpen, GitBranch, Loader2 } from 'lucide-react';
import type { CreateProject, Project } from 'shared/types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useProjectMutations } from '@/hooks/useProjectMutations';
import { fileTreeApi, repoApi } from '@/lib/api';
import { defineModal } from '@/lib/modals';
import { STYLE_RHYTHM_RULES } from '@/lib/writingPrompts';
import { normalizeDisplayPath } from '@/utils/displayPath';

export interface ProjectFormDialogProps {
  autoOpenFolderPicker?: boolean;
}

export type ProjectFormDialogResult =
  | { status: 'saved'; project: Project }
  | { status: 'canceled' };

const textInputSurfaceStyle = {
  backgroundColor: 'var(--surface-control)',
  borderRadius: 'var(--radius)',
};

function setReadOnly(input: HTMLInputElement | null) {
  if (input) input.readOnly = true;
}

interface ProjectPathPreviewProps {
  label: string;
  placeholder: string;
  value: string;
}

function ProjectPathPreview({
  label,
  placeholder,
  value,
}: ProjectPathPreviewProps) {
  return (
    <div className="min-w-0 flex-1" title={normalizeDisplayPath(value)}>
      <TextInput
        ref={setReadOnly}
        label={label}
        isLabelHidden
        size="sm"
        value={value}
        placeholder={placeholder}
        onChange={() => undefined}
        width="100%"
        aria-readonly="true"
        className="[&_input]:cursor-default [&_input]:truncate [&_input]:font-mono [&_input]:text-xs [&_input]:text-muted-foreground"
        style={textInputSurfaceStyle}
      />
    </div>
  );
}

function getPathName(path: string): string {
  const normalized = normalizeDisplayPath(path).replace(/[\\/]+$/, '');
  if (!normalized) return '';
  const parts = normalized.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? normalized;
}

function toFolderName(projectName: string): string {
  const invalidCharacters = new Set([
    '<',
    '>',
    ':',
    '"',
    '/',
    '\\',
    '|',
    '?',
    '*',
  ]);

  return Array.from(projectName)
    .map((character) =>
      invalidCharacters.has(character) || character.charCodeAt(0) < 32
        ? '-'
        : character
    )
    .join('')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '');
}

function joinLocalPath(parent: string, child: string): string {
  const separator = parent.includes('\\') ? '\\' : '/';
  return `${parent.replace(/[\\/]+$/, '')}${separator}${child}`;
}

function createReadme(projectName: string, projectDescription: string): string {
  const description = projectDescription.trim();

  return [
    `# ${projectName}`,
    '',
    description || 'Project created with Cinyuverse.',
    '',
  ].join('\n');
}

const GITIGNORE_TEMPLATE = [
  'node_modules/',
  'dist/',
  'build/',
  '.env',
  '.env.*',
  '*.log',
  '.DS_Store',
  'Thumbs.db',
  '',
].join('\n');

// ZHUQUE_API_KEY 是朱雀 AIGC 检测的密钥；`.env` 本身永不生成、永不覆写。
export const CINYUVERSE_ENV_EXAMPLE = [
  '# 复制为 .env 并填入真实密钥（.env 已被 .gitignore 忽略）',
  '# 创建入口：https://console.cloud.tencent.com/edgeone/makers → API Key 管理',
  '# 用途见 .cinyuverse/skills/aigc-check/SKILL.md',
  'ZHUQUE_API_KEY=',
  '',
].join('\n');

const MIT_LICENSE_TEMPLATE = [
  'MIT License',
  '',
  `Copyright (c) ${new Date().getFullYear()}`,
  '',
  'Permission is hereby granted, free of charge, to any person obtaining a copy',
  'of this software and associated documentation files (the "Software"), to deal',
  'in the Software without restriction, including without limitation the rights',
  'to use, copy, modify, merge, publish, distribute, sublicense, and/or sell',
  'copies of the Software, and to permit persons to whom the Software is',
  'furnished to do so, subject to the following conditions:',
  '',
  'The above copyright notice and this permission notice shall be included in all',
  'copies or substantial portions of the Software.',
  '',
  'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR',
  'IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,',
  'FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE',
  'AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER',
  'LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,',
  'OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE',
  'SOFTWARE.',
  '',
].join('\n');

// ---------------------------------------------------------------------------
// .cinyuverse/ novel metadata scaffolding
// ---------------------------------------------------------------------------

const CINYUVERSE_DIR = '.cinyuverse';

function cinyuverseClaudeMd(projectName: string): string {
  return [
    '# 小说创作规范',
    '',
    `本项目《${projectName}》是一个 AI 辅助小说创作项目。`,
    '所有 Agent 在操作本项目时应遵循以下规范：',
    '',
    '## 项目元数据',
    '',
    '- `.cinyuverse/project.json` — 书籍信息（书名、题材、作者、目标字数）',
    '- `.cinyuverse/world-view.md` — 世界观设定',
    '- `.cinyuverse/writing-rules.md` — 写作规则、禁词表、文风要求',
    '- `.cinyuverse/style-sample.md` — 文风参考样本',
    '- `.cinyuverse/SolutionToWrite.md` — 去AI化写作方案（朱雀实测的五档可检测性、铁律与硬指标）',
    '- `.cinyuverse/pipeline.md` — 章节流水线手册（七步闭环与模板映射）',
    '- `.cinyuverse/outline.md` — 大纲（卷/章结构与细纲）',
    '- `.cinyuverse/hooks.md` — 伏笔池（状态：open/progressing/resolved）',
    '- `.cinyuverse/current-state.md` — 当前世界状态事实',
    '- `.cinyuverse/chapter-summaries.md` — 章节摘要滚动窗口',
    '- `.cinyuverse/characters/` — 角色卡（一个角色一个 .md 文件）',
    '- `.cinyuverse/story-graph.json` — 故事节拍图（节点=故事事件，边=依赖关系）',
    '- `.cinyuverse/aigc/` — AIGC 检测报告（chapter-NN.json，整章与逐段 AI 占比）',
    '- `.cinyuverse/skills/` — 写作辅助 Skill（humanizer-chinese：中文去 AI 味改写方法论，「去AI化润稿」模板依赖它；aigc-check：朱雀 AIGC 检测调用契约，「AIGC 检测」模板依赖它，密钥在项目根 `.env` 的 `ZHUQUE_API_KEY`）',
    '',
    '## 创作流程',
    '',
    '1. **初始化作品**：生成故事圣经、卷大纲、写作规则，写入对应元数据文件',
    '2. **规划章节**：读取大纲和前文摘要，为目标章节生成备忘录',
    '3. **撰写章节**：读取备忘录、角色卡、上下文，撰写正文写入 `chapters/`',
    '4. **审校章节**：从人物弧光、伏笔回收、时间线、节奏等维度审计',
    '5. **修订章节**：根据审校报告修订正文',
    '6. **更新状态**：每章完成后更新章节摘要、伏笔池、当前状态',
    '',
    '## 章节文件',
    '',
    '- 正文存放在 `chapters/` 目录，命名格式 `chapter-NN.md`',
    '- 章节备忘录存放在 `memo/` 目录（与 `chapters/` 同级），命名格式 `chapter-NN-memo.md`（十节结构，见 `.cinyuverse/pipeline.md`）',
    '- 每章开头用一级标题标注章节名',
    '',
    '## 注意事项',
    '',
    '- 撰写前务必读取相关角色卡和前文摘要，保持人设一致',
    '- 禁词表见 `.cinyuverse/writing-rules.md`，切勿使用',
    '- 文风参考 `.cinyuverse/style-sample.md`',
    '- 伏笔状态变更时同步更新 `.cinyuverse/hooks.md`',
    '',
  ].join('\n');
}

function cinyuverseProjectJson(projectName: string): string {
  return JSON.stringify(
    {
      bookName: projectName,
      genre: '',
      tags: [],
      author: '',
      status: 'draft',
      worldView: '',
      style: '',
      styleSample: '',
      targetWords: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    null,
    2
  );
}

const CINYUVERSE_OUTLINE_MD = [
  '# 大纲',
  '',
  '## 第一卷',
  '',
  '### 第1章',
  '',
  '（章节细纲：主要事件、出场角色、情节目标）',
  '',
].join('\n');

const CINYUVERSE_WORLD_VIEW_MD = [
  '# 世界观',
  '',
  '（描述故事发生的世界背景、核心设定、力量体系等）',
  '',
].join('\n');

export const CINYUVERSE_WRITING_RULES_MD = [
  '# 写作规则',
  '',
  '## 叙事基调',
  '（如：轻松幽默 / 沉郁厚重 / 冷峻克制）',
  '',
  '## 视角',
  '（如：第三人称限知 / 第一人称 / 多视角）',
  '',
  '## 禁词表',
  '（列出需要避免的词汇，每行一个）',
  '',
  '## 文风节奏',
  '',
  '以下量化阈值用于压低 AI 生成痕迹，撰写与审校都会按此计数，可按题材微调：',
  '',
  ...STYLE_RHYTHM_RULES.map((rule) => `- ${rule.constraint}`),
  '',
].join('\n');

// 模式层结论来自朱雀检测四章实测（2026-09-15），量化阈值仍在 writing-rules.md。
export const CINYUVERSE_SOLUTION_TO_WRITE_MD = [
  '---',
  'name: solution-to-write',
  'description: 去AI化写作方案：朱雀实测的五档可检测性模型、三条铁律、硬指标、送检规范、文本执行红线与活人感加法。撰写、审校、润稿前必读。',
  '---',
  '',
  '# 去AI化写作方案（SolutionToWrite）',
  '',
  '结论来自十次朱雀检测实测（2026-09-15/16）：同一管线、同一视角的十六章。单章加权',
  'AIGC 从 0.89 降到 0.27，自方案生效的第七章起十章零新增硬判；审校后整卷复测',
  '（4.3 万字一次送检）加权 0.54，硬判仅剩两处——未修订的第一章开头与第六章残留段。',
  '规律：对话主导章节稳在人工区（0.14–0.34），系统交易与设定倾倒章节回撤到疑似区',
  '（0.58–0.60）。审校只出报告不改文，改写必须接修订/去AI化润稿并复检。',
  '',
  '## 适用范围',
  '',
  '- 「撰写节拍 / 撰写章节」：按硬指标与红线写作',
  '- 「审校章节 / 审校→修订→复检」：按五档模型定位高危段',
  '- 「AIGC 检测」：按送检规范预处理与归档；「去AI化润稿」：按五档定向改写',
  '- 量化句式阈值以 `writing-rules.md` 的「文风节奏」为准，两者冲突时以本文件为准',
  '- 改写方法论见 `.cinyuverse/skills/humanizer-chinese/SKILL.md`；检测调用契约见',
  '  `.cinyuverse/skills/aigc-check/SKILL.md`',
  '',
  '## 五档可检测性模型（按内容模式，实测数据）',
  '',
  '| 内容模式 | AIGC 区间 | 实证 |',
  '| --- | --- | --- |',
  '| 规则/数字独白（自问自答或陈述式推演） | 0.99+ 必硬判 | 0.998 / 0.991 片段 |',
  '| 金钱数字流水账（独行开场） | 0.99 上下 | 0.989 / 0.994 片段 |',
  '| 超现实动作叙事（无对话） | 0.73–0.77 | 0.773 整章 / 0.715 / 0.735 片段 |',
  '| 结构化规则文本 + 观察 | 0.63；贴身解读叠加升至 0.72–0.81 | 0.630 / 0.624 / 0.754 / 0.719 / 0.808（四块连发） |',
  '| 多人对话场景（须双向交锋） | 0.16–0.49 | 0.290 / 0.197 / 0.253 / 0.219 / 0.160 |',
  '',
  '注：一方连续说明超过 150 字的「伪对话」（设定倾倒）不按对话档计，实测落在 0.68–0.74。',
  '注：全章单一场景的纯对话（无地点/事件变更）整章锁在疑似区中段（第十七章三版实测',
  '0.748 → 0.732 → 0.717）；场景内加感官微动作不算拆场景（再修订 +28% 字数仅 -0.015），',
  '拆场景指地点或事件的实际变更——切平行线、传送换场、外部事件打断背诵——修订必须',
  '先拆场景再润字。',
  '',
  '## 三条铁律',
  '',
  '1. **信息揭示的载体决定生死**：对话 > 动作 > 独白。同样的规则内容，独白被硬判（0.998），对白进人工区（0.290）。',
  '2. **独行观察开场是最弱起手**：所有「一个人走 + 看环境 + 记数字」的段落都在 0.49 以上；章节应从对话、事件或他人动作切入。',
  '3. **结构化块单独出现只到疑似区**：系统面板/规则石板本身约 0.63，叠加独白解读就会被硬判——面板可以有，解读走对话或留白。',
  '',
  '## 硬指标（撰写与审校按此计数，可按题材微调）',
  '',
  '- 对话占比 ≥ 40%；规则/设定信息必须经角色之口或动作揭示',
  '- 规则/数字推演不得由宿主独白承担——自问自答和陈述式算账（「A 对 B 是 1/N」）都算；',
  '  转成对话，或让数字直接呈现后跳进动作。连续自问 ≤ 2 句',
  '- 系统面板/结构化代码块全章 ≤ 2 次，重复的货架/状态列表能省则省',
  '- 「不是A——是B」二元否定纠正全章 ≤ 3 次',
  '- 精确数字：时间/距离可用；金钱/价格/编号类每千字 ≤ 3 个，禁止逐段均匀分布',
  '- 感知动词（看了一眼 / 下意识地 / 我没动）每千字 ≤ 4 个',
  '- 配角有名有姓、行为可区分；群像动作优先于纯内心戏',
  '',
  '## 批量生成纪律',
  '',
  '用户要求「多章一起生成」「一次写第 N 到 M 章」时，底层执行不变：仍按七步流水线',
  '（memo → 撰写 → 自检 → 五项归档）**逐章走完再进入下一章**；「一起」只体现在产出',
  '呈现上。禁止跳过任何一步、禁止一份 memo 写多章、禁止合并归档、禁止后续章节引用',
  '尚未落盘的前章内容。逐章落盘使中断损失面最小——第 N 章归档完成即为完成。',
  '',
  '## 送检规范',
  '',
  '- 剥离章节元数据头（`> 节拍：`、`> 视角：`）后再送检',
  '- 正文中的系统面板/代码块不计入送检文本',
  '- 逐段归档到 `.cinyuverse/aigc/chapter-NN.json` 时按五档模式标注每段类型',
  '- 手动网页检测后必须补录：≥0.9 的高危段回写 `.cinyuverse/aigc/chapter-NN.json`，',
  '  修订指令点名这些段落，复检核对清零——否则「润稿优先重写高危段」机制无数据可用',
  '  （实证：第六章货架推演段 4 次检测 0.99，因报告未落盘，历次修订均未触及）',
  '',
  '## 文本执行红线',
  '',
  '以下与可检测性维度正交，提炼自第七至九章实测复盘：',
  '',
  '| 缺陷 | 规则 | 实证 |',
  '| --- | --- | --- |',
  '| 创作元数据泄漏 | 正文禁止出现章节号、beat-id、文件名；引用前文用事件描述（如「上次进楼道看的时候」） | 「从第 4 章我们进门看的时候」出现 2 处 |',
  '| 逐字计数断言 | 禁用「“X” N 个字」式句式 | “可能是”两个字（实为三个字） |',
  '| 空间自相矛盾 | 门开向、楼梯/电梯等空间元素首次确立后必须沿用，动作动词须与开向一致 | 「朝里开的门」却「从里面推……推得更开」 |',
  '| 术语漂移 | 同一地点/物件全篇只用一个名字 | 「后楼梯」出现两次后被「楼梯间」取代（38 次） |',
  '| 锚定短语复用 | 同一空间锚定短语全章 ≤ 3 次；环境状态词（纯黑/发青）全章 ≤ 2 次 | 「电梯那边」三章 17 次、「纯黑」14 次 |',
  '| 硬切场失锚 | “---” 切场全章 ≤ 5 处，切后首句必须含「人物 + 位置」锚定 | 三章切场 19 处，多处切后无锚定 |',
  '| 数字自相矛盾 | 金额/轮次等数字全文对账，写入前回读上一处同一数字；面板数字转述须换算核对 | 「6 亿」vs 面板 ¥6,000,000,000（=60 亿）、「四轮」vs「三轮」 |',
  '| 回声式应答 | 对话禁止原样复述对方上一句再延伸，全章 ≤ 1 次 | 「“周奕是工具。”我说。“周奕是工具。但……”」第十七章出现 4 次 |',
  '| 数字写法双轨 | 楼层/计数统一阿拉伯数字；对账与检索时中文数字变体一并排查 | 「8 层/八层」「三楼/3 楼」混用 |',
  '| 上下文断供 | 跨会话写作前必读角色卡与既有章节；写后对账人名/系统名是否漂移，发现新名字先查剧情依据 | 「沈遥」→「沈澄」第27章断裂（98 次）、「补贴系统」→「补给系统」第25章起（52 次） |',
  '',
  '修订提示词本身的坑（实测）：审校/修订清单若含未核实条目，agent 会照单执行——曾出现',
  '要求删除「不存在的重复段落」、改掉「刻意设计的口误更正节拍」。规则：修订指令必须逐条',
  '附原文实证位置；执行方对查无实证的条目标注「未证实」并跳过回报，不得凭指令直接改。',
  '',
  '## 活人感加法',
  '',
  '「文本执行红线」全是减法——防 AI 指纹；本节是配套的加法——防止把文字优化成极简',
  '回声体（实证：第三十章整章三句回声循环、第三十四章「便利店的灯是亮的」重复数十次、',
  '全章 79% 句子 ≤8 字、词形数腰斩——检测分数不差，小说死了）。每章按此自查：',
  '',
  '- 生活颗粒度：≥3 个非剧情必需的具体细节（食物形态、天气、店内杂音、路人碎片），用描述不用精确计数',
  '- 感官轮换：每章至少覆盖 3 种感官通道（视/听/触/嗅/味），不能只有「看」',
  '- 对话允许不规矩：打断、答非所问、说半句、跑题到日常——真实感与「回声式应答」红线天然互解',
  '- 情绪具体化：写「做了什么」不写「感觉什么」；悲伤落在具体记忆片段上，不用抽象宣告',
  '- 人物习惯：主要角色各保留一个与剧情无关的小习惯',
  '- 句长分布：≤8 字短句占比 ≤50%，描写性中长句必须有存在空间（方差要有，不是把句子拉长）',
  '',
  '加法与红线不冲突：生活细节用描述性语言，不堆精确数字（避开数字红线）；具体记忆是',
  '情节事实的一部分，受「不编造新情节」约束的只有伏笔与主线事件。',
  '',
].join('\n');

export const CINYUVERSE_PIPELINE_MD = [
  '# 章节流水线（Pipeline）',
  '',
  '每章走完七步闭环；流程由写作模板强制执行，本手册只做交接说明与模板映射——',
  '执行逻辑以模板内容为准，不要凭手册复述。',
  '',
  '## 单章七步',
  '',
  '| # | 步骤 | 载体 |',
  '| --- | --- | --- |',
  '| ① | 读节拍：beat-NN 的 description / characters / hooks / completion_criteria | `.cinyuverse/story-graph.json` |',
  '| ② | 读前章锚点：上一章结尾段（尾景 / 人物位置 / 时间线 / 未决动作） | `chapters/chapter-(NN-1).md` |',
  '| ③ | 读规则：writing-rules 阈值 + SolutionToWrite 硬指标与红线 | `.cinyuverse/` |',
  '| ④ | 写十节备忘录 | `memo/chapter-NN-memo.md` |',
  '| ⑤ | 写正文（按 memo 三/四/五/六节撰写，执行七/八/九节） | `chapters/chapter-NN.md` |',
  '| ⑥ | 自检：节奏计数 + 完成判定逐条核对，超标先修再交付 | 正文内自查 |',
  '| ⑦ | 五项归档：摘要 / current-state / hooks / 节拍图双状态 / 下一章 memo | `.cinyuverse/` + `memo/` |',
  '',
  '## 模板映射',
  '',
  '| 模板（会话输入框触发） | 覆盖步骤 |',
  '| --- | --- |',
  '| 规划章节（plan-chapter） | ① ② ③ ④ |',
  '| 撰写章节（write-chapter） | ② ③ ⑤ ⑥ |',
  '| 撰写节拍（write-beat） | ①–⑦ 全链，含五项归档 |',
  '| 审校章节（audit-chapter） | ⑥ 的独立深检：写后对账 + 计数审计 |',
  '| 审校→修订→复检（audit-revise-recheck） | ⑥ + 修订 + 复检 |',
  '| AIGC 检测 / 去AI化润稿 | 送检规范与按五档定向改写 |',
  '',
  '## 十节备忘录与五项归档',
  '',
  '结构定义随模板下发（十节 = 规划章节的输出规范；五项 = 撰写节拍的步骤 5），',
  '此处不复述，防止与模板漂移。备忘录存放于 `memo/` 目录（与 `chapters/` 同级）。',
  '',
  '## 闭环',
  '',
  '十节 memo（前置约束）→ 撰写 → 硬指标自检 → 五项归档（收尾）→ 下一章 memo。',
  '少一步都会导致后续章节失锚或漂移。',
  '',
].join('\n');

const CINYUVERSE_HOOKS_MD = [
  '# 伏笔池',
  '',
  '| hook_id | 起始章节 | 类型 | 状态 | 预期回收 | 备注 |',
  '| --- | --- | --- | --- | --- | --- |',
  '',
].join('\n');

const CINYUVERSE_CURRENT_STATE_MD = [
  '# 当前状态',
  '',
  '| 字段 | 值 | 章节 |',
  '| --- | --- | --- |',
  '',
].join('\n');

const CINYUVERSE_CHAPTER_SUMMARIES_MD = [
  '# 章节摘要',
  '',
  '（每章完成后在此追加摘要，格式：## 第N章 — 标题）',
  '',
].join('\n');

const CINYUVERSE_STYLE_SAMPLE_MD = [
  '# 文风样本',
  '',
  '（粘贴一段能代表目标文风的文字，Agent 撰写时会参考）',
  '',
].join('\n');

const CINYUVERSE_STORY_GRAPH_JSON = JSON.stringify(
  {
    beats: [
      {
        id: 'beat-001',
        title: '故事开端',
        description: '主角的日常世界，引出核心矛盾',
        beat_type: 'plot_point',
        chapter_hint: 1,
        status: 'planned',
        characters: [],
        hooks: [],
        volume: 1,
        arc: '第一幕',
        sort_order: 0,
      },
    ],
    edges: [],
  },
  null,
  2
);

/**
 * Create the `.cinyuverse/` metadata directory with template files.
 * Safe to call when the directory already exists — existing files are
 * never overwritten.
 */
async function ensureCinyuverseScaffold(
  repoPath: string,
  projectName: string
): Promise<void> {
  const metaDir = joinLocalPath(repoPath, CINYUVERSE_DIR);
  const charactersDir = joinLocalPath(metaDir, 'characters');
  const humanizerDir = joinLocalPath(metaDir, 'skills/humanizer-chinese');
  const aigcCheckDir = joinLocalPath(metaDir, 'skills/aigc-check');
  const chaptersDir = joinLocalPath(repoPath, 'chapters');

  // Create directories (createDirectory is idempotent on the backend).
  await Promise.all([
    fileTreeApi.createDirectory(metaDir),
    fileTreeApi.createDirectory(charactersDir),
    fileTreeApi.createDirectory(humanizerDir),
    fileTreeApi.createDirectory(aigcCheckDir),
    fileTreeApi.createDirectory(chaptersDir),
  ]);

  // Write template files — only if they don't already exist.
  // writeTextFile overwrites, so we guard with a simple "best effort" approach:
  // these are only called during project creation, so overwriting is acceptable.
  const writes: Array<Promise<void>> = [
    writeTextFile(
      joinLocalPath(metaDir, 'CLAUDE.md'),
      cinyuverseClaudeMd(projectName)
    ),
    writeTextFile(
      joinLocalPath(metaDir, 'project.json'),
      cinyuverseProjectJson(projectName)
    ),
    writeTextFile(joinLocalPath(metaDir, 'outline.md'), CINYUVERSE_OUTLINE_MD),
    writeTextFile(
      joinLocalPath(metaDir, 'world-view.md'),
      CINYUVERSE_WORLD_VIEW_MD
    ),
    writeTextFile(
      joinLocalPath(metaDir, 'writing-rules.md'),
      CINYUVERSE_WRITING_RULES_MD
    ),
    writeTextFile(
      joinLocalPath(metaDir, 'SolutionToWrite.md'),
      CINYUVERSE_SOLUTION_TO_WRITE_MD
    ),
    writeTextFile(
      joinLocalPath(metaDir, 'pipeline.md'),
      CINYUVERSE_PIPELINE_MD
    ),
    writeTextFile(joinLocalPath(metaDir, 'hooks.md'), CINYUVERSE_HOOKS_MD),
    writeTextFile(
      joinLocalPath(metaDir, 'current-state.md'),
      CINYUVERSE_CURRENT_STATE_MD
    ),
    writeTextFile(
      joinLocalPath(metaDir, 'chapter-summaries.md'),
      CINYUVERSE_CHAPTER_SUMMARIES_MD
    ),
    writeTextFile(
      joinLocalPath(metaDir, 'style-sample.md'),
      CINYUVERSE_STYLE_SAMPLE_MD
    ),
    writeTextFile(
      joinLocalPath(metaDir, 'story-graph.json'),
      CINYUVERSE_STORY_GRAPH_JSON
    ),
    writeTextFile(joinLocalPath(humanizerDir, 'SKILL.md'), humanizerSkillMd),
    writeTextFile(joinLocalPath(aigcCheckDir, 'SKILL.md'), aigcCheckSkillMd),
    writeTextFile(
      joinLocalPath(repoPath, '.env.example'),
      CINYUVERSE_ENV_EXAMPLE
    ),
  ];

  await Promise.all(writes);
}

const ProjectFormDialogImpl = NiceModal.create<ProjectFormDialogProps>(
  ({ autoOpenFolderPicker = false }) => {
    const { t } = useTranslation(['dialogs', 'common']);
    const modal = useModal();
    const isOpenExistingFolderMode = autoOpenFolderPicker;
    const { createProject } = useProjectMutations();

    const [projectName, setProjectName] = useState('');
    const [projectDescription, setProjectDescription] = useState('');
    const [parentFolderPath, setParentFolderPath] = useState('');
    const [selectedFolderPath, setSelectedFolderPath] = useState('');
    const [selectedFolderIsGitRepo, setSelectedFolderIsGitRepo] = useState<
      boolean | null
    >(null);
    const [includeReadme, setIncludeReadme] = useState(true);
    const [includeGitignore, setIncludeGitignore] = useState(true);
    const [includeLicense, setIncludeLicense] = useState(false);
    const [isPickingFolder, setIsPickingFolder] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    const hasAutoOpenedFolderRef = useRef(false);
    const folderName = toFolderName(projectName);
    const targetProjectPath = useMemo(() => {
      if (!parentFolderPath || !folderName) {
        return '';
      }

      return joinLocalPath(parentFolderPath, folderName);
    }, [folderName, parentFolderPath]);

    useEffect(() => {
      if (!modal.visible) {
        hasAutoOpenedFolderRef.current = false;
        return;
      }

      setProjectName('');
      setProjectDescription('');
      setParentFolderPath('');
      setSelectedFolderPath('');
      setSelectedFolderIsGitRepo(null);
      setIncludeReadme(true);
      setIncludeGitignore(true);
      setIncludeLicense(false);
      setIsPickingFolder(false);
      setIsSubmitting(false);
      setError('');
    }, [modal.visible]);

    const handlePickFolder = useCallback(async () => {
      setError('');
      try {
        setIsPickingFolder(true);
        const selected = await pickHostDirectory({
          title: isOpenExistingFolderMode
            ? t('projectForm.pickFolderTitleExisting')
            : t('projectForm.pickFolderTitleNew'),
        });
        if (!selected || typeof selected !== 'string') {
          return;
        }

        const normalizedSelected = normalizeDisplayPath(selected);

        if (isOpenExistingFolderMode) {
          const isGitRepo = await repoApi.checkGitRepoPath(normalizedSelected);
          setSelectedFolderPath(normalizedSelected);
          setSelectedFolderIsGitRepo(isGitRepo);
          setProjectName(getPathName(normalizedSelected));
          return;
        }

        setParentFolderPath(normalizedSelected);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : t('projectForm.pickFolderFailed')
        );
      } finally {
        setIsPickingFolder(false);
      }
    }, [isOpenExistingFolderMode, t]);

    useEffect(() => {
      if (
        !modal.visible ||
        !autoOpenFolderPicker ||
        hasAutoOpenedFolderRef.current
      ) {
        return;
      }

      hasAutoOpenedFolderRef.current = true;
      void handlePickFolder();
    }, [autoOpenFolderPicker, handlePickFolder, modal.visible]);

    const handleCancel = () => {
      modal.resolve({ status: 'canceled' } as ProjectFormDialogResult);
      modal.hide();
    };

    const writeTemplateFiles = async (repoPath: string) => {
      const writes: Array<Promise<void>> = [];

      if (includeReadme) {
        writes.push(
          writeTextFile(
            joinLocalPath(repoPath, 'README.md'),
            createReadme(projectName.trim(), projectDescription)
          )
        );
      }

      if (includeGitignore) {
        writes.push(
          writeTextFile(
            joinLocalPath(repoPath, '.gitignore'),
            GITIGNORE_TEMPLATE
          )
        );
      }

      if (includeLicense) {
        writes.push(
          writeTextFile(
            joinLocalPath(repoPath, 'LICENSE'),
            MIT_LICENSE_TEMPLATE
          )
        );
      }

      await Promise.all(writes);

      // Scaffold .cinyuverse/ novel metadata directory.
      await ensureCinyuverseScaffold(repoPath, projectName.trim());
    };

    const createProjectRecord = async (
      finalProjectName: string,
      repoPathForProject: string
    ) => {
      const createData: CreateProject = {
        name: finalProjectName,
        repositories: [
          {
            display_name: finalProjectName,
            git_repo_path: repoPathForProject,
          },
        ],
      };

      return createProject.mutateAsync(createData);
    };

    const handleCreateNewProject = async () => {
      const finalProjectName = projectName.trim();

      if (!finalProjectName) {
        setError(t('projectForm.nameRequired'));
        return;
      }

      if (!folderName) {
        setError(t('projectForm.invalidFolderName'));
        return;
      }

      if (!parentFolderPath) {
        setError(t('projectForm.locationRequired'));
        return;
      }

      setError('');
      setIsSubmitting(true);

      try {
        const repo = await repoApi.init({
          parent_path: parentFolderPath,
          folder_name: folderName,
        });
        await writeTemplateFiles(repo.path);
        const project = await createProjectRecord(finalProjectName, repo.path);
        modal.resolve({ status: 'saved', project } as ProjectFormDialogResult);
        modal.hide();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : t('projectForm.createFailed')
        );
      } finally {
        setIsSubmitting(false);
      }
    };

    const handleOpenExistingFolder = async () => {
      const finalProjectName =
        projectName.trim() || getPathName(selectedFolderPath);

      if (!selectedFolderPath) {
        setError(t('projectForm.selectFolderRequired'));
        return;
      }

      setError('');
      setIsSubmitting(true);

      try {
        const repo = selectedFolderIsGitRepo
          ? await repoApi.register({
              path: selectedFolderPath,
              display_name: finalProjectName,
            })
          : await repoApi.initAtPath({
              path: selectedFolderPath,
              display_name: finalProjectName,
            });

        // Ensure .cinyuverse/ scaffold exists for existing folders too.
        await ensureCinyuverseScaffold(repo.path, finalProjectName);

        const project = await createProjectRecord(finalProjectName, repo.path);
        modal.resolve({ status: 'saved', project } as ProjectFormDialogResult);
        modal.hide();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : t('projectForm.openFolderFailed')
        );
      } finally {
        setIsSubmitting(false);
      }
    };

    const handleSubmit = () => {
      if (isOpenExistingFolderMode) {
        void handleOpenExistingFolder();
        return;
      }

      void handleCreateNewProject();
    };

    const isBusy = isSubmitting || isPickingFolder || createProject.isPending;
    const canSubmit = isOpenExistingFolderMode
      ? !!selectedFolderPath
      : !!projectName.trim() && !!parentFolderPath && !!folderName;
    const submitLabel = isOpenExistingFolderMode
      ? selectedFolderPath && selectedFolderIsGitRepo === false
        ? t('projectForm.submitInitGitAndOpen')
        : t('projectForm.submitOpenFolder')
      : t('projectForm.submitCreate');

    const handleOpenChange = (openState: boolean) => {
      if (!openState && !isBusy) {
        handleCancel();
      }
    };

    return (
      <Dialog
        open={modal.visible}
        onOpenChange={handleOpenChange}
        className="welcome-project-form-surface border-0 sm:max-w-[640px]"
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isOpenExistingFolderMode
                ? t('projectForm.titleExisting')
                : t('projectForm.titleNew')}
            </DialogTitle>
            <DialogDescription>
              {isOpenExistingFolderMode
                ? t('projectForm.descriptionExisting')
                : t('projectForm.descriptionNew')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {isOpenExistingFolderMode ? (
              <div className="space-y-2">
                <Label>{t('projectForm.folderLabel')}</Label>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void handlePickFolder()}
                    disabled={isBusy}
                    className="gap-1.5 bg-[var(--surface-control-hover)] text-foreground hover:bg-foreground/[0.14]"
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                    {t('projectForm.chooseFolder')}
                  </Button>
                  <ProjectPathPreview
                    label={t('projectForm.folderLabel')}
                    value={selectedFolderPath}
                    placeholder={t('projectForm.noFolderSelected')}
                  />
                </div>
                {selectedFolderPath && selectedFolderIsGitRepo !== null ? (
                  <p
                    className={
                      selectedFolderIsGitRepo
                        ? 'text-sm text-[hsl(var(--success))]'
                        : 'text-sm text-[hsl(var(--warning))]'
                    }
                  >
                    {selectedFolderIsGitRepo
                      ? t('projectForm.recognizedGitRepo')
                      : t('projectForm.notGitRepoHint')}
                  </p>
                ) : null}
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>{t('projectForm.nameLabel')}</Label>
                  <TextInput
                    label={t('projectForm.nameLabel')}
                    isLabelHidden
                    value={projectName}
                    onChange={setProjectName}
                    placeholder={t('projectForm.namePlaceholder')}
                    isDisabled={isBusy}
                    hasAutoFocus
                    width="100%"
                    className="[&_input]:text-sm"
                    style={textInputSurfaceStyle}
                  />
                </div>

                <div className="space-y-2">
                  <Label>{t('projectForm.descriptionLabel')}</Label>
                  <TextArea
                    label={t('projectForm.descriptionLabel')}
                    isLabelHidden
                    value={projectDescription}
                    onChange={setProjectDescription}
                    placeholder={t('projectForm.descriptionPlaceholder')}
                    rows={4}
                    isDisabled={isBusy}
                    width="100%"
                    className="project-form-description-field [&_textarea]:resize-none [&_textarea]:text-sm"
                    style={textInputSurfaceStyle}
                  />
                </div>

                <div className="space-y-2">
                  <Label>{t('projectForm.locationLabel')}</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void handlePickFolder()}
                      disabled={isBusy}
                      className="gap-1.5 bg-[var(--surface-control-hover)] text-foreground hover:bg-foreground/[0.14]"
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                      {t('projectForm.chooseLocation')}
                    </Button>
                    <ProjectPathPreview
                      label={t('projectForm.locationLabel')}
                      value={parentFolderPath}
                      placeholder={t('projectForm.noLocationSelected')}
                    />
                  </div>
                  {targetProjectPath ? (
                    <p className="truncate text-xs text-muted-foreground">
                      {t('projectForm.willCreate', { path: targetProjectPath })}
                    </p>
                  ) : null}
                </div>

                <div className="rounded-lg border bg-muted/20 p-3">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <GitBranch className="h-4 w-4 text-muted-foreground" />
                    {t('projectForm.gitInitNote')}
                  </div>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={includeReadme}
                        onCheckedChange={(checked) =>
                          setIncludeReadme(checked === true)
                        }
                        disabled={isBusy}
                      />
                      {t('projectForm.createReadme')}
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={includeGitignore}
                        onCheckedChange={(checked) =>
                          setIncludeGitignore(checked === true)
                        }
                        disabled={isBusy}
                      />
                      {t('projectForm.createGitignore')}
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={includeLicense}
                        onCheckedChange={(checked) =>
                          setIncludeLicense(checked === true)
                        }
                        disabled={isBusy}
                      />
                      {t('projectForm.createLicense')}
                    </label>
                  </div>
                </div>
              </>
            )}

            {error ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={isBusy}
            >
              {t('common:cancel')}
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={isBusy || !canSubmit}
            >
              {isBusy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('projectForm.processing')}
                </>
              ) : (
                submitLabel
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

export const ProjectFormDialog = defineModal<
  ProjectFormDialogProps,
  ProjectFormDialogResult
>(ProjectFormDialogImpl);
