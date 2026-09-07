/**
 * Novel overview panel — renders the story beat graph (React Flow) as the
 * primary view, with a side panel for beat details and actions, plus a
 * compact writing-statistics strip sourced from `.cinyuverse/` and
 * `chapters/`.
 *
 * The graph is the authoritative story plan; beats light up as chapters are
 * written. Selecting a beat opens a detail panel with infer/write actions.
 */
import '@xyflow/react/dist/style.css';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
  type OnConnect,
  Handle,
  Position,
  BackgroundVariant,
} from '@xyflow/react';
import {
  BookOpen,
  Loader2,
  RefreshCw,
  Plus,
  Trash2,
  Pencil,
  CircleDot,
  CheckCircle2,
  Circle,
  XCircle,
} from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';
import { useProjectRepos } from '@/hooks/useProjectRepos';
import { fileTreeApi, storyGraphApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type {
  StoryBeat,
  StoryGraph,
  BeatContext,
  CreateBeatInput,
  UpdateBeatInput,
} from 'shared/types';

// ---------------------------------------------------------------------------
// Stats helpers (kept from the previous implementation)
// ---------------------------------------------------------------------------

interface ChapterStat {
  fileName: string;
  title: string;
  wordCount: number;
}

interface OverviewStats {
  chapterCount: number;
  totalWords: number;
  avgWordsPerChapter: number;
  characterCount: number;
  hookTotal: number;
  hookResolved: number;
  hookOpen: number;
  outlineChapters: number;
  chapters: ChapterStat[];
}

const EMPTY_STATS: OverviewStats = {
  chapterCount: 0,
  totalWords: 0,
  avgWordsPerChapter: 0,
  characterCount: 0,
  hookTotal: 0,
  hookResolved: 0,
  hookOpen: 0,
  outlineChapters: 0,
  chapters: [],
};

function countWords(text: string): number {
  const cleaned = text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^---[\s\S]*?---/m, '')
    .replace(/```[\s\S]*?```/g, '')
    .trim();
  if (!cleaned) return 0;
  const cjkMatches = cleaned.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/g);
  const cjkCount = cjkMatches ? cjkMatches.length : 0;
  const latinText = cleaned
    .replace(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/g, ' ')
    .trim();
  const latinWords = latinText ? latinText.split(/\s+/).filter(Boolean).length : 0;
  return cjkCount + latinWords;
}

function extractChapterTitle(content: string, fallback: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : fallback;
}

async function scanWorkspace(rootPath: string): Promise<OverviewStats> {
  try {
    const chaptersDir = await fileTreeApi.listDirectoryChildren(rootPath, 'chapters');
    const chapterFiles = chaptersDir.files.filter((f) => f.endsWith('.md'));
    const chapters: ChapterStat[] = [];
    let totalWords = 0;
    for (const fileName of chapterFiles) {
      const filePath = `${rootPath}/chapters/${fileName}`;
      const content = await fileTreeApi.readFile(filePath);
      const wordCount = countWords(content);
      totalWords += wordCount;
      chapters.push({ fileName, title: extractChapterTitle(content, fileName), wordCount });
    }
    chapters.sort((a, b) => a.fileName.localeCompare(b.fileName));

    let characterCount = 0;
    try {
      const charsDir = await fileTreeApi.listDirectoryChildren(rootPath, '.cinyuverse/characters');
      characterCount = charsDir.files.filter((f) => f.endsWith('.md')).length;
    } catch {
      // characters dir may not exist
    }

    let hookTotal = 0;
    let hookResolved = 0;
    let hookOpen = 0;
    try {
      const hooksContent = await fileTreeApi.readFile(`${rootPath}/.cinyuverse/hooks.md`);
      const resolvedMatches = hooksContent.match(/-\s*\[[xX]\]\s/g) || [];
      const openMatches = hooksContent.match(/-\s*\[\s\]\s/g) || [];
      hookResolved = resolvedMatches.length;
      hookOpen = openMatches.length;
      hookTotal = hookResolved + hookOpen;
    } catch {
      // hooks file may not exist
    }

    let outlineChapters = 0;
    try {
      const outlineContent = await fileTreeApi.readFile(`${rootPath}/.cinyuverse/outline.md`);
      const chapterHeadings = outlineContent.match(/^#{2,4}\s+/gm) || [];
      outlineChapters = chapterHeadings.length;
    } catch {
      // outline may not exist
    }

    return {
      chapterCount: chapters.length,
      totalWords,
      avgWordsPerChapter: chapters.length > 0 ? Math.round(totalWords / chapters.length) : 0,
      characterCount,
      hookTotal,
      hookResolved,
      hookOpen,
      outlineChapters,
      chapters,
    };
  } catch {
    return EMPTY_STATS;
  }
}

// ---------------------------------------------------------------------------
// Beat node rendering
// ---------------------------------------------------------------------------

type BeatNodeData = {
  beat: StoryBeat;
  isSelected: boolean;
};

const STATUS_STYLES: Record<
  string,
  { border: string; bg: string; icon: typeof CircleDot; label: string }
> = {
  planned: {
    border: 'border-slate-400/60',
    bg: 'bg-slate-50 dark:bg-slate-800/60',
    icon: Circle,
    label: 'text-slate-500',
  },
  current: {
    border: 'border-blue-500',
    bg: 'bg-blue-50 dark:bg-blue-950/40',
    icon: CircleDot,
    label: 'text-blue-600',
  },
  completed: {
    border: 'border-emerald-500',
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    icon: CheckCircle2,
    label: 'text-emerald-600',
  },
  skipped: {
    border: 'border-rose-400',
    bg: 'bg-rose-50 dark:bg-rose-950/40',
    icon: XCircle,
    label: 'text-rose-500 line-through',
  },
  revised: {
    border: 'border-amber-500',
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    icon: Pencil,
    label: 'text-amber-600',
  },
};

const BEAT_TYPE_LABELS: Record<string, string> = {
  plot_point: '情节点',
  character_arc: '角色弧',
  hook_plant: '埋伏笔',
  hook_advance: '推进伏笔',
  hook_resolve: '回收伏笔',
  world_change: '世界变化',
  relationship_shift: '关系转变',
  climax: '高潮',
  turning_point: '转折点',
};

function BeatNodeComponent({ data }: NodeProps) {
  const nodeData = data as unknown as BeatNodeData;
  const { beat, isSelected } = nodeData;
  const style = STATUS_STYLES[beat.status] ?? STATUS_STYLES.planned;
  const Icon = style.icon;
  return (
    <div
      className={cn(
        'rounded-lg border-2 px-3 py-2 min-w-[160px] max-w-[220px] shadow-sm transition-shadow',
        style.border,
        style.bg,
        isSelected && 'ring-2 ring-offset-1 ring-blue-400 shadow-md'
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-slate-400" />
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={cn('h-3.5 w-3.5', style.label)} />
        <span className="text-[10px] uppercase tracking-wide text-slate-400">
          {BEAT_TYPE_LABELS[beat.beat_type] ?? beat.beat_type}
        </span>
      </div>
      <div className="text-sm font-medium text-foreground leading-snug line-clamp-2">
        {beat.title}
      </div>
      {beat.chapter_hint != null && (
        <div className="text-[10px] text-slate-400 mt-1">第 {Number(beat.chapter_hint)} 章</div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-slate-400" />
    </div>
  );
}

const nodeTypes = { beatNode: BeatNodeComponent };

// ---------------------------------------------------------------------------
// Edge styling
// ---------------------------------------------------------------------------

const EDGE_STYLES: Record<string, { stroke: string; dashed: boolean; label: string }> = {
  sequential: { stroke: '#94a3b8', dashed: false, label: '顺序' },
  causal: { stroke: '#f97316', dashed: false, label: '因果' },
  foreshadow: { stroke: '#ef4444', dashed: true, label: '伏笔' },
  parallel: { stroke: '#3b82f6', dashed: false, label: '并行' },
  alternative: { stroke: '#a855f7', dashed: true, label: '备选' },
  character_arc: { stroke: '#a855f7', dashed: true, label: '角色弧' },
  item_flow: { stroke: '#14b8a6', dashed: false, label: '物品流' },
};

// ---------------------------------------------------------------------------
// Layout — simple layered DAG layout by sort_order + volume
// ---------------------------------------------------------------------------

function layoutGraph(beats: StoryBeat[]): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  if (beats.length === 0) return positions;

  const sorted = [...beats].sort((a, b) => {
    const va = Number(a.volume ?? 0);
    const vb = Number(b.volume ?? 0);
    if (va !== vb) return va - vb;
    return Number(a.sort_order) - Number(b.sort_order);
  });

  const NODE_W = 220;
  const NODE_H = 90;
  const GAP_X = 60;
  const GAP_Y = 80;
  const MAX_PER_ROW = 4;

  sorted.forEach((beat, idx) => {
    const row = Math.floor(idx / MAX_PER_ROW);
    const col = idx % MAX_PER_ROW;
    positions.set(beat.id, {
      x: col * (NODE_W + GAP_X),
      y: row * (NODE_H + GAP_Y),
    });
  });
  return positions;
}

// ---------------------------------------------------------------------------
// Beat form (create / edit)
// ---------------------------------------------------------------------------

interface BeatFormState {
  title: string;
  description: string;
  beat_type: string;
  chapter_hint: string;
  characters: string;
  hooks: string;
  volume: string;
  arc: string;
  sort_order: string;
  status: string;
  completion_criteria: string;
}

const EMPTY_FORM: BeatFormState = {
  title: '',
  description: '',
  beat_type: 'plot_point',
  chapter_hint: '',
  characters: '',
  hooks: '',
  volume: '',
  arc: '',
  sort_order: '',
  status: 'planned',
  completion_criteria: '',
};

function formFromBeat(beat: StoryBeat): BeatFormState {
  const list = (s: string | null): string => {
    if (!s) return '';
    try {
      const arr = JSON.parse(s) as string[];
      return arr.join(', ');
    } catch {
      return s;
    }
  };
  return {
    title: beat.title,
    description: beat.description ?? '',
    beat_type: beat.beat_type,
    chapter_hint: beat.chapter_hint != null ? String(Number(beat.chapter_hint)) : '',
    characters: list(beat.characters),
    hooks: list(beat.hooks),
    volume: beat.volume != null ? String(Number(beat.volume)) : '',
    arc: beat.arc ?? '',
    sort_order: String(Number(beat.sort_order)),
    status: beat.status,
    completion_criteria: list(beat.completion_criteria),
  };
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function NovelOverviewPanel() {
  const { t } = useTranslation(['panels', 'writingPrompts']);
  const { projectId } = useProject();
  const { data: repos } = useProjectRepos(projectId);
  const rootPath = repos?.[0]?.path ?? '';

  const [stats, setStats] = useState<OverviewStats>(EMPTY_STATS);

  const [graph, setGraph] = useState<StoryGraph | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphError, setGraphError] = useState<string | null>(null);

  const [selectedBeatId, setSelectedBeatId] = useState<string | null>(null);
  const [beatContext, setBeatContext] = useState<BeatContext | null>(null);
  const [contextLoading, setContextLoading] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingBeat, setEditingBeat] = useState<StoryBeat | null>(null);
  const [form, setForm] = useState<BeatFormState>(EMPTY_FORM);

  const [statusFilter, setStatusFilter] = useState<string>('all');

  // ----- refresh stats -----
  const refreshStats = useCallback(async () => {
    if (!rootPath) {
      setStats(EMPTY_STATS);
      return;
    }
    try {
      const result = await scanWorkspace(rootPath);
      setStats(result);
    } catch {
      setStats(EMPTY_STATS);
    }
  }, [rootPath]);

  // ----- refresh graph -----
  const refreshGraph = useCallback(async () => {
    if (!projectId) {
      setGraph(null);
      return;
    }
    setGraphLoading(true);
    setGraphError(null);
    try {
      const result = await storyGraphApi.getGraph(projectId);
      setGraph(result);
    } catch (err) {
      setGraphError(err instanceof Error ? err.message : String(err));
      setGraph(null);
    } finally {
      setGraphLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    refreshStats();
    refreshGraph();
  }, [refreshStats, refreshGraph]);

  // ----- build context when selection changes -----
  useEffect(() => {
    if (!selectedBeatId) {
      setBeatContext(null);
      return;
    }
    setContextLoading(true);
    let cancelled = false;
    storyGraphApi
      .buildBeatContext(selectedBeatId)
      .then((ctx: BeatContext) => {
        if (!cancelled) setBeatContext(ctx);
      })
      .catch(() => {
        if (!cancelled) setBeatContext(null);
      })
      .finally(() => {
        if (!cancelled) setContextLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedBeatId]);

  // ----- React Flow nodes/edges -----
  const positions = useMemo(
    () => (graph ? layoutGraph(graph.beats) : new Map<string, { x: number; y: number }>()),
    [graph]
  );

  const nodes = useMemo<Node[]>(() => {
    if (!graph) return [];
    return graph.beats
      .filter((b) => statusFilter === 'all' || b.status === statusFilter)
      .map((beat) => ({
        id: beat.id,
        type: 'beatNode',
        position: positions.get(beat.id) ?? { x: 0, y: 0 },
        data: { beat, isSelected: beat.id === selectedBeatId } as unknown as Record<string, unknown>,
        selected: beat.id === selectedBeatId,
      }));
  }, [graph, positions, selectedBeatId, statusFilter]);

  const edges = useMemo<Edge[]>(() => {
    if (!graph) return [];
    const visibleIds = new Set(
      graph.beats
        .filter((b) => statusFilter === 'all' || b.status === statusFilter)
        .map((b) => b.id)
    );
    return graph.edges
      .filter((e) => visibleIds.has(e.from_beat) && visibleIds.has(e.to_beat))
      .map((edge) => {
        const style = EDGE_STYLES[edge.edge_type] ?? EDGE_STYLES.sequential;
        return {
          id: `${edge.from_beat}->${edge.to_beat}:${edge.edge_type}`,
          source: edge.from_beat,
          target: edge.to_beat,
          label: style.label,
          type: 'smoothstep',
          style: {
            stroke: style.stroke,
            strokeDasharray: style.dashed ? '6 4' : undefined,
          },
        };
      });
  }, [graph, statusFilter]);

  const [rfNodes, setRfNodes] = useState<Node[]>(nodes);
  const [rfEdges, setRfEdges] = useState<Edge[]>(edges);

  useEffect(() => setRfNodes(nodes), [nodes]);
  useEffect(() => setRfEdges(edges), [edges]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) =>
      setRfNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) =>
      setRfEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );
  const onConnect: OnConnect = useCallback(
    (connection) => {
      // Create a sequential edge by default when the user draws one
      const fromBeat = connection.source;
      const toBeat = connection.target;
      if (projectId && fromBeat && toBeat) {
        storyGraphApi
          .createEdge({ from_beat: fromBeat, to_beat: toBeat, edge_type: 'sequential', note: null })
          .then(() => refreshGraph())
          .catch(() => undefined);
      }
      setRfEdges((eds) => addEdge({ ...connection, type: 'smoothstep' }, eds));
    },
    [projectId, refreshGraph]
  );

  const onNodeClick = useCallback((_: unknown, node: Node) => {
    setSelectedBeatId(node.id);
  }, []);

  // ----- form actions -----
  const openCreateForm = useCallback(() => {
    setEditingBeat(null);
    setForm({ ...EMPTY_FORM, sort_order: String(graph?.beats.length ?? 0) });
    setShowForm(true);
  }, [graph]);

  const openEditForm = useCallback((beat: StoryBeat) => {
    setEditingBeat(beat);
    setForm(formFromBeat(beat));
    setShowForm(true);
  }, []);

  const closeForm = useCallback(() => {
    setShowForm(false);
    setEditingBeat(null);
  }, []);

  const saveBeat = useCallback(async () => {
    if (!projectId) return;
    const parseArr = (s: string): string[] | null =>
      s.trim() ? s.split(',').map((x) => x.trim()).filter(Boolean) : null;
    const parseNum = (s: string): bigint | null =>
      s.trim() ? BigInt(s.trim()) : null;
    try {
      if (editingBeat) {
        const payload: UpdateBeatInput = {
          title: form.title || null,
          description: form.description || null,
          beat_type: form.beat_type || null,
          chapter_hint: parseNum(form.chapter_hint),
          completed_chapter: null,
          characters: parseArr(form.characters),
          hooks: parseArr(form.hooks),
          status: form.status || null,
          volume: parseNum(form.volume),
          arc: form.arc || null,
          sort_order: parseNum(form.sort_order),
          completion_criteria: parseArr(form.completion_criteria),
        };
        await storyGraphApi.updateBeat(editingBeat.id, payload);
      } else {
        const input: CreateBeatInput = {
          project_id: projectId,
          title: form.title,
          description: form.description || null,
          beat_type: form.beat_type || null,
          chapter_hint: parseNum(form.chapter_hint),
          characters: parseArr(form.characters),
          hooks: parseArr(form.hooks),
          volume: parseNum(form.volume),
          arc: form.arc || null,
          sort_order: parseNum(form.sort_order),
          completion_criteria: parseArr(form.completion_criteria),
        };
        await storyGraphApi.createBeat(input);
      }
      closeForm();
      await refreshGraph();
    } catch (err) {
      setGraphError(err instanceof Error ? err.message : String(err));
    }
  }, [projectId, editingBeat, form, closeForm, refreshGraph]);

  const deleteBeat = useCallback(
    async (beatId: string) => {
      if (!confirm(t('panels:overview.deleteConfirm'))) return;
      try {
        await storyGraphApi.deleteBeat(beatId);
        if (selectedBeatId === beatId) setSelectedBeatId(null);
        await refreshGraph();
      } catch (err) {
        setGraphError(err instanceof Error ? err.message : String(err));
      }
    },
    [selectedBeatId, refreshGraph, t]
  );

  const updateStatus = useCallback(
    async (beatId: string, status: string) => {
      try {
        await storyGraphApi.updateBeat(beatId, { status, title: null, description: null, beat_type: null, chapter_hint: null, completed_chapter: null, characters: null, hooks: null, volume: null, arc: null, sort_order: null, completion_criteria: null });
        await refreshGraph();
      } catch (err) {
        setGraphError(err instanceof Error ? err.message : String(err));
      }
    },
    [refreshGraph]
  );

  // ----- derived stats -----
  const beatStats = useMemo(() => {
    if (!graph) return { total: 0, completed: 0, current: 0, planned: 0 };
    const total = graph.beats.length;
    const completed = graph.beats.filter((b) => b.status === 'completed').length;
    const current = graph.beats.filter((b) => b.status === 'current').length;
    const planned = graph.beats.filter((b) => b.status === 'planned').length;
    return { total, completed, current, planned };
  }, [graph]);

  const selectedBeat = useMemo(
    () => graph?.beats.find((b) => b.id === selectedBeatId) ?? null,
    [graph, selectedBeatId]
  );

  // ----- render -----
  if (!projectId) {
    return (
      <div className="overview-overlay bg-background text-foreground flex h-full w-full items-center justify-center">
        <p className="text-muted-foreground">{t('panels:overview.noProject')}</p>
      </div>
    );
  }

  return (
    <div className="overview-overlay bg-background text-foreground flex h-full w-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">{t('panels:overview.storyGraph')}</h2>
          <span className="text-xs text-muted-foreground">
            {t('panels:overview.statsBeats', beatStats)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="ghost" onClick={openCreateForm}>
            <Plus className="h-3.5 w-3.5" />
            {t('panels:overview.addBeat')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { refreshGraph(); refreshStats(); }}>
            <RefreshCw className={cn('h-3.5 w-3.5', graphLoading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* Stats strip */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-4 py-1.5 text-xs text-muted-foreground">
        <span>{t('panels:overview.chapterCount')}: {stats.chapterCount}</span>
        <span>{t('panels:overview.totalWords')}: {stats.totalWords.toLocaleString()}</span>
        <span>{t('panels:overview.characterCount')}: {stats.characterCount}</span>
        <span>
          {t('panels:overview.hooks')}: {stats.hookTotal}
          {stats.hookTotal > 0 && (
            <span className="ml-1">
              ({t('panels:overview.hookResolution', {
                resolved: stats.hookResolved,
                open: stats.hookOpen,
                rate: stats.hookTotal > 0 ? Math.round((stats.hookResolved / stats.hookTotal) * 100) : 0,
              })})
            </span>
          )}
        </span>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-1.5 border-b px-4 py-1.5">
        {['all', 'planned', 'current', 'completed', 'skipped'].map((s) => (
          <Button
            key={s}
            size="sm"
            variant={statusFilter === s ? 'secondary' : 'ghost'}
            onClick={() => setStatusFilter(s)}
            className="h-6 px-2 text-xs"
          >
            {t(`panels:overview.filter${s.charAt(0).toUpperCase() + s.slice(1)}`)}
          </Button>
        ))}
      </div>

      {/* Main content: graph + side panel */}
      <div className="flex flex-1 overflow-hidden">
        <div className="relative flex-1">
          {graphLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">
                {t('panels:overview.graphLoading')}
              </span>
            </div>
          )}
          {graphError && (
            <div className="absolute inset-0 z-10 flex items-center justify-center">
              <p className="text-sm text-rose-500">{t('panels:overview.graphError')}: {graphError}</p>
            </div>
          )}
          {!graphLoading && graph && graph.beats.length === 0 && (
            <div className="absolute inset-0 z-10 flex items-center justify-center">
              <p className="text-sm text-muted-foreground">{t('panels:overview.graphEmpty')}</p>
            </div>
          )}
          {graph && graph.beats.length > 0 && (
            <ReactFlow
              nodes={rfNodes}
              edges={rfEdges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
              <Controls showInteractive={false} />
              <MiniMap
                pannable
                zoomable
                nodeColor={(n) => {
                  const beat = (n.data as unknown as BeatNodeData)?.beat;
                  if (!beat) return '#94a3b8';
                  switch (beat.status) {
                    case 'completed': return '#10b981';
                    case 'current': return '#3b82f6';
                    case 'skipped': return '#f43f5e';
                    case 'revised': return '#f59e0b';
                    default: return '#94a3b8';
                  }
                }}
              />
            </ReactFlow>
          )}
        </div>

        {/* Side panel: beat details */}
        {selectedBeat && (
          <div className="w-72 border-l overflow-y-auto p-3 space-y-3">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {BEAT_TYPE_LABELS[selectedBeat.beat_type] ?? selectedBeat.beat_type}
              </div>
              <h3 className="text-sm font-semibold leading-snug">{selectedBeat.title}</h3>
              <div className="mt-1 text-xs text-muted-foreground">
                {t('panels:overview.beatStatus')}: {selectedBeat.status}
              </div>
            </div>

            {selectedBeat.description && (
              <p className="text-xs text-muted-foreground leading-relaxed">
                {selectedBeat.description}
              </p>
            )}

            {selectedBeat.chapter_hint != null && (
              <div className="text-xs">
                <span className="text-muted-foreground">{t('panels:overview.beatChapter')}: </span>
                <span>第 {Number(selectedBeat.chapter_hint)} 章</span>
              </div>
            )}

            {contextLoading ? (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> {t('panels:overview.graphLoading')}
              </div>
            ) : beatContext ? (
              <div className="space-y-2 text-xs">
                {beatContext.predecessors.length > 0 && (
                  <div>
                    <div className="text-muted-foreground mb-0.5">
                      {t('panels:overview.beatPredecessors')}
                    </div>
                    <ul className="list-disc pl-4 space-y-0.5">
                      {beatContext.predecessors.map((p) => (
                        <li key={p.id} className="cursor-pointer hover:text-blue-500"
                          onClick={() => setSelectedBeatId(p.id)}>
                          {p.title}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {beatContext.successors.length > 0 && (
                  <div>
                    <div className="text-muted-foreground mb-0.5">
                      {t('panels:overview.beatSuccessors')}
                    </div>
                    <ul className="list-disc pl-4 space-y-0.5">
                      {beatContext.successors.map((s) => (
                        <li key={s.id} className="cursor-pointer hover:text-blue-500"
                          onClick={() => setSelectedBeatId(s.id)}>
                          {s.title}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {beatContext.characters.length > 0 && (
                  <div>
                    <div className="text-muted-foreground mb-0.5">
                      {t('panels:overview.beatCharacters')}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {beatContext.characters.map((c) => (
                        <span key={c} className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5">
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {beatContext.related_hooks.length > 0 && (
                  <div>
                    <div className="text-muted-foreground mb-0.5">
                      {t('panels:overview.beatHooks')}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {beatContext.related_hooks.map((h) => (
                        <span key={h} className="rounded bg-rose-50 dark:bg-rose-950/40 px-1.5 py-0.5 text-rose-600">
                          {h}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {/* Actions */}
            <div className="flex flex-col gap-1.5 pt-2 border-t">
              <Button size="sm" variant="ghost" onClick={() => openEditForm(selectedBeat)}>
                <Pencil className="h-3.5 w-3.5" /> {t('panels:overview.editBeat')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => updateStatus(selectedBeat.id, 'current')}>
                <CircleDot className="h-3.5 w-3.5" /> {t('panels:overview.markCurrent')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => updateStatus(selectedBeat.id, 'completed')}>
                <CheckCircle2 className="h-3.5 w-3.5" /> {t('panels:overview.markCompleted')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => updateStatus(selectedBeat.id, 'planned')}>
                <Circle className="h-3.5 w-3.5" /> {t('panels:overview.markPlanned')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => deleteBeat(selectedBeat.id)}>
                <Trash2 className="h-3.5 w-3.5" /> {t('panels:overview.deleteBeat')}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Beat form modal */}
      {showForm && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40">
          <div className="w-[420px] max-h-[80%] overflow-y-auto rounded-lg border bg-background p-4 shadow-lg">
            <h3 className="text-sm font-semibold mb-3">
              {editingBeat ? t('panels:overview.editBeat') : t('panels:overview.addBeat')}
            </h3>
            <div className="space-y-2.5">
              <Field label={t('panels:overview.beatTitle')}>
                <input
                  className="w-full rounded border bg-transparent px-2 py-1 text-sm"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </Field>
              <Field label={t('panels:overview.beatType')}>
                <select
                  className="w-full rounded border bg-transparent px-2 py-1 text-sm"
                  value={form.beat_type}
                  onChange={(e) => setForm({ ...form, beat_type: e.target.value })}
                >
                  {Object.entries(BEAT_TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </Field>
              <Field label={t('panels:overview.beatStatus')}>
                <select
                  className="w-full rounded border bg-transparent px-2 py-1 text-sm"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  disabled={!editingBeat}
                >
                  {['planned', 'current', 'completed', 'skipped', 'revised'].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </Field>
              <Field label={t('panels:overview.beatDescription')}>
                <textarea
                  className="w-full rounded border bg-transparent px-2 py-1 text-sm min-h-[60px]"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label={t('panels:overview.beatChapter')}>
                  <input
                    type="number"
                    className="w-full rounded border bg-transparent px-2 py-1 text-sm"
                    value={form.chapter_hint}
                    onChange={(e) => setForm({ ...form, chapter_hint: e.target.value })}
                  />
                </Field>
                <Field label={t('panels:overview.beatVolume')}>
                  <input
                    type="number"
                    className="w-full rounded border bg-transparent px-2 py-1 text-sm"
                    value={form.volume}
                    onChange={(e) => setForm({ ...form, volume: e.target.value })}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label={t('panels:overview.beatArc')}>
                  <input
                    className="w-full rounded border bg-transparent px-2 py-1 text-sm"
                    value={form.arc}
                    onChange={(e) => setForm({ ...form, arc: e.target.value })}
                  />
                </Field>
                <Field label={t('panels:overview.beatSortOrder')}>
                  <input
                    type="number"
                    className="w-full rounded border bg-transparent px-2 py-1 text-sm"
                    value={form.sort_order}
                    onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
                  />
                </Field>
              </div>
              <Field label={`${t('panels:overview.beatCharacters')} (逗号分隔)`}>
                <input
                  className="w-full rounded border bg-transparent px-2 py-1 text-sm"
                  value={form.characters}
                  onChange={(e) => setForm({ ...form, characters: e.target.value })}
                />
              </Field>
              <Field label={`${t('panels:overview.beatHooks')} (逗号分隔)`}>
                <input
                  className="w-full rounded border bg-transparent px-2 py-1 text-sm"
                  value={form.hooks}
                  onChange={(e) => setForm({ ...form, hooks: e.target.value })}
                />
              </Field>
              <Field label={`${t('panels:overview.beatCompletionCriteria')} (逗号分隔)`}>
                <input
                  className="w-full rounded border bg-transparent px-2 py-1 text-sm"
                  value={form.completion_criteria}
                  onChange={(e) => setForm({ ...form, completion_criteria: e.target.value })}
                />
              </Field>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button size="sm" variant="ghost" onClick={closeForm}>
                {t('panels:overview.cancel')}
              </Button>
              <Button size="sm" onClick={saveBeat}>
                {t('panels:overview.save')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-muted-foreground mb-0.5 block">{label}</span>
      {children}
    </label>
  );
}
