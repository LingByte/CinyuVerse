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
import { createChapter, generateChapterContentByAI } from '@/api/chapters'
import type { Novel } from '@/types/novel'
import type { Volume } from '@/types/volume'
import type { Storyline } from '@/types/storyline'
import type { Chapter, GenerateChapterBody } from '@/types/chapter'

const route = useRoute()
const router = useRouter()
const novelId = computed(() => Number(route.params.id))
const volumeId = computed(() => Number(route.params.volumeId))

const novel = ref<Novel | null>(null)
const volume = ref<Volume | null>(null)
const storylines = ref<Storyline[]>([])
const selectedStorylineId = ref<number | undefined>(undefined)
const loading = ref(false)
const saving = ref(false)
const aiLoading = ref(false)

const form = reactive({
  title: '',
  content: '',
  orderNo: 1,
  summary: '',
  status: 'draft',
  characterIds: '',
  plotPointIds: '',
  previousSummary: '',
  outline: '',
  relatedNodeIds: '',
  promptMemo: '',
})

const PLOT_NODE_TYPES = 'event,twist,clue,payoff'

const aiMessage = ref('请生成本卷下一章，要求情节推进明显，文风与已有设定一致。')
const aiFeedback = ref('')
const aiModel = ref('')
const aiMaxTokens = ref<number | undefined>(undefined)
const aiLockedFields = ref<string[]>([])
const AI_LOCK_FIELDS = [
  { label: '标题', value: 'title' },
  { label: '正文', value: 'content' },
  { label: '摘要', value: 'summary' },
  { label: '大纲', value: 'outline' },
  { label: '状态', value: 'status' },
]

function currentDraft(): Partial<Chapter> {
  return {
    title: form.title,
    content: form.content,
    orderNo: form.orderNo,
    summary: form.summary,
    characterIds: form.characterIds,
    plotPointIds: form.plotPointIds,
    previousSummary: form.previousSummary,
    outline: form.outline,
    relatedNodeIds: form.relatedNodeIds,
    promptMemo: form.promptMemo,
    status: form.status,
  }
}

function applyDraft(draft: Partial<Chapter>) {
  form.title = draft.title || ''
  form.content = draft.content || ''
  form.orderNo = draft.orderNo && draft.orderNo > 0 ? draft.orderNo : 1
  form.summary = draft.summary || ''
  form.characterIds = draft.characterIds || ''
  form.plotPointIds = draft.plotPointIds || ''
  form.previousSummary = draft.previousSummary || ''
  form.outline = draft.outline || ''
  form.relatedNodeIds = draft.relatedNodeIds || ''
  form.promptMemo = draft.promptMemo || ''
  form.status = draft.status || 'draft'
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

async function runChapterAI() {
  const msg = aiMessage.value.trim()
  if (!msg) {
    Message.warning('请填写 AI 需求')
    return
  }
  aiLoading.value = true
  try {
    const novelCtx = novel.value
      ? [
          `小说标题：${novel.value.title || ''}`,
          `主题：${novel.value.theme || ''}`,
          `简介：${novel.value.description || ''}`,
          `世界观：${novel.value.worldSetting || ''}`,
        ].join('\n')
      : ''
    const volumeCtx = volume.value
      ? [
          `卷标题：${volume.value.title || ''}`,
          `卷主题：${volume.value.theme || ''}`,
          `卷简介：${volume.value.description || ''}`,
        ].join('\n')
      : ''
    const mergedMessage = [
      '请基于以下设定生成章节草稿。',
      novelCtx,
      volumeCtx,
      `用户要求：${msg}`,
    ]
      .filter(Boolean)
      .join('\n\n')

    const body: GenerateChapterBody = {
      message: mergedMessage,
      model: aiModel.value.trim() || undefined,
      maxTokens: aiMaxTokens.value,
      feedback: aiFeedback.value.trim() || undefined,
      lockedFields: aiLockedFields.value,
      baseDraft: {
        ...currentDraft(),
        novelId: novelId.value,
        volumeId: volumeId.value,
      },
    }
    const { draft } = await generateChapterContentByAI(body)
    applyDraft(draft)
    Message.success('AI 章节草稿已写入，可继续反馈重写')
  } catch (e) {
    Message.error(String((e as Error)?.message || e))
  } finally {
    aiLoading.value = false
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
      previousSummary: form.previousSummary || undefined,
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
          <template #title>AI 章节草稿</template>
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
                <a-input-number v-model="aiMaxTokens" :min="256" :max="8000" placeholder="默认" />
              </a-form-item>
            </a-col>
          </a-row>
          <a-button type="primary" :loading="aiLoading" @click="runChapterAI">生成 / 重写章节</a-button>
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

        <a-form-item label="摘要">
          <a-textarea v-model="form.summary" :auto-size="{ minRows: 2, maxRows: 6 }" />
        </a-form-item>
        <a-form-item label="前情提要">
          <a-textarea v-model="form.previousSummary" :auto-size="{ minRows: 2, maxRows: 6 }" />
        </a-form-item>
        <a-form-item label="章节大纲">
          <a-textarea v-model="form.outline" :auto-size="{ minRows: 2, maxRows: 8 }" />
        </a-form-item>
        <a-form-item label="提示词备注">
          <a-textarea v-model="form.promptMemo" :auto-size="{ minRows: 2, maxRows: 6 }" />
        </a-form-item>

        <a-form-item label="章节正文" class="chapter-create__content-field">
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
</style>
