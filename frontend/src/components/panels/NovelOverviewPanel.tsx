/**
 * Novel overview panel — story beat graph (React Flow) with beat detail
 * actions. Generate / infer / write fill the side session.
 */
import '@xyflow/react/dist/style.css';

import dagre from 'dagre';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Library,
  Loader2,
  RefreshCw,
  Sparkles,
  PenLine,
  CircleDot,
  CheckCircle2,
  Circle,
  XCircle,
  Trash2,
  Wand2,
  ChevronDown,
  ChevronRight,
  Layers,
  Maximize2,
  Minimize2,
  Info,
  X,
  Link2,
  RotateCcw,
} from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';
import { useProjectRepos } from '@/hooks/useProjectRepos';
import { fileTreeApi } from '@/lib/api';
import { getWritingPrompt } from '@/lib/writingPrompts';
import {
  buildBeatContextPack,
  buildUpdateStateGuidance,
  completeBeatAndAdvance,
  formatContextPackMarkdown,
  loadStorylineMeta,
  loadTransferSourceMarkdown,
  reconcileHooks,
  type HookReconciliation,
  type StorylineMetaFiles,
} from '@/lib/storylineContext';
import {
  parseTransferSourceMarkdown,
  type TransferSource,
} from '@/lib/transferSource';
import { useLayoutStore } from '@/stores/useLayoutStore';
import { useComposerPrefillStore } from '@/stores/useComposerPrefillStore';
import { useLibraryFocusStore } from '@/stores/useLibraryFocusStore';
import { useKanbanSessionContext } from '@/contexts/KanbanSessionContext';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { OverviewSessionSlot } from '@/components/panels/OverviewSessionSlot';
// The JSON file format uses arrays for characters/hooks, while the SQLite
// model uses JSON strings. We use a local type that matches the file format.
type JsonBeat = {
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

type JsonGraph = {
  beats: JsonBeat[];
  edges: Array<{
    from_beat: string;
    to_beat: string;
    edge_type: string;
    note?: string | null;
  }>;
};

type JsonBeatContext = {
  beat: JsonBeat;
  predecessors: JsonBeat[];
  successors: JsonBeat[];
  characters: string[];
  related_hooks: string[];
};

// ---------------------------------------------------------------------------
// Stats helpers (kept from the previous implementation)
// ---------------------------------------------------------------------------

interface OverviewStats {
  chapterCount: number;
  totalWords: number;
  characterCount: number;
  hookTotal: number;
  hookResolved: number;
  hookOpen: number;
}

const EMPTY_STATS: OverviewStats = {
  chapterCount: 0,
  totalWords: 0,
  characterCount: 0,
  hookTotal: 0,
  hookResolved: 0,
  hookOpen: 0,
};

function countWords(text: string): number {
  const cleaned = text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^---[\s\S]*?---/m, '')
    .replace(/```[\s\S]*?```/g, '')
    .trim();
  if (!cleaned) return 0;
  const cjkMatches = cleaned.match(
    /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/g
  );
  const cjkCount = cjkMatches ? cjkMatches.length : 0;
  const latinText = cleaned
    .replace(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/g, ' ')
    .trim();
  const latinWords = latinText
    ? latinText.split(/\s+/).filter(Boolean).length
    : 0;
  return cjkCount + latinWords;
}

async function scanWorkspace(rootPath: string): Promise<OverviewStats> {
  try {
    const chaptersDir = await fileTreeApi.listDirectoryChildren(
      rootPath,
      'chapters'
    );
    const chapterFiles = chaptersDir.files.filter((f) => f.endsWith('.md'));
    let totalWords = 0;
    for (const fileName of chapterFiles) {
      const filePath = `${rootPath}/chapters/${fileName}`;
      const content = await fileTreeApi.readFile(filePath);
      totalWords += countWords(content);
    }

    let characterCount = 0;
    try {
      const charsDir = await fileTreeApi.listDirectoryChildren(
        rootPath,
        '.cinyuverse/characters'
      );
      characterCount = charsDir.files.filter((f) => f.endsWith('.md')).length;
    } catch {
      // characters dir may not exist
    }

    let hookTotal = 0;
    let hookResolved = 0;
    let hookOpen = 0;
    try {
      const hooksContent = await fileTreeApi.readFile(
        `${rootPath}/.cinyuverse/hooks.md`
      );
      const resolvedMatches = hooksContent.match(/-\s*\[[xX]\]\s/g) || [];
      const openMatches = hooksContent.match(/-\s*\[\s\]\s/g) || [];
      hookResolved = resolvedMatches.length;
      hookOpen = openMatches.length;
      hookTotal = hookResolved + hookOpen;
    } catch {
      // hooks file may not exist
    }

    return {
      chapterCount: chapterFiles.length,
      totalWords,
      characterCount,
      hookTotal,
      hookResolved,
      hookOpen,
    };
  } catch {
    return EMPTY_STATS;
  }
}

// ---------------------------------------------------------------------------
// Beat node rendering
// ---------------------------------------------------------------------------

type BeatNodeData = {
  beat: JsonBeat;
  isSelected: boolean;
};

const STATUS_STYLES: Record<
  string,
  { rail: string; icon: typeof CircleDot; label: string; title: string }
> = {
  planned: {
    rail: 'bg-muted-foreground/35',
    icon: Circle,
    label: 'text-muted-foreground',
    title: 'text-foreground',
  },
  current: {
    rail: 'bg-primary',
    icon: CircleDot,
    label: 'text-foreground',
    title: 'text-foreground',
  },
  completed: {
    rail: 'bg-[var(--success,#86b300)]',
    icon: CheckCircle2,
    label: 'text-muted-foreground',
    title: 'text-foreground',
  },
  skipped: {
    rail: 'bg-destructive/70',
    icon: XCircle,
    label: 'text-muted-foreground line-through',
    title: 'text-muted-foreground line-through',
  },
  revised: {
    rail: 'bg-[var(--warning,#f2ae49)]',
    icon: PenLine,
    label: 'text-muted-foreground',
    title: 'text-foreground',
  },
};

const STATUS_LABELS: Record<string, string> = {
  planned: '计划',
  current: '当前',
  completed: '已完成',
  skipped: '已跳过',
  revised: '修订中',
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

const BeatNodeComponent = memo(function BeatNodeComponent({ data }: NodeProps) {
  const nodeData = data as unknown as BeatNodeData;
  const { beat, isSelected } = nodeData;
  const style = STATUS_STYLES[beat.status] ?? STATUS_STYLES.planned;
  const Icon = style.icon;
  return (
    <div
      className={cn(
        'flex min-w-[176px] max-w-[216px] overflow-hidden rounded-md border border-border/60 bg-[var(--surface-card-strong,hsl(var(--card)))] shadow-none transition-colors',
        isSelected && 'border-foreground/40 ring-1 ring-foreground/15'
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-1.5 !w-1.5 !border-0 !bg-muted-foreground/50"
      />
      <div className={cn('w-0.5 shrink-0 self-stretch', style.rail)} />
      <div className="min-w-0 flex-1 px-2.5 py-2">
        <div className="mb-1 flex items-center gap-1">
          <Icon className={cn('h-3 w-3 shrink-0', style.label)} />
          <span className="truncate text-[10px] text-muted-foreground">
            {BEAT_TYPE_LABELS[beat.beat_type] ?? beat.beat_type}
          </span>
          {beat.status === 'current' && (
            <Badge
              variant="secondary"
              className="ml-auto h-4 rounded-sm px-1 text-[9px] font-medium"
            >
              当前
            </Badge>
          )}
        </div>
        <div
          className={cn(
            'text-[13px] font-medium leading-snug line-clamp-2',
            style.title
          )}
        >
          {beat.title}
        </div>
        {beat.chapter_hint != null && (
          <div className="mt-1 text-[10px] text-muted-foreground">
            第 {Number(beat.chapter_hint)} 章
          </div>
        )}
        {beat.characters && beat.characters.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {beat.characters.slice(0, 3).map((c) => (
              <span
                key={c}
                className="rounded-sm bg-muted/60 px-1 py-px text-[9px] text-muted-foreground"
              >
                {c}
              </span>
            ))}
            {beat.characters.length > 3 && (
              <span className="text-[9px] text-muted-foreground">
                +{beat.characters.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-1.5 !w-1.5 !border-0 !bg-muted-foreground/50"
      />
    </div>
  );
});

// ---------------------------------------------------------------------------
// Progressive Disclosure: Arc-level macro node
//
// When collapsed: a compact card with summary info.
// When expanded: a large container with a header bar; beat nodes are
// rendered as children (parentNode) inside it.
// ---------------------------------------------------------------------------

type ArcNodeData = {
  arc: string;
  beatCount: number;
  statusCounts: Record<string, number>;
  characters: string[];
  isExpanded: boolean;
  onToggle: (arc: string) => void;
};

function ArcStatusSummary({
  completed,
  current,
  planned,
  skipped,
}: {
  completed: number;
  current: number;
  planned: number;
  skipped: number;
}) {
  const parts: string[] = [];
  if (completed > 0) parts.push(`完成 ${completed}`);
  if (current > 0) parts.push(`当前 ${current}`);
  if (planned > 0) parts.push(`计划 ${planned}`);
  if (skipped > 0) parts.push(`跳过 ${skipped}`);
  if (parts.length === 0) return null;
  return (
    <span className="truncate text-[10px] text-muted-foreground">
      {parts.join(' · ')}
    </span>
  );
}

const ArcNodeComponent = memo(function ArcNodeComponent({
  data,
  selected,
}: NodeProps) {
  const nodeData = data as unknown as ArcNodeData;
  const { arc, beatCount, statusCounts, characters, isExpanded, onToggle } =
    nodeData;
  const completed = statusCounts.completed ?? 0;
  const current = statusCounts.current ?? 0;
  const planned = statusCounts.planned ?? 0;
  const skipped = statusCounts.skipped ?? 0;
  const progress =
    beatCount > 0 ? Math.round((completed / beatCount) * 100) : 0;

  if (isExpanded) {
    return (
      <div
        className={cn(
          'flex h-full flex-col overflow-hidden rounded-md border border-border/70 bg-muted/20',
          current > 0 && 'border-foreground/25',
          selected && 'ring-1 ring-foreground/20'
        )}
      >
        <Handle
          type="target"
          position={Position.Top}
          className="!h-2 !w-2 !border-0 !bg-muted-foreground/60"
        />

        <button
          type="button"
          className="flex w-full items-center gap-2 border-b border-border/50 bg-background/70 px-3 py-2 text-left transition-colors hover:bg-muted/40"
          onClick={() => onToggle(arc)}
        >
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
            {arc}
          </span>
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {beatCount} 节拍
          </span>
          <div className="h-1 w-14 overflow-hidden rounded-sm bg-muted">
            <div
              className="h-full bg-foreground/55"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="w-7 shrink-0 text-right text-[10px] text-muted-foreground">
            {progress}%
          </span>
        </button>

        <div className="flex items-center gap-2 border-b border-border/40 px-3 py-1.5">
          <ArcStatusSummary
            completed={completed}
            current={current}
            planned={planned}
            skipped={skipped}
          />
          {characters.length > 0 && (
            <div className="ml-auto flex min-w-0 flex-wrap justify-end gap-1">
              {characters.slice(0, 4).map((c) => (
                <span
                  key={c}
                  className="rounded-sm bg-muted/70 px-1 py-px text-[9px] text-muted-foreground"
                >
                  {c}
                </span>
              ))}
              {characters.length > 4 && (
                <span className="text-[9px] text-muted-foreground">
                  +{characters.length - 4}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1" />

        <Handle
          type="source"
          position={Position.Bottom}
          className="!h-2 !w-2 !border-0 !bg-muted-foreground/60"
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'w-[200px] overflow-hidden rounded-md border border-border/70 bg-[var(--surface-card-strong,hsl(var(--card)))] transition-colors',
        current > 0 && 'border-foreground/30',
        selected && 'ring-1 ring-foreground/20'
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-2 !w-2 !border-0 !bg-muted-foreground/60"
      />

      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/40"
        onClick={() => onToggle(arc)}
      >
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
          {arc}
        </span>
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {beatCount} 节拍
        </span>
      </button>

      <div className="px-3 pb-1.5">
        <div className="flex items-center gap-1.5">
          <div className="h-1 flex-1 overflow-hidden rounded-sm bg-muted">
            <div
              className="h-full bg-foreground/55"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-[10px] text-muted-foreground">{progress}%</span>
        </div>
      </div>

      <div className="px-3 pb-2">
        <ArcStatusSummary
          completed={completed}
          current={current}
          planned={planned}
          skipped={skipped}
        />
      </div>

      {characters.length > 0 && (
        <div className="flex flex-wrap gap-1 px-3 pb-2.5">
          {characters.slice(0, 5).map((c) => (
            <span
              key={c}
              className="rounded-sm bg-muted/70 px-1 py-px text-[9px] text-muted-foreground"
            >
              {c}
            </span>
          ))}
          {characters.length > 5 && (
            <span className="text-[9px] text-muted-foreground">
              +{characters.length - 5}
            </span>
          )}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-2 !w-2 !border-0 !bg-muted-foreground/60"
      />
    </div>
  );
});

const nodeTypes = { beatNode: BeatNodeComponent, arcNode: ArcNodeComponent };

// Stable minimap color function — avoids re-creating on every render
const minimapNodeColor = (n: Node): string => {
  if (n.id.startsWith('arc:')) return '#727b85';
  const beat = (n.data as unknown as BeatNodeData)?.beat;
  if (!beat) return '#a0a8b0';
  switch (beat.status) {
    case 'completed':
      return '#86b300';
    case 'current':
      return '#1d2530';
    case 'skipped':
      return '#f51818';
    case 'revised':
      return '#f2ae49';
    default:
      return '#a0a8b0';
  }
};

// ---------------------------------------------------------------------------
// Edge styling — each edge type has a distinct visual identity
// ---------------------------------------------------------------------------

const EDGE_STYLES: Record<
  string,
  {
    stroke: string;
    dashed: boolean;
    label: string;
    description: string;
    animated: boolean;
    width: number;
  }
> = {
  sequential: {
    stroke: '#727b85',
    dashed: false,
    label: '顺序',
    description: 'A 完成后 B 自然发生，主线推进',
    animated: false,
    width: 1.5,
  },
  causal: {
    stroke: '#c47a2a',
    dashed: false,
    label: '因果',
    description: 'A 导致 B 发生，B 是 A 的直接后果',
    animated: true,
    width: 2,
  },
  foreshadow: {
    stroke: '#c23b3b',
    dashed: true,
    label: '伏笔',
    description: 'A 埋下的伏笔在 B 处回收或推进',
    animated: true,
    width: 1.75,
  },
  parallel: {
    stroke: '#46505b',
    dashed: false,
    label: '并行',
    description: 'A 和 B 在同一时间线并行发生',
    animated: false,
    width: 1.5,
  },
  alternative: {
    stroke: '#8a7a68',
    dashed: true,
    label: '备选',
    description: 'B 是 A 的替代走向，非确定路径',
    animated: false,
    width: 1.5,
  },
  character_arc: {
    stroke: '#5a6a7a',
    dashed: true,
    label: '角色弧',
    description: '同一角色的成长轨迹串联',
    animated: false,
    width: 1.75,
  },
  item_flow: {
    stroke: '#5f7a6a',
    dashed: false,
    label: '物品流',
    description: '某物品或关键信息从 A 流转到 B',
    animated: false,
    width: 1.5,
  },
};

// ---------------------------------------------------------------------------
// Layout — Progressive Disclosure with dagre
//
// Two-level layout:
// 1. Arc-level macro nodes are laid out as a vertical DAG
// 2. When an arc is expanded, its beats are laid out in a sub-cluster
//    and positioned within the arc's allocated space
// ---------------------------------------------------------------------------

function layoutProgressive(
  beats: JsonBeat[],
  edges: Array<{ from_beat: string; to_beat: string; edge_type: string }>,
  expandedArcs: Set<string>
): {
  positions: Map<string, { x: number; y: number }>;
  arcPositions: Map<string, { x: number; y: number }>;
  arcSizes: Map<string, { width: number; height: number }>;
} {
  const positions = new Map<string, { x: number; y: number }>();
  const arcPositions = new Map<string, { x: number; y: number }>();
  const arcSizes = new Map<string, { width: number; height: number }>();
  if (beats.length === 0) return { positions, arcPositions, arcSizes };

  // Group beats by arc
  const arcGroups = new Map<string, JsonBeat[]>();
  for (const beat of beats) {
    const arc = beat.arc ?? '未分类';
    if (!arcGroups.has(arc)) arcGroups.set(arc, []);
    arcGroups.get(arc)!.push(beat);
  }

  const arcs = [...arcGroups.keys()];
  const beatToArc = new Map<string, string>();
  for (const beat of beats) {
    beatToArc.set(beat.id, beat.arc ?? '未分类');
  }

  // Build arc-level edges
  const arcEdges: Array<{ from: string; to: string; weight: number }> = [];
  for (const edge of edges) {
    const fromArc = beatToArc.get(edge.from_beat);
    const toArc = beatToArc.get(edge.to_beat);
    if (fromArc && toArc && fromArc !== toArc) {
      const isMainline =
        edge.edge_type === 'sequential' || edge.edge_type === 'causal';
      arcEdges.push({ from: fromArc, to: toArc, weight: isMainline ? 10 : 1 });
    }
  }

  // --- Step 1: Sub-layout beats within each expanded arc to determine size ---
  const BEAT_W = 200;
  const BEAT_H = 100;
  const HEADER_H = 70; // header + status pills row
  const PADDING = 16;

  const subLayouts = new Map<
    string,
    {
      positions: Map<string, { x: number; y: number }>;
      width: number;
      height: number;
    }
  >();

  for (const arc of arcs) {
    if (!expandedArcs.has(arc)) continue;
    const arcBeats = arcGroups.get(arc)!;
    const subEdges = edges.filter(
      (e) =>
        beatToArc.get(e.from_beat) === arc && beatToArc.get(e.to_beat) === arc
    );

    const subG = new dagre.graphlib.Graph();
    subG.setGraph({
      rankdir: 'TB',
      nodesep: 50,
      edgesep: 25,
      ranksep: 60,
      marginx: PADDING,
      marginy: PADDING,
    });
    subG.setDefaultEdgeLabel(() => ({}));

    for (const beat of arcBeats) {
      subG.setNode(beat.id, { width: BEAT_W, height: BEAT_H });
    }
    for (const edge of subEdges) {
      subG.setEdge(edge.from_beat, edge.to_beat, { weight: 5, minlen: 1 });
    }

    dagre.layout(subG);

    // Calculate bounding box of sub-layout
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    const subPositions = new Map<string, { x: number; y: number }>();
    for (const beat of arcBeats) {
      const subNode = subG.node(beat.id);
      if (subNode) {
        const x = subNode.x - BEAT_W / 2;
        const y = subNode.y - BEAT_H / 2;
        subPositions.set(beat.id, { x, y });
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x + BEAT_W);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y + BEAT_H);
      }
    }
    if (minX === Infinity) {
      minX = 0;
      maxX = BEAT_W;
      minY = 0;
      maxY = BEAT_H;
    }

    const contentW = maxX - minX;
    const contentH = maxY - minY;
    const arcWidth = Math.max(contentW + PADDING * 2, 280);
    const arcHeight = contentH + HEADER_H + PADDING;

    // Normalize sub-positions to start at (PADDING, HEADER_H)
    for (const [beatId, pos] of subPositions) {
      positions.set(beatId, {
        x: pos.x - minX + PADDING,
        y: pos.y - minY + HEADER_H,
      });
    }

    subLayouts.set(arc, {
      positions: new Map(positions),
      width: arcWidth,
      height: arcHeight,
    });
    // Temporarily clear positions — will re-offset after arc layout
    for (const beat of arcBeats) positions.delete(beat.id);

    arcSizes.set(arc, { width: arcWidth, height: arcHeight });
  }

  // --- Step 2: Layout arc-level graph with computed sizes ---
  const ARC_W_COLLAPSED = 200;
  const ARC_H_COLLAPSED = 78;

  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: 'TB',
    nodesep: 60,
    edgesep: 40,
    ranksep: 80,
    marginx: 30,
    marginy: 30,
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const arc of arcs) {
    const isExpanded = expandedArcs.has(arc);
    const size = arcSizes.get(arc);
    g.setNode(arc, {
      width: isExpanded ? (size?.width ?? 400) : ARC_W_COLLAPSED,
      height: isExpanded ? (size?.height ?? 400) : ARC_H_COLLAPSED,
    });
  }

  for (const edge of arcEdges) {
    g.setEdge(edge.from, edge.to, { weight: edge.weight, minlen: 1 });
  }

  dagre.layout(g);

  for (const arc of arcs) {
    const node = g.node(arc);
    if (node) {
      const isExpanded = expandedArcs.has(arc);
      const size = arcSizes.get(arc);
      const w = isExpanded ? (size?.width ?? 400) : ARC_W_COLLAPSED;
      const h = isExpanded ? (size?.height ?? 400) : ARC_H_COLLAPSED;
      arcPositions.set(arc, {
        x: node.x - w / 2,
        y: node.y - h / 2,
      });
    }
  }

  // --- Step 3: Offset beat positions by arc position ---
  for (const arc of arcs) {
    if (!expandedArcs.has(arc)) continue;
    const sub = subLayouts.get(arc);
    const arcPos = arcPositions.get(arc);
    if (!sub || !arcPos) continue;
    for (const [beatId, pos] of sub.positions) {
      positions.set(beatId, {
        x: pos.x,
        y: pos.y,
      });
    }
  }

  return { positions, arcPositions, arcSizes };
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
  const [graph, setGraph] = useState<JsonGraph | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphError, setGraphError] = useState<string | null>(null);
  const [promptNotice, setPromptNotice] = useState<string | null>(null);

  const [selectedBeatId, setSelectedBeatId] = useState<string | null>(null);
  const [beatContext, setJsonBeatContext] = useState<JsonBeatContext | null>(
    null
  );
  const [expandedArcs, setExpandedArcs] = useState<Set<string>>(new Set());
  const seededForPathRef = useRef('');
  const [storyMeta, setStoryMeta] = useState<StorylineMetaFiles | null>(null);
  const [transferSource, setTransferSource] = useState<TransferSource | null>(
    null
  );
  const [packBusy, setPackBusy] = useState(false);
  const setActiveTab = useLayoutStore((s) => s.setActiveTab);
  const focusLibraryBook = useLibraryFocusStore((s) => s.focusBook);
  /** After「撰写」— remind user to sync hooks/summaries. */
  const [pendingWriteBackBeatId, setPendingWriteBackBeatId] = useState<
    string | null
  >(null);
  /** After「回写状态」prompt queued — wait for agent, then confirm advance. */
  const [pendingAdvanceBeatId, setPendingAdvanceBeatId] = useState<
    string | null
  >(null);

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

  // ----- story graph file path -----
  const storyGraphPath = rootPath
    ? `${rootPath}/.cinyuverse/story-graph.json`
    : '';

  // ----- refresh graph (read from .cinyuverse/story-graph.json) -----
  const refreshGraph = useCallback(async () => {
    if (!storyGraphPath) {
      setGraph(null);
      return;
    }
    setGraphLoading(true);
    setGraphError(null);
    try {
      const content = await fileTreeApi.readFile(storyGraphPath);
      const parsed = JSON.parse(content) as JsonGraph;
      // Ensure required arrays exist and edges have required fields
      setGraph({
        beats: parsed.beats ?? [],
        edges: (parsed.edges ?? []).map((e) => ({
          from_beat: e.from_beat,
          to_beat: e.to_beat,
          edge_type: e.edge_type,
          note: e.note ?? null,
        })),
      });
    } catch {
      // File may not exist yet or be empty — show empty graph
      setGraph({ beats: [], edges: [] });
    } finally {
      setGraphLoading(false);
    }
  }, [storyGraphPath]);

  // ----- save graph (write to .cinyuverse/story-graph.json) -----
  const saveGraph = useCallback(
    async (nextGraph: JsonGraph) => {
      if (!storyGraphPath) return;
      try {
        const content = JSON.stringify(nextGraph, null, 2);
        await fileTreeApi.saveFile(storyGraphPath, content);
        setGraph(nextGraph);
      } catch (err) {
        setGraphError(err instanceof Error ? err.message : String(err));
      }
    },
    [storyGraphPath]
  );

  const refreshStoryMeta = useCallback(async () => {
    if (!rootPath) {
      setStoryMeta(null);
      setTransferSource(null);
      return;
    }
    try {
      setStoryMeta(await loadStorylineMeta(rootPath));
    } catch {
      setStoryMeta(null);
    }
    try {
      const md = await loadTransferSourceMarkdown(rootPath);
      setTransferSource(parseTransferSourceMarkdown(md));
    } catch {
      setTransferSource(null);
    }
  }, [rootPath]);

  const handleOpenSourceBook = useCallback(() => {
    if (!transferSource?.sourceBookDir) return;
    focusLibraryBook(transferSource.sourceBookDir);
    setActiveTab('library');
  }, [focusLibraryBook, setActiveTab, transferSource]);

  useEffect(() => {
    refreshStats();
    refreshGraph();
    void refreshStoryMeta();
  }, [refreshStats, refreshGraph, refreshStoryMeta]);

  useEffect(() => {
    seededForPathRef.current = '';
    setSelectedBeatId(null);
    setExpandedArcs(new Set());
    setPendingWriteBackBeatId(null);
    setPendingAdvanceBeatId(null);
  }, [storyGraphPath]);

  // Once per project: expand arcs (so beats are visible) and focus current beat.
  useEffect(() => {
    if (!storyGraphPath || !graph || graph.beats.length === 0) return;
    if (seededForPathRef.current === storyGraphPath) return;
    seededForPathRef.current = storyGraphPath;

    const current =
      graph.beats.find((b) => b.status === 'current') ?? graph.beats[0];
    setSelectedBeatId(current.id);

    const arcs = new Set<string>();
    if (graph.beats.length <= 24) {
      for (const b of graph.beats) arcs.add(b.arc ?? '未分类');
    } else {
      arcs.add(current.arc ?? '未分类');
    }
    setExpandedArcs(arcs);
  }, [storyGraphPath, graph]);

  // ----- build context when selection changes (computed from local graph) -----
  useEffect(() => {
    if (!selectedBeatId || !graph) {
      setJsonBeatContext(null);
      return;
    }
    const beat = graph.beats.find((b) => b.id === selectedBeatId);
    if (!beat) {
      setJsonBeatContext(null);
      return;
    }
    const predecessorIds = new Set(
      graph.edges
        .filter((e) => e.to_beat === selectedBeatId)
        .map((e) => e.from_beat)
    );
    const successorIds = new Set(
      graph.edges
        .filter((e) => e.from_beat === selectedBeatId)
        .map((e) => e.to_beat)
    );
    const predecessors = graph.beats.filter((b) => predecessorIds.has(b.id));
    const successors = graph.beats.filter((b) => successorIds.has(b.id));
    setJsonBeatContext({
      beat,
      predecessors,
      successors,
      characters: beat.characters ?? [],
      related_hooks: beat.hooks ?? [],
    });
  }, [selectedBeatId, graph]);

  // ----- Progressive Disclosure: layout + nodes/edges -----
  const { positions, arcPositions, arcSizes } = useMemo(
    () =>
      graph
        ? layoutProgressive(graph.beats, graph.edges, expandedArcs)
        : {
            positions: new Map<string, { x: number; y: number }>(),
            arcPositions: new Map<string, { x: number; y: number }>(),
            arcSizes: new Map<string, { width: number; height: number }>(),
          },
    [graph, expandedArcs]
  );

  // Stable toggle callback — doesn't change reference between renders
  const toggleArc = useCallback((arc: string) => {
    setExpandedArcs((prev) => {
      const next = new Set(prev);
      if (next.has(arc)) next.delete(arc);
      else next.add(arc);
      return next;
    });
  }, []);

  // Arc-level data for macro nodes
  const arcData = useMemo(() => {
    if (!graph) return new Map<string, ArcNodeData>();
    const groups = new Map<string, JsonBeat[]>();
    for (const beat of graph.beats) {
      const arc = beat.arc ?? '未分类';
      if (!groups.has(arc)) groups.set(arc, []);
      groups.get(arc)!.push(beat);
    }
    const result = new Map<string, ArcNodeData>();
    for (const [arc, beats] of groups) {
      const statusCounts: Record<string, number> = {};
      const charSet = new Set<string>();
      for (const b of beats) {
        statusCounts[b.status] = (statusCounts[b.status] ?? 0) + 1;
        for (const c of b.characters ?? []) charSet.add(c);
      }
      result.set(arc, {
        arc,
        beatCount: beats.length,
        statusCounts,
        characters: [...charSet],
        isExpanded: expandedArcs.has(arc),
        onToggle: toggleArc,
      });
    }
    return result;
  }, [graph, expandedArcs, toggleArc]);

  // Build the node list: arc macro nodes + beat nodes (only for expanded arcs)
  const nodes = useMemo<Node[]>(() => {
    if (!graph) return [];
    const result: Node[] = [];

    // Arc macro nodes
    for (const [arc, data] of arcData) {
      const pos = arcPositions.get(arc) ?? { x: 0, y: 0 };
      const size = arcSizes.get(arc);
      const isExpanded = expandedArcs.has(arc);
      result.push({
        id: `arc:${arc}`,
        type: 'arcNode',
        position: pos,
        data: data as unknown as Record<string, unknown>,
        draggable: true,
        style: isExpanded
          ? { width: size?.width ?? 400, height: size?.height ?? 400 }
          : undefined,
      });
    }

    // Beat nodes — only for expanded arcs, as children of the arc node
    for (const beat of graph.beats) {
      const arc = beat.arc ?? '未分类';
      if (!expandedArcs.has(arc)) continue;
      if (statusFilter !== 'all' && beat.status !== statusFilter) continue;
      const pos = positions.get(beat.id);
      if (!pos) continue;
      result.push({
        id: beat.id,
        type: 'beatNode',
        position: pos,
        data: {
          beat,
          isSelected: beat.id === selectedBeatId,
        } as unknown as Record<string, unknown>,
        selected: beat.id === selectedBeatId,
        // Nest inside the arc container — positions are relative to parent
        parentId: `arc:${arc}`,
        extent: 'parent',
        draggable: true,
      });
    }

    return result;
  }, [
    graph,
    arcData,
    arcPositions,
    arcSizes,
    positions,
    expandedArcs,
    selectedBeatId,
    statusFilter,
  ]);

  // Build edges: cross-arc edges (always visible, between arc nodes) +
  // within-arc edges (only when arc is expanded, between beat nodes)
  const edges = useMemo<Edge[]>(() => {
    if (!graph) return [];
    const result: Edge[] = [];
    const beatToArc = new Map<string, string>();
    for (const beat of graph.beats) {
      beatToArc.set(beat.id, beat.arc ?? '未分类');
    }

    // Cross-arc edges: connect arc macro nodes
    const seenArcEdges = new Set<string>();
    for (const edge of graph.edges) {
      const fromArc = beatToArc.get(edge.from_beat);
      const toArc = beatToArc.get(edge.to_beat);
      if (!fromArc || !toArc || fromArc === toArc) continue;

      // If both arcs are expanded, draw beat-to-beat
      if (expandedArcs.has(fromArc) && expandedArcs.has(toArc)) {
        const style = EDGE_STYLES[edge.edge_type] ?? EDGE_STYLES.sequential;
        const isCrossEdge =
          edge.edge_type === 'foreshadow' ||
          edge.edge_type === 'character_arc' ||
          edge.edge_type === 'item_flow' ||
          edge.edge_type === 'alternative';
        result.push({
          id: `${edge.from_beat}->${edge.to_beat}:${edge.edge_type}`,
          source: edge.from_beat,
          target: edge.to_beat,
          type: isCrossEdge ? 'default' : 'smoothstep',
          animated: style.animated,
          style: {
            stroke: style.stroke,
            strokeWidth: style.width,
            strokeDasharray: style.dashed ? '6 4' : undefined,
          },
        });
        continue;
      }

      // Otherwise, aggregate as arc-to-arc edge
      const arcEdgeKey = `${fromArc}->${toArc}:${edge.edge_type}`;
      if (seenArcEdges.has(arcEdgeKey)) continue;
      seenArcEdges.add(arcEdgeKey);

      const style = EDGE_STYLES[edge.edge_type] ?? EDGE_STYLES.sequential;
      result.push({
        id: arcEdgeKey,
        source: `arc:${fromArc}`,
        target: `arc:${toArc}`,
        type: 'smoothstep',
        animated: style.animated,
        style: {
          stroke: style.stroke,
          strokeWidth: style.width,
          strokeDasharray: style.dashed ? '6 4' : undefined,
        },
      });
    }

    // Within-arc edges: only for expanded arcs
    for (const edge of graph.edges) {
      const fromArc = beatToArc.get(edge.from_beat);
      const toArc = beatToArc.get(edge.to_beat);
      if (!fromArc || !toArc || fromArc !== toArc) continue;
      if (!expandedArcs.has(fromArc)) continue;

      const style = EDGE_STYLES[edge.edge_type] ?? EDGE_STYLES.sequential;
      result.push({
        id: `${edge.from_beat}->${edge.to_beat}:${edge.edge_type}`,
        source: edge.from_beat,
        target: edge.to_beat,
        type: 'smoothstep',
        animated: style.animated,
        style: {
          stroke: style.stroke,
          strokeWidth: style.width,
          strokeDasharray: style.dashed ? '6 4' : undefined,
        },
      });
    }

    return result;
  }, [graph, expandedArcs]);

  // ----- React Flow state: use controlled nodes/edges directly -----
  // We keep internal state for drag/position changes, but sync from props
  // only when the computed nodes/edges actually change (by reference).
  const [rfNodes, setRfNodes] = useState<Node[]>(nodes);
  const [rfEdges, setRfEdges] = useState<Edge[]>(edges);

  // Sync only when the memoized arrays change reference
  useEffect(() => {
    setRfNodes(nodes);
  }, [nodes]);
  useEffect(() => {
    setRfEdges(edges);
  }, [edges]);

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
      const fromBeat = connection.source;
      const toBeat = connection.target;
      if (graph && fromBeat && toBeat) {
        const newEdge = {
          from_beat: fromBeat,
          to_beat: toBeat,
          edge_type: 'sequential',
          note: null,
        };
        void saveGraph({
          beats: graph.beats,
          edges: [...graph.edges, newEdge],
        });
      }
      setRfEdges((eds) => addEdge({ ...connection, type: 'smoothstep' }, eds));
    },
    [graph, saveGraph]
  );

  const onNodeClick = useCallback((_: unknown, node: Node) => {
    // Arc nodes handle their own click via the toggle in data
    if (node.id.startsWith('arc:')) return;
    setSelectedBeatId(node.id);
  }, []);

  const selectedBeat = useMemo(
    () => graph?.beats.find((b) => b.id === selectedBeatId) ?? null,
    [graph, selectedBeatId]
  );

  // ----- agent session actions -----
  const { visibleRightSession } = useKanbanSessionContext();
  const setRightPanelVisible = useLayoutStore(
    (state) => state.setRightPanelVisible
  );
  const requestPrefill = useComposerPrefillStore((s) => s.requestPrefill);

  const fillPromptIntoSession = useCallback(
    (promptText: string): boolean => {
      setPromptNotice(null);
      // Require an existing session on the right panel — do NOT create one.
      // Storyline actions reuse the same session so context compounds.
      if (!visibleRightSession?.sessionId) {
        setPromptNotice(t('panels:overview.noSession'));
        setRightPanelVisible(true);
        return false;
      }
      requestPrefill(promptText);
      setRightPanelVisible(true);
      return true;
    },
    [visibleRightSession, requestPrefill, setRightPanelVisible, t]
  );

  const assemblePackForBeat = useCallback(
    async (beat: JsonBeat) => {
      if (!graph || !rootPath) return null;
      // Always re-read meta so hooks/state/summaries are not stale.
      const meta = await loadStorylineMeta(rootPath);
      setStoryMeta(meta);
      return buildBeatContextPack({
        rootPath,
        graph,
        beat,
        meta,
      });
    },
    [graph, rootPath]
  );

  const resolveChapterHint = useCallback((beat: JsonBeat): number | null => {
    if (beat.chapter_hint == null) return null;
    const n = Number(beat.chapter_hint);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, []);

  const handleGenerateGraph = useCallback(() => {
    const tpl = getWritingPrompt('generate-story-graph');
    if (!tpl) return;
    const prompt = tpl.build({
      bookName: undefined,
      guidance: '',
    });
    void fillPromptIntoSession(prompt);
  }, [fillPromptIntoSession]);

  const handleInferBeat = useCallback(async () => {
    if (!selectedBeat || !beatContext || !graph || !rootPath) return;
    const tpl = getWritingPrompt('infer-beat');
    if (!tpl) return;
    setPackBusy(true);
    try {
      const pack = await assemblePackForBeat(selectedBeat);
      if (!pack) return;
      const prompt = tpl.build({
        beatId: selectedBeat.id,
        beatTitle: selectedBeat.title,
        beatDescription: selectedBeat.description ?? '',
        // Neighborhood only — full graph lives in the pack's compact JSON.
        fullGraph: JSON.stringify(pack.neighborhoodGraph, null, 2),
        contextPack: formatContextPackMarkdown(pack),
      });
      fillPromptIntoSession(prompt);
    } finally {
      setPackBusy(false);
    }
  }, [
    selectedBeat,
    beatContext,
    graph,
    rootPath,
    assemblePackForBeat,
    fillPromptIntoSession,
  ]);

  const handleWriteBeat = useCallback(async () => {
    if (!selectedBeat || !beatContext || !graph || !rootPath) return;
    const tpl = getWritingPrompt('write-beat');
    if (!tpl) return;
    const chapterNum = resolveChapterHint(selectedBeat);
    if (chapterNum == null) {
      setPromptNotice(t('panels:overview.needChapterHint'));
      return;
    }
    setPackBusy(true);
    try {
      const pack = await assemblePackForBeat(selectedBeat);
      if (!pack) return;
      const prompt = tpl.build({
        beatId: selectedBeat.id,
        beatTitle: selectedBeat.title,
        beatDescription: selectedBeat.description ?? '',
        chapterNumber: chapterNum,
        fullGraph: JSON.stringify(pack.neighborhoodGraph, null, 2),
        contextPack: formatContextPackMarkdown(pack),
      });
      if (fillPromptIntoSession(prompt)) {
        setPendingWriteBackBeatId(selectedBeat.id);
        setPendingAdvanceBeatId(null);
        setPromptNotice(t('panels:overview.writeBackHint'));
      }
    } finally {
      setPackBusy(false);
    }
  }, [
    selectedBeat,
    beatContext,
    graph,
    rootPath,
    assemblePackForBeat,
    fillPromptIntoSession,
    resolveChapterHint,
    t,
  ]);

  /** Step 1: queue update-state in the same session. Do NOT advance the graph yet. */
  const handleSyncState = useCallback(async () => {
    if (!selectedBeat || !graph || !rootPath) return;
    const tpl = getWritingPrompt('update-state');
    if (!tpl) return;
    const chapterNum = resolveChapterHint(selectedBeat);
    if (chapterNum == null) {
      setPromptNotice(t('panels:overview.needChapterHint'));
      return;
    }
    setPackBusy(true);
    try {
      const pack = await assemblePackForBeat(selectedBeat);
      if (!pack) return;
      const prompt = tpl.build({
        beatId: selectedBeat.id,
        beatTitle: selectedBeat.title,
        chapterNumber: chapterNum,
        contextPack: formatContextPackMarkdown(pack),
        guidance: buildUpdateStateGuidance(pack),
      });
      if (!fillPromptIntoSession(prompt)) return;
      setPendingWriteBackBeatId(selectedBeat.id);
      setPendingAdvanceBeatId(selectedBeat.id);
      setPromptNotice(t('panels:overview.writeBackQueued'));
    } finally {
      setPackBusy(false);
    }
  }, [
    selectedBeat,
    graph,
    rootPath,
    assemblePackForBeat,
    fillPromptIntoSession,
    resolveChapterHint,
    t,
  ]);

  /** Step 2: after agent finishes update-state, advance beat locally and refresh meta. */
  const handleConfirmAdvance = useCallback(async () => {
    if (!selectedBeat || !graph) return;
    if (
      pendingAdvanceBeatId &&
      pendingAdvanceBeatId !== selectedBeat.id
    ) {
      setPromptNotice(t('panels:overview.advanceWrongBeat'));
      return;
    }
    setPackBusy(true);
    try {
      const advanced = completeBeatAndAdvance(graph, selectedBeat.id);
      await saveGraph(advanced);
      const nextCurrent = advanced.beats.find((b) => b.status === 'current');
      if (nextCurrent) setSelectedBeatId(nextCurrent.id);
      setPendingWriteBackBeatId(null);
      setPendingAdvanceBeatId(null);
      await refreshStoryMeta();
      setPromptNotice(t('panels:overview.advanceDone'));
    } finally {
      setPackBusy(false);
    }
  }, [
    selectedBeat,
    graph,
    pendingAdvanceBeatId,
    saveGraph,
    refreshStoryMeta,
    t,
  ]);

  // ----- status update (modify local graph, save to JSON) -----
  const updateStatus = useCallback(
    async (beatId: string, status: string) => {
      if (!graph) return;
      const nextBeats = graph.beats.map((b) =>
        b.id === beatId ? { ...b, status } : b
      );
      await saveGraph({ beats: nextBeats, edges: graph.edges });
    },
    [graph, saveGraph]
  );

  const deleteBeat = useCallback(
    async (beatId: string) => {
      if (!graph) return;
      if (!confirm(t('panels:overview.deleteConfirm'))) return;
      const nextBeats = graph.beats.filter((b) => b.id !== beatId);
      const nextEdges = graph.edges.filter(
        (e) => e.from_beat !== beatId && e.to_beat !== beatId
      );
      if (selectedBeatId === beatId) setSelectedBeatId(null);
      await saveGraph({ beats: nextBeats, edges: nextEdges });
    },
    [graph, saveGraph, selectedBeatId, t]
  );

  // ----- derived stats -----
  const beatStats = useMemo(() => {
    if (!graph) return { total: 0, completed: 0, current: 0, planned: 0 };
    const total = graph.beats.length;
    const completed = graph.beats.filter(
      (b) => b.status === 'completed'
    ).length;
    const current = graph.beats.filter((b) => b.status === 'current').length;
    const planned = graph.beats.filter((b) => b.status === 'planned').length;
    return { total, completed, current, planned };
  }, [graph]);

  const hookRecon: HookReconciliation | null = useMemo(() => {
    if (!graph || !storyMeta) return null;
    return reconcileHooks(graph, storyMeta.hooks, selectedBeat);
  }, [graph, storyMeta, selectedBeat]);

  // Banner only flags hard errors: graph references hooks missing from pool.
  const hookMissingCount = hookRecon?.missingInPool.length ?? 0;

  // ----- render -----
  if (!projectId) {
    return (
      <div className="overview-overlay flex h-full w-full items-center justify-center bg-background text-foreground">
        <p className="text-sm text-muted-foreground">
          {t('panels:overview.noProject')}
        </p>
      </div>
    );
  }

  const filterKeys = [
    'all',
    'planned',
    'current',
    'completed',
    'skipped',
  ] as const;

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className="overview-overlay flex h-full w-full overflow-hidden bg-background text-foreground"
        data-panel="overview"
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <header className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2">
            <div className="flex shrink-0 items-center gap-1.5">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">
                {t('panels:overview.storyGraph')}
              </h2>
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                {beatStats.total}
              </Badge>
            </div>

            <div className="hidden min-w-0 flex-1 items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground sm:flex">
              <span>
                {t('panels:overview.chapterCount')} {stats.chapterCount}
              </span>
              <span>
                {t('panels:overview.totalWords')}{' '}
                {stats.totalWords.toLocaleString()}
              </span>
              <span>
                {t('panels:overview.characterCount')} {stats.characterCount}
              </span>
              <span>
                {t('panels:overview.hooks')} {stats.hookTotal}
              </span>
            </div>

            <div className="flex items-center gap-0.5 rounded-md border border-border/50 p-0.5">
              {filterKeys.map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={statusFilter === s ? 'secondary' : 'ghost'}
                  className="h-6 px-2 text-[11px]"
                  onClick={() => setStatusFilter(s)}
                >
                  {t(
                    `panels:overview.filter${s.charAt(0).toUpperCase() + s.slice(1)}`
                  )}
                </Button>
              ))}
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-0.5">
              {transferSource ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 max-w-[11rem] gap-1 px-2"
                      onClick={handleOpenSourceBook}
                      data-testid="overview-open-source-book"
                    >
                      <Library className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">
                        {t('panels:overview.openSourceBook', {
                          title: transferSource.sourceBookTitle,
                        })}
                      </span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    {t('panels:overview.openSourceBookHint', {
                      path: transferSource.sourceBookDir,
                    })}
                  </TooltipContent>
                </Tooltip>
              ) : null}
              <Button
                size="sm"
                variant="secondary"
                className="h-7"
                onClick={handleGenerateGraph}
              >
                <Wand2 className="h-3.5 w-3.5" />
                {t('panels:overview.generateStoryGraph')}
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2"
                    onClick={() => {
                      const allArcs = new Set<string>();
                      for (const b of graph?.beats ?? []) {
                        allArcs.add(b.arc ?? '未分类');
                      }
                      setExpandedArcs(allArcs);
                    }}
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {t('panels:overview.expandAll')}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2"
                    onClick={() => setExpandedArcs(new Set())}
                  >
                    <Minimize2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {t('panels:overview.collapseAll')}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-7 px-2">
                    <Info className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs space-y-1.5 p-3">
                  <div className="text-[11px] font-medium text-foreground">
                    {t('panels:overview.edgeLegend')}
                  </div>
                  {Object.entries(EDGE_STYLES).map(([type, s]) => (
                    <div
                      key={type}
                      className="flex items-start gap-2 text-[11px] text-muted-foreground"
                    >
                      <span
                        className="mt-1.5 inline-block w-5 shrink-0"
                        style={{
                          borderTop: `${s.width}px ${s.dashed ? 'dashed' : 'solid'} ${s.stroke}`,
                        }}
                      />
                      <span>
                        <span className="text-foreground">{s.label}</span>
                        {' — '}
                        {s.description}
                      </span>
                    </div>
                  ))}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2"
                    onClick={() => {
                      refreshGraph();
                      refreshStats();
                      void refreshStoryMeta();
                    }}
                  >
                    <RefreshCw
                      className={cn(
                        'h-3.5 w-3.5',
                        graphLoading && 'animate-spin'
                      )}
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('panels:overview.refresh')}</TooltipContent>
              </Tooltip>
            </div>
          </header>

          {promptNotice && (
            <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
              <span className="min-w-0 truncate">{promptNotice}</span>
              <button
                type="button"
                className="shrink-0 rounded-sm p-0.5 hover:bg-muted hover:text-foreground"
                onClick={() => setPromptNotice(null)}
                aria-label="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {hookMissingCount > 0 && hookRecon && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-950 dark:text-amber-100">
              <Link2 className="h-3.5 w-3.5 shrink-0" />
              <span className="font-medium">
                {t('panels:overview.hookMismatch', { count: hookMissingCount })}
              </span>
              <span className="text-muted-foreground">
                {t('panels:overview.hookMissingInPool')}:{' '}
                {hookRecon.missingInPool.join(', ')}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto h-6 px-2 text-[11px]"
                onClick={() => void refreshStoryMeta()}
              >
                {t('panels:overview.refreshMeta')}
              </Button>
            </div>
          )}

          <div className="flex min-h-0 flex-1 overflow-hidden">
            <div className="relative min-h-0 flex-1">
              {graphLoading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">
                    {t('panels:overview.graphLoading')}
                  </span>
                </div>
              )}
              {graphError && (
                <div className="absolute inset-0 z-10 flex items-center justify-center px-6">
                  <p className="text-sm text-destructive">
                    {t('panels:overview.graphError')}: {graphError}
                  </p>
                </div>
              )}
              {!graphLoading && graph && graph.beats.length === 0 && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 px-6">
                  <Layers className="h-8 w-8 text-muted-foreground/50" />
                  <p className="max-w-sm text-center text-sm text-muted-foreground">
                    {t('panels:overview.graphEmpty')}
                  </p>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleGenerateGraph}
                  >
                    <Wand2 className="h-3.5 w-3.5" />
                    {t('panels:overview.generateStoryGraph')}
                  </Button>
                </div>
              )}

              {graph && graph.beats.length > 0 && (
                <ReactFlow
                  key={`story-graph:${storyGraphPath}`}
                  nodes={rfNodes}
                  edges={rfEdges}
                  nodeTypes={nodeTypes}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={onConnect}
                  onNodeClick={onNodeClick}
                  onEdgeClick={(_, edge) => {
                    const edgeType = edge.id.split(':').pop() ?? '';
                    const style = EDGE_STYLES[edgeType];
                    if (style) {
                      setPromptNotice(`${style.label}：${style.description}`);
                    }
                  }}
                  onEdgeMouseEnter={(_, edge) => {
                    const edgeType = edge.id.split(':').pop() ?? '';
                    const style = EDGE_STYLES[edgeType];
                    if (style) {
                      setPromptNotice(`${style.label}：${style.description}`);
                    }
                  }}
                  onEdgeMouseLeave={() => {
                    setPromptNotice(null);
                  }}
                  fitView
                  fitViewOptions={{ padding: 0.45, maxZoom: 1, minZoom: 0.35 }}
                  proOptions={{ hideAttribution: true }}
                  minZoom={0.2}
                  maxZoom={2.5}
                  defaultEdgeOptions={{ type: 'smoothstep' }}
                  nodesDraggable
                  nodesConnectable
                  elementsSelectable
                >
                  <Background
                    variant={BackgroundVariant.Dots}
                    gap={20}
                    size={1}
                    color="var(--border, #0b162814)"
                  />
                  <Controls showInteractive={false} />
                  <MiniMap pannable zoomable nodeColor={minimapNodeColor} />
                </ReactFlow>
              )}
            </div>

            {selectedBeat && (
              <aside className="flex w-72 shrink-0 flex-col overflow-hidden border-l">
                <div className="flex items-start gap-2 border-b px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] text-muted-foreground">
                      {BEAT_TYPE_LABELS[selectedBeat.beat_type] ??
                        selectedBeat.beat_type}
                    </div>
                    <h3 className="text-sm font-semibold leading-snug">
                      {selectedBeat.title}
                    </h3>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <Badge
                        variant="secondary"
                        className="h-5 rounded-sm px-1.5 text-[10px] font-medium"
                      >
                        {STATUS_LABELS[selectedBeat.status] ??
                          selectedBeat.status}
                      </Badge>
                      {selectedBeat.chapter_hint != null && (
                        <span className="text-[11px] text-muted-foreground">
                          第 {Number(selectedBeat.chapter_hint)} 章
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 shrink-0 p-0"
                    onClick={() => setSelectedBeatId(null)}
                    aria-label="Close"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                  {selectedBeat.description && (
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {selectedBeat.description}
                    </p>
                  )}

                  {beatContext ? (
                    <div className="space-y-3 text-xs">
                      {beatContext.predecessors.length > 0 && (
                        <div>
                          <div className="mb-1 text-muted-foreground">
                            {t('panels:overview.beatPredecessors')}
                          </div>
                          <div className="flex flex-col gap-0.5">
                            {beatContext.predecessors.map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                className="rounded-sm px-1.5 py-1 text-left text-foreground transition-colors hover:bg-muted/60"
                                onClick={() => setSelectedBeatId(p.id)}
                              >
                                {p.title}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {beatContext.successors.length > 0 && (
                        <div>
                          <div className="mb-1 text-muted-foreground">
                            {t('panels:overview.beatSuccessors')}
                          </div>
                          <div className="flex flex-col gap-0.5">
                            {beatContext.successors.map((s) => (
                              <button
                                key={s.id}
                                type="button"
                                className="rounded-sm px-1.5 py-1 text-left text-foreground transition-colors hover:bg-muted/60"
                                onClick={() => setSelectedBeatId(s.id)}
                              >
                                {s.title}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {beatContext.characters.length > 0 && (
                        <div>
                          <div className="mb-1 text-muted-foreground">
                            {t('panels:overview.beatCharacters')}
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {beatContext.characters.map((c) => (
                              <span
                                key={c}
                                className="rounded-sm bg-muted/70 px-1.5 py-0.5 text-[11px] text-foreground"
                              >
                                {c}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>

                <div className="space-y-2 border-t p-3">
                  {(selectedBeat.hooks?.length ?? 0) > 0 && hookRecon && (
                    <div className="rounded-md border border-border/60 bg-muted/20 px-2 py-1.5 text-[11px]">
                      <div className="mb-1 font-medium text-foreground">
                        {t('panels:overview.beatHooks')}
                      </div>
                      <div className="flex flex-col gap-0.5 text-muted-foreground">
                        {(selectedBeat.hooks ?? []).map((id) => {
                          const row = hookRecon.beatHooks.find(
                            (h) => h.hookId === id
                          );
                          const missing =
                            hookRecon.beatMissingInPool.includes(id);
                          return (
                            <span key={id}>
                              {id}
                              {missing
                                ? ` · ${t('panels:overview.hookMissingShort')}`
                                : row
                                  ? ` · ${row.status || '—'}`
                                  : ''}
                            </span>
                          );
                        })}
                      </div>
                      {hookRecon.orphanInPool.length > 0 && (
                        <div className="mt-1 text-[10px] text-muted-foreground/80">
                          {t('panels:overview.hookOrphanInPool')}:{' '}
                          {hookRecon.orphanInPool.slice(0, 6).join(', ')}
                          {hookRecon.orphanInPool.length > 6
                            ? ` +${hookRecon.orphanInPool.length - 6}`
                            : ''}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-1.5">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-8"
                      onClick={() => void handleInferBeat()}
                      disabled={!beatContext || packBusy}
                    >
                      {packBusy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}
                      {t('panels:overview.inferBeat')}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-8"
                      onClick={() => void handleWriteBeat()}
                      disabled={!beatContext || packBusy}
                    >
                      <PenLine className="h-3.5 w-3.5" />
                      {t('panels:overview.writeBeat')}
                    </Button>
                  </div>
                  <Button
                    size="sm"
                    variant={
                      pendingWriteBackBeatId === selectedBeat.id &&
                      !pendingAdvanceBeatId
                        ? 'default'
                        : 'outline'
                    }
                    className="h-8 w-full"
                    onClick={() => void handleSyncState()}
                    disabled={!beatContext || packBusy}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {t('panels:overview.syncState')}
                  </Button>
                  {pendingAdvanceBeatId === selectedBeat.id && (
                    <Button
                      size="sm"
                      variant="default"
                      className="h-8 w-full"
                      onClick={() => void handleConfirmAdvance()}
                      disabled={packBusy}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {t('panels:overview.confirmAdvance')}
                    </Button>
                  )}
                  <div className="flex flex-wrap gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => updateStatus(selectedBeat.id, 'current')}
                    >
                      <CircleDot className="h-3 w-3" />
                      {t('panels:overview.markCurrent')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-[11px]"
                      onClick={() =>
                        updateStatus(selectedBeat.id, 'completed')
                      }
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      {t('panels:overview.markCompleted')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => updateStatus(selectedBeat.id, 'planned')}
                    >
                      <Circle className="h-3 w-3" />
                      {t('panels:overview.markPlanned')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-[11px] text-destructive hover:text-destructive"
                      onClick={() => deleteBeat(selectedBeat.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                      {t('panels:overview.deleteBeat')}
                    </Button>
                  </div>
                </div>
              </aside>
            )}
          </div>
        </div>

        <OverviewSessionSlot visible={true} />
      </div>
    </TooltipProvider>
  );
}
