<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Message, Modal } from '@arco-design/web-vue'
import { IconPlus, IconRefresh, IconEdit } from '@arco-design/web-vue/es/icon'
import { WorkspaceBreadcrumb } from '@/components/layout'
import { listStyleProfiles } from '@/api/styleLearning'
import {
  createNovel,
  deleteNovel,
  generateNovelByAI,
  getNovel,
  listNovels,
  searchNovels,
  updateNovel,
  uploadNovelCover,
} from '@/api/novels'
import type { GeneratedNovelDraft, GenerateNovelBody, Novel } from '@/types/novel'
import type { StyleProfile } from '@/types/styleLearning'

const router = useRouter()

const loading = ref(false)
const novels = ref<Novel[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(12)
const keyword = ref('')

const drawerVisible = ref(false)
const drawerMode = ref<'create' | 'edit'>('create')
const editId = ref<number | null>(null)
const saving = ref(false)
const coverUploading = ref(false)
const coverFileRef = ref<HTMLInputElement | null>(null)
const aiLoading = ref(false)

const styleProfiles = ref<StyleProfile[]>([])
const styleProfilesLoading = ref(false)

const styleProfileOptions = computed(() =>
  styleProfiles.value.map((p) => ({
    label: `${p.name}${p.learnedAt ? ' · 已学习' : ''}`,
    value: p.id,
  })),
)

const form = reactive({
  title: '',
  status: '',
  genre: '',
  audience: '',
  theme: '',
  description: '',
  worldSetting: '',
  tags: '',
  coverImage: '',
  styleGuide: '',
  /** 未选时为 undefined；保存时转为 0 解除绑定 */
  styleProfileId: undefined as number | undefined,
})

const aiMessage = ref('请生成一部长篇小说策划草案，给出标题、题材、受众、主题、简介、世界观与标签。')
const aiFeedback = ref('')
const aiModel = ref('')
const aiMaxTokens = ref<number | undefined>(undefined)
const aiLockedFields = ref<string[]>([])

const AI_LOCKABLE_FIELDS = [
  { label: '标题', value: 'title' },
  { label: '状态', value: 'status' },
  { label: '类型', value: 'genre' },
  { label: '受众', value: 'audience' },
  { label: '主题', value: 'theme' },
  { label: '简介', value: 'description' },
  { label: '世界观', value: 'worldSetting' },
  { label: '标签', value: 'tags' },
  { label: '风格指南', value: 'styleGuide' },
]

const COVER_PLACEHOLDER =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="320"><rect width="100%" height="100%" fill="%23f2f3f5"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%239ca3af" font-size="28">No Cover</text></svg>'

function resetForm() {
  form.title = ''
  form.status = ''
  form.genre = ''
  form.audience = ''
  form.theme = ''
  form.description = ''
  form.worldSetting = ''
  form.tags = ''
  form.coverImage = ''
  form.styleGuide = ''
  form.styleProfileId = undefined
}

function fillFromNovel(n: Novel) {
  form.title = n.title || ''
  form.status = n.status || ''
  form.genre = n.genre || ''
  form.audience = n.audience || ''
  form.theme = n.theme || ''
  form.description = n.description || ''
  form.worldSetting = n.worldSetting || ''
  form.tags = n.tags || ''
  form.coverImage = n.coverImage || ''
  form.styleGuide = n.styleGuide || ''
  form.styleProfileId =
    n.styleProfileId && n.styleProfileId > 0 ? n.styleProfileId : undefined
}

function fillFromDraft(d: GeneratedNovelDraft) {
  form.title = d.title || ''
  form.status = d.status || ''
  form.genre = d.genre || ''
  form.audience = d.audience || ''
  form.theme = d.theme || ''
  form.description = d.description || ''
  form.worldSetting = d.worldSetting || ''
  form.tags = d.tags || ''
  form.styleGuide = d.styleGuide || ''
}

function currentFormToDraft(): GeneratedNovelDraft {
  return {
    title: form.title,
    status: form.status,
    genre: form.genre,
    audience: form.audience,
    theme: form.theme,
    description: form.description,
    worldSetting: form.worldSetting,
    tags: form.tags,
    coverImage: '',
    styleGuide: form.styleGuide,
  }
}

function formToCreateBody() {
  return {
    title: form.title.trim(),
    status: form.status.trim() || undefined,
    genre: form.genre.trim() || undefined,
    audience: form.audience.trim() || undefined,
    theme: form.theme.trim() || undefined,
    description: form.description.trim() || undefined,
    worldSetting: form.worldSetting.trim() || undefined,
    tags: form.tags.trim() || undefined,
    coverImage: form.coverImage.trim() || undefined,
    styleGuide: form.styleGuide.trim() || undefined,
    styleProfileId: form.styleProfileId && form.styleProfileId > 0 ? form.styleProfileId : undefined,
  }
}

function formToUpdateBody() {
  return {
    title: form.title.trim(),
    status: form.status.trim(),
    genre: form.genre.trim(),
    audience: form.audience.trim(),
    theme: form.theme.trim(),
    description: form.description.trim(),
    worldSetting: form.worldSetting.trim(),
    tags: form.tags.trim(),
    coverImage: form.coverImage.trim(),
    styleGuide: form.styleGuide.trim(),
    styleProfileId: form.styleProfileId ?? 0,
  }
}

async function loadStyleProfiles() {
  styleProfilesLoading.value = true
  try {
    const res = await listStyleProfiles({ page: 1, size: 200 })
    styleProfiles.value = res.items ?? []
  } catch (e) {
    Message.error(String((e as Error)?.message || e))
  } finally {
    styleProfilesLoading.value = false
  }
}

onMounted(() => {
  void load()
})

async function load() {
  loading.value = true
  try {
    const kw = keyword.value.trim()
    const res = kw
      ? await searchNovels({ keyword: kw, page: page.value, size: pageSize.value })
      : await listNovels({ page: page.value, size: pageSize.value })
    novels.value = res.novels
    total.value = res.total
  } catch (e) {
    Message.error(String((e as Error)?.message || e))
  } finally {
    loading.value = false
  }
}

function onSearch() {
  page.value = 1
  void load()
}

function clearSearch() {
  keyword.value = ''
  page.value = 1
  void load()
}

function onPageChange(p: number) {
  page.value = p
  void load()
}

function onPageSizeChange(s: number) {
  pageSize.value = s
  page.value = 1
  void load()
}

function goDetail(row: Novel) {
  void router.push({ name: 'novel-detail', params: { id: String(row.id) } })
}

function coverSrc(url: string) {
  const u = (url || '').trim()
  return u || COVER_PLACEHOLDER
}

function onCoverLoadError(ev: Event) {
  const img = ev.target as HTMLImageElement
  if (img && img.src !== COVER_PLACEHOLDER) {
    img.src = COVER_PLACEHOLDER
  }
}

async function openCreate() {
  drawerMode.value = 'create'
  editId.value = null
  resetForm()
  aiFeedback.value = ''
  aiLockedFields.value = []
  aiModel.value = ''
  aiMaxTokens.value = undefined
  drawerVisible.value = true
  await loadStyleProfiles()
}

async function openEdit(row: Novel) {
  drawerMode.value = 'edit'
  editId.value = row.id
  drawerVisible.value = true
  try {
    await loadStyleProfiles()
    const n = await getNovel(row.id)
    fillFromNovel(n)
  } catch (e) {
    Message.error(String((e as Error)?.message || e))
    drawerVisible.value = false
  }
}

async function saveDrawer() {
  if (!form.title.trim()) {
    Message.warning('标题必填')
    return
  }
  saving.value = true
  try {
    if (drawerMode.value === 'create') {
      await createNovel(formToCreateBody())
      Message.success('已创建')
    } else if (editId.value != null) {
      await updateNovel(editId.value, formToUpdateBody())
      Message.success('已保存')
    }
    drawerVisible.value = false
    await load()
  } catch (e) {
    Message.error(String((e as Error)?.message || e))
  } finally {
    saving.value = false
  }
}

function onRowDelete(row: Novel) {
  Modal.confirm({
    title: '删除小说',
    content: `确定删除「${row.title}」？`,
    okText: '删除',
    async onOk() {
      await deleteNovel(row.id)
      Message.success('已删除')
      await load()
    },
  })
}

async function runAiGenerateInCreateForm() {
  if (drawerMode.value !== 'create') {
    Message.info('AI 草稿入口仅在“新建小说”表单中提供')
    return
  }
  const msg = aiMessage.value.trim()
  if (!msg) {
    Message.warning('请填写对 AI 的需求说明')
    return
  }
  aiLoading.value = true
  try {
    const body: GenerateNovelBody = {
      message: msg,
      maxTokens: aiMaxTokens.value,
      baseDraft: currentFormToDraft(),
      lockedFields: aiLockedFields.value,
      feedback: aiFeedback.value.trim() || undefined,
    }
    const m = aiModel.value.trim()
    if (m) {
      body.model = m
    }
    const { draft } = await generateNovelByAI(body)
    fillFromDraft(draft)
    Message.success('已写入草稿；可继续反馈并重写')
  } catch (e) {
    Message.error(String((e as Error)?.message || e))
  } finally {
    aiLoading.value = false
  }
}

function triggerCoverPick() {
  coverFileRef.value?.click()
}

async function onCoverFileChange(ev: Event) {
  const el = ev.target as HTMLInputElement
  const file = el.files?.[0]
  el.value = ''
  if (!file) {
    return
  }
  coverUploading.value = true
  try {
    const r = await uploadNovelCover(file)
    form.coverImage = r.url
    Message.success('封面上传成功')
  } catch (e) {
    Message.error(String((e as Error)?.message || e))
  } finally {
    coverUploading.value = false
  }
}
</script>

<template>
  <div class="novel-home">
    <WorkspaceBreadcrumb :trail="[{ label: '小说管理' }]" />

    <a-card title="小说管理" :bordered="false" class="novel-home__card">
      <template #extra>
        <a-space wrap>
          <a-input-search
            v-model="keyword"
            placeholder="按标题/简介搜索"
            style="width: 220px"
            allow-clear
            @search="onSearch"
            @clear="clearSearch"
          />
          <a-button @click="clearSearch">清除搜索</a-button>
          <a-button @click="load">
            <template #icon>
              <IconRefresh />
            </template>
            刷新
          </a-button>
          <a-button type="primary" @click="openCreate">
            <template #icon>
              <IconPlus />
            </template>
            新建小说
          </a-button>
        </a-space>
      </template>

      <a-spin :loading="loading" style="width: 100%">
        <div class="novel-home__grid">
          <a-card
            v-for="row in novels"
            :key="row.id"
            class="novel-home__item"
            hoverable
            @click="goDetail(row)"
          >
            <div class="novel-home__cover-wrap">
              <img
                class="novel-home__cover"
                :src="coverSrc(row.coverImage)"
                alt="封面"
                loading="lazy"
                @error="onCoverLoadError"
              />
            </div>
            <div class="novel-home__item-hd">
              <div class="novel-home__title">{{ row.title || '未命名小说' }}</div>
              <a-tag size="small">{{ row.status || 'draft' }}</a-tag>
            </div>
            <a-typography-paragraph class="novel-home__desc" :ellipsis="{ rows: 3 }">
              {{ row.description || '暂无简介' }}
            </a-typography-paragraph>
            <div class="novel-home__meta">
              类型：{{ row.genre || '未设置' }} | 受众：{{ row.audience || '未设置' }}
              <template v-if="row.styleProfileName">
                <span class="novel-home__style-sp">|</span>
                风格：{{ row.styleProfileName }}
              </template>
            </div>
            <div class="novel-home__ops" @click.stop>
              <a-button type="text" size="small" @click="openEdit(row)">
                <template #icon>
                  <IconEdit />
                </template>
                编辑
              </a-button>
              <a-button type="text" status="danger" size="small" @click="onRowDelete(row)">删除</a-button>
            </div>
          </a-card>
          <a-empty v-if="!novels.length" description="暂无小说" class="novel-home__empty" />
        </div>
      </a-spin>

      <div class="novel-home__pager">
        <a-pagination
          :total="total"
          :current="page"
          :page-size="pageSize"
          show-total
          show-page-size
          :page-size-options="[12, 24, 48]"
          @change="onPageChange"
          @page-size-change="onPageSizeChange"
        />
      </div>
    </a-card>

    <a-drawer
      v-model:visible="drawerVisible"
      :width="680"
      :title="drawerMode === 'create' ? '新建小说' : `编辑小说 #${editId}`"
      unmount-on-close
    >
      <template #footer>
        <a-space>
          <a-button @click="drawerVisible = false">取消</a-button>
          <a-button type="primary" :loading="saving" @click="saveDrawer">
            {{ drawerMode === 'create' ? '创建' : '保存' }}
          </a-button>
        </a-space>
      </template>

      <a-form :model="form" layout="vertical" class="novel-home__drawer-form">
        <a-card v-if="drawerMode === 'create'" :bordered="false" class="novel-home__ai-card">
          <template #title>AI 生成草稿</template>
          <a-form-item label="需求说明" required>
            <a-textarea
              v-model="aiMessage"
              :auto-size="{ minRows: 3, maxRows: 8 }"
              placeholder="描述想要的小说方向、题材、风格等"
            />
          </a-form-item>
          <a-form-item label="反馈（用于重写）">
            <a-textarea
              v-model="aiFeedback"
              :auto-size="{ minRows: 2, maxRows: 6 }"
              placeholder="例如：保留世界观，标题更简洁，简介更有冲突感"
            />
          </a-form-item>
          <a-form-item label="重写时锁定字段（保持不变）">
            <a-checkbox-group v-model="aiLockedFields" :options="AI_LOCKABLE_FIELDS" />
          </a-form-item>
          <a-row :gutter="12">
            <a-col :span="12">
              <a-form-item label="模型（可选）">
                <a-input v-model="aiModel" placeholder="默认后端配置" allow-clear />
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="maxTokens">
                <a-input-number v-model="aiMaxTokens" :min="256" :max="8000" placeholder="默认" />
              </a-form-item>
            </a-col>
          </a-row>
          <a-button type="primary" :loading="aiLoading" @click="runAiGenerateInCreateForm">
            生成 / 按反馈重写
          </a-button>
        </a-card>

        <a-form-item label="标题" required>
          <a-input v-model="form.title" placeholder="标题" allow-clear />
        </a-form-item>
        <a-row :gutter="12">
          <a-col :span="12">
            <a-form-item label="状态">
              <a-input v-model="form.status" placeholder="如 draft / writing" allow-clear />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="类型">
              <a-input v-model="form.genre" placeholder="玄幻 / 都市 …" allow-clear />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="12">
          <a-col :span="12">
            <a-form-item label="受众">
              <a-input v-model="form.audience" placeholder="male / female / 空" allow-clear />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="主题">
              <a-input v-model="form.theme" allow-clear />
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="简介">
          <a-textarea v-model="form.description" :auto-size="{ minRows: 2, maxRows: 8 }" allow-clear />
        </a-form-item>
        <a-form-item label="世界观">
          <a-textarea v-model="form.worldSetting" :auto-size="{ minRows: 2, maxRows: 8 }" allow-clear />
        </a-form-item>
        <a-form-item label="标签（逗号分隔）">
          <a-input v-model="form.tags" allow-clear />
        </a-form-item>
        <a-form-item label="封面 URL">
          <a-space fill style="width: 100%">
            <a-input v-model="form.coverImage" placeholder="上传后自动填入或手动粘贴 URL" allow-clear />
            <input
              ref="coverFileRef"
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              class="novel-home__file"
              @change="onCoverFileChange"
            />
            <a-button :loading="coverUploading" @click="triggerCoverPick">上传封面</a-button>
          </a-space>
        </a-form-item>
        <a-form-item label="写作风格指南">
          <a-textarea v-model="form.styleGuide" :auto-size="{ minRows: 2, maxRows: 6 }" allow-clear />
        </a-form-item>
        <a-form-item label="风格学习档案">
          <a-select
            v-model="form.styleProfileId"
            allow-clear
            placeholder="不绑定（可在「风格学习」中创建档案后在此选择）"
            :loading="styleProfilesLoading"
            :options="styleProfileOptions"
          />
          <template #extra>
            <span class="novel-home__hint">
              绑定后可与创作流程联动使用已学习的风格指令；未学习完成的档案也可先绑定。
              <a-link @click="router.push({ name: 'style-learning' })">前往风格学习</a-link>
            </span>
          </template>
        </a-form-item>
      </a-form>
    </a-drawer>
  </div>
</template>

<style scoped>
.novel-home {
  padding: 12px 24px 24px;
  max-width: 1280px;
  margin: 0 auto;
}
.novel-home__card {
  border-radius: 8px;
}
.novel-home__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 14px;
  min-height: 220px;
}
.novel-home__item {
  border-radius: 8px;
}
.novel-home__cover-wrap {
  margin: -4px -4px 10px;
  border-radius: 8px;
  overflow: hidden;
  background: var(--color-fill-2);
  border: 1px solid var(--color-border-2);
}
.novel-home__cover {
  width: 100%;
  height: 156px;
  object-fit: cover;
  display: block;
}
.novel-home__item-hd {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}
.novel-home__title {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-1);
}
.novel-home__desc {
  margin-bottom: 10px;
  color: var(--color-text-2);
  min-height: 66px;
}
.novel-home__meta {
  color: var(--color-text-3);
  font-size: 12px;
}
.novel-home__style-sp {
  margin: 0 4px;
  opacity: 0.6;
}
.novel-home__hint {
  font-size: 12px;
  color: var(--color-text-3);
}
.novel-home__ops {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}
.novel-home__empty {
  grid-column: 1 / -1;
  padding-top: 24px;
}
.novel-home__pager {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
.novel-home__file {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  pointer-events: none;
}
.novel-home__drawer-form {
  padding-bottom: 8px;
}
.novel-home__ai-card {
  margin-bottom: 12px;
  background: var(--color-fill-1);
}
</style>
