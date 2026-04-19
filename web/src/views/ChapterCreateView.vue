<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Message } from '@arco-design/web-vue'
import { WorkspaceBreadcrumb } from '@/components/layout'
import NovelTextEditor from '@/components/editor/NovelTextEditor.vue'
import CharacterMultiSelect from '@/components/select/CharacterMultiSelect.vue'
import StorylineNodeMultiSelect from '@/components/select/StorylineNodeMultiSelect.vue'
import { getNovel } from '@/api/novels'
import { listVolumes } from '@/api/volumes'
import { listStorylines } from '@/api/storylines'
import { createChapter, generateChapterSummary, generateChapterOutline, generateChapterBody, listChapters, predictPlot } from '@/api/chapters'
import type { Novel } from '@/types/novel'
import type { Volume } from '@/types/volume'
import type { Storyline } from '@/types/storyline'
import type { Chapter, GenerateChapterFieldBody, PlotPrediction } from '@/types/chapter'

const route = useRoute()
const router = useRouter()
const novelId = computed(() => Number(route.params.id))
const volumeId = computed(() => Number(route.params.volumeId))

const novel = ref<Novel | null>(null)
const volume = ref<Volume | null>(null)
const storylines = ref<Storyline[]>([])
const siblingChapters = ref<Chapter[]>([])
const selectedStorylineId = ref<number | undefined>(undefined)
const loading = ref(false)
const saving = ref(false)
const aiSummaryLoading = ref(false)
const aiOutlineLoading = ref(false)
const aiBodyLoading = ref(false)
const aiSummaryFeedback = ref('')
const aiOutlineFeedback = ref('')
const aiBodyFeedback = ref('')
const predictLoading = ref(false)
const predictions = ref<PlotPrediction[]>([])
const predictDirection = ref('')

const form = reactive({
  title: '',
  content: '',
  orderNo: 1,
  summary: '',
  status: 'draft',
  characterIds: '',
  plotPointIds: '',
  previousChapterIds: [] as number[],
  outline: '',
  relatedNodeIds: '',
  promptMemo: '',
})

const PLOT_NODE_TYPES = 'event,twist,clue,payoff'

function buildFieldBody(feedback: string): GenerateChapterFieldBody {
  return {
    novelId: novelId.value,
    volumeId: volumeId.value,
    previousChapterIds: form.previousChapterIds.length ? form.previousChapterIds.join(',') : undefined,
    previousChapterId: form.previousChapterIds[0] || undefined,
    characterIds: form.characterIds || undefined,
    feedback: feedback.trim() || undefined,
    baseDraft: currentDraft(),
  }
}

function currentDraft(): Partial<Chapter> {
  return {
    title: form.title,
    content: form.content,
    orderNo: form.orderNo,
    summary: form.summary,
    characterIds: form.characterIds,
    plotPointIds: form.plotPointIds,
    previousChapterIds: form.previousChapterIds.length ? form.previousChapterIds.join(',') : undefined,
    previousChapterId: form.previousChapterIds[0] || 0,
    outline: form.outline,
    relatedNodeIds: form.relatedNodeIds,
    promptMemo: form.promptMemo,
    status: form.status,
  }
}

watch(selectedStorylineId, (id, prev) => {
  if (prev !== undefined && prev !== id) {
    form.plotPointIds = ''
    form.relatedNodeIds = ''
  }
})

async function loadContext() {
  loading.value = true
  try {
    const [n, vres, sl] = await Promise.all([
      getNovel(novelId.value),
      listVolumes({ novelId: novelId.value, page: 1, size: 200 }),
      listStorylines({ novelId: novelId.value, page: 1, size: 50 }),
    ])
    novel.value = n
    volume.value = vres.volumes.find((v) => v.id === volumeId.value) || null
    storylines.value = sl.items || []
    if (storylines.value.length && selectedStorylineId.value == null) {
      selectedStorylineId.value = storylines.value[0]!.id
    }
    if (!volume.value) {
      Message.error('未找到对应卷')
      await router.replace({ name: 'novel-detail', params: { id: String(novelId.value) } })
      return
    }
    form.orderNo = (volume.value.chapterStart || 0) + 1
    // load sibling chapters for previous-chapter multi-select
    const chRes = await listChapters({ novelId: novelId.value, volumeId: volumeId.value, page: 1, size: 200 })
    siblingChapters.value = chRes.chapters
  } catch (e) {
    Message.error(String((e as Error)?.message || e))
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  if (!Number.isFinite(novelId.value) || !Number.isFinite(volumeId.value) || novelId.value <= 0 || volumeId.value <= 0) {
    Message.error('无效的路由参数')
    return
  }
  await loadContext()
})

async function runGenerateSummary() {
  aiSummaryLoading.value = true
  try {
    const { value } = await generateChapterSummary(buildFieldBody(aiSummaryFeedback.value))
    if (value) form.summary = value
    Message.success('摘要已生成')
  } catch (e) {
    Message.error(String((e as Error)?.message || e))
  } finally {
    aiSummaryLoading.value = false
  }
}

async function runGenerateOutline() {
  aiOutlineLoading.value = true
  try {
    const { value } = await generateChapterOutline(buildFieldBody(aiOutlineFeedback.value))
    if (value) form.outline = value
    Message.success('大纲已生成')
  } catch (e) {
    Message.error(String((e as Error)?.message || e))
  } finally {
    aiOutlineLoading.value = false
  }
}

async function runGenerateBody() {
  aiBodyLoading.value = true
  try {
    const { value } = await generateChapterBody(buildFieldBody(aiBodyFeedback.value))
    if (value) form.content = value
    Message.success('正文已生成')
  } catch (e) {
    Message.error(String((e as Error)?.message || e))
  } finally {
    aiBodyLoading.value = false
  }
}

async function runPredictPlot() {
  predictLoading.value = true
  predictions.value = []
  try {
    const res = await predictPlot({
      novelId: novelId.value,
      volumeId: volumeId.value,
      previousChapterIds: form.previousChapterIds.length ? form.previousChapterIds.join(',') : undefined,
      previousChapterId: form.previousChapterIds[0] || undefined,
      characterIds: form.characterIds || undefined,
      direction: predictDirection.value.trim() || undefined,
      count: 3,
    })
    predictions.value = res.predictions
  } catch (e) {
    Message.error(String((e as Error)?.message || e))
  } finally {
    predictLoading.value = false
  }
}

function applyPrediction(p: PlotPrediction) {
  if (p.summary) {
    form.outline = (form.outline ? form.outline + '\n' : '') + `【预测方向：${p.direction}】\n${p.summary}`
  }
}

async function saveChapter() {
  if (!form.title.trim()) {
    Message.warning('章节标题必填')
    return
  }
  saving.value = true
  try {
    await createChapter({
      novelId: novelId.value,
      volumeId: volumeId.value,
      title: form.title.trim(),
      content: form.content,
      orderNo: form.orderNo > 0 ? form.orderNo : 1,
      summary: form.summary || undefined,
      status: form.status || undefined,
      characterIds: form.characterIds || undefined,
      plotPointIds: form.plotPointIds || undefined,
      previousChapterIds: form.previousChapterIds.length ? form.previousChapterIds.join(',') : undefined,
      previousChapterId: form.previousChapterIds[0] || undefined,
      outline: form.outline || undefined,
      relatedNodeIds: form.relatedNodeIds || undefined,
      promptMemo: form.promptMemo || undefined,
    })
    Message.success('章节已创建')
    await router.replace({ name: 'novel-detail', params: { id: String(novelId.value) } })
  } catch (e) {
    Message.error(String((e as Error)?.message || e))
  } finally {
    saving.value = false
  }
}

const storylineIdForNodes = computed(() => selectedStorylineId.value ?? 0)
</script>

<template>
  <div class="chapter-create" v-if="novel && volume">
    <WorkspaceBreadcrumb
      :trail="[
        { label: '小说管理', to: { name: 'home' } },
        { label: novel.title || '卷管理', to: { name: 'novel-detail', params: { id: String(novelId) } } },
        { label: '新增章节' },
      ]"
    />

    <a-card :bordered="false" class="chapter-create__card">
      <template #title>新增章节（{{ volume.title || '未命名卷' }}）</template>

      <a-form :model="form" layout="vertical" class="chapter-create__form">
        <a-card :bordered="false" class="chapter-create__ai-card">
          <template #title>预测后续情节</template>
          <a-form-item label="倾向方向（可选）">
            <a-input v-model="predictDirection" allow-clear placeholder="如：复仇、和解、悬疑等" />
          </a-form-item>
          <a-button type="outline" :loading="predictLoading" @click="runPredictPlot">
            预测情节走向
          </a-button>
          <div v-if="predictions.length" class="chapter-create__predictions">
            <div v-for="(p, i) in predictions" :key="i" class="chapter-create__prediction-item">
              <div class="chapter-create__prediction-head">
                <a-tag color="arcoblue">{{ p.direction }}</a-tag>
                <a-button type="text" size="mini" @click="applyPrediction(p)">采纳到大纲</a-button>
              </div>
              <div class="chapter-create__prediction-summary">{{ p.summary }}</div>
            </div>
          </div>
        </a-card>

        <a-row :gutter="12">
          <a-col :span="16">
            <a-form-item label="章节标题" required>
              <a-input v-model="form.title" allow-clear />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="章节序号">
              <a-input-number v-model="form.orderNo" :min="1" style="width: 100%" />
            </a-form-item>
          </a-col>
        </a-row>

        <a-row :gutter="12">
          <a-col :span="12">
            <a-form-item label="状态">
              <a-input v-model="form.status" allow-clear />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="故事线（节点选择）">
              <a-select
                v-model="selectedStorylineId"
                allow-clear
                placeholder="选择故事线"
                :loading="loading"
              >
                <a-option v-for="s in storylines" :key="s.id" :value="s.id">{{ s.name }}</a-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>

        <a-alert v-if="!storylines.length" type="warning" style="margin-bottom: 12px">
          当前小说暂无故事线数据，情节点与关联节点选择不可用；可在故事线模块创建后再来关联。
        </a-alert>

        <a-form-item label="关联角色">
          <CharacterMultiSelect v-model="form.characterIds" :novel-id="novelId" />
        </a-form-item>

        <a-form-item label="情节点（故事线节点，偏情节类）">
          <StorylineNodeMultiSelect
            v-model="form.plotPointIds"
            :storyline-id="storylineIdForNodes"
            :types-csv="PLOT_NODE_TYPES"
            placeholder="搜索标题 / 业务节点 ID，多选情节点"
          />
        </a-form-item>
        <a-form-item label="关联故事节点（全部类型）">
          <StorylineNodeMultiSelect
            v-model="form.relatedNodeIds"
            :storyline-id="storylineIdForNodes"
            placeholder="搜索标题 / 业务节点 ID，多选节点"
          />
        </a-form-item>

        <a-form-item>
          <template #label>
            <div class="chapter-create__field-label">
              <span>摘要</span>
              <a-input v-model="aiSummaryFeedback" size="mini" allow-clear placeholder="重写意见" class="chapter-create__feedback-input" />
              <a-button type="outline" size="mini" :loading="aiSummaryLoading" @click="runGenerateSummary">AI 生成</a-button>
            </div>
          </template>
          <a-textarea v-model="form.summary" :auto-size="{ minRows: 2, maxRows: 6 }" />
        </a-form-item>
        <a-form-item label="关联前序章节">
          <a-select
            v-model="form.previousChapterIds"
            multiple
            allow-clear
            allow-search
            placeholder="可多选前几章（建议按阅读顺序选），AI 按顺序注入摘要与正文末尾"
            :max-tag-count="3"
          >
            <a-option v-for="c in siblingChapters" :key="c.id" :value="c.id">
              第{{ c.orderNo }}章 · {{ c.title }}
            </a-option>
          </a-select>
        </a-form-item>
        <a-form-item>
          <template #label>
            <div class="chapter-create__field-label">
              <span>章节大纲</span>
              <a-input v-model="aiOutlineFeedback" size="mini" allow-clear placeholder="重写意见" class="chapter-create__feedback-input" />
              <a-button type="outline" size="mini" :loading="aiOutlineLoading" @click="runGenerateOutline">AI 生成</a-button>
            </div>
          </template>
          <a-textarea v-model="form.outline" :auto-size="{ minRows: 2, maxRows: 8 }" />
        </a-form-item>
        <a-form-item label="提示词备注">
          <a-textarea v-model="form.promptMemo" :auto-size="{ minRows: 2, maxRows: 6 }" />
        </a-form-item>

        <a-form-item class="chapter-create__content-field">
          <template #label>
            <div class="chapter-create__field-label">
              <span>章节正文</span>
              <a-input v-model="aiBodyFeedback" size="mini" allow-clear placeholder="重写意见" class="chapter-create__feedback-input" />
              <a-button type="outline" size="mini" :loading="aiBodyLoading" @click="runGenerateBody">AI 生成</a-button>
            </div>
          </template>
          <NovelTextEditor v-model="form.content" :min-rows="16" :max-rows="48" />
        </a-form-item>

        <a-space>
          <a-button @click="router.back()">取消</a-button>
          <a-button type="primary" :loading="saving" @click="saveChapter">保存章节</a-button>
        </a-space>
      </a-form>
    </a-card>
  </div>
  <a-spin v-else :loading="loading" class="chapter-create__loading" />
</template>

<style scoped>
.chapter-create {
  padding: 12px 24px 24px;
  max-width: none;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
}
.chapter-create__card {
  border-radius: 8px;
  max-width: none;
}
.chapter-create__ai-card {
  margin-bottom: 14px;
  background: var(--color-fill-1);
}
.chapter-create__field-label {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}
.chapter-create__field-label > span:first-child {
  flex-shrink: 0;
}
.chapter-create__field-label .chapter-create__feedback-input,
.chapter-create__field-label .arco-btn {
  margin-left: auto;
}
.chapter-create__feedback-input {
  max-width: 200px;
}
.chapter-create__loading {
  margin-top: 80px;
  display: flex;
  justify-content: center;
}
.chapter-create__form :deep(.arco-form-item-content) {
  max-width: none;
}
.chapter-create__content-field :deep(.arco-form-item-content) {
  display: block;
  width: 100%;
}
.chapter-create__predictions {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.chapter-create__prediction-item {
  padding: 10px 12px;
  border-radius: 6px;
  background: var(--color-bg-2);
}
.chapter-create__prediction-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.chapter-create__prediction-summary {
  font-size: 13px;
  color: var(--color-text-2);
  line-height: 1.6;
}
</style>
