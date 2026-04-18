<script setup lang="ts">
import { nextTick, onUnmounted, ref, shallowRef, watch } from 'vue'
import { DataSet } from 'vis-data'
import { Network } from 'vis-network'
import 'vis-network/styles/vis-network.min.css'
import { getStorylineGraph } from '@/api/storylines'
import type { StorylineGraph } from '@/types/storyline'

const props = defineProps<{
  storylineId: number
}>()

const container = ref<HTMLElement | null>(null)
const net = shallowRef<InstanceType<typeof Network> | null>(null)
const graph = ref<StorylineGraph | null>(null)
const loading = ref(false)
const error = ref('')

function colorForType(t: string) {
  const k = (t || '').toLowerCase()
  if (k === 'fact') return '#7c3aed'
  if (k === 'event') return '#2563eb'
  if (k === 'twist') return '#ea580c'
  if (k === 'clue') return '#16a34a'
  if (k === 'payoff') return '#0d9488'
  if (k === 'goal') return '#db2777'
  if (k === 'checkpoint') return '#ca8a04'
  return '#64748b'
}

function destroyNet() {
  net.value?.destroy()
  net.value = null
}

function buildVisData(g: StorylineGraph) {
  const nodes = new DataSet(
    g.nodes.map((n) => {
      const label =
        n.label && String(n.label).trim() ? String(n.label).slice(0, 48) : String(n.id).slice(0, 48)
      const tip = [`类型: ${n.type || '-'}`, `ID: ${n.id}`, JSON.stringify(n.props ?? {}, null, 2)].join('\n')
      return {
        id: n.id,
        label,
        title: tip.slice(0, 4000),
        shape: String(n.type).toLowerCase() === 'fact' ? 'box' : 'dot',
        size: String(n.type).toLowerCase() === 'fact' ? 22 : 18,
        color: {
          background: colorForType(n.type),
          border: '#0f172a',
          highlight: { background: colorForType(n.type), border: '#020617' },
        },
        font: { color: '#f8fafc', size: 13, face: 'system-ui' },
      }
    }),
  )
  const edges = new DataSet(
    g.edges.map((e, i) => ({
      id: e.id || `edge-${i}`,
      from: e.source,
      to: e.target,
      arrows: 'to',
      title: `${e.type || 'edge'}`,
      label: (e.type || '').length > 14 ? `${(e.type || '').slice(0, 12)}…` : e.type || '',
      font: { align: 'middle', size: 11, color: '#334155', strokeWidth: 0 },
      color: { color: '#94a3b8', highlight: '#475569' },
    })),
  )
  return { nodes, edges }
}

function redraw() {
  destroyNet()
  const el = container.value
  if (!el || !graph.value?.nodes?.length) return
  const { nodes, edges } = buildVisData(graph.value)
  const options = {
    physics: {
      enabled: true,
      stabilization: { iterations: 200 },
      barnesHut: {
        gravitationalConstant: -2800,
        centralGravity: 0.18,
        springLength: 160,
        springConstant: 0.05,
        damping: 0.45,
      },
    },
    interaction: {
      hover: true,
      tooltipDelay: 100,
      navigationButtons: true,
      keyboard: true,
    },
    nodes: { borderWidth: 1 },
    edges: { selectionWidth: 2 },
  }
  net.value = new Network(el, { nodes, edges } as never, options as never)
  net.value.once('stabilizationIterationsDone', () => {
    net.value?.setOptions({ physics: false } as never)
    net.value?.fit({ animation: { duration: 420, easingFunction: 'easeInOutQuad' } })
  })
}

async function loadGraph() {
  error.value = ''
  if (!props.storylineId) {
    graph.value = null
    destroyNet()
    return
  }
  loading.value = true
  try {
    graph.value = await getStorylineGraph(props.storylineId)
  } catch (e) {
    graph.value = null
    error.value = String((e as Error)?.message || e)
  } finally {
    loading.value = false
  }
}

watch(
  () => props.storylineId,
  async () => {
    await loadGraph()
    await nextTick()
    redraw()
  },
  { immediate: true },
)

watch(graph, async () => {
  await nextTick()
  redraw()
})

onUnmounted(() => destroyNet())

function fitView() {
  net.value?.fit({ animation: { duration: 320, easingFunction: 'easeInOutQuad' } })
}

defineExpose({ reload: loadGraph, fitView })
</script>

<template>
  <div class="storyline-graph">
    <a-alert v-if="error" type="error" style="margin-bottom: 8px">{{ error }}</a-alert>
    <div class="storyline-graph__toolbar">
      <a-button size="small" :loading="loading" @click="loadGraph">刷新图数据</a-button>
      <a-button size="small" :disabled="!graph?.nodes?.length" @click="fitView">自适应画布</a-button>
      <span v-if="graph?.stats" class="storyline-graph__stats">
        节点 {{ graph.stats.totalNodes }} · 边 {{ graph.stats.totalEdges }} · 事件 {{ graph.stats.eventCount }} ·
        伏笔 {{ graph.stats.clueCount }} · 转折 {{ graph.stats.twistCount }} · 事实 {{ graph.stats.factCount }}
      </span>
    </div>
    <a-spin :loading="loading" class="storyline-graph__spin">
      <div v-show="graph && graph.nodes.length" ref="container" class="storyline-graph__canvas" />
      <a-empty
        v-if="!loading && (!graph || !graph.nodes.length) && !error"
        description="暂无图数据。可通过 AI 生成并写入数据库，或手动新增节点/边/事实。"
        class="storyline-graph__empty"
      />
    </a-spin>
  </div>
</template>

<style scoped>
.storyline-graph__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.storyline-graph__stats {
  font-size: 12px;
  color: var(--color-text-3);
  margin-left: 4px;
}
.storyline-graph__spin {
  width: 100%;
  min-height: 200px;
}
.storyline-graph__canvas {
  width: 100%;
  height: min(62vh, 640px);
  min-height: 420px;
  border: 1px solid var(--color-border-2);
  border-radius: 8px;
  background: radial-gradient(circle at 20% 20%, var(--color-fill-2), var(--color-bg-2));
}
.storyline-graph__empty {
  padding: 48px 0;
}
</style>
