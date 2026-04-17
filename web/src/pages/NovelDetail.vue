<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import Button from '@/components/Button.vue'
import Card from '@/components/Card.vue'
import FileUpload from '@/components/FileUpload.vue'
import Input from '@/components/Input.vue'
import novelsApi, { type Novel } from '@/api/novels'
import {
  createNovelChapter,
  createNovelVolume,
  deleteNovelChapter,
  deleteNovelVolume,
  ensureActiveVolumeAndChapter,
  type NovelChapter,
  type NovelDraftState,
  type NovelVolume,
  updateNovelChapterMarkdown,
  updateNovelChapterTitle,
  updateNovelVolumeTitle,
} from '@/utils/novelDraftStorage'
import Alert from '@/components/feedback/Alert.vue'
import Modal from '@/components/feedback/Modal.vue'

const props = defineProps<{ novelId: number | string }>()

const emit = defineEmits<{
  (e: 'back'): void
  (e: 'startCreate', payload: { volumeId: string; chapterId: string }): void
}>()

const novel = ref<Novel | null>(null)
const loading = ref(false)
const loadError = ref('')

const draftState = ref<NovelDraftState>({ volumes: [], chapters: [] })
const activeVolumeId = ref<string | null>(null)
const activeChapterId = ref<string | null>(null)

const refreshDraft = () => {
  const { state, activeVolumeId: av, activeChapterId: ac } = ensureActiveVolumeAndChapter(
    props.novelId,
    activeVolumeId.value,
    activeChapterId.value,
  )
  draftState.value = state
  activeVolumeId.value = av
  activeChapterId.value = ac
}

onMounted(async () => {
  loading.value = true
  loadError.value = ''
  try {
    const res = await novelsApi.getOne<Novel>(props.novelId)
    novel.value = res.data as unknown as Novel
  } catch (e: unknown) {
    loadError.value = (e as { msg?: string })?.msg || '加载小说失败'
    novel.value = null
  } finally {
    loading.value = false
  }

  refreshDraft()
})

watch(
  () => props.novelId,
  async () => {
    loading.value = true
    loadError.value = ''
    try {
      const res = await novelsApi.getOne<Novel>(props.novelId)
      novel.value = res.data as unknown as Novel
    } catch (e: unknown) {
      loadError.value = (e as { msg?: string })?.msg || '加载小说失败'
      novel.value = null
    } finally {
      loading.value = false
    }
    refreshDraft()
  },
)

const volumes = computed(() => draftState.value.volumes)
const chapters = computed(() => draftState.value.chapters)

const activeVolume = computed(() => volumes.value.find((v) => v.id === activeVolumeId.value) ?? null)
const activeChapters = computed(() => chapters.value.filter((c) => c.volumeId === activeVolumeId.value))

const volumeTitleInput = ref('')
const chapterTitleInput = ref('')

const getCoverInitial = (title: string) => (title?.trim()?.slice(0, 1) || '书').toUpperCase()

const AUTHOR_OVERRIDE_KEY = computed(() => `novelDetail_authorOverride:${String(props.novelId)}`)
const authorOverride = ref<string>(window.localStorage.getItem(AUTHOR_OVERRIDE_KEY.value) || '')
watch(
  () => props.novelId,
  () => {
    authorOverride.value = window.localStorage.getItem(`novelDetail_authorOverride:${String(props.novelId)}`) || ''
  },
)
watch(authorOverride, (v) => window.localStorage.setItem(AUTHOR_OVERRIDE_KEY.value, v))

const displayAuthor = computed(() => {
  const override = authorOverride.value.trim()
  if (override) return `@${override}`
  return novel.value?.createBy ? `@${novel.value.createBy}` : `ID ${novel.value?.authorId ?? '-'}`
})

const toChineseNumber = (n: number) => {
  if (!Number.isFinite(n) || n <= 0) return ''
  const digits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'] as const
  if (n < 10) return digits[n]
  if (n < 20) return n === 10 ? '十' : `十${digits[n % 10]}`
  if (n < 100) {
    const tens = Math.floor(n / 10)
    const ones = n % 10
    return ones ? `${digits[tens]}十${digits[ones]}` : `${digits[tens]}十`
  }
  return String(n)
}

const getDefaultVolumeTitle = () => `第${toChineseNumber(volumes.value.length + 1)}卷`
const getDefaultChapterTitle = (index: number) => `第${toChineseNumber(index)}章`

const addVolume = () => {
  const title = (volumeTitleInput.value.trim() || getDefaultVolumeTitle()).slice(0, 40)
  const v = createNovelVolume(props.novelId, title)
  volumeTitleInput.value = ''
  activeVolumeId.value = v.id
  activeChapterId.value = null
  refreshDraft()
}

const addChapter = () => {
  if (!activeVolumeId.value) return
  const existingCount = activeChapters.value.length
  const title = (chapterTitleInput.value.trim() || getDefaultChapterTitle(existingCount + 1)).slice(0, 60)
  const ch = createNovelChapter(props.novelId, activeVolumeId.value, title)
  chapterTitleInput.value = ''
  activeChapterId.value = ch.id
  refreshDraft()
}

const startCreate = () => {
  if (!activeVolumeId.value) {
    const v = createNovelVolume(props.novelId, '第一卷')
    const ch = createNovelChapter(props.novelId, v.id, '第一章')
    refreshDraft()
    emit('startCreate', { volumeId: v.id, chapterId: ch.id })
    return
  }

  const nextIndex = activeChapters.value.length + 1
  const ch = createNovelChapter(props.novelId, activeVolumeId.value, getDefaultChapterTitle(nextIndex))
  refreshDraft()
  emit('startCreate', { volumeId: activeVolumeId.value, chapterId: ch.id })
}

const deleteVolume = (v: NovelVolume) => {
  const ok = window.confirm(`确认删除卷《${v.title}》及其所有章节？`)
  if (!ok) return
  deleteNovelVolume(props.novelId, v.id)
  refreshDraft()
}

const deleteChapter = (c: NovelChapter) => {
  const ok = window.confirm(`确认删除章节《${c.title}》？`)
  if (!ok) return
  deleteNovelChapter(props.novelId, c.id)
  refreshDraft()
}

const editChapter = (c: NovelChapter) => {
  activeVolumeId.value = c.volumeId
  activeChapterId.value = c.id
  emit('startCreate', { volumeId: c.volumeId, chapterId: c.id })
}

type EditTarget =
  | { kind: 'volume'; id: string; title: string }
  | { kind: 'chapter'; id: string; title: string }
  | null

const editTarget = ref<EditTarget>(null)
const editTitle = ref('')

const openRenameVolume = (v: NovelVolume) => {
  editTarget.value = { kind: 'volume', id: v.id, title: v.title }
  editTitle.value = v.title
}

const openRenameChapter = (c: NovelChapter) => {
  editTarget.value = { kind: 'chapter', id: c.id, title: c.title }
  editTitle.value = c.title
}

const closeRename = () => {
  editTarget.value = null
  editTitle.value = ''
}

const saveRename = () => {
  const next = editTitle.value.trim().slice(0, 60)
  if (!editTarget.value || !next) return
  if (editTarget.value.kind === 'volume') {
    updateNovelVolumeTitle(props.novelId, editTarget.value.id, next.slice(0, 40))
  } else {
    updateNovelChapterTitle(props.novelId, editTarget.value.id, next)
  }
  refreshDraft()
  closeRename()
}

// --------- Cover upload + inline edit ---------
const isSavingMeta = ref(false)
const metaError = ref('')
const coverModalOpen = ref(false)

const descriptionEditing = ref(false)
const descriptionDraft = ref('')

const authorEditing = ref(false)
const authorDraft = ref('')

const openEditDescription = () => {
  descriptionDraft.value = novel.value?.description ?? ''
  descriptionEditing.value = true
}
const cancelEditDescription = () => {
  descriptionEditing.value = false
  descriptionDraft.value = ''
}
const saveDescription = async () => {
  if (!novel.value) return
  metaError.value = ''
  isSavingMeta.value = true
  try {
    const next = descriptionDraft.value.trim().slice(0, 2000)
    const res = await novelsApi.update(props.novelId, { description: next })
    novel.value = res.data as unknown as Novel
    cancelEditDescription()
  } catch (e: unknown) {
    metaError.value = (e as { msg?: string })?.msg || '保存故事简介失败'
  } finally {
    isSavingMeta.value = false
  }
}

const openEditAuthor = () => {
  authorDraft.value = (authorOverride.value.trim() || novel.value?.createBy || '').replace(/^@/, '')
  authorEditing.value = true
}
const cancelEditAuthor = () => {
  authorEditing.value = false
  authorDraft.value = ''
}
const saveAuthor = () => {
  authorOverride.value = authorDraft.value.trim().slice(0, 32)
  cancelEditAuthor()
}

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.readAsDataURL(file)
  })

const onCoverFilesChange = async (files: File[]) => {
  if (!files.length || !novel.value) return
  metaError.value = ''
  isSavingMeta.value = true
  try {
    const dataUrl = await readFileAsDataUrl(files[0])
    const res = await novelsApi.update(props.novelId, { coverImage: dataUrl })
    novel.value = res.data as unknown as Novel
    coverModalOpen.value = false
  } catch (e: unknown) {
    metaError.value = (e as { msg?: string })?.msg || '上传封面失败'
  } finally {
    isSavingMeta.value = false
  }
}

// --------- One-click full generation ---------
const fullGenOpen = ref(false)
const fullGenOutline = ref('')
const fullGenCharacters = ref('')
const fullGenVolumes = ref(1)
const fullGenChaptersPerVolume = ref(10)
const fullGenBusy = ref(false)
const fullGenError = ref('')

const openFullGen = () => {
  fullGenError.value = ''
  fullGenOpen.value = true
}

const deriveChapterTitleFromContent = (markdown: string, fallback: string) => {
  const lines = (markdown || '').split('\n').map((x) => x.trim()).filter(Boolean)
  const h1 = lines.find((l) => l.startsWith('# '))?.replace(/^#\s+/, '').trim()
  const firstSentence = lines
    .filter((l) => !l.startsWith('#') && !l.startsWith('- ') && !l.startsWith('## '))
    .join(' ')
    .split(/[。！？.!?]/)[0]
    ?.trim()
  const raw = (h1 || firstSentence || fallback).replace(/[【】\[\]]/g, '').trim()
  return raw.length > 18 ? raw.slice(0, 18) : raw
}

const buildChapterMarkdown = (volumeTitle: string, chapterTitle: string, outline: string, characters: string) => {
  const tOutline = outline.trim() || '（待补充故事线）'
  const tChars = characters.trim() || '（待补充人物设定）'
  return `# 

## 本章要点
- 关联卷：${volumeTitle}
- 主线：${tOutline.split('\n')[0].slice(0, 80)}

## 人物
${tChars}

## 正文（草稿）
（从冲突开场 → 推进 → 反转/悬念收束，按你的故事线扩写。）`
}

const generateFullDraft = () => {
  if (!props.novelId) return
  fullGenError.value = ''
  fullGenBusy.value = true
  try {
    const volCount = Math.max(1, Math.min(30, Number(fullGenVolumes.value) || 1))
    const chPerVol = Math.max(1, Math.min(50, Number(fullGenChaptersPerVolume.value) || 10))
    const outline = fullGenOutline.value
    const characters = fullGenCharacters.value

    for (let vi = 1; vi <= volCount; vi += 1) {
      const volumeTitle = `第${toChineseNumber(vi)}卷`
      const v = createNovelVolume(props.novelId, volumeTitle.slice(0, 40))
      for (let ci = 1; ci <= chPerVol; ci += 1) {
        const fallbackTitle = `第${toChineseNumber(ci)}章`
        const ch = createNovelChapter(props.novelId, v.id, fallbackTitle.slice(0, 60))
        const md = buildChapterMarkdown(volumeTitle, fallbackTitle, outline, characters)
        const derived = deriveChapterTitleFromContent(md, fallbackTitle)
        const finalTitle = derived || fallbackTitle
        updateNovelChapterTitle(props.novelId, ch.id, finalTitle)
        const patchedMd = md.replace(/^#\s*$/m, `# ${finalTitle}`)
        updateNovelChapterMarkdown(props.novelId, ch.id, md)
        updateNovelChapterMarkdown(props.novelId, ch.id, patchedMd)
      }
    }

    refreshDraft()
    fullGenOpen.value = false
  } catch (e: unknown) {
    fullGenError.value = e instanceof Error ? e.message : '生成失败'
  } finally {
    fullGenBusy.value = false
  }
}
</script>

<template>
  <div class="novel-detail__root">
    <main class="novel-detail">
      <header class="novel-detail__top">
        <button type="button" class="novel-detail__back" @click="emit('back')">返回</button>
        <div class="novel-detail__topbar">
          <div class="novel-detail__title">小说详情</div>
          <div class="novel-detail__subtitle">封面 · 作者 · 故事简介 · 卷管理（含章节）</div>
        </div>
        <div class="novel-detail__spacer" />
      </header>

      <section class="novel-detail__content">
        <div v-if="loadError" class="novel-detail__alert novel-detail__alert--error">{{ loadError }}</div>
        <div v-else-if="loading" class="novel-detail__alert">加载中...</div>

        <template v-else>
          <section class="novel-detail__hero" aria-label="小说信息">
            <div class="novel-detail__cover" :class="{ 'is-placeholder': !novel?.coverImage }">
              <img v-if="novel?.coverImage" class="novel-detail__cover-img" :src="novel.coverImage" :alt="`${novel.title} 封面`" />
              <div v-else class="novel-detail__cover-fallback" aria-hidden="true">
                <span class="novel-detail__cover-mark">{{ getCoverInitial(novel?.title || '') }}</span>
                <span class="novel-detail__cover-text">暂无封面</span>
              </div>
              <button type="button" class="novel-detail__cover-edit" @click="coverModalOpen = true">上传封面</button>
            </div>

            <div class="novel-detail__hero-body">
              <div class="novel-detail__hero-title">{{ novel?.title || '未命名小说' }}</div>
              <div class="novel-detail__hero-meta">
                <span class="novel-detail__editable" @dblclick="openEditAuthor">作者：{{ displayAuthor }}</span>
                <span v-if="novel?.genre">类型：{{ novel.genre }}</span>
              </div>

            <div
              v-if="novel?.description"
              class="novel-detail__hero-desc novel-detail__editable"
              title="双击编辑故事简介"
              @dblclick="openEditDescription"
            >
              {{ novel.description }}
            </div>
            <div
              v-else
              class="novel-detail__hero-desc novel-detail__hero-desc--muted novel-detail__editable"
              title="双击编辑故事简介"
              @dblclick="openEditDescription"
            >
              暂无故事简介
            </div>

              <div class="novel-detail__hero-actions">
                <Button variant="solid" size="md" shape="rounded" @click="startCreate">
                  开始创作
                </Button>
              <Button variant="outline" size="md" shape="rounded" @click="openFullGen">
                一键生成全文
              </Button>
              </div>
            </div>
          </section>

          <section class="novel-detail__grid" aria-label="卷管理（含章节）">
            <div class="novel-detail__panel">
              <div class="novel-detail__panel-head">
                <div class="novel-detail__panel-title">卷管理</div>
              </div>

              <div class="novel-detail__add-row">
                <Input v-model="volumeTitleInput" placeholder="新建卷标题（例：第一卷）" />
                <Button variant="outline" size="sm" shape="rounded" @click="addVolume">新增卷</Button>
              </div>

              <div v-if="!volumes.length" class="novel-detail__empty">暂无卷</div>
              <div v-else class="novel-detail__list">
                <Card
                  v-for="v in volumes"
                  :key="v.id"
                  class="novel-detail__item"
                  bordered
                  surface="none"
                  shadow="sm"
                  interactive="hover"
                  :class="{ 'is-active': v.id === activeVolumeId }"
                  role="button"
                  tabindex="0"
                  @click="activeVolumeId = v.id"
                  @dblclick="activeVolumeId = v.id"
                >
                  <div class="novel-detail__item-row">
                    <div class="novel-detail__item-title">{{ v.title }}</div>
                    <div class="novel-detail__item-actions">
                      <Button variant="outline" size="sm" shape="rounded" @click.stop="openRenameVolume(v)">编辑</Button>
                      <Button variant="outline" size="sm" shape="rounded" color="orange" @click.stop="deleteVolume(v)">
                        删除
                      </Button>
                    </div>
                  </div>
                </Card>
              </div>
            </div>

            <div class="novel-detail__panel novel-detail__panel--nested">
              <div class="novel-detail__panel-head">
                <div class="novel-detail__panel-title">章节管理（隶属于当前卷）</div>
                <div class="novel-detail__panel-sub" v-if="activeVolume">当前卷：{{ activeVolume.title }}</div>
              </div>

              <div class="novel-detail__add-row">
                <Input v-model="chapterTitleInput" :disabled="!activeVolumeId" placeholder="新建章节标题（例：第一章）" />
                <Button variant="outline" size="sm" shape="rounded" :disabled="!activeVolumeId" @click="addChapter">新增章节</Button>
              </div>

              <Alert v-if="activeVolumeId && !activeChapters.length" type="info">
                当前卷暂无章节，点「新增章节」或点击「开始创作」会自动创建第一个章节。
              </Alert>

              <div v-if="!activeVolumeId" class="novel-detail__empty">请先选择或新建一个卷</div>
              <div v-else-if="!activeChapters.length" class="novel-detail__empty">暂无章节</div>

              <div v-else class="novel-detail__list">
                <Card
                  v-for="c in activeChapters"
                  :key="c.id"
                  class="novel-detail__item"
                  bordered
                  surface="none"
                  shadow="sm"
                  interactive="hover"
                  :class="{ 'is-active': c.id === activeChapterId }"
                  role="button"
                  tabindex="0"
                  @click="activeChapterId = c.id"
                >
                  <div class="novel-detail__item-row" @dblclick="editChapter(c)">
                    <div class="novel-detail__item-title">{{ c.title }}</div>
                    <div class="novel-detail__item-actions">
                      <Button variant="outline" size="sm" shape="rounded" @click.stop="openRenameChapter(c)">编辑</Button>
                      <Button variant="outline" size="sm" shape="rounded" color="orange" @click.stop="deleteChapter(c)">
                        删除
                      </Button>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          </section>
        </template>
      </section>
    </main>

    <Modal
      :open="!!editTarget"
      :title="editTarget?.kind === 'volume' ? '编辑卷名' : '编辑章节名'"
      @close="closeRename"
    >
      <div class="novel-detail__rename">
        <Input v-model="editTitle" :placeholder="editTarget?.kind === 'volume' ? '输入卷名' : '输入章节名'" />
        <div class="novel-detail__rename-actions">
          <Button variant="outline" size="sm" shape="rounded" @click="closeRename">取消</Button>
          <Button variant="solid" size="sm" shape="rounded" @click="saveRename">保存</Button>
        </div>
      </div>
    </Modal>

    <Modal :open="coverModalOpen" title="上传封面" @close="coverModalOpen = false">
      <div class="novel-detail__modal-stack">
        <FileUpload accept="image/*" :multiple="false" :max-size="10" :max-files="1" label="选择一张封面图" @change="onCoverFilesChange" />
        <div v-if="metaError" class="novel-detail__meta-error">{{ metaError }}</div>
      </div>
    </Modal>

    <Modal :open="authorEditing" title="编辑作者" @close="cancelEditAuthor">
      <div class="novel-detail__modal-stack">
        <Input v-model="authorDraft" placeholder="作者名（仅本地显示）" />
        <div class="novel-detail__rename-actions">
          <Button variant="outline" size="sm" shape="rounded" @click="cancelEditAuthor">取消</Button>
          <Button variant="solid" size="sm" shape="rounded" :disabled="isSavingMeta" @click="saveAuthor">保存</Button>
        </div>
      </div>
    </Modal>

    <Modal :open="descriptionEditing" title="编辑故事简介" @close="cancelEditDescription">
      <div class="novel-detail__modal-stack">
        <textarea v-model="descriptionDraft" class="novel-detail__textarea" rows="8" placeholder="输入故事简介…" />
        <div v-if="metaError" class="novel-detail__meta-error">{{ metaError }}</div>
        <div class="novel-detail__rename-actions">
          <Button variant="outline" size="sm" shape="rounded" @click="cancelEditDescription">取消</Button>
          <Button variant="solid" size="sm" shape="rounded" :disabled="isSavingMeta" @click="saveDescription">保存</Button>
        </div>
      </div>
    </Modal>

    <Modal :open="fullGenOpen" title="一键生成全文" @close="fullGenOpen = false">
      <div class="novel-detail__modal-stack">
        <div class="novel-detail__modal-grid">
          <Input v-model="fullGenVolumes" placeholder="卷数（1-30）" />
          <Input v-model="fullGenChaptersPerVolume" placeholder="每卷章节数（1-50）" />
        </div>
        <textarea v-model="fullGenOutline" class="novel-detail__textarea" rows="6" placeholder="粘贴/输入故事线…" />
        <textarea v-model="fullGenCharacters" class="novel-detail__textarea" rows="6" placeholder="粘贴/输入人物设定…" />
        <div v-if="fullGenError" class="novel-detail__meta-error">{{ fullGenError }}</div>
        <div class="novel-detail__rename-actions">
          <Button variant="outline" size="sm" shape="rounded" @click="fullGenOpen = false">取消</Button>
          <Button variant="solid" size="sm" shape="rounded" :disabled="fullGenBusy" @click="generateFullDraft">生成</Button>
        </div>
      </div>
    </Modal>
  </div>
</template>

<style scoped>
.novel-detail__root {
  min-height: 100vh;
}

.novel-detail {
  min-height: 100vh;
  background: radial-gradient(circle at 20% 12%, rgba(196, 181, 253, 0.62) 0%, rgba(255, 255, 255, 0.96) 34%, rgba(248, 250, 252, 1) 100%);
}

.novel-detail__top {
  height: 56px;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 12px;
  padding: 0 18px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.85);
  background: rgba(255, 255, 255, 0.88);
  position: sticky;
  top: 0;
  z-index: 10;
}

.novel-detail__back {
  border: 0;
  background: transparent;
  color: color-mix(in oklab, #0b1220 65%, #ffffff);
  font-size: 14px;
  cursor: pointer;
  font-weight: 800;
}

.novel-detail__topbar {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.novel-detail__title {
  font-size: 14px;
  font-weight: 900;
  color: #0b1220;
}

.novel-detail__subtitle {
  font-size: 11px;
  color: color-mix(in oklab, #0b1220 42%, #ffffff);
}

.novel-detail__spacer {
  width: 1px;
}

.novel-detail__content {
  padding: 18px;
  max-width: 1200px;
  margin: 0 auto;
}

.novel-detail__alert {
  margin: 14px 0;
  padding: 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(226, 232, 240, 0.95);
}

.novel-detail__alert--error {
  border-color: rgba(244, 63, 94, 0.35);
  background: rgba(255, 228, 230, 0.55);
  color: rgba(159, 18, 57, 0.95);
}

.novel-detail__hero {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 18px;
  align-items: stretch;
  margin-bottom: 18px;
}

@media (max-width: 860px) {
  .novel-detail__hero {
    grid-template-columns: 1fr;
  }
}

.novel-detail__cover {
  height: 200px;
  border-radius: 16px;
  border: 1px solid rgba(226, 232, 240, 0.95);
  background: rgba(255, 255, 255, 0.9);
  overflow: hidden;
  position: relative;
}

.novel-detail__cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.novel-detail__cover-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: linear-gradient(160deg, rgba(237, 233, 254, 0.65), rgba(224, 231, 255, 0.65));
}

.novel-detail__cover-mark {
  width: 52px;
  height: 52px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  font-weight: 900;
  color: #5b21b6;
  background: rgba(255, 255, 255, 0.85);
  border: 1px solid rgba(124, 58, 237, 0.18);
}

.novel-detail__cover-text {
  font-size: 12px;
  color: color-mix(in oklab, #0b1220 56%, #fff);
  font-weight: 700;
}

.novel-detail__hero-body {
  border-radius: 16px;
  border: 1px solid rgba(226, 232, 240, 0.95);
  background: rgba(255, 255, 255, 0.92);
  padding: 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.novel-detail__hero-title {
  font-size: 20px;
  font-weight: 950;
  color: #0b1220;
  line-height: 1.3;
}

.novel-detail__hero-meta {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 12px;
  color: color-mix(in oklab, #0b1220 52%, #ffffff);
}

.novel-detail__hero-desc {
  font-size: 13px;
  line-height: 1.8;
  color: color-mix(in oklab, #0b1220 66%, #ffffff);
}

.novel-detail__hero-desc--muted {
  color: color-mix(in oklab, #0b1220 46%, #ffffff);
}

.novel-detail__hero-actions {
  margin-top: auto;
  display: flex;
  justify-content: flex-start;
  gap: 12px;
}

.novel-detail__grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
  align-items: start;
}

.novel-detail__panel {
  border-radius: 16px;
  border: 1px solid rgba(226, 232, 240, 0.95);
  background: rgba(255, 255, 255, 0.92);
  padding: 14px 14px;
}
.novel-detail__panel--nested {
  margin-left: clamp(8px, 2vw, 20px);
  border-left: 3px solid rgba(139, 92, 246, 0.38);
}

.novel-detail__panel-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.novel-detail__panel-title {
  font-size: 14px;
  font-weight: 950;
  color: #0b1220;
}

.novel-detail__panel-sub {
  font-size: 12px;
  font-weight: 800;
  color: color-mix(in oklab, #0b1220 42%, #ffffff);
}

.novel-detail__add-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  align-items: center;
  margin-bottom: 12px;
}

.novel-detail__list {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

.novel-detail__item {
  padding: 12px 12px;
}

.novel-detail__item.is-active {
  border-color: rgba(124, 58, 237, 0.75);
  box-shadow: 0 10px 24px rgba(124, 58, 237, 0.16);
}

.novel-detail__item-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.novel-detail__item-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.novel-detail__item-title {
  font-size: 13px;
  font-weight: 950;
  color: color-mix(in oklab, #0b1220 70%, #fff);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.novel-detail__empty {
  padding: 14px;
  border-radius: 14px;
  border: 1px dashed rgba(226, 232, 240, 0.95);
  background: rgba(255, 255, 255, 0.7);
  color: color-mix(in oklab, #0b1220 48%, #ffffff);
  font-size: 13px;
  font-weight: 800;
}

.novel-detail__rename {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 2px;
}

.novel-detail__rename-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}

.novel-detail__modal-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 2px;
}

.novel-detail__modal-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

@media (max-width: 720px) {
  .novel-detail__modal-grid {
    grid-template-columns: 1fr;
  }
}

.novel-detail__textarea {
  width: 100%;
  border: 1px solid rgba(226, 232, 240, 0.95);
  border-radius: 12px;
  padding: 10px 12px;
  font-size: 13px;
  line-height: 1.6;
  outline: none;
  background: rgba(255, 255, 255, 0.92);
  resize: vertical;
}

.novel-detail__meta-error {
  font-size: 12px;
  color: rgba(159, 18, 57, 0.95);
}

.novel-detail__editable {
  cursor: text;
}

.novel-detail__editable:hover {
  text-decoration: underline;
  text-decoration-color: rgba(124, 58, 237, 0.35);
}

.novel-detail__cover-edit {
  position: absolute;
  right: 10px;
  bottom: 10px;
  border: 1px solid rgba(226, 232, 240, 0.95);
  background: rgba(255, 255, 255, 0.92);
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  color: color-mix(in oklab, #0b1220 58%, #ffffff);
}

.novel-detail__cover-edit:hover {
  border-color: rgba(124, 58, 237, 0.35);
  background: rgba(237, 233, 254, 0.25);
}
</style>

