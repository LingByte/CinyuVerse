<script setup lang="ts">
import { computed } from 'vue'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export type GitGraphLine = {
  graph: string
  hash: string
  message: string
  author?: string
  refs?: string
  timestamp?: number
}

const props = withDefaults(
  defineProps<{
    lines: GitGraphLine[]
    rowHeight?: number
    colWidth?: number
    selectedHash?: string
  }>(),
  {
    rowHeight: 28,
    colWidth: 14,
  },
)

const emit = defineEmits<{
  select: [line: GitGraphLine]
}>()

const laneColors = ['#3794ff', '#56d364', '#ffa657', '#d2a8ff', '#79c0ff', '#ff7b72', '#a5d6ff']

function laneColor(idx: number) {
  return laneColors[Math.max(0, idx) % laneColors.length]
}

function colX(col: number) {
  return col * props.colWidth + props.colWidth / 2 + 4
}

function parseRefs(refs: string) {
  if (!refs.trim()) return [] as string[]
  return refs
    .replace(/^\s*\(/, '')
    .replace(/\)\s*$/, '')
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean)
}

const parsed = computed(() => {
  const list = props.lines.map((l, index) => {
    const g = l.graph ?? ''
    const nodeCol = Math.max(0, g.indexOf('*'))
    const activeCols = new Set<number>()
    for (let i = 0; i < g.length; i++) {
      const ch = g[i]
      if (ch === '|' || ch === '*' || ch === '/' || ch === '\\') activeCols.add(i)
    }
    if (g.includes('*')) activeCols.add(nodeCol)
    return { ...l, index, nodeCol, activeCols, graph: g, refTags: parseRefs(l.refs ?? '') }
  })

  type Segment = { row: number; col: number }
  const verticalSegments: Segment[] = []
  const seen = new Set<string>()

  function addSegment(row: number, col: number) {
    const key = `${row}:${col}`
    if (seen.has(key)) return
    seen.add(key)
    verticalSegments.push({ row, col })
  }

  for (let r = 0; r < list.length; r++) {
    const cur = list[r]
    for (const c of cur.activeCols) addSegment(r, c)

    if (cur.graph.includes('*')) {
      if (r < list.length - 1) addSegment(r, cur.nodeCol)
      if (r > 0) addSegment(r - 1, cur.nodeCol)
    }

    const prev = list[r - 1]
    if (prev) {
      for (const c of prev.activeCols) addSegment(r - 1, c)
      for (const c of cur.activeCols) {
        if (prev.activeCols.has(c)) addSegment(r - 1, c)
      }
    }
  }

  const diagonals: Array<{ row: number; col: number; dir: '/' | '\\' }> = []
  for (let r = 0; r < list.length; r++) {
    const g = list[r].graph
    for (let col = 0; col < g.length; col++) {
      const ch = g[col]
      if (ch === '/' || ch === '\\') diagonals.push({ row: r, col, dir: ch })
    }
  }

  return { list, verticalSegments, diagonals }
})

const maxCols = computed(() => {
  let m = 0
  for (const l of props.lines) m = Math.max(m, (l.graph ?? '').length)
  return Math.max(1, m)
})

const graphWidth = computed(() => maxCols.value * props.colWidth + 8)
const totalHeight = computed(() => Math.max(props.rowHeight, parsed.value.list.length * props.rowHeight))

const dtf = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

function fmtTime(ts?: number) {
  if (!ts) return ''
  try {
    return dtf.format(new Date(ts * 1000))
  } catch {
    return ''
  }
}

function refVariant(ref: string): 'default' | 'secondary' | 'outline' {
  if (/HEAD/i.test(ref)) return 'default'
  if (ref.includes('/')) return 'secondary'
  return 'outline'
}

function onSelect(line: GitGraphLine) {
  emit('select', line)
}
</script>

<template>
  <div class="git-graph-root">
    <div class="flex items-stretch">
      <svg
        :width="graphWidth"
        :height="totalHeight"
        :viewBox="`0 0 ${graphWidth} ${totalHeight}`"
        class="shrink-0 select-none"
        aria-hidden="true"
      >
        <line
          v-for="seg in parsed.verticalSegments"
          :key="`v:${seg.row}:${seg.col}`"
          :x1="colX(seg.col)"
          :y1="seg.row * rowHeight"
          :x2="colX(seg.col)"
          :y2="(seg.row + 1) * rowHeight"
          :stroke="laneColor(seg.col)"
          stroke-width="2"
          stroke-linecap="round"
          opacity="0.65"
        />

        <line
          v-for="d in parsed.diagonals"
          :key="`d:${d.row}:${d.col}:${d.dir}`"
          :x1="d.dir === '/' ? colX(d.col + 1) : colX(d.col - 1)"
          :y1="d.row * rowHeight"
          :x2="d.dir === '/' ? colX(d.col) : colX(d.col)"
          :y2="(d.row + 1) * rowHeight"
          :stroke="laneColor(d.col)"
          stroke-width="2"
          stroke-linecap="round"
          opacity="0.8"
        />

        <g v-for="l in parsed.list" :key="`node:${l.hash}`">
          <circle
            v-if="l.graph.includes('*')"
            :cx="colX(l.nodeCol)"
            :cy="l.index * rowHeight + rowHeight / 2"
            r="5"
            :fill="laneColor(l.nodeCol)"
          />
          <circle
            v-if="l.graph.includes('*') && l.refTags.some((r) => /HEAD/i.test(r))"
            :cx="colX(l.nodeCol)"
            :cy="l.index * rowHeight + rowHeight / 2"
            r="8"
            fill="none"
            :stroke="laneColor(l.nodeCol)"
            stroke-width="2"
            opacity="0.35"
          />
        </g>
      </svg>

      <div class="min-w-0 flex-1">
        <button
          v-for="l in parsed.list"
          :key="`row:${l.hash}`"
          type="button"
          class="git-graph-row w-full text-left"
          :class="cn(selectedHash === l.hash && 'git-graph-row-active')"
          :style="{ minHeight: `${rowHeight}px` }"
          @click="onSelect(l)"
        >
          <div class="git-graph-title">
            <span class="git-graph-hash">{{ l.hash }}</span>
            <span class="git-graph-message">{{ l.message }}</span>
            <Badge
              v-for="ref in l.refTags"
              :key="ref"
              :variant="refVariant(ref)"
              class="h-4 px-1.5 text-[10px] font-mono font-semibold"
            >
              {{ ref }}
            </Badge>
          </div>
          <div class="git-graph-sub">
            <span v-if="l.author">{{ l.author }}</span>
            <span v-if="l.author && fmtTime(l.timestamp)" class="mx-1">·</span>
            <span v-if="fmtTime(l.timestamp)">{{ fmtTime(l.timestamp) }}</span>
          </div>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.git-graph-root {
  font-size: 12px;
}

.git-graph-row {
  display: block;
  padding: 2px 8px 2px 4px;
  border-radius: 4px;
  margin: 0 4px;
  cursor: pointer;
  border: none;
  background: transparent;
}

.git-graph-row:hover {
  background: hsl(var(--accent) / 0.6);
}

.git-graph-row-active {
  background: hsl(var(--primary) / 0.12);
}

.git-graph-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  line-height: 18px;
  color: hsl(var(--foreground));
}

.git-graph-hash {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  color: hsl(var(--muted-foreground));
}

.git-graph-message {
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.git-graph-sub {
  font-size: 11px;
  line-height: 16px;
  color: hsl(var(--muted-foreground));
}
</style>
