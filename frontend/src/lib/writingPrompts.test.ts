import { describe, expect, it } from 'vitest';

import aigcCheckSkillMd from './aigc-check.SKILL.md?raw';
import humanizerSkillMd from './humanizer-chinese.SKILL.md?raw';

import {
  STYLE_RHYTHM_FORBIDDEN_PATTERNS,
  STYLE_RHYTHM_RULES,
  WRITING_PROMPT_TEMPLATES,
  WRITING_PROMPTS_BY_ID,
  WRITING_PROMPTS_BY_CATEGORY,
  buildWritingPrompt,
  getWritingPrompt,
  type WritingPromptInput,
} from './writingPrompts';

describe('writingPrompts', () => {
  it('every template has a unique id', () => {
    const ids = WRITING_PROMPT_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every template is indexed by id', () => {
    for (const tpl of WRITING_PROMPT_TEMPLATES) {
      expect(WRITING_PROMPTS_BY_ID.get(tpl.id)).toBe(tpl);
    }
  });

  it('every template appears in its category bucket', () => {
    for (const tpl of WRITING_PROMPT_TEMPLATES) {
      const bucket = WRITING_PROMPTS_BY_CATEGORY[tpl.category];
      expect(bucket).toContain(tpl);
    }
  });

  it('buildWritingPrompt returns null for unknown id', () => {
    expect(buildWritingPrompt('does-not-exist', {})).toBeNull();
  });

  it('buildWritingPrompt produces non-empty string for known id', () => {
    const input: WritingPromptInput = {
      bookName: '测试书',
      genre: '玄幻',
      chapterNumber: 3,
      wordCount: 2500,
      guidance: '注意节奏',
    };
    const prompt = buildWritingPrompt('write-chapter', input);
    expect(prompt).toBeTruthy();
    expect(prompt).toContain('第 3 章');
    expect(prompt).toContain('2500');
    expect(prompt).toContain('注意节奏');
  });

  it('plan-chapter includes memo file path with zero-padded number', () => {
    const prompt = buildWritingPrompt('plan-chapter', { chapterNumber: 5 });
    expect(prompt).toContain('chapter-05-memo.md');
  });

  it('write-chapter includes chapter file path with zero-padded number', () => {
    const prompt = buildWritingPrompt('write-chapter', { chapterNumber: 12 });
    expect(prompt).toContain('chapter-12.md');
  });

  it('init-foundation includes book name and genre', () => {
    const prompt = buildWritingPrompt('init-foundation', {
      bookName: '星河舰队',
      genre: '科幻',
    });
    expect(prompt).toContain('星河舰队');
    expect(prompt).toContain('科幻');
  });

  it('getWritingPrompt returns the template', () => {
    expect(getWritingPrompt('audit-chapter')?.id).toBe('audit-chapter');
  });

  it('templates cover all expected categories', () => {
    const categories = Object.keys(WRITING_PROMPTS_BY_CATEGORY);
    expect(categories).toContain('foundation');
    expect(categories).toContain('chapter');
    expect(categories).toContain('review');
    expect(categories).toContain('character');
    expect(categories).toContain('worldbuilding');
    expect(categories).toContain('meta');
  });
});

describe('style rhythm baseline', () => {
  it('every rule pairs a constraint with an audit item', () => {
    expect(STYLE_RHYTHM_RULES.length).toBeGreaterThan(0);
    for (const rule of STYLE_RHYTHM_RULES) {
      expect(rule.constraint).toBeTruthy();
      expect(rule.audit).toBeTruthy();
    }
  });

  it('write-chapter embeds every rhythm constraint', () => {
    const prompt = buildWritingPrompt('write-chapter', { chapterNumber: 1 });
    for (const rule of STYLE_RHYTHM_RULES) {
      expect(prompt).toContain(rule.constraint);
    }
  });

  it('write-beat embeds every rhythm constraint', () => {
    const prompt = buildWritingPrompt('write-beat', { beatTitle: '开端' });
    for (const rule of STYLE_RHYTHM_RULES) {
      expect(prompt).toContain(rule.constraint);
    }
  });

  it('audit-chapter embeds every counting item and the metrics table', () => {
    const prompt = buildWritingPrompt('audit-chapter', { chapterNumber: 1 });
    for (const rule of STYLE_RHYTHM_RULES) {
      expect(prompt).toContain(rule.audit);
    }
    expect(prompt).toContain('文风节奏统计');
    expect(prompt).toContain('| 指标 | 实测值 | 阈值 | 是否超标 |');
  });

  it('init-foundation asks for quantified style rhythm rules', () => {
    const prompt = buildWritingPrompt('init-foundation', {
      bookName: '测试书',
    });
    expect(prompt).toContain('文风节奏');
  });

  it('forbidden patterns are listed and non-empty', () => {
    expect(STYLE_RHYTHM_FORBIDDEN_PATTERNS.length).toBeGreaterThan(0);
    for (const pattern of STYLE_RHYTHM_FORBIDDEN_PATTERNS) {
      expect(pattern).toBeTruthy();
    }
  });

  it('write-chapter lists forbidden patterns, self-check and rewrite rule', () => {
    const prompt = buildWritingPrompt('write-chapter', { chapterNumber: 1 });
    for (const pattern of STYLE_RHYTHM_FORBIDDEN_PATTERNS) {
      expect(prompt).toContain(pattern);
    }
    expect(prompt).toContain('自查');
    expect(prompt).toContain('从零撰写');
    expect(prompt).toContain('不参照、不修补旧稿');
  });

  it('write-beat lists forbidden patterns, self-check and rewrite rule', () => {
    const prompt = buildWritingPrompt('write-beat', { beatTitle: '开端' });
    for (const pattern of STYLE_RHYTHM_FORBIDDEN_PATTERNS) {
      expect(prompt).toContain(pattern);
    }
    expect(prompt).toContain('自查');
    expect(prompt).toContain('不参照、不修补旧稿');
  });

  it('revise-chapter requires structural rewrite for rhythm violations', () => {
    const prompt = buildWritingPrompt('revise-chapter', { chapterNumber: 1 });
    expect(prompt).toContain('整段重写');
    expect(prompt).toContain('禁止逐句微调修补');
  });

  it('write-beat keeps persona continuity without imitating existing cadence', () => {
    const prompt = buildWritingPrompt('write-beat', { beatTitle: '开端' });
    expect(prompt).not.toContain('保持文风和人设一致');
    expect(prompt).toContain('句式节奏不要向已有章节看齐');
  });

  it('style rhythm rules cap one-line paragraphs absolutely and guard openings', () => {
    const singleLineRule = STYLE_RHYTHM_RULES.find((rule) =>
      rule.constraint.startsWith('单句成段')
    );
    expect(singleLineRule?.constraint).toContain('全章不超过 6 处');
    expect(singleLineRule?.constraint).toContain('开头 500 字');
    const openingRule = STYLE_RHYTHM_RULES.find((rule) =>
      rule.constraint.includes('开头 500 字内禁用')
    );
    expect(openingRule).toBeTruthy();
  });
});

describe('humanize-chapter', () => {
  it('points at the vendored skill file and embeds measurable targets', () => {
    const prompt = buildWritingPrompt('humanize-chapter', { chapterNumber: 7 });
    expect(prompt).toContain('.cinyuverse/skills/humanizer-chinese/SKILL.md');
    expect(prompt).toContain('节奏三件套');
    expect(prompt).toContain('chapter-07.md');
    for (const rule of STYLE_RHYTHM_RULES) {
      expect(prompt).toContain(rule.constraint);
    }
    for (const pattern of STYLE_RHYTHM_FORBIDDEN_PATTERNS) {
      expect(prompt).toContain(pattern);
    }
    expect(prompt).toContain('自查');
    expect(prompt).toContain('不要凭印象改写');
  });

  it('consumes the AIGC detection report when present and asks for recheck', () => {
    const prompt = buildWritingPrompt('humanize-chapter', { chapterNumber: 7 });
    expect(prompt).toContain('.cinyuverse/aigc/chapter-07.json');
    expect(prompt).toContain('label≠0');
    expect(prompt).toContain('复检');
  });
});

describe('check-aigc', () => {
  it('sequences the detection task against the scaffolded skill', () => {
    const prompt = buildWritingPrompt('check-aigc', { chapterNumber: 7 });
    expect(prompt).toContain('.cinyuverse/skills/aigc-check/SKILL.md');
    expect(prompt).toContain('ZHUQUE_API_KEY');
    expect(prompt).toContain('chapters/chapter-07.md');
    expect(prompt).toContain('.cinyuverse/aigc/chapter-07.json');
    expect(prompt).toContain('is_merge: false');
    expect(prompt).toContain('不要编造密钥');
    expect(prompt).toContain('省额度');
  });
});

describe('scaffolded aigc-check skill', () => {
  it('bundles the API contract intact', () => {
    expect(aigcCheckSkillMd).toContain('name: aigc-check');
    expect(aigcCheckSkillMd).toContain(
      'ai-gateway.edgeone.link/v1/providers/zhuque-text/classify'
    );
    expect(aigcCheckSkillMd).toContain('ZHUQUE_API_KEY');
    expect(aigcCheckSkillMd).toContain('labels_ratio');
    expect(aigcCheckSkillMd).toContain('segment_labels');
    expect(aigcCheckSkillMd).toContain('ai_ratio');
  });
});

describe('vendored humanizer-chinese skill', () => {
  it('bundles the full methodology intact', () => {
    expect(humanizerSkillMd).toContain('name: humanizer-chinese');
    expect(humanizerSkillMd).toContain('节奏三件套');
    expect(humanizerSkillMd).toContain('§23');
    expect(humanizerSkillMd).toContain('MIT');
    expect(humanizerSkillMd.length).toBeGreaterThan(5000);
  });
});
