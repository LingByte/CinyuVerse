<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Message, Modal } from '@arco-design/web-vue'
import { IconPlus, IconEdit, IconRobot } from '@arco-design/web-vue/es/icon'
import { WorkspaceBreadcrumb } from '@/components/layout'
import { getNovel } from '@/api/novels'
import { createVolume, deleteVolume, generateVolumeByAI, listVolumes, updateVolume } from '@/api/volumes'
import { listChapters } from '@/api/chapters'
import type { Novel } from '@/types/novel'
import type { Volume, GenerateVolumeBody } from '@/types/volume'
import type { Chapter } from '@/types/chapter'
import type { TableColumnData, TableData } from '@arco-design/web-vue/es/table/interface'

const route = useRoute()
const router = useRouter()
const novelId = computed(() => Number(route.params.id))

const novel = ref<Novel | null>(null)
const volumes = ref<Volume[]>([])
const loading = ref(false)
const listLoading = ref(false)
const activeVolumeKeys = ref<string[]>([])

type ChapterPageState = {
  items: Chapter[]
  total: number
  page: number
  size: number
  loading: boolean
}
const chapterStateByVolume = ref<Record<number, ChapterPageState>>({})

const chapterColumns: TableColumnData[] = [
  { title: '章节', dataIndex: 'title' },
  { title: '序号', dataIndex: 'orderNo', width: 80 },
  { title: '状态', dataIndex: 'status', width: 120 },
  { title: '摘要', dataIndex: 'summary', ellipsis: true, tooltip: true },
  { title: '操作', slotName: 'action', width: 100, align: 'center' },
]

function goEditChapter(chapter: Chapter) {
  router.push({
    name: 'chapter-edit',
    params: { id: String(novelId.value), volumeId: String(chapter.volumeId), chapterId: String(chapter.id) },
  })
}

async function onDeleteChapter(chapter: Chapter) {
  const { deleteChapter } = await import('@/api/chapters')
  Modal.warning({
    title: '确认删除',
    content: `确定删除章节「${chapter.title}」？`,
    hideCancel: false,
    okText: '删除',
    cancelText: '取消',
    onOk: async () => {
      try {
        await deleteChapter(chapter.id)
        Message.success('章节已删除')
        await loadChaptersByVolume(chapter.volumeId)
      } catch (e) {
        Message.error(String((e as Error)?.message || e))
      }
    },
  })
}

const volumeVisible = ref(false)
const volumeMode = ref<'create' | 'edit'>('create')
const volumeEditId = ref<number | null>(null)
const volumeSaving = ref(false)

const form = reactive({
  title: '',
  subtitle: '',
  description: '',
  theme: '',
  status: '',
  orderNo: 1,
})

const aiLoading = ref(false)
const aiMessage = ref('请生成一个有冲突与目标推进的卷设定，包含卷标题、主题、简介和副标题。')
const aiFeedback = ref('')
const aiModel = ref('')
const aiMaxTokens = ref<number | undefined>(undefined)
const aiLockedFields = ref<string[]>([])
const AI_LOCK_FIELDS = [
  { label: '标题', value: 'title' },
  { label: '副标题', value: 'subtitle' },
  { label: '简介', value: 'description' },
  { label: '主题', value: 'theme' },
  { label: '状态', value: 'status' },
  { label: '排序号', value: 'orderNo' },
]

function ensureChapterState(volumeId: number): ChapterPageState {
  if (!chapterStateByVolume.value[volumeId]) {
    chapterStateByVolume.value[volumeId] = {
      items: [],
      total: 0,
      page: 1,
      size: 10,
      loading: false,
    }
  }
  return chapterStateByVolume.value[volumeId]!
}

function resetForm() {
  form.title = ''
  form.subtitle = ''
  form.description = ''
  form.theme = ''
  form.status = ''
  form.orderNo = 1
}

function fillForm(v: Volume) {
  form.title = v.title || ''
  form.subtitle = v.subtitle || ''
  form.description = v.description || ''
  form.theme = v.theme || ''
  form.status = v.status || ''
  form.orderNo = v.orderNo || 1
}

function currentVolumeDraft() {
  return {
    title: form.title,
    subtitle: form.subtitle,
    description: form.description,
    theme: form.theme,
    status: form.status,
    orderNo: form.orderNo,
  }
}

function applyVolumeDraft(draft: Partial<Volume>) {
  form.title = draft.title || ''
  form.subtitle = draft.subtitle || ''
  form.description = draft.description || ''
  form.theme = draft.theme || ''
  form.status = draft.status || ''
  form.orderNo = draft.orderNo && draft.orderNo > 0 ? draft.orderNo : 1
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

async function loadVolumes() {
  listLoading.value = true
  try {
    const res = await listVolumes({ novelId: novelId.value, page: 1, size: 100 })
    volumes.value = res.volumes
  } catch (e) {
    Message.error(String((e as Error)?.message || e))
  } finally {
    listLoading.value = false
  }
}

async function loadChaptersByVolume(volumeId: number) {
  const state = ensureChapterState(volumeId)
  state.loading = true
  try {
    const res = await listChapters({
      novelId: novelId.value,
      volumeId,
      page: state.page,
      size: state.size,
    })
    state.items = res.chapters
    state.total = res.total
  } catch (e) {
    Message.error(String((e as Error)?.message || e))
  } finally {
    state.loading = false
  }
}

onMounted(async () => {
  if (!Number.isFinite(novelId.value) || novelId.value <= 0) {
    Message.error('无效的小说 ID')
    return
  }
  await Promise.all([loadNovel(), loadVolumes()])
})

function openCreateVolume() {
  volumeMode.value = 'create'
  volumeEditId.value = null
  resetForm()
  aiFeedback.value = ''
  aiLockedFields.value = []
  aiModel.value = ''
  aiMaxTokens.value = undefined
  volumeVisible.value = true
}

function openEditVolume(v: Volume) {
  volumeMode.value = 'edit'
  volumeEditId.value = v.id
  fillForm(v)
  aiFeedback.value = ''
  aiLockedFields.value = []
  aiModel.value = ''
  aiMaxTokens.value = undefined
  volumeVisible.value = true
}

async function runVolumeAIRewrite() {
  const msg = aiMessage.value.trim()
  if (!msg) {
    Message.warning('请填写 AI 需求')
    return
  }
  aiLoading.value = true
  try {
    const novelContext = novel.value
      ? [
          `小说标题：${novel.value.title || ''}`,
          `小说类型：${novel.value.genre || ''}`,
          `主题：${novel.value.theme || ''}`,
          `简介：${novel.value.description || ''}`,
        ].join('\n')
      : ''
    const mergedMessage = novelContext ? `请基于小说设定生成卷设定。\n\n${novelContext}\n\n用户要求：${msg}` : msg

    const body: GenerateVolumeBody = {
      message: mergedMessage,
      model: aiModel.value.trim() || undefined,
      maxTokens: aiMaxTokens.value,
      feedback: aiFeedback.value.trim() || undefined,
      lockedFields: aiLockedFields.value,
      baseDraft: currentVolumeDraft(),
    }
    const { draft } = await generateVolumeByAI(body)
    applyVolumeDraft(draft)
    Message.success('AI 草稿已写入，可继续反馈重写')
  } catch (e) {
    Message.error(String((e as Error)?.message || e))
  } finally {
    aiLoading.value = false
  }
}

async function saveVolume() {
  if (!form.title.trim()) {
    Message.warning('卷标题必填')
    return
  }
  volumeSaving.value = true
  try {
    const body = {
      novelId: novelId.value,
      title: form.title.trim(),
      subtitle: form.subtitle.trim() || undefined,
      description: form.description.trim() || undefined,
      theme: form.theme.trim() || undefined,
      status: form.status.trim() || undefined,
      orderNo: form.orderNo > 0 ? form.orderNo : 1,
    }
    if (volumeMode.value === 'create') {
      await createVolume(body)
      Message.success('卷已创建')
    } else if (volumeEditId.value != null) {
      await updateVolume(volumeEditId.value, body)
      Message.success('卷已保存')
    }
    volumeVisible.value = false
    await loadVolumes()
  } catch (e) {
    Message.error(String((e as Error)?.message || e))
  } finally {
    volumeSaving.value = false
  }
}

function onDeleteVolume(v: Volume) {
  Modal.confirm({
    title: '删除卷',
    content: `确定删除「${v.title}」？`,
    okText: '删除',
    async onOk() {
      await deleteVolume(v.id)
      Message.success('已删除')
      await loadVolumes()
    },
  })
}

function onVolumeExpand(keys: Array<string | number>) {
  const arr = keys.map((k) => String(k))
  activeVolumeKeys.value = arr
  arr.forEach((k) => {
    const vid = Number(k)
    if (!Number.isFinite(vid) || vid <= 0) return
    const state = ensureChapterState(vid)
    if (state.items.length === 0 && !state.loading) {
      void loadChaptersByVolume(vid)
    }
  })
}

function onChapterPageChange(volumeId: number, page: number) {
  const state = ensureChapterState(volumeId)
  state.page = page
  void loadChaptersByVolume(volumeId)
}

function onChapterPageSizeChange(volumeId: number, size: number) {
  const state = ensureChapterState(volumeId)
  state.size = size
  state.page = 1
  void loadChaptersByVolume(volumeId)
}

function goCreateChapter(v: Volume) {
  void router.push({
    name: 'chapter-create',
    params: { id: String(novelId.value), volumeId: String(v.id) },
  })
}

function goCharacters() {
  void router.push({ name: 'novel-characters', params: { id: String(novelId.value) } })
}

function goStorylines() {
  void router.push({ name: 'novel-storylines', params: { id: String(novelId.value) } })
}
</script>

<template>
  <div class="novel-volumes" v-if="novel">
    <WorkspaceBreadcrumb :trail="[{ label: '小说管理', to: { name: 'home' } }, { label: novel.title || '卷管理' }]" />

    <a-card :bordered="false" class="novel-volumes__head">
      <template #extra>
        <a-space>
          <a-button @click="goStorylines">故事线管理</a-button>
          <a-button type="primary" @click="goCharacters">角色管理</a-button>
        </a-space>
      </template>
      <h2 class="novel-volumes__title">{{ novel.title || '未命名小说' }}</h2>
      <div class="novel-volumes__stats">
        <a-tag color="arcoblue">已写 {{ novel.totalWordCount ?? 0 }} 字</a-tag>
        <a-tag>共 {{ novel.chapterCount ?? 0 }} 章</a-tag>
        <span class="novel-volumes__stats-hint">字数为各章节保存时的字数累计（章节「正文」）</span>
      </div>
      <a-typography-paragraph class="novel-volumes__desc">
        {{ novel.description || '暂无小说介绍' }}
      </a-typography-paragraph>
    </a-card>

    <a-card title="卷管理" :bordered="false" class="novel-volumes__list">
      <template #extra>
        <a-button type="primary" @click="openCreateVolume">
          <template #icon>
            <IconPlus />
          </template>
          新建卷
        </a-button>
      </template>

      <a-spin :loading="listLoading" style="width: 100%">
        <a-empty v-if="!volumes.length" description="暂无卷" />
        <a-collapse v-else :active-key="activeVolumeKeys" @change="onVolumeExpand">
          <a-collapse-item v-for="v in volumes" :key="String(v.id)">
            <template #header>
              <div class="novel-volumes__item-title">
                <span>第{{ v.orderNo || '-' }}卷 · {{ v.title }}</span>
                <a-tag size="small">{{ v.status || 'draft' }}</a-tag>
              </div>
            </template>
            <div class="novel-volumes__line">副标题：{{ v.subtitle || '无' }}</div>
            <div class="novel-volumes__line">主题：{{ v.theme || '无' }}</div>
            <div class="novel-volumes__line">简介：{{ v.description || '无' }}</div>
            <div class="novel-volumes__ops">
              <a-space>
                <a-button type="text" size="small" @click="openEditVolume(v)">
                  <template #icon>
                    <IconEdit />
                  </template>
                  编辑卷
                </a-button>
                <a-button type="text" status="danger" size="small" @click="onDeleteVolume(v)">删除卷</a-button>
                <a-button size="small" @click="goCreateChapter(v)">新增章节</a-button>
              </a-space>
            </div>

            <a-spin :loading="ensureChapterState(v.id).loading" style="width: 100%">
              <a-table
                :data="ensureChapterState(v.id).items"
                :columns="chapterColumns"
                :pagination="false"
                :bordered="false"
                row-key="id"
                size="small"
                class="novel-volumes__chapter-table"
                @row-click="(record: TableData) => goEditChapter(record as unknown as Chapter)"
              >
                <template #action="{ record }">
                  <a-button
                    type="text"
                    status="danger"
                    size="mini"
                    @click.stop="onDeleteChapter(record as unknown as Chapter)"
                  >删除</a-button>
                </template>
              </a-table>
              <div class="novel-volumes__chapters-pager">
                <a-pagination
                  :total="ensureChapterState(v.id).total"
                  :current="ensureChapterState(v.id).page"
                  :page-size="ensureChapterState(v.id).size"
                  show-total
                  show-page-size
                  :page-size-options="[10, 20, 50]"
                  @change="(p) => onChapterPageChange(v.id, p)"
                  @page-size-change="(s) => onChapterPageSizeChange(v.id, s)"
                />
              </div>
            </a-spin>
          </a-collapse-item>
        </a-collapse>
      </a-spin>
    </a-card>

    <a-drawer
      v-model:visible="volumeVisible"
      :title="volumeMode === 'create' ? '新建卷' : `编辑卷 #${volumeEditId}`"
      :width="660"
      unmount-on-close
    >
      <template #footer>
        <a-space>
          <a-button @click="volumeVisible = false">取消</a-button>
          <a-button type="primary" :loading="volumeSaving" @click="saveVolume">
            {{ volumeMode === 'create' ? '创建' : '保存' }}
          </a-button>
        </a-space>
      </template>

      <a-form :model="form" layout="vertical">
        <a-card :bordered="false" class="novel-volumes__ai-card">
          <template #title>
            <span><IconRobot /> AI 卷草稿</span>
          </template>
          <a-form-item label="需求说明" required>
            <a-textarea v-model="aiMessage" :auto-size="{ minRows: 3, maxRows: 8 }" />
          </a-form-item>
          <a-form-item label="反馈（用于重写）">
            <a-textarea v-model="aiFeedback" :auto-size="{ minRows: 2, maxRows: 6 }" />
          </a-form-item>
          <a-form-item label="锁定字段">
            <a-checkbox-group v-model="aiLockedFields" :options="AI_LOCK_FIELDS" />
          </a-form-item>
          <a-row :gutter="12">
            <a-col :span="12">
              <a-form-item label="模型（可选）">
                <a-input v-model="aiModel" allow-clear />
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="maxTokens">
                <a-input-number v-model="aiMaxTokens" :min="128" :max="4000" placeholder="默认" />
              </a-form-item>
            </a-col>
          </a-row>
          <a-button type="primary" :loading="aiLoading" @click="runVolumeAIRewrite">生成 / 重写卷</a-button>
        </a-card>

        <a-form-item label="卷标题" required>
          <a-input v-model="form.title" allow-clear />
        </a-form-item>
        <a-form-item label="副标题">
          <a-input v-model="form.subtitle" allow-clear />
        </a-form-item>
        <a-row :gutter="12">
          <a-col :span="12">
            <a-form-item label="状态">
              <a-input v-model="form.status" placeholder="draft / writing" allow-clear />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="排序号">
              <a-input-number v-model="form.orderNo" :min="1" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="主题">
          <a-input v-model="form.theme" allow-clear />
        </a-form-item>
        <a-form-item label="简介">
          <a-textarea v-model="form.description" :auto-size="{ minRows: 3, maxRows: 10 }" />
        </a-form-item>
      </a-form>
    </a-drawer>
  </div>
  <a-spin v-else :loading="loading" class="novel-volumes__loading" />
</template>

<style scoped>
.novel-volumes {
  padding: 12px 24px 24px;
  max-width: 1280px;
  margin: 0 auto;
}
.novel-volumes__head,
.novel-volumes__list {
  border-radius: 8px;
  margin-bottom: 12px;
}
.novel-volumes__title {
  margin: 0 0 8px;
}
.novel-volumes__stats {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.novel-volumes__stats-hint {
  font-size: 12px;
  color: var(--color-text-3);
}
.novel-volumes__desc {
  margin-top: 8px;
}
.novel-volumes__item-title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.novel-volumes__line {
  margin-bottom: 4px;
}
.novel-volumes__ops {
  margin: 8px 0 10px;
  display: flex;
  justify-content: flex-end;
}
.novel-volumes__chapters-pager {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
}
.novel-volumes__ai-card {
  margin-bottom: 12px;
  background: var(--color-fill-1);
}
.novel-volumes__loading {
  margin-top: 80px;
  width: 100%;
  display: flex;
  justify-content: center;
}
.novel-volumes__chapter-table :deep(tbody tr) {
  cursor: pointer;
}
</style>
