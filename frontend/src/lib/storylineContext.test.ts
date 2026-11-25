import { describe, expect, it } from 'vitest';

import {
  buildUpdateStateGuidance,
  completeBeatAndAdvance,
  extractRecentSummaries,
  formatContextPackMarkdown,
  parseHooksMarkdown,
  reconcileHooks,
  type BeatContextPack,
  type StoryGraphLike,
} from './storylineContext';

const sampleHooksMd = `# 伏笔池

| hook_id | 起始章节 | 类型 | 状态 | 预期回收 | 备注 |
| --- | --- | --- | --- | --- | --- |
| H-001 | 1 | 身份 | open | 12 | 主角身世 |
| H-002 | 3 | 物件 | progressing | 20 | 玉佩裂纹 |
`;

const sampleGraph: StoryGraphLike = {
  beats: [
    {
      id: 'beat-001',
      title: '开端',
      beat_type: 'plot_point',
      status: 'current',
      chapter_hint: 1,
      hooks: ['H-001', 'H-999'],
      characters: ['林深'],
      completion_criteria: ['引出矛盾'],
      arc: '第一幕',
      sort_order: 0,
    },
    {
      id: 'beat-002',
      title: '推进',
      beat_type: 'plot_point',
      status: 'planned',
      chapter_hint: 2,
      hooks: ['H-001'],
      arc: '第一幕',
      sort_order: 1,
    },
  ],
  edges: [
    {
      from_beat: 'beat-001',
      to_beat: 'beat-002',
      edge_type: 'sequential',
    },
    {
      from_beat: 'beat-001',
      to_beat: 'beat-002',
      edge_type: 'foreshadow',
    },
  ],
};

describe('storylineContext', () => {
  it('parses hooks.md table rows', () => {
    const rows = parseHooksMarkdown(sampleHooksMd);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      hookId: 'H-001',
      status: 'open',
      type: '身份',
    });
  });

  it('reconciles graph hooks against the pool', () => {
    const pool = parseHooksMarkdown(sampleHooksMd);
    const result = reconcileHooks(sampleGraph, pool, sampleGraph.beats[0]);
    expect(result.missingInPool).toEqual(['H-999']);
    expect(result.orphanInPool).toEqual(['H-002']);
    expect(result.beatMissingInPool).toEqual(['H-999']);
    expect(result.beatHooks.map((h) => h.hookId)).toEqual(['H-001']);
  });

  it('extracts the most recent summary sections', () => {
    const md = [
      '# 章节摘要',
      '',
      '## 第1章 — A',
      '摘要一',
      '',
      '## 第2章 — B',
      '摘要二',
      '',
      '## 第3章 — C',
      '摘要三',
      '',
      '## 第4章 — D',
      '摘要四',
    ].join('\n');
    const recent = extractRecentSummaries(md, 2);
    expect(recent).toContain('第3章');
    expect(recent).toContain('第4章');
    expect(recent).not.toContain('第1章');
  });

  it('completes the current beat and advances the next planned successor', () => {
    const next = completeBeatAndAdvance(sampleGraph, 'beat-001');
    expect(next.beats.find((b) => b.id === 'beat-001')?.status).toBe(
      'completed'
    );
    expect(next.beats.find((b) => b.id === 'beat-002')?.status).toBe(
      'current'
    );
  });

  it('does not promote a beat when completing one with no successors', () => {
    const lonely: StoryGraphLike = {
      beats: [
        {
          id: 'beat-solo',
          title: '独章',
          beat_type: 'plot_point',
          status: 'current',
        },
      ],
      edges: [],
    };
    const next = completeBeatAndAdvance(lonely, 'beat-solo');
    expect(next.beats[0]?.status).toBe('completed');
  });

  it('formats a context pack with hook reconciliation warnings', () => {
    const pool = parseHooksMarkdown(sampleHooksMd);
    const reconciliation = reconcileHooks(
      sampleGraph,
      pool,
      sampleGraph.beats[0]
    );
    const pack: BeatContextPack = {
      beat: sampleGraph.beats[0],
      predecessors: [],
      successors: [sampleGraph.beats[1]],
      foreshadowEdges: [sampleGraph.edges[1]],
      characterArcEdges: [],
      reconciliation,
      characters: [
        {
          name: '林深',
          path: '.cinyuverse/characters/林深.md',
          excerpt: '冷静克制',
          missing: false,
        },
      ],
      currentStateMd: '| 地点 | 京城 | 1 |',
      recentSummariesMd: '## 第0章 — 序',
      neighborhoodGraph: sampleGraph,
    };
    const md = formatContextPackMarkdown(pack);
    expect(md).toContain('H-001');
    expect(md).toContain('图有池无：H-999');
    expect(md).toContain('林深');
    expect(buildUpdateStateGuidance(pack)).toContain('H-999');
  });
});
