import { describe, expect, it } from 'vitest';
import {
  imitateStatusLabel,
  imitateStepPercent,
} from './NovelLibraryPanel';

const base = {
  step: null as number | null,
  stepTotal: null as number | null,
  progress: null as string | null,
  error: null as string | null,
  updatedAt: '1',
  conversationId: null as string | null,
};

describe('imitateStatusLabel', () => {
  it('shows idle as 未分析', () => {
    expect(imitateStatusLabel(null)).toBe('未分析');
    expect(
      imitateStatusLabel({
        ...base,
        phase: 'idle',
      })
    ).toBe('未分析');
  });

  it('prefers progress while running and prefixes step', () => {
    expect(
      imitateStatusLabel({
        ...base,
        phase: 'running',
        step: 4,
        stepTotal: 5,
        progress: 'Agent 分析中… 已耗时 1分05秒',
      })
    ).toBe('4/5 · Agent 分析中… 已耗时 1分05秒');
  });

  it('surfaces failure errors', () => {
    expect(
      imitateStatusLabel({
        ...base,
        phase: 'failed',
        error: '超时',
      })
    ).toBe('失败：超时');
  });

  it('marks completed as deep-pack ready', () => {
    expect(
      imitateStatusLabel({
        ...base,
        phase: 'completed',
        step: 5,
        stepTotal: 5,
        progress: '分析完成',
      })
    ).toBe('已拆出故事线/人物卡/写法');
  });

  it('surfaces cancelled idle as 已中断', () => {
    expect(
      imitateStatusLabel({
        ...base,
        phase: 'idle',
        progress: '已中断',
      })
    ).toBe('已中断');
  });
});

describe('imitateStepPercent', () => {
  it('maps step to percent while running', () => {
    expect(
      imitateStepPercent({
        ...base,
        phase: 'running',
        step: 4,
        stepTotal: 5,
        progress: 'Agent 分析中…',
      })
    ).toBe(80);
  });

  it('is 100 when completed', () => {
    expect(
      imitateStepPercent({
        ...base,
        phase: 'completed',
        step: 5,
        stepTotal: 5,
      })
    ).toBe(100);
  });
});
