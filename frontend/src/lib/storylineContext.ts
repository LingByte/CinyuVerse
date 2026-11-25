/**
 * Storyline context pack — assembles beat-local graph neighborhood,
 * hooks.md rows, current-state, recent summaries, and character excerpts
 * so infer/write prompts carry structured writing memory instead of
 * relying on the agent to rediscover files every turn.
 */

import { fileTreeApi } from '@/lib/api';

export type StoryBeatLike = {
  id: string;
  title: string;
  description?: string | null;
  beat_type: string;
  chapter_hint?: number | null;
  status: string;
  characters?: string[] | null;
  hooks?: string[] | null;
  volume?: number | null;
  arc?: string | null;
  sort_order?: number;
  completion_criteria?: string[] | null;
};

export type StoryEdgeLike = {
  from_beat: string;
  to_beat: string;
  edge_type: string;
  note?: string | null;
};

export type StoryGraphLike = {
  beats: StoryBeatLike[];
  edges: StoryEdgeLike[];
};

export type HookRow = {
  hookId: string;
  startChapter: string;
  type: string;
  status: string;
  expectedResolve: string;
  note: string;
};

export type HookReconciliation = {
  pool: HookRow[];
  graphHookIds: string[];
  /** Referenced on the graph but missing from hooks.md */
  missingInPool: string[];
  /** Present in hooks.md but never referenced by any beat */
  orphanInPool: string[];
  /** Open/progressing hooks that the selected beat should touch */
  beatHooks: HookRow[];
  /** Beat hook ids with no pool row */
  beatMissingInPool: string[];
};

export type CharacterExcerpt = {
  name: string;
  path: string;
  excerpt: string;
  missing: boolean;
};

export type StorylineMetaFiles = {
  hooksMd: string;
  currentStateMd: string;
  summariesMd: string;
  hooks: HookRow[];
};

export type BeatContextPack = {
  beat: StoryBeatLike;
  predecessors: StoryBeatLike[];
  successors: StoryBeatLike[];
  foreshadowEdges: StoryEdgeLike[];
  characterArcEdges: StoryEdgeLike[];
  reconciliation: HookReconciliation;
  characters: CharacterExcerpt[];
  currentStateMd: string;
  recentSummariesMd: string;
  neighborhoodGraph: StoryGraphLike;
};

const MAX_EXCERPT_CHARS = 1200;
const MAX_STATE_CHARS = 2500;
const MAX_SUMMARY_CHARS = 3500;

export function parseHooksMarkdown(markdown: string): HookRow[] {
  const rows: HookRow[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    const cells = trimmed
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
    if (cells.length < 4) continue;
    const hookId = cells[0] ?? '';
    if (!hookId || hookId === 'hook_id' || /^[-:]+$/.test(hookId)) continue;
    rows.push({
      hookId,
      startChapter: cells[1] ?? '',
      type: cells[2] ?? '',
      status: cells[3] ?? '',
      expectedResolve: cells[4] ?? '',
      note: cells[5] ?? '',
    });
  }
  return rows;
}

export function collectGraphHookIds(graph: StoryGraphLike): string[] {
  const ids = new Set<string>();
  for (const beat of graph.beats) {
    for (const hook of beat.hooks ?? []) {
      if (hook.trim()) ids.add(hook.trim());
    }
  }
  return [...ids].sort();
}

export function reconcileHooks(
  graph: StoryGraphLike,
  pool: HookRow[],
  beat?: StoryBeatLike | null
): HookReconciliation {
  const graphHookIds = collectGraphHookIds(graph);
  const poolIds = new Set(pool.map((h) => h.hookId));
  const graphSet = new Set(graphHookIds);

  const beatHookIds = (beat?.hooks ?? [])
    .map((h) => h.trim())
    .filter(Boolean);
  const beatHookSet = new Set(beatHookIds);

  return {
    pool,
    graphHookIds,
    missingInPool: graphHookIds.filter((id) => !poolIds.has(id)),
    orphanInPool: pool
      .map((h) => h.hookId)
      .filter((id) => !graphSet.has(id)),
    beatHooks: pool.filter((h) => beatHookSet.has(h.hookId)),
    beatMissingInPool: beatHookIds.filter((id) => !poolIds.has(id)),
  };
}

function truncate(text: string, max: number): string {
  const cleaned = text.trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max).trimEnd()}\n…(截断)`;
}

/** Keep the last few chapter summary sections for rolling context. */
export function extractRecentSummaries(
  summariesMd: string,
  keepSections = 4
): string {
  const trimmed = summariesMd.trim();
  if (!trimmed) return '';
  const parts = trimmed.split(/(?=^##\s+)/m).filter((p) => p.trim());
  if (parts.length <= 1) return truncate(trimmed, MAX_SUMMARY_CHARS);
  const body = parts.filter((p) => /^##\s+/.test(p.trim()));
  const recent = body.slice(-keepSections);
  if (recent.length === 0) return truncate(trimmed, MAX_SUMMARY_CHARS);
  return truncate(recent.join('\n').trim(), MAX_SUMMARY_CHARS);
}

async function readOptional(path: string): Promise<string> {
  try {
    return await fileTreeApi.readFile(path);
  } catch {
    return '';
  }
}

export async function loadStorylineMeta(
  rootPath: string
): Promise<StorylineMetaFiles> {
  const [hooksMd, currentStateMd, summariesMd] = await Promise.all([
    readOptional(`${rootPath}/.cinyuverse/hooks.md`),
    readOptional(`${rootPath}/.cinyuverse/current-state.md`),
    readOptional(`${rootPath}/.cinyuverse/chapter-summaries.md`),
  ]);
  return {
    hooksMd,
    currentStateMd,
    summariesMd,
    hooks: parseHooksMarkdown(hooksMd),
  };
}

export async function loadTransferSourceMarkdown(
  rootPath: string
): Promise<string> {
  return readOptional(`${rootPath}/.cinyuverse/transfer-source.md`);
}

export async function loadCharacterExcerpts(
  rootPath: string,
  names: string[]
): Promise<CharacterExcerpt[]> {
  if (names.length === 0) return [];
  let files: string[] = [];
  try {
    const listing = await fileTreeApi.listDirectoryChildren(
      rootPath,
      '.cinyuverse/characters'
    );
    files = listing.files.filter((f) => f.endsWith('.md'));
  } catch {
    files = [];
  }

  const results: CharacterExcerpt[] = [];
  for (const name of names) {
    const exact = name.trim();
    if (!exact) continue;
    // Exact basename only — avoid substring false matches (林 → 林深.md).
    const match = files.find((f) => f.replace(/\.md$/i, '') === exact);
    if (!match) {
      results.push({ name: exact, path: '', excerpt: '', missing: true });
      continue;
    }
    const path = `${rootPath}/.cinyuverse/characters/${match}`;
    const content = await readOptional(path);
    results.push({
      name,
      path: `.cinyuverse/characters/${match}`,
      excerpt: truncate(content, MAX_EXCERPT_CHARS),
      missing: !content,
    });
  }
  return results;
}

function beatNeighborhood(
  graph: StoryGraphLike,
  beatId: string
): StoryGraphLike {
  const related = new Set<string>([beatId]);
  for (const edge of graph.edges) {
    if (edge.from_beat === beatId || edge.to_beat === beatId) {
      related.add(edge.from_beat);
      related.add(edge.to_beat);
    }
  }
  // One more hop for foreshadow / character_arc chains
  for (const edge of graph.edges) {
    if (
      (edge.edge_type === 'foreshadow' || edge.edge_type === 'character_arc') &&
      (related.has(edge.from_beat) || related.has(edge.to_beat))
    ) {
      related.add(edge.from_beat);
      related.add(edge.to_beat);
    }
  }
  return {
    beats: graph.beats.filter((b) => related.has(b.id)),
    edges: graph.edges.filter(
      (e) => related.has(e.from_beat) && related.has(e.to_beat)
    ),
  };
}

export async function buildBeatContextPack(args: {
  rootPath: string;
  graph: StoryGraphLike;
  beat: StoryBeatLike;
  meta?: StorylineMetaFiles | null;
}): Promise<BeatContextPack> {
  const { rootPath, graph, beat } = args;
  const meta = args.meta ?? (await loadStorylineMeta(rootPath));
  const predecessorIds = new Set(
    graph.edges.filter((e) => e.to_beat === beat.id).map((e) => e.from_beat)
  );
  const successorIds = new Set(
    graph.edges.filter((e) => e.from_beat === beat.id).map((e) => e.to_beat)
  );
  const predecessors = graph.beats.filter((b) => predecessorIds.has(b.id));
  const successors = graph.beats.filter((b) => successorIds.has(b.id));
  const foreshadowEdges = graph.edges.filter(
    (e) =>
      e.edge_type === 'foreshadow' &&
      (e.from_beat === beat.id || e.to_beat === beat.id)
  );
  const characterArcEdges = graph.edges.filter(
    (e) =>
      e.edge_type === 'character_arc' &&
      (e.from_beat === beat.id || e.to_beat === beat.id)
  );

  const reconciliation = reconcileHooks(graph, meta.hooks, beat);
  const characters = await loadCharacterExcerpts(
    rootPath,
    beat.characters ?? []
  );

  return {
    beat,
    predecessors,
    successors,
    foreshadowEdges,
    characterArcEdges,
    reconciliation,
    characters,
    currentStateMd: truncate(meta.currentStateMd, MAX_STATE_CHARS),
    recentSummariesMd: extractRecentSummaries(meta.summariesMd),
    neighborhoodGraph: beatNeighborhood(graph, beat.id),
  };
}

function formatBeatLine(beat: StoryBeatLike): string {
  const chapter =
    beat.chapter_hint != null ? ` · 第${Number(beat.chapter_hint)}章` : '';
  return `- ${beat.id}「${beat.title}」[${beat.beat_type}/${beat.status}]${chapter}`;
}

function formatHookRow(hook: HookRow): string {
  return `- ${hook.hookId} · ${hook.status || 'unknown'} · ${hook.type || '—'} · 起章 ${hook.startChapter || '—'} · 预期回收 ${hook.expectedResolve || '—'} · ${hook.note || ''}`;
}

export function formatContextPackMarkdown(pack: BeatContextPack): string {
  const sections: string[] = [];
  const beat = pack.beat;

  sections.push('### 节拍要点');
  sections.push(`- ID：${beat.id}`);
  sections.push(`- 标题：${beat.title}`);
  sections.push(`- 类型：${beat.beat_type}`);
  sections.push(`- 状态：${beat.status}`);
  sections.push(`- 弧：${beat.arc ?? '未分类'}`);
  if (beat.chapter_hint != null) {
    sections.push(`- 章节提示：第 ${Number(beat.chapter_hint)} 章`);
  }
  if (beat.description) sections.push(`- 描述：${beat.description}`);
  if (beat.completion_criteria?.length) {
    sections.push('- 完成条件：');
    for (const c of beat.completion_criteria) sections.push(`  - ${c}`);
  }

  sections.push('');
  sections.push('### 前驱节拍');
  sections.push(
    pack.predecessors.length
      ? pack.predecessors.map(formatBeatLine).join('\n')
      : '- （无）'
  );

  sections.push('');
  sections.push('### 后继节拍');
  sections.push(
    pack.successors.length
      ? pack.successors.map(formatBeatLine).join('\n')
      : '- （无）'
  );

  sections.push('');
  sections.push('### 伏笔（节拍声明 × 伏笔池）');
  if (pack.reconciliation.beatHooks.length > 0) {
    sections.push(
      pack.reconciliation.beatHooks.map(formatHookRow).join('\n')
    );
  } else if ((beat.hooks ?? []).length === 0) {
    sections.push('- （本节拍未声明 hooks）');
  } else {
    sections.push(
      `- 声明：${(beat.hooks ?? []).join(', ')}（伏笔池中暂无对应行）`
    );
  }
  if (pack.reconciliation.beatMissingInPool.length > 0) {
    sections.push(
      `- ⚠ 图有池无：${pack.reconciliation.beatMissingInPool.join(', ')}`
    );
  }
  if (pack.foreshadowEdges.length > 0) {
    sections.push('- foreshadow 边：');
    for (const e of pack.foreshadowEdges) {
      sections.push(
        `  - ${e.from_beat} → ${e.to_beat}${e.note ? `（${e.note}）` : ''}`
      );
    }
  }

  sections.push('');
  sections.push('### 角色');
  if (pack.characters.length === 0) {
    sections.push('- （未标注角色）');
  } else {
    for (const c of pack.characters) {
      if (c.missing) {
        sections.push(`- ${c.name}：缺少角色卡`);
      } else {
        sections.push(`- ${c.name}（${c.path}）`);
        sections.push('```');
        sections.push(c.excerpt);
        sections.push('```');
      }
    }
  }

  if (pack.characterArcEdges.length > 0) {
    sections.push('');
    sections.push('### 角色弧边');
    for (const e of pack.characterArcEdges) {
      sections.push(`- ${e.from_beat} → ${e.to_beat}`);
    }
  }

  sections.push('');
  sections.push('### 当前世界状态（摘录）');
  sections.push(pack.currentStateMd || '（空）');

  sections.push('');
  sections.push('### 近章摘要（摘录）');
  sections.push(pack.recentSummariesMd || '（空）');

  sections.push('');
  sections.push('### 邻域图（节拍+一跳/伏笔链）');
  sections.push('```json');
  sections.push(JSON.stringify(pack.neighborhoodGraph, null, 2));
  sections.push('```');

  if (
    pack.reconciliation.missingInPool.length > 0 ||
    pack.reconciliation.orphanInPool.length > 0
  ) {
    sections.push('');
    sections.push('### 伏笔对账（全书）');
    if (pack.reconciliation.missingInPool.length > 0) {
      sections.push(
        `- 图有池无：${pack.reconciliation.missingInPool.join(', ')}`
      );
    }
    if (pack.reconciliation.orphanInPool.length > 0) {
      sections.push(
        `- 池有图无：${pack.reconciliation.orphanInPool.join(', ')}`
      );
    }
  }

  return sections.join('\n');
}

/**
 * Mark beat completed, clear other current flags, promote the best
 * sequential/causal successor to current when available.
 */
export function completeBeatAndAdvance(
  graph: StoryGraphLike,
  beatId: string
): StoryGraphLike {
  const successorIds = graph.edges
    .filter(
      (e) =>
        e.from_beat === beatId &&
        (e.edge_type === 'sequential' || e.edge_type === 'causal')
    )
    .map((e) => e.to_beat);

  const nextId =
    graph.beats.find(
      (b) => successorIds.includes(b.id) && b.status === 'planned'
    )?.id ??
    graph.beats.find(
      (b) => successorIds.includes(b.id) && b.status !== 'completed'
    )?.id ??
    null;

  const beats = graph.beats.map((b) => {
    if (b.id === beatId) return { ...b, status: 'completed' };
    if (nextId && b.id === nextId) return { ...b, status: 'current' };
    if (b.status === 'current' && b.id !== nextId)
      return { ...b, status: 'planned' };
    return b;
  });

  return { beats, edges: graph.edges };
}

export function buildUpdateStateGuidance(pack: BeatContextPack): string {
  const beat = pack.beat;
  const lines = [
    `对应故事节拍：${beat.id}「${beat.title}」`,
    beat.chapter_hint != null
      ? `章节提示：第 ${Number(beat.chapter_hint)} 章`
      : '章节提示：未设置（请按实际写入的 chapter 文件判断）',
    '',
    '本节拍声明的伏笔（必须在 hooks.md 中反映）：',
  ];
  if ((beat.hooks ?? []).length === 0) {
    lines.push('- （无声明；若正文新埋伏笔仍需写入 hooks.md）');
  } else {
    for (const id of beat.hooks ?? []) {
      const row = pack.reconciliation.beatHooks.find((h) => h.hookId === id);
      if (row) {
        lines.push(
          `- ${id}：池中状态=${row.status || 'unknown'}；按正文结果更新为 open/progressing/resolved`
        );
      } else {
        lines.push(`- ${id}：池中缺失，请新增行`);
      }
    }
  }
  if (beat.completion_criteria?.length) {
    lines.push('');
    lines.push('完成条件（摘要中应能核对）：');
    for (const c of beat.completion_criteria) lines.push(`- ${c}`);
  }
  lines.push('');
  lines.push(
    '同步：更新 chapter-summaries.md、current-state.md、hooks.md；不要改写章节正文。'
  );
  return lines.join('\n');
}
