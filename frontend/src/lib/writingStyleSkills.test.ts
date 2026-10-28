import { describe, expect, it } from 'vitest';

import {
  composeStagedReference,
  extractExcerptSections,
  stagedReferenceName,
  stripFrontmatter,
  type WritingStyleSkill,
} from './writingStyleSkills';

const SKILL: WritingStyleSkill = {
  id: 'xin-fanqie-style-gou',
  book: '每年加一点从山野村夫成仙界道祖',
  author: '',
  category: '番茄小说风格',
  keywords: ['苟道流'],
  hasExamples: true,
};

const SKILL_MD = [
  '---',
  'name: xin-fanqie-style-gou',
  'description: "《每年加一点》文风锁定技能。"',
  '---',
  '',
  '# 《每年加一点》文风锁定',
  '',
  '## 角色定位',
  '',
  '短句为主，单句成段。',
].join('\n');

const EXAMPLES_MD = [
  '# 文风参考段落摘录',
  '',
  '## 摘录1：开篇对话切入（第1章）',
  '',
  '“长生真是寂寞如雪啊。”',
  '',
  '## 摘录2：互动节奏（第1章）',
  '',
  '“哞！”',
  '',
  '## 摘录3：危机钩子（第5章）',
  '',
  '“一切都已被他看透。”',
].join('\n');

describe('stripFrontmatter', () => {
  it('removes the leading frontmatter block', () => {
    expect(stripFrontmatter(SKILL_MD).startsWith('# 《')).toBe(true);
  });

  it('leaves markdown without frontmatter untouched', () => {
    expect(stripFrontmatter('# 标题')).toBe('# 标题');
  });
});

describe('extractExcerptSections', () => {
  it('splits on `## 摘录` headings and drops the file preamble', () => {
    const sections = extractExcerptSections(EXAMPLES_MD);
    expect(sections).toHaveLength(3);
    expect(sections[0].startsWith('## 摘录1')).toBe(true);
    expect(sections[0]).toContain('寂寞如雪');
  });
});

describe('stagedReferenceName', () => {
  it('derives the references/ file name from the book title', () => {
    expect(stagedReferenceName(SKILL)).toBe(
      '文风-每年加一点从山野村夫成仙界道祖.md'
    );
  });

  it('sanitizes path-hostile characters', () => {
    // ASCII colon and slash are replaced; the full-width colon is legal in
    // Windows file names and stays.
    expect(stagedReferenceName({ ...SKILL, book: '快：开局/an绝' })).toBe(
      '文风-快：开局_an绝.md'
    );
  });
});

describe('composeStagedReference', () => {
  it('builds a self-contained reference: marker + spec + all excerpts', () => {
    const content = composeStagedReference({
      skill: SKILL,
      skillMd: SKILL_MD,
      examplesMd: EXAMPLES_MD,
    });

    expect(content).toContain('<!-- xin-skills:xin-fanqie-style-gou -->');
    expect(content).toContain(
      '# 文风参考 · 《每年加一点从山野村夫成仙界道祖》'
    );
    expect(content).toContain('> 番茄小说风格');
    expect(content).toContain('## 角色定位');
    expect(content).toContain('## 代表性摘录');
    expect(content).toContain('### 摘录1：开篇对话切入（第1章）');
    // A staged reference keeps every curated excerpt — distillation, not
    // import, decides which ones represent the style.
    expect(content).toContain('### 摘录3：危机钩子（第5章）');
    // Staging never writes the live style authority or its guardrails.
    expect(content).not.toContain('文风样本');
    expect(content).not.toContain('节奏执行原则');
  });

  it('omits the excerpt section when the skill ships no examples', () => {
    const content = composeStagedReference({
      skill: SKILL,
      skillMd: SKILL_MD,
      examplesMd: null,
    });
    expect(content).not.toContain('## 代表性摘录');
  });

  it('carries the author in the byline when present', () => {
    const content = composeStagedReference({
      skill: { ...SKILL, author: '古龙', category: '古龙武侠风格' },
      skillMd: SKILL_MD,
      examplesMd: null,
    });
    expect(content).toContain('> 古龙 · 古龙武侠风格');
  });
});
