<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Message, Modal } from '@arco-design/web-vue'
import { ArrowLeft, FileText, GitBranch, Sparkles, Wand2 } from 'lucide-vue-next'
import { WorkspaceBreadcrumb } from '@/components/layout'
import StorylineGraphCanvas from '@/components/storyline/StorylineGraphCanvas.vue'
import { getNovel } from '@/api/novels'
import {
  commitStorylineIncrement,
  createStoryline,
  createStorylineEdge,
  createStorylineFact,
  createStorylineNode,
  deleteStoryline,
  deleteStorylineEdge,
  deleteStorylineFact,
  deleteStorylineNode,
  generateStorylineByAI,
  getStoryline,
  listStorylineEdges,
  listStorylineFacts,
  listStorylineNodes,
  listStorylines,
  updateStoryline,
} from '@/api/storylines'
import { ApiBizError } from '@/types/api'
import type { Novel } from '@/types/novel'
import type {
  Storyline,
  StorylineAIDraft,
  StorylineEdge,
  StorylineFact,
  StorylineNode,
} from '@/types/storyline'

const route = useRoute()
const router = useRouter()
const novelId = computed(() => Number(route.params.id))

const novel = ref<Novel | null>(null)
const loading = ref(false)
const storylines = ref<Storyline[]>([])
const selectedId = ref<number | null>(null)
const tab = ref('graph')

const graphRef = ref<{ reload: () => Promise<void>; fitView: () => void } | null>(null)

const nodes = ref<StorylineNode[]>([])
const edges = ref<StorylineEdge[]>([])
const facts = ref<StorylineFact[]>([])
const subLoading = ref(false)

const drawerVisible = ref(false)
const drawerMode = ref<'create' | 'edit'>('create')
const slForm = reactive({
  name: '',
  version: 1,
  status: 'draft',
  theme: '',
  promise: '',
  forbidden: '',
  description: '',
  currentNodeId: '',
})

const aiVisible = ref(false)
const aiLoading = ref(false)
const aiMessage = ref('请为本小说生成一条主线故事图：包含若干事件/伏笔/转折节点，以及它们之间的因果边，并补充少量事实锚点。')
const aiDetailLevel = ref('standard')
const aiModel = ref('')
const aiMaxTokens = ref<number | undefined>(undefined)
const aiTemperature = ref<number | undefined>(undefined)
const aiNodeLimit = ref<number | undefined>(undefined)
const aiEdgeLimit = ref<number | undefined>(undefined)
const aiFactLimit = ref<number | undefined>(undefined)
const aiFeedback = ref('')
const aiLocked = ref<string[]>([])
const aiError = ref<{ message: string; raw?: string; validationErrors?: string[] } | null>(null)
const aiSafeIncrement = ref(true)
const AI_LOCK_OPTS = [
  { label: '故事线元数据', value: 'storyline' },
  { label: '节点', value: 'nodes' },
  { label: '边', value: 'edges' },
  { label: '事实', value: 'facts' },
]
const lastDraft = ref<StorylineAIDraft | null>(null)
const lastRaw = ref('')
const persistLoading = ref(false)
const previewBaseDraft = ref<StorylineAIDraft | null>(null)
const overviewLoading = ref(false)
const finalOverview = ref('')

const nodeModal = ref(false)
const nodeForm = reactive({
  nodeId: '',
  type: 'event',
  title: '',
  summary: '',
  status: 'draft',
})

const edgeModal = ref(false)
const edgeForm = reactive({
  edgeId: '',
  fromNodeId: '',
  toNodeId: '',
  relation: 'cause',
})

const factModal = ref(false)
const factForm = reactive({
  factKey: '',
  factValue: '',
  sourceNodeId: '',
  confidence: 100,
})

const selectedStoryline = computed(() => storylines.value.find((s) => s.id === selectedId.value) || null)
const previewNodes = computed(() => {
  const out: StorylineNode[] = []
  const seen = new Set<string>()
  for (const n of previewBaseDraft.value?.nodes || []) {
    const k = (n.nodeId || '').trim() || `base-${n.id}`
    if (!seen.has(k)) {
      seen.add(k)
      out.push(n)
    }
  }
  for (const n of lastDraft.value?.nodes || []) {
    const k = (n.nodeId || '').trim() || `draft-${n.id}`
    if (!seen.has(k)) {
      seen.add(k)
      out.push(n)
    }
  }
  return out
})
const previewEdges = computed(() => {
  const out: StorylineEdge[] = []
  const seen = new Set<string>()
  for (const e of previewBaseDraft.value?.edges || []) {
    const k = (e.edgeId || '').trim() || `base-${e.id}`
    if (!seen.has(k)) {
      seen.add(k)
      out.push(e)
    }
  }
  for (const e of lastDraft.value?.edges || []) {
    const k = (e.edgeId || '').trim() || `draft-${e.id}`
    if (!seen.has(k)) {
      seen.add(k)
      out.push(e)
    }
  }
  return out
})
const previewFacts = computed(() => {
  const out: StorylineFact[] = []
  const seen = new Set<string>()
  for (const f of previewBaseDraft.value?.facts || []) {
    const k = `${(f.factKey || '').trim()}::${(f.sourceNodeId || '').trim()}`
    if (!seen.has(k)) {
      seen.add(k)
      out.push(f)
    }
  }
  for (const f of lastDraft.value?.facts || []) {
    const k = `${(f.factKey || '').trim()}::${(f.sourceNodeId || '').trim()}`
    if (!seen.has(k)) {
      seen.add(k)
      out.push(f)
    }
  }
  return out
})
const draftCounts = computed(() => ({
  nodes: previewNodes.value.length,
  edges: previewEdges.value.length,
  facts: previewFacts.value.length,
}))

function newId(prefix: string) {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

async function loadNovel() {
  loading.value = true
  try {
    novel.value = await getNovel(novelId.value)
  } catch (e) {
    Message.error(String((e as Error)?.message || e))
  } finally {
    loading.value = false
  }
}

async function loadStorylines() {
  subLoading.value = true
  try {
    const res = await listStorylines({ novelId: novelId.value, page: 1, size: 100 })
    storylines.value = res.items
    if (!selectedId.value && res.items.length) {
      selectedId.value = res.items[0]!.id
    }
    if (selectedId.value && !res.items.some((x) => x.id === selectedId.value)) {
      selectedId.value = res.items[0]?.id ?? null
    }
  } catch (e) {
    Message.error(String((e as Error)?.message || e))
  } finally {
    subLoading.value = false
  }
  if (selectedId.value) {
    await loadSubs()
  } else {
    nodes.value = []
    edges.value = []
    facts.value = []
  }
}

async function loadSubs() {
  if (!selectedId.value) {
    nodes.value = []
    edges.value = []
    facts.value = []
    return
  }
  subLoading.value = true
  try {
    const [n, e, f] = await Promise.all([
      listStorylineNodes({ storylineId: selectedId.value, page: 1, size: 200 }),
      listStorylineEdges({ storylineId: selectedId.value, page: 1, size: 200 }),
      listStorylineFacts({ storylineId: selectedId.value, page: 1, size: 200 }),
    ])
    nodes.value = n.items
    edges.value = e.items
    facts.value = f.items
  } catch (e) {
    Message.error(String((e as Error)?.message || e))
  } finally {
    subLoading.value = false
  }
}

onMounted(async () => {
  if (!Number.isFinite(novelId.value) || novelId.value <= 0) {
    Message.error('无效的小说 ID')
    return
  }
  await loadNovel()
  await loadStorylines()
  await loadSubs()
})

async function onSelectStoryline(id: number) {
  selectedId.value = id
  tab.value = 'graph'
  await loadSubs()
  await nextTick()
  await graphRef.value?.reload()
}

function openCreate() {
  drawerMode.value = 'create'
  slForm.name = ''
  slForm.version = 1
  slForm.status = 'draft'
  slForm.theme = ''
  slForm.promise = ''
  slForm.forbidden = ''
  slForm.description = ''
  slForm.currentNodeId = ''
  drawerVisible.value = true
}

function openEdit() {
  const s = selectedStoryline.value
  if (!s) return
  drawerMode.value = 'edit'
  slForm.name = s.name || ''
  slForm.version = s.version || 1
  slForm.status = s.status || 'draft'
  slForm.theme = s.theme || ''
  slForm.promise = s.promise || ''
  slForm.forbidden = s.forbidden || ''
  slForm.description = s.description || ''
  slForm.currentNodeId = s.currentNodeId || ''
  drawerVisible.value = true
}

async function saveStorylineMeta() {
  if (!slForm.name.trim()) {
    Message.warning('名称必填')
    return
  }
  try {
    if (drawerMode.value === 'create') {
      const created = await createStoryline({
        novelId: novelId.value,
        name: slForm.name.trim(),
        version: slForm.version || 1,
        status: slForm.status.trim() || 'draft',
        theme: slForm.theme.trim(),
        promise: slForm.promise.trim(),
        forbidden: slForm.forbidden.trim(),
        description: slForm.description.trim(),
        currentNodeId: slForm.currentNodeId.trim(),
      })
      selectedId.value = created.id
      Message.success('已创建故事线')
    } else if (selectedId.value) {
      await updateStoryline(selectedId.value, {
        name: slForm.name.trim(),
        version: slForm.version || 1,
        status: slForm.status.trim(),
        theme: slForm.theme.trim(),
        promise: slForm.promise.trim(),
        forbidden: slForm.forbidden.trim(),
        description: slForm.description.trim(),
        currentNodeId: slForm.currentNodeId.trim(),
      })
      Message.success('已保存')
    }
    drawerVisible.value = false
    await loadStorylines()
    await loadSubs()
    await graphRef.value?.reload()
  } catch (e) {
    Message.error(String((e as Error)?.message || e))
  }
}

function confirmDelete(row: Storyline) {
  Modal.confirm({
    title: '删除故事线',
    content: `确定删除「${row.name}」？将同时失去图数据关联（节点/边/事实为软删除）。`,
    okText: '删除',
    async onOk() {
      await deleteStoryline(row.id)
      Message.success('已删除')
      if (selectedId.value === row.id) {
        selectedId.value = null
      }
      await loadStorylines()
      await loadSubs()
    },
  })
}

function buildNovelContextPrefix() {
  const n = novel.value
  if (!n) {
    return `小说 ID: ${novelId.value}。\n`
  }
  const parts = [
    `小说 ID: ${novelId.value}`,
    `标题：${n.title || ''}`,
    `类型：${n.genre || ''}`,
    `主题：${n.theme || ''}`,
    `简介：${n.description || ''}`,
    `世界观：${n.worldSetting || ''}`,
    `受众：${n.audience || ''}`,
    `标签：${n.tags || ''}`,
  ]
  return `${parts.join('\n')}\n\n`
}

function clearBaseDraft() {
  lastDraft.value = null
  lastRaw.value = ''
  aiError.value = null
  previewBaseDraft.value = null
  Message.success('已清空草稿基座')
}

function onAiDrawerVisible(v: boolean) {
  if (v) {
    aiError.value = null
  }
}

async function loadBaseFromCurrentStoryline() {
  if (!selectedId.value) {
    Message.warning('请先在左侧选择一条故事线')
    return
  }
  try {
    const [sl, n, e, f] = await Promise.all([
      getStoryline(selectedId.value),
      listStorylineNodes({ storylineId: selectedId.value, page: 1, size: 500 }),
      listStorylineEdges({ storylineId: selectedId.value, page: 1, size: 500 }),
      listStorylineFacts({ storylineId: selectedId.value, page: 1, size: 500 }),
    ])
    lastDraft.value = {
      storyline: { ...sl },
      nodes: n.items,
      edges: e.items,
      facts: f.items,
    }
    previewBaseDraft.value = {
      storyline: { ...sl },
      nodes: n.items,
      edges: e.items,
      facts: f.items,
    }
    lastRaw.value = ''
    aiError.value = null
    Message.success('已载入当前故事线为 AI 草稿基座，可直接点「生成草稿」做迭代')
  } catch (e) {
    Message.error(String((e as Error)?.message || e))
  }
}

async function runAI() {
  if (aiLoading.value) {
    return
  }
  if (!aiMessage.value.trim()) {
    Message.warning('请填写需求说明')
    return
  }
  aiLoading.value = true
  aiError.value = null
  try {
    let base = lastDraft.value
      ? {
          ...lastDraft.value,
          storyline: { ...lastDraft.value.storyline, novelId: novelId.value },
        }
      : undefined
    let lockedFields = [...aiLocked.value]
    if (aiSafeIncrement.value && selectedId.value) {
      const [sl, n, e, f] = await Promise.all([
        getStoryline(selectedId.value),
        listStorylineNodes({ storylineId: selectedId.value, page: 1, size: 500 }),
        listStorylineEdges({ storylineId: selectedId.value, page: 1, size: 500 }),
        listStorylineFacts({ storylineId: selectedId.value, page: 1, size: 500 }),
      ])
      base = {
        storyline: { ...sl },
        nodes: n.items,
        edges: e.items,
        facts: f.items,
      }
      previewBaseDraft.value = {
        storyline: { ...sl },
        nodes: n.items,
        edges: e.items,
        facts: f.items,
      }
      lockedFields = Array.from(new Set([...lockedFields, 'storyline', 'nodes', 'edges', 'facts']))
    } else if (!base) {
      previewBaseDraft.value = null
    }
    const body = {
      message: `${buildNovelContextPrefix()}${aiMessage.value.trim()}`,
      detailLevel: aiDetailLevel.value,
      model: aiModel.value.trim() || undefined,
      maxTokens: aiMaxTokens.value,
      temperature: aiTemperature.value,
      nodeLimit: aiNodeLimit.value,
      edgeLimit: aiEdgeLimit.value,
      factLimit: aiFactLimit.value,
      feedback: aiFeedback.value.trim() || undefined,
      lockedFields,
      baseDraft: base,
    }
    const res = await generateStorylineByAI(body)
    lastDraft.value = res.draft
    lastRaw.value = res.raw || ''
    Message.success(
      res.regenerated ? 'AI 已按反馈重生草稿' : 'AI 草稿已生成，可预览后写入数据库或合并到当前故事线',
    )
  } catch (e) {
    if (e instanceof ApiBizError) {
      const payload = e.data as { raw?: string; validationErrors?: string[] } | undefined
      aiError.value = {
        message: e.message,
        raw: payload?.raw,
        validationErrors: payload?.validationErrors,
      }
      if (payload?.raw) {
        lastRaw.value = payload.raw
      }
      Message.error(e.message)
    } else {
      Message.error(String((e as Error)?.message || e))
    }
  } finally {
    aiLoading.value = false
  }
}

async function generateFinalOverview() {
  if (!storylines.value.length) {
    Message.warning('暂无故事线可概括')
    return
  }
  overviewLoading.value = true
  try {
    const parts: string[] = []
    for (const s of storylines.value) {
      const [detail, n, e, f] = await Promise.all([
        getStoryline(s.id),
        listStorylineNodes({ storylineId: s.id, page: 1, size: 500 }),
        listStorylineEdges({ storylineId: s.id, page: 1, size: 500 }),
        listStorylineFacts({ storylineId: s.id, page: 1, size: 500 }),
      ])
      parts.push(
        [
          `【${detail.name || `故事线#${detail.id}`}】`,
          `状态：${detail.status || 'draft'}；版本：v${detail.version || 1}；当前节点：${detail.currentNodeId || '—'}`,
          `主题：${detail.theme || '—'}`,
          `核心承诺：${detail.promise || '—'}`,
          `禁忌：${detail.forbidden || '—'}`,
          `说明：${detail.description || '—'}`,
          `图规模：节点 ${n.items.length} / 边 ${e.items.length} / 事实 ${f.items.length}`,
        ].join('\n'),
      )
    }
    finalOverview.value = [
      `小说「${novel.value?.title || novelId.value}」故事线最终概括`,
      `共 ${storylines.value.length} 条故事线。`,
      '',
      ...parts,
    ].join('\n\n')
    Message.success('已生成最终概括')
  } catch (e) {
    Message.error(String((e as Error)?.message || e))
  } finally {
    overviewLoading.value = false
  }
}

function draftNodeToCreateBody(n: StorylineNode, sid: number) {
  const nodeId = (n.nodeId || '').trim() || newId('node')
  return {
    storylineId: sid,
    novelId: novelId.value,
    nodeId,
    type: n.type || 'event',
    title: n.title || '',
    summary: n.summary || '',
    status: n.status || 'draft',
    chapterNo: n.chapterNo ?? 0,
    volumeNo: n.volumeNo ?? 0,
    priority: n.priority ?? 0,
    props: n.props && String(n.props).trim() ? String(n.props) : '{}',
  }
}

function draftEdgeToCreateBody(e: StorylineEdge, sid: number) {
  const edgeId = (e.edgeId || '').trim() || newId('edge')
  return {
    storylineId: sid,
    novelId: novelId.value,
    edgeId,
    fromNodeId: e.fromNodeId || '',
    toNodeId: e.toNodeId || '',
    relation: e.relation || 'depends',
    weight: e.weight ?? 0,
    status: e.status || 'active',
    props: e.props && String(e.props).trim() ? String(e.props) : '{}',
  }
}

function draftFactToCreateBody(f: StorylineFact, sid: number) {
  return {
    storylineId: sid,
    novelId: novelId.value,
    factKey: f.factKey || '',
    factValue: f.factValue || '',
    sourceNodeId: f.sourceNodeId || '',
    validFromChap: f.validFromChap ?? 0,
    validToChap: f.validToChap ?? 0,
    confidence: f.confidence ?? 100,
  }
}

async function persistMergeToCurrent() {
  const d = lastDraft.value
  if (!d?.storyline) {
    Message.warning('请先生成 AI 草稿')
    return
  }
  if (!selectedId.value) {
    Message.warning('请先在左侧选择要合并到的故事线')
    return
  }
  persistLoading.value = true
  try {
    const sid = selectedId.value
    const nodeBodies = (d.nodes || []).map((n) => draftNodeToCreateBody(n, sid))
    const edgeBodies = (d.edges || []).map((e) => draftEdgeToCreateBody(e, sid))
    const factBodies = (d.facts || []).map((f) => draftFactToCreateBody(f, sid))
    await commitStorylineIncrement(sid, {
      nodes: nodeBodies,
      edges: edgeBodies,
      facts: factBodies,
      nextCurrentNodeId: d.storyline.currentNodeId?.trim() || undefined,
    })
    Message.success('已将 AI 草稿中的节点/边/事实合并到当前故事线')
    aiVisible.value = false
    aiError.value = null
    await loadStorylines()
    await loadSubs()
    await graphRef.value?.reload()
  } catch (e) {
    Message.error(String((e as Error)?.message || e))
  } finally {
    persistLoading.value = false
  }
}

async function persistAIDraft() {
  const d = lastDraft.value
  if (!d?.storyline) {
    Message.warning('请先生成 AI 草稿')
    return
  }
  persistLoading.value = true
  try {
    d.storyline.novelId = novelId.value
    const created = await createStoryline({
      novelId: novelId.value,
      name: (d.storyline.name || 'AI 故事线').trim(),
      version: d.storyline.version || 1,
      status: d.storyline.status || 'draft',
      theme: d.storyline.theme || '',
      promise: d.storyline.promise || '',
      forbidden: d.storyline.forbidden || '',
      description: d.storyline.description || '',
      currentNodeId: d.storyline.currentNodeId || '',
    })
    const sid = created.id

    for (const n of d.nodes || []) {
      await createStorylineNode(draftNodeToCreateBody(n, sid))
    }
    for (const e of d.edges || []) {
      await createStorylineEdge(draftEdgeToCreateBody(e, sid))
    }
    for (const f of d.facts || []) {
      await createStorylineFact(draftFactToCreateBody(f, sid))
    }

    Message.success('已根据 AI 草稿创建故事线并写入图数据')
    aiVisible.value = false
    aiError.value = null
    selectedId.value = sid
    await loadStorylines()
    await loadSubs()
    await graphRef.value?.reload()
  } catch (e) {
    Message.error(String((e as Error)?.message || e))
  } finally {
    persistLoading.value = false
  }
}

function openNodeModal() {
  if (!selectedId.value) {
    Message.warning('请选择故事线')
    return
  }
  nodeForm.nodeId = newId('node')
  nodeForm.type = 'event'
  nodeForm.title = ''
  nodeForm.summary = ''
  nodeForm.status = 'draft'
  nodeModal.value = true
}

async function onBeforeSaveNode() {
  if (!selectedId.value) return false
  try {
    await createStorylineNode({
      storylineId: selectedId.value,
      novelId: novelId.value,
      nodeId: nodeForm.nodeId.trim(),
      type: nodeForm.type.trim() || 'event',
      title: nodeForm.title.trim(),
      summary: nodeForm.summary.trim(),
      status: nodeForm.status.trim() || 'draft',
    })
    Message.success('节点已创建')
    await loadSubs()
    await graphRef.value?.reload()
    return true
  } catch (e) {
    Message.error(String((e as Error)?.message || e))
    return false
  }
}

function openEdgeModal() {
  if (!selectedId.value) {
    Message.warning('请选择故事线')
    return
  }
  edgeForm.edgeId = newId('edge')
  edgeForm.fromNodeId = nodes.value[0]?.nodeId || ''
  edgeForm.toNodeId = nodes.value[1]?.nodeId || nodes.value[0]?.nodeId || ''
  edgeForm.relation = 'cause'
  edgeModal.value = true
}

async function onBeforeSaveEdge() {
  if (!selectedId.value) return false
  try {
    await createStorylineEdge({
      storylineId: selectedId.value,
      novelId: novelId.value,
      edgeId: edgeForm.edgeId.trim(),
      fromNodeId: edgeForm.fromNodeId.trim(),
      toNodeId: edgeForm.toNodeId.trim(),
      relation: edgeForm.relation.trim() || 'depends',
    })
    Message.success('边已创建')
    await loadSubs()
    await graphRef.value?.reload()
    return true
  } catch (e) {
    Message.error(String((e as Error)?.message || e))
    return false
  }
}

function openFactModal() {
  if (!selectedId.value) {
    Message.warning('请选择故事线')
    return
  }
  factForm.factKey = ''
  factForm.factValue = ''
  factForm.sourceNodeId = nodes.value[0]?.nodeId || ''
  factForm.confidence = 100
  factModal.value = true
}

async function onBeforeSaveFact() {
  if (!selectedId.value) return false
  try {
    await createStorylineFact({
      storylineId: selectedId.value,
      novelId: novelId.value,
      factKey: factForm.factKey.trim(),
      factValue: factForm.factValue.trim(),
      sourceNodeId: factForm.sourceNodeId.trim(),
      confidence: factForm.confidence,
    })
    Message.success('事实已创建')
    await loadSubs()
    await graphRef.value?.reload()
    return true
  } catch (e) {
    Message.error(String((e as Error)?.message || e))
    return false
  }
}

function confirmDeleteNode(row: StorylineNode) {
  Modal.confirm({
    title: '删除节点',
    content: `删除「${row.title || row.nodeId}」？`,
    okText: '删除',
    async onOk() {
      await deleteStorylineNode(row.id)
      await loadSubs()
      await graphRef.value?.reload()
    },
  })
}

function confirmDeleteEdge(row: StorylineEdge) {
  Modal.confirm({
    title: '删除边',
    content: `删除边 ${row.edgeId}？`,
    okText: '删除',
    async onOk() {
      await deleteStorylineEdge(row.id)
      await loadSubs()
      await graphRef.value?.reload()
    },
  })
}

function confirmDeleteFact(row: StorylineFact) {
  Modal.confirm({
    title: '删除事实',
    content: `删除「${row.factKey}」？`,
    okText: '删除',
    async onOk() {
      await deleteStorylineFact(row.id)
      await loadSubs()
      await graphRef.value?.reload()
    },
  })
}
</script>

<template>
  <div class="novel-sl" v-if="novel">
    <WorkspaceBreadcrumb
      :trail="[
        { label: '小说管理', to: { name: 'home' } },
        { label: novel.title || '卷管理', to: { name: 'novel-detail', params: { id: String(novelId) } } },
        { label: '故事线管理' },
      ]"
    />

    <a-card :bordered="false" class="novel-sl__head">
      <template #extra>
        <a-space wrap>
          <a-button @click="router.push({ name: 'novel-detail', params: { id: String(novelId) } })">
            <template #icon>
              <ArrowLeft :size="16" :stroke-width="1.75" />
            </template>
            返回卷管理
          </a-button>
          <a-button @click="router.push({ name: 'novel-characters', params: { id: String(novelId) } })">
            角色管理
          </a-button>
          <a-button type="primary" @click="aiVisible = true">
            <template #icon>
              <Sparkles :size="16" :stroke-width="1.75" />
            </template>
            AI 生成故事线
          </a-button>
        </a-space>
      </template>
      <h2 class="novel-sl__title">
        <GitBranch :size="22" :stroke-width="1.75" class="novel-sl__title-icon" />
        故事线 · {{ novel.title }}
      </h2>
      <p class="novel-sl__desc">
        关系图由后端聚合节点、边与事实生成。可直接点右上角「AI 生成故事线」打开抽屉（无需先选中某条故事线）；选中某条后也可用列表上方的「AI」快捷打开。
      </p>
    </a-card>

    <a-row :gutter="16" class="novel-sl__body">
      <a-col :span="7" :xs="24" :md="7">
        <a-card title="故事线列表" :bordered="false" class="novel-sl__card">
          <template #extra>
            <a-space :size="8">
              <a-button type="outline" size="small" @click="aiVisible = true">
                <template #icon>
                  <Sparkles :size="14" :stroke-width="1.75" />
                </template>
                AI
              </a-button>
              <a-button type="primary" size="small" @click="openCreate">新建</a-button>
            </a-space>
          </template>
          <a-spin :loading="subLoading" style="width: 100%">
            <a-list :bordered="false" :data="storylines">
              <template #item="{ item }">
                <a-list-item
                  class="novel-sl__list-item"
                  :class="{ 'novel-sl__list-item--active': item.id === selectedId }"
                  @click="onSelectStoryline(item.id)"
                >
                  <a-list-item-meta :title="item.name" :description="`v${item.version} · ${item.status}`" />
                  <template #actions>
                    <a-button type="text" size="mini" status="danger" @click.stop="confirmDelete(item)">删</a-button>
                  </template>
                </a-list-item>
              </template>
              <template #empty>
                <a-empty description="暂无故事线" />
              </template>
            </a-list>
          </a-spin>
        </a-card>
      </a-col>
      <a-col :span="17" :xs="24" :md="17">
        <a-card v-if="selectedStoryline" :bordered="false" class="novel-sl__card">
          <template #title>
            <span>{{ selectedStoryline.name }}</span>
          </template>
          <template #extra>
            <a-space wrap>
              <a-button size="small" @click="openEdit">编辑元数据</a-button>
              <a-button size="small" type="primary" @click="aiVisible = true">
                <template #icon>
                  <Sparkles :size="16" :stroke-width="1.75" />
                </template>
                AI 生成
              </a-button>
            </a-space>
          </template>

          <a-tabs v-model:active-key="tab" type="rounded">
            <a-tab-pane key="graph" title="关系图">
              <StorylineGraphCanvas v-if="selectedId" ref="graphRef" :storyline-id="selectedId" />
            </a-tab-pane>
            <a-tab-pane key="meta" title="元数据">
              <a-descriptions :column="1" bordered size="small">
                <a-descriptions-item label="名称">{{ selectedStoryline.name }}</a-descriptions-item>
                <a-descriptions-item label="版本">{{ selectedStoryline.version }}</a-descriptions-item>
                <a-descriptions-item label="状态">{{ selectedStoryline.status }}</a-descriptions-item>
                <a-descriptions-item label="主题">{{ selectedStoryline.theme || '—' }}</a-descriptions-item>
                <a-descriptions-item label="卖点">{{ selectedStoryline.promise || '—' }}</a-descriptions-item>
                <a-descriptions-item label="禁忌">{{ selectedStoryline.forbidden || '—' }}</a-descriptions-item>
                <a-descriptions-item label="说明">{{ selectedStoryline.description || '—' }}</a-descriptions-item>
                <a-descriptions-item label="当前节点 ID">{{ selectedStoryline.currentNodeId || '—' }}</a-descriptions-item>
              </a-descriptions>
            </a-tab-pane>
            <a-tab-pane key="nodes" title="节点">
              <a-button type="primary" size="small" style="margin-bottom: 10px" @click="openNodeModal">新增节点</a-button>
              <a-table :data="nodes" :pagination="false" row-key="id" size="small">
                <a-table-column title="业务 ID" data-index="nodeId" />
                <a-table-column title="类型" data-index="type" :width="100" />
                <a-table-column title="标题" data-index="title" />
                <a-table-column title="操作" :width="80">
                  <template #cell="{ record }">
                    <a-button type="text" size="mini" status="danger" @click="confirmDeleteNode(record)">删</a-button>
                  </template>
                </a-table-column>
              </a-table>
            </a-tab-pane>
            <a-tab-pane key="edges" title="边">
              <a-button type="primary" size="small" style="margin-bottom: 10px" @click="openEdgeModal">新增边</a-button>
              <a-table :data="edges" :pagination="false" row-key="id" size="small">
                <a-table-column title="边 ID" data-index="edgeId" />
                <a-table-column title="从" data-index="fromNodeId" />
                <a-table-column title="到" data-index="toNodeId" />
                <a-table-column title="关系" data-index="relation" :width="100" />
                <a-table-column title="操作" :width="80">
                  <template #cell="{ record }">
                    <a-button type="text" size="mini" status="danger" @click="confirmDeleteEdge(record)">删</a-button>
                  </template>
                </a-table-column>
              </a-table>
            </a-tab-pane>
            <a-tab-pane key="facts" title="事实">
              <a-button type="primary" size="small" style="margin-bottom: 10px" @click="openFactModal">新增事实</a-button>
              <a-table :data="facts" :pagination="false" row-key="id" size="small">
                <a-table-column title="键" data-index="factKey" />
                <a-table-column title="值" data-index="factValue" :ellipsis="true" tooltip />
                <a-table-column title="来源节点" data-index="sourceNodeId" />
                <a-table-column title="操作" :width="80">
                  <template #cell="{ record }">
                    <a-button type="text" size="mini" status="danger" @click="confirmDeleteFact(record)">删</a-button>
                  </template>
                </a-table-column>
              </a-table>
            </a-tab-pane>
          </a-tabs>
        </a-card>
        <a-card v-else :bordered="false" class="novel-sl__card novel-sl__pick-card">
          <template #title>尚未选择故事线</template>
          <p class="novel-sl__pick-hint">
            请从左侧列表点选一条故事线查看关系图与节点表；也可以先用 AI 生成一整条故事线再写入数据库。
          </p>
          <a-space wrap>
            <a-button type="primary" @click="aiVisible = true">
              <template #icon>
                <Sparkles :size="16" :stroke-width="1.75" />
              </template>
              AI 生成故事线
            </a-button>
            <a-button type="outline" @click="openCreate">新建空白故事线</a-button>
          </a-space>
        </a-card>
        <a-card :bordered="false" class="novel-sl__card">
          <template #title>
            <span class="novel-sl__overview-title">
              <FileText :size="16" :stroke-width="1.75" />
              最终完整概括
            </span>
          </template>
          <template #extra>
            <a-button size="small" type="outline" :loading="overviewLoading" @click="generateFinalOverview">
              生成概括
            </a-button>
          </template>
          <a-textarea
            v-model="finalOverview"
            :auto-size="{ minRows: 8, maxRows: 18 }"
            placeholder="点击「生成概括」，汇总所有故事线元数据与图规模，便于做最终总览与交付。"
          />
        </a-card>
      </a-col>
    </a-row>

    <a-drawer v-model:visible="drawerVisible" :title="drawerMode === 'create' ? '新建故事线' : '编辑故事线'" :width="520">
      <a-form :model="slForm" layout="vertical">
        <a-form-item label="名称" required>
          <a-input v-model="slForm.name" />
        </a-form-item>
        <a-form-item label="版本">
          <a-input-number v-model="slForm.version" :min="1" />
        </a-form-item>
        <a-form-item label="状态">
          <a-input v-model="slForm.status" placeholder="draft / active / archived" />
        </a-form-item>
        <a-form-item label="主题">
          <a-input v-model="slForm.theme" />
        </a-form-item>
        <a-form-item label="卖点 / 承诺">
          <a-textarea v-model="slForm.promise" :auto-size="{ minRows: 2, maxRows: 6 }" />
        </a-form-item>
        <a-form-item label="禁忌">
          <a-textarea v-model="slForm.forbidden" :auto-size="{ minRows: 2, maxRows: 6 }" />
        </a-form-item>
        <a-form-item label="说明">
          <a-textarea v-model="slForm.description" :auto-size="{ minRows: 2, maxRows: 8 }" />
        </a-form-item>
        <a-form-item label="当前推进节点 ID">
          <a-input v-model="slForm.currentNodeId" />
        </a-form-item>
      </a-form>
      <template #footer>
        <a-button @click="drawerVisible = false">取消</a-button>
        <a-button type="primary" @click="saveStorylineMeta">保存</a-button>
      </template>
    </a-drawer>

    <a-drawer
      v-model:visible="aiVisible"
      title="AI 生成故事线图"
      :width="680"
      unmount-on-close
      @update:visible="onAiDrawerVisible"
    >
      <div class="novel-sl__drawer-form">
        <a-alert v-if="aiError" type="error" show-icon style="margin-bottom: 12px">
          <div>{{ aiError.message }}</div>
          <ul v-if="aiError.validationErrors?.length" class="novel-sl__err-list">
            <li v-for="(line, i) in aiError.validationErrors" :key="i">{{ line }}</li>
          </ul>
          <div v-if="aiError.raw" class="novel-sl__err-raw">原始片段已展开在下方「原始 JSON」中。</div>
        </a-alert>
        <a-typography-text type="secondary">
          对接后端 <code>POST /storylines/ai/generate</code>：支持 <code>baseDraft</code> 迭代、<code>lockedFields</code>、规模上限与温度。
        </a-typography-text>
        <a-divider style="margin: 12px 0" />
        <a-space wrap style="margin-bottom: 12px">
          <a-button size="small" @click="loadBaseFromCurrentStoryline">载入当前故事线为草稿基座</a-button>
          <a-button size="small" :disabled="!lastDraft" @click="clearBaseDraft">清空草稿基座</a-button>
        </a-space>
        <div class="novel-sl__field">
          <div class="novel-sl__label">生成模式</div>
          <a-switch v-model="aiSafeIncrement" />
          <a-typography-text type="secondary" style="margin-left: 8px">
            默认增量保护（推荐）：自动基于当前故事线并锁定元数据/节点/边/事实，避免覆盖已有设定。
          </a-typography-text>
        </div>
        <div class="novel-sl__field">
          <div class="novel-sl__label">需求说明</div>
          <a-textarea v-model="aiMessage" :auto-size="{ minRows: 4, maxRows: 12 }" />
        </div>
        <div class="novel-sl__field">
          <div class="novel-sl__label">细节档位（影响默认节点/边/数量上限）</div>
          <a-select v-model="aiDetailLevel">
            <a-option value="lite">lite</a-option>
            <a-option value="standard">standard</a-option>
            <a-option value="full">full</a-option>
          </a-select>
        </div>
        <a-row :gutter="12">
          <a-col :span="8">
            <div class="novel-sl__field">
              <div class="novel-sl__label">nodeLimit（可选）</div>
              <a-input-number v-model="aiNodeLimit" :min="1" :max="80" placeholder="默认按档位" />
            </div>
          </a-col>
          <a-col :span="8">
            <div class="novel-sl__field">
              <div class="novel-sl__label">edgeLimit（可选）</div>
              <a-input-number v-model="aiEdgeLimit" :min="1" :max="120" placeholder="默认按档位" />
            </div>
          </a-col>
          <a-col :span="8">
            <div class="novel-sl__field">
              <div class="novel-sl__label">factLimit（可选）</div>
              <a-input-number v-model="aiFactLimit" :min="0" :max="60" placeholder="默认按档位" />
            </div>
          </a-col>
        </a-row>
        <div class="novel-sl__field">
          <div class="novel-sl__label">反馈（重写）</div>
          <a-textarea v-model="aiFeedback" :auto-size="{ minRows: 2, maxRows: 6 }" />
        </div>
        <div class="novel-sl__field">
          <div class="novel-sl__label">锁定块（重写时保持对应块不变）</div>
          <a-checkbox-group v-model="aiLocked" :options="AI_LOCK_OPTS" />
        </div>
        <a-row :gutter="12">
          <a-col :span="8">
            <div class="novel-sl__field">
              <div class="novel-sl__label">temperature（可选）</div>
              <a-input-number v-model="aiTemperature" :min="0" :max="2" :step="0.1" placeholder="默认" />
            </div>
          </a-col>
          <a-col :span="8">
            <div class="novel-sl__field">
              <div class="novel-sl__label">模型（可选）</div>
              <a-input v-model="aiModel" allow-clear />
            </div>
          </a-col>
          <a-col :span="8">
            <div class="novel-sl__field">
              <div class="novel-sl__label">maxTokens</div>
              <a-input-number v-model="aiMaxTokens" :min="256" :max="8192" placeholder="默认" />
            </div>
          </a-col>
        </a-row>
        <a-space wrap>
          <a-button type="primary" :loading="aiLoading" @click="runAI">
            <template #icon>
              <Wand2 :size="16" :stroke-width="1.75" />
            </template>
            生成 / 重写草稿
          </a-button>
          <a-button :disabled="!lastDraft" :loading="persistLoading" type="secondary" @click="persistAIDraft">
            写入为新故事线
          </a-button>
          <a-button :disabled="!lastDraft || !selectedId" :loading="persistLoading" @click="persistMergeToCurrent">
            合并到当前故事线
          </a-button>
        </a-space>
        <a-divider />
        <a-typography-text type="secondary">
          草稿预览（分块）：节点 {{ draftCounts.nodes }} · 边 {{ draftCounts.edges }} · 事实 {{ draftCounts.facts }}
        </a-typography-text>
        <a-typography-text type="secondary" style="display: block; margin-top: 4px">
          预览显示“已有基座 + 本次新增”的合并结果；“合并到当前故事线”仍按本次草稿增量提交，不会整库重写。
        </a-typography-text>
        <a-empty v-if="!lastDraft" description="尚未生成草稿" />
        <template v-else>
          <a-collapse>
            <a-collapse-item key="storyline" header="storyline（元数据）">
              <pre class="novel-sl__pre">{{ JSON.stringify(lastDraft.storyline || {}, null, 2).slice(0, 4000) }}</pre>
            </a-collapse-item>
            <a-collapse-item key="nodes" :header="`nodes（${draftCounts.nodes}）`">
              <pre class="novel-sl__pre">{{ JSON.stringify(previewNodes, null, 2).slice(0, 5000) }}</pre>
            </a-collapse-item>
            <a-collapse-item key="edges" :header="`edges（${draftCounts.edges}）`">
              <pre class="novel-sl__pre">{{ JSON.stringify(previewEdges, null, 2).slice(0, 5000) }}</pre>
            </a-collapse-item>
            <a-collapse-item key="facts" :header="`facts（${draftCounts.facts}）`">
              <pre class="novel-sl__pre">{{ JSON.stringify(previewFacts, null, 2).slice(0, 5000) }}</pre>
            </a-collapse-item>
          </a-collapse>
        </template>
        <a-collapse v-if="lastRaw">
          <a-collapse-item header="原始 JSON 文本" key="raw">
            <pre class="novel-sl__pre">{{ lastRaw.slice(0, 8000) }}</pre>
          </a-collapse-item>
        </a-collapse>
      </div>
    </a-drawer>

    <a-modal v-model:visible="nodeModal" title="新增节点" :on-before-ok="onBeforeSaveNode">
      <a-form :model="nodeForm" layout="vertical">
        <a-form-item label="业务 nodeId" required>
          <a-input v-model="nodeForm.nodeId" />
        </a-form-item>
        <a-form-item label="类型">
          <a-input v-model="nodeForm.type" placeholder="event / twist / clue …" />
        </a-form-item>
        <a-form-item label="标题">
          <a-input v-model="nodeForm.title" />
        </a-form-item>
        <a-form-item label="摘要">
          <a-textarea v-model="nodeForm.summary" :auto-size="{ minRows: 2, maxRows: 6 }" />
        </a-form-item>
        <a-form-item label="状态">
          <a-input v-model="nodeForm.status" />
        </a-form-item>
      </a-form>
    </a-modal>

    <a-modal v-model:visible="edgeModal" title="新增边" :on-before-ok="onBeforeSaveEdge">
      <a-form :model="edgeForm" layout="vertical">
        <a-form-item label="业务 edgeId" required>
          <a-input v-model="edgeForm.edgeId" />
        </a-form-item>
        <a-form-item label="起点 nodeId" required>
          <a-select v-model="edgeForm.fromNodeId" allow-search>
            <a-option v-for="n in nodes" :key="n.id" :value="n.nodeId">{{ n.nodeId }} · {{ n.title || n.type }}</a-option>
          </a-select>
        </a-form-item>
        <a-form-item label="终点 nodeId" required>
          <a-select v-model="edgeForm.toNodeId" allow-search>
            <a-option v-for="n in nodes" :key="n.id" :value="n.nodeId">{{ n.nodeId }} · {{ n.title || n.type }}</a-option>
          </a-select>
        </a-form-item>
        <a-form-item label="关系">
          <a-input v-model="edgeForm.relation" placeholder="cause / conflict / reveal …" />
        </a-form-item>
      </a-form>
    </a-modal>

    <a-modal v-model:visible="factModal" title="新增事实" :on-before-ok="onBeforeSaveFact">
      <a-form :model="factForm" layout="vertical">
        <a-form-item label="键" required>
          <a-input v-model="factForm.factKey" />
        </a-form-item>
        <a-form-item label="值">
          <a-textarea v-model="factForm.factValue" :auto-size="{ minRows: 2, maxRows: 6 }" />
        </a-form-item>
        <a-form-item label="来源节点 nodeId">
          <a-select v-model="factForm.sourceNodeId" allow-clear allow-search>
            <a-option v-for="n in nodes" :key="n.id" :value="n.nodeId">{{ n.nodeId }} · {{ n.title || n.type }}</a-option>
          </a-select>
        </a-form-item>
        <a-form-item label="置信度">
          <a-input-number v-model="factForm.confidence" :min="0" :max="100" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
  <a-spin v-else :loading="loading" class="novel-sl__spin" />
</template>

<style scoped>
.novel-sl {
  padding: 12px 24px 24px;
  max-width: 1400px;
  margin: 0 auto;
}
.novel-sl__head,
.novel-sl__card {
  border-radius: 8px;
  margin-bottom: 12px;
}
.novel-sl__title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 8px;
}
.novel-sl__title-icon {
  color: rgb(var(--primary-6));
  flex-shrink: 0;
}
.novel-sl__desc {
  margin: 0;
  color: var(--color-text-3);
  font-size: 13px;
}
.novel-sl__list-item {
  cursor: pointer;
  border-radius: 8px;
}
.novel-sl__list-item--active {
  background: var(--color-primary-light-1);
}
.novel-sl__pre {
  margin-top: 8px;
  max-height: 320px;
  overflow: auto;
  font-size: 12px;
  padding: 10px;
  border-radius: 8px;
  background: var(--color-fill-2);
  border: 1px solid var(--color-border-2);
}
.novel-sl__spin {
  margin-top: 80px;
  display: flex;
  justify-content: center;
}
.novel-sl__pick-card .novel-sl__pick-hint {
  margin: 0 0 14px;
  color: var(--color-text-2);
  font-size: 13px;
  line-height: 1.6;
}
.novel-sl__field {
  margin-bottom: 14px;
}
.novel-sl__label {
  font-size: 13px;
  color: var(--color-text-2);
  margin-bottom: 6px;
}
.novel-sl__err-list {
  margin: 8px 0 0;
  padding-left: 18px;
  font-size: 12px;
}
.novel-sl__err-raw {
  margin-top: 6px;
  font-size: 12px;
}
.novel-sl__overview-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
</style>
