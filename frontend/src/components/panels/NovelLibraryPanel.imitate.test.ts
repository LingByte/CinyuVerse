import { describe, expect, it } from 'vitest';
import { imitateStatusLabel } from './NovelLibraryPanel';

describe('imitateStatusLabel', () => {
  it('shows idle as 未分析', () => {
    expect(imitateStatusLabel(null)).toBe('未分析');
    expect(
      imitateStatusLabel({
        phase: 'idle',
        progress: null,
        error: null,
        updatedAt: '1',
        conversationId: null,
      })
    ).toBe('未分析');
  });

  it('prefers progress while running', () => {
    expect(
      imitateStatusLabel({
        phase: 'running',
        progress: '抽取指纹与场景…',
        error: null,
        updatedAt: '1',
        conversationId: null,
      })
    ).toBe('抽取指纹与场景…');
  });

  it('surfaces failure errors', () => {
    expect(
      imitateStatusLabel({
        phase: 'failed',
        progress: null,
        error: '超时',
        updatedAt: '1',
        conversationId: null,
      })
    ).toBe('失败：超时');
  });

  it('marks completed', () => {
    expect(
      imitateStatusLabel({
        phase: 'completed',
        progress: '分析完成',
        error: null,
        updatedAt: '1',
        conversationId: null,
      })
    ).toBe('已完成');
  });
});
