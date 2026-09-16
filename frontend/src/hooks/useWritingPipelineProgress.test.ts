import { describe, expect, it } from 'vitest';

import {
  deriveWritingGuideSteps,
  isScaffoldWorldView,
} from './useWritingPipelineProgress';

describe('isScaffoldWorldView', () => {
  it('treats empty and placeholder content as uninitialized', () => {
    expect(isScaffoldWorldView('')).toBe(true);
    expect(isScaffoldWorldView('   \n')).toBe(true);
    expect(
      isScaffoldWorldView(
        '# 世界观\n\n（描述故事发生的世界背景、核心设定、力量体系等）\n'
      )
    ).toBe(true);
  });

  it('treats real content as initialized', () => {
    expect(isScaffoldWorldView('# 世界观\n\n灵气复苏后的近未来都市。')).toBe(
      false
    );
  });
});

describe('deriveWritingGuideSteps', () => {
  it('starts with foundation as the only active step on a fresh project', () => {
    const steps = deriveWritingGuideSteps({
      worldViewInitialized: false,
      characterCount: 0,
      hasGraph: false,
      hasCurrentBeat: false,
      chapterCount: 0,
      aigcReportCount: 0,
    });
    expect(steps.find((s) => s.id === 'foundation')).toMatchObject({
      done: false,
      active: true,
    });
    expect(steps.find((s) => s.id === 'characters')?.active).toBe(false);
    expect(steps.find((s) => s.id === 'graph')).toMatchObject({
      done: false,
      active: false,
    });
    expect(steps.find((s) => s.id === 'write')?.active).toBe(false);
  });

  it('activates the characters step once the foundation exists', () => {
    const steps = deriveWritingGuideSteps({
      worldViewInitialized: true,
      characterCount: 0,
      hasGraph: false,
      hasCurrentBeat: false,
      chapterCount: 0,
      aigcReportCount: 0,
    });
    expect(steps.find((s) => s.id === 'foundation')?.done).toBe(true);
    expect(steps.find((s) => s.id === 'characters')).toMatchObject({
      done: false,
      active: true,
    });
    // The graph waits for the cast — its character fields reference cards.
    expect(steps.find((s) => s.id === 'graph')?.active).toBe(false);
  });

  it('moves to the graph step once the main cast exists', () => {
    const steps = deriveWritingGuideSteps({
      worldViewInitialized: true,
      characterCount: 2,
      hasGraph: false,
      hasCurrentBeat: false,
      chapterCount: 0,
      aigcReportCount: 0,
    });
    expect(steps.find((s) => s.id === 'characters')?.done).toBe(true);
    expect(steps.find((s) => s.id === 'graph')).toMatchObject({
      done: false,
      active: true,
    });
  });

  it('makes writing the active loop once the graph exists', () => {
    const steps = deriveWritingGuideSteps({
      worldViewInitialized: true,
      characterCount: 2,
      hasGraph: true,
      hasCurrentBeat: true,
      chapterCount: 0,
      aigcReportCount: 0,
    });
    expect(steps.find((s) => s.id === 'graph')?.done).toBe(true);
    expect(steps.find((s) => s.id === 'write')).toMatchObject({
      done: false,
      active: true,
    });
  });

  it('marks habit steps actionable after the first chapter lands', () => {
    const steps = deriveWritingGuideSteps({
      worldViewInitialized: true,
      characterCount: 2,
      hasGraph: true,
      hasCurrentBeat: true,
      chapterCount: 3,
      aigcReportCount: 1,
    });
    expect(steps.find((s) => s.id === 'write')?.done).toBe(true);
    expect(steps.find((s) => s.id === 'audit')?.active).toBe(true);
    expect(steps.find((s) => s.id === 'aigc')?.done).toBe(true);
  });
});
