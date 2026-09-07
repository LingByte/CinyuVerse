import { describe, expect, it } from 'vitest';

import {
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
