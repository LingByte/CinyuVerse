<script setup lang="ts">
import Button from '@/components/Button.vue'
import Card from '@/components/Card.vue'
import Empty from '@/components/base/Empty.vue'
import Input from '@/components/Input.vue'
import Modal from '@/components/feedback/Modal.vue'
import NovelManageSidebar from '@/components/NovelManageSidebar.vue'
import Pagination from '@/components/navigation/Pagination.vue'
import Search from '@/components/business/Search.vue'
import Spin from '@/components/base/Spin.vue'
import Tag from '@/components/base/Tag.vue'
import Textarea from '@/components/Textarea.vue'
import novelsApi from '@/api/novels'
import { computed, onMounted, reactive, ref, watch } from 'vue'

const emit = defineEmits<{
  (e: 'back'): void
  (e: 'openNovel', id: number): void
}>()

const loadSidebarHidden = (): boolean => {
  const v = window.localStorage.getItem('hotTemplate_sidebarHidden')
  return v === '1'
}

const sidebarHidden = ref(loadSidebarHidden())
watch(sidebarHidden, (v) => window.localStorage.setItem('hotTemplate_sidebarHidden', v ? '1' : '0'))

const toggleHidden = () => {
  sidebarHidden.value = !sidebarHidden.value
}

const sidebarFeatures = [{ id: 'ai-create', label: '小说管理', active: true, disabled: true }]

type NovelItem = {
  id: number
  title: string
  authorId: number
  status: string
  genre: string
  audience: string
  theme: string
  description: string
  worldSetting: string
  tags: string
  coverImage: string
  styleGuide: string
  referenceNovel: string
  createdAt: string
  updatedAt: string
  createBy: string
  updateBy: string
  chapterCount?: number
  totalChapters?: number
  chapters?: number
  wordCount?: number
  totalWords?: number
  words?: number
}

const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const novels = ref<NovelItem[]>([])
const isLoading = ref(false)
const loadError = ref('')


const fetchNovels = async () => {
  isLoading.value = true
  loadError.value = ''
  try {
    const res = await novelsApi.list({ page: page.value, size: pageSize.value })
    const data = res.data as unknown as { novels?: NovelItem[]; total?: number; page?: number; size?: number }
    novels.value = data.novels ?? []
    total.value = Number(data.total ?? 0)
  } catch (e: unknown) {
    loadError.value = (e as { msg?: string })?.msg || '加载失败'
    novels.value = []
    total.value = 0
  } finally {
    isLoading.value = false
  }
}

watch([page, pageSize], () => {
  void fetchNovels()
})

onMounted(() => {
  void fetchNovels()
})

const openModal = ref(false)
const modalMode = ref<'create' | 'edit'>('create')
const activeId = ref<number | null>(null)
const saving = ref(false)
const saveError = ref('')

const modalForm = reactive({
  title: '',
  authorId: 1,
  status: 'draft',
  genre: '',
  audience: 'male',
  theme: '',
  tags: '',
  description: '',
  worldSetting: '',
  coverImage: '',
  styleGuide: '',
  referenceNovel: '',
})

const genreSearch = ref('')
const listSearch = ref('')

const genrePresets = [
  '都市',
  '言情',
  '玄幻',
  '奇幻',
  '武侠',
  '仙侠',
  '科幻',
  '悬疑',
  '推理',
  '恐怖/惊悚',
  '历史',
  '架空历史',
  '军事',
  '游戏',
  '体育',
]

const filteredGenres = computed(() => {
  const q = genreSearch.value.trim()
  if (!q) return genrePresets
  return genrePresets.filter((g) => g.includes(q))
})

const filteredNovels = computed(() => {
  const q = listSearch.value.trim()
  if (!q) return novels.value
  return novels.value.filter((n) => `${n.title} ${n.tags} ${n.genre} ${n.description}`.includes(q))
})

const modalPrimaryText = computed(() => (modalMode.value === 'create' ? '创建小说' : '保存修改'))

watch(
  () => modalForm.description,
  (v) => {
    if (v.length > 300) modalForm.description = v.slice(0, 300)
  },
)

const tagSuggestions = ['甜宠', '虐文', '爽文', '系统', '重生', '穿越', '无限', '群像']
const selectedGenres = ref<string[]>([])

const parseGenres = (value: string) =>
  (value || '')
    .split(/[、,，/|]/)
    .map((s) => s.trim())
    .filter(Boolean)

const syncGenreField = () => {
  modalForm.genre = selectedGenres.value.join('、')
}

const appendTag = (t: string) => {
  const tag = t.trim()
  if (!tag) return
  const cur = modalForm.tags.trim()
  if (!cur) {
    modalForm.tags = tag
    return
  }
  const parts = cur
    .split(/[、,，\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (parts.includes(tag)) return
  modalForm.tags = `${cur}、${tag}`
}

const toggleGenre = (g: string) => {
  if (selectedGenres.value.includes(g)) {
    selectedGenres.value = selectedGenres.value.filter((x) => x !== g)
  } else {
    selectedGenres.value = [...selectedGenres.value, g]
  }
  syncGenreField()
}

const resetModalForm = () => {
  saveError.value = ''
  genreSearch.value = ''
  modalForm.title = ''
  modalForm.authorId = 1
  modalForm.status = 'draft'
  modalForm.genre = ''
  selectedGenres.value = []
  modalForm.audience = 'male'
  modalForm.theme = ''
  modalForm.tags = ''
  modalForm.description = ''
  modalForm.worldSetting = ''
  modalForm.coverImage = ''
  modalForm.styleGuide = ''
  modalForm.referenceNovel = ''
}

const openCreate = () => {
  modalMode.value = 'create'
  activeId.value = null
  resetModalForm()
  openModal.value = true
}

const openEdit = (n: NovelItem) => {
  modalMode.value = 'edit'
  activeId.value = n.id
  saveError.value = ''
  genreSearch.value = ''
  modalForm.title = n.title ?? ''
  modalForm.authorId = n.authorId ?? 1
  modalForm.status = n.status ?? 'draft'
  selectedGenres.value = parseGenres(n.genre ?? '')
  modalForm.genre = selectedGenres.value.join('、')
  modalForm.audience = n.audience ?? 'male'
  modalForm.theme = n.theme ?? ''
  modalForm.tags = n.tags ?? ''
  modalForm.description = n.description ?? ''
  modalForm.worldSetting = n.worldSetting ?? ''
  modalForm.coverImage = n.coverImage ?? ''
  modalForm.styleGuide = n.styleGuide ?? ''
  modalForm.referenceNovel = n.referenceNovel ?? ''
  openModal.value = true
}

const closeModal = () => {
  if (saving.value) return
  openModal.value = false
}

const submitModal = async () => {
  if (saving.value) return
  saveError.value = ''
  const title = modalForm.title.trim()
  if (!title) {
    saveError.value = '请输入小说名称'
    return
  }

  saving.value = true
  try {
    if (modalMode.value === 'create') {
      await novelsApi.create({
        title,
        authorId: modalForm.authorId,
        status: modalForm.status,
        genre: modalForm.genre,
        audience: modalForm.audience,
        theme: modalForm.theme,
        tags: modalForm.tags,
        description: modalForm.description,
        worldSetting: modalForm.worldSetting,
        coverImage: modalForm.coverImage,
        styleGuide: modalForm.styleGuide,
        referenceNovel: modalForm.referenceNovel,
      })
    } else if (activeId.value != null) {
      await novelsApi.update(activeId.value, {
        title,
        status: modalForm.status,
        genre: modalForm.genre,
        audience: modalForm.audience,
        theme: modalForm.theme,
        tags: modalForm.tags,
        description: modalForm.description,
        worldSetting: modalForm.worldSetting,
        coverImage: modalForm.coverImage,
        styleGuide: modalForm.styleGuide,
        referenceNovel: modalForm.referenceNovel,
      })
    }
    openModal.value = false
    await fetchNovels()
  } catch (e: unknown) {
    saveError.value = (e as { msg?: string })?.msg || '保存失败'
  } finally {
    saving.value = false
  }
}

const removeNovel = async (n: NovelItem) => {
  if (saving.value) return
  const ok = window.confirm(`确认删除《${n.title}》？`)
  if (!ok) return
  saving.value = true
  try {
    await novelsApi.remove(n.id)
    await fetchNovels()
  } catch (e: unknown) {
    loadError.value = (e as { msg?: string })?.msg || '删除失败'
  } finally {
    saving.value = false
  }
}

const getCoverInitial = (title: string) => (title?.trim()?.slice(0, 1) || '书').toUpperCase()

const getTotalChapters = (n: NovelItem) => n.totalChapters ?? n.chapterCount ?? n.chapters ?? 0

const getTotalWords = (n: NovelItem) => n.totalWords ?? n.wordCount ?? n.words ?? 0

const formatWordCount = (count: number) => {
  if (!count) return '0'
  if (count >= 10000) return `${(count / 10000).toFixed(1).replace(/\.0$/, '')}万`
  return String(count)
}
</script>

<template>
  <main class="tpl" :class="{ 'is-hidden': sidebarHidden }">
    <header class="tpl__top">
      <div class="tpl__back" />
      <div class="tpl__topbar">
        <div class="tpl__topbar-title">小说管理</div>
        <div class="tpl__topbar-sub">创建 · 编辑 · 删除</div>
      </div>
      <div class="tpl__spacer" />
    </header>

    <button
      v-if="sidebarHidden"
      type="button"
      class="tpl__floating-toggle"
      aria-label="显示侧边栏"
      @click="toggleHidden"
    >
      <svg viewBox="0 0 24 24" class="tpl__floating-toggle-icon" aria-hidden="true">
        <path
          d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5zm6 0H6v14h4V5zm2 0v14h6V5h-6z"
          fill="currentColor"
        />
      </svg>
    </button>

    <section class="tpl__content">
      <NovelManageSidebar
        v-show="!sidebarHidden"
        :features="sidebarFeatures"
        hint="点击小说卡片进入小说详情，封面为空时会显示占位样式。"
        @toggle="toggleHidden"
        @back="emit('back')"
      />

      <div class="tpl__panel" role="region" aria-label="挑选爆款模版">
        <section class="tpl__main" aria-label="小说管理工具">
          <div class="tpl__nm-head">
            <div class="tpl__nm-title">小说管理工具</div>
            <div class="tpl__nm-actions">
              <Button variant="outline" size="sm" shape="rounded" @click="fetchNovels">刷新</Button>
              <Button variant="solid" size="sm" shape="rounded" @click="openCreate">创建小说</Button>
            </div>
          </div>

          <div class="tpl__nm-search">
            <Search v-model="listSearch" placeholder="搜索小说名 / 标签 / 类型" />
          </div>

          <div v-if="loadError" class="tpl__nm-alert tpl__nm-alert--error">{{ loadError }}</div>
          <div v-else-if="isLoading" class="tpl__nm-alert"><Spin>加载中...</Spin></div>

          <div v-else class="tpl__nm-list" role="list">
            <Card
              v-for="n in filteredNovels"
              :key="n.id"
              class="tpl__nm-item"
              role="listitem"
              surface="none"
              :bordered="true"
              shadow="sm"
              interactive="hover"
              tabindex="0"
              @click="emit('openNovel', n.id)"
              @keydown.enter.prevent="emit('openNovel', n.id)"
            >
              <div class="tpl__nm-cover" :class="{ 'is-placeholder': !n.coverImage }">
                <img v-if="n.coverImage" class="tpl__nm-cover-img" :src="n.coverImage" :alt="`${n.title} 封面`" />
                <div v-else class="tpl__nm-cover-fallback" aria-hidden="true">
                  <span class="tpl__nm-cover-mark">{{ getCoverInitial(n.title) }}</span>
                  <span class="tpl__nm-cover-text">暂无封面</span>
                </div>
              </div>
              <div class="tpl__nm-item-head">
                <div class="tpl__nm-item-title">{{ n.title }}</div>
                <div class="tpl__nm-item-meta">共 {{ getTotalChapters(n) }} 章 · {{ formatWordCount(getTotalWords(n)) }} 字</div>
              </div>
                <div class="tpl__nm-item-tags-inline">
                  <Tag variant="soft">{{ n.genre || '未分类' }}</Tag>
                </div>
              <div class="tpl__nm-item-desc" :class="{ 'is-empty': !n.description }">
                {{ n.description || ' ' }}
              </div>
              <div class="tpl__nm-item-foot">
                <div class="tpl__nm-item-tags">{{ n.tags }}</div>
                <div class="tpl__nm-item-actions">
                  <Button variant="outline" size="sm" shape="rounded" @click.stop="openEdit(n)">编辑</Button>
                  <Button variant="outline" size="sm" shape="rounded" color="orange" @click.stop="removeNovel(n)">删除</Button>
                </div>
              </div>
            </Card>

            <div v-if="!filteredNovels.length" class="tpl__nm-empty">
              <Empty title="暂无小说" description="点击右上角“创建小说”开始第一部作品" />
            </div>
          </div>

          <div class="tpl__nm-pager">
            <Pagination :page="page" :page-size="pageSize" :total="total" @update:page="page = $event" />
          </div>
        </section>
      </div>
    </section>

    <Modal :open="openModal" :title="modalMode === 'create' ? '创建小说' : '编辑小说'" @close="closeModal">
      <div class="tpl__modal-panel">
        <div class="tpl__modal-head">
          <div class="tpl__modal-title">{{ modalMode === 'create' ? '创建小说' : '编辑小说' }}</div>
          <button type="button" class="tpl__modal-close" aria-label="关闭" @click="closeModal">×</button>
        </div>

        <div class="tpl__modal-body">
          <div class="tpl__form-grid">
            <div class="tpl__group">
              <div class="tpl__field">
                <div class="tpl__label">小说名称:</div>
                <div class="tpl__control">
                  <Input v-model="modalForm.title" placeholder="请输入小说正文标题" />
                </div>
              </div>

              <div class="tpl__field">
                <div class="tpl__label">小说类型:</div>
                <div class="tpl__control">
                  <div class="tpl__chip-search">
                    <Input v-model="genreSearch" placeholder="搜索类型" />
                  </div>
                  <div class="tpl__chips" role="list" aria-label="类型">
                    <button
                      v-for="g in filteredGenres"
                      :key="g"
                      type="button"
                      class="tpl__chip"
                      :class="{ 'is-on': selectedGenres.includes(g) }"
                      role="listitem"
                      @click="toggleGenre(g)"
                    >
                      {{ g }}
                    </button>
                  </div>
                  <div class="tpl__selected">
                    <span class="tpl__selected-label">已选类型</span>
                    <span class="tpl__selected-text">{{ modalForm.genre || '未选择' }}</span>
                  </div>
                </div>
              </div>

              <div class="tpl__field">
                <div class="tpl__label">小说受众:</div>
                <div class="tpl__control">
                  <div class="tpl__radio-pill" role="group" aria-label="小说受众">
                    <label class="tpl__radio2" :class="{ 'is-on': modalForm.audience === 'male' }">
                      <input v-model="modalForm.audience" type="radio" value="male" />
                      男频
                    </label>
                    <label class="tpl__radio2" :class="{ 'is-on': modalForm.audience === 'female' }">
                      <input v-model="modalForm.audience" type="radio" value="female" />
                      女频
                    </label>
                  </div>
                </div>
              </div>

              <div class="tpl__field">
                <div class="tpl__label">主题:</div>
                <div class="tpl__control">
                  <Input v-model="modalForm.theme" placeholder="填写小说核心主题（如：系统流、赘婿逆袭、赛博朋克）" />
                  <div class="tpl__helper">主题：填写小说核心主题（如：系统流、赘婿逆袭、赛博朋克）</div>
                </div>
              </div>

              <div class="tpl__field">
                <div class="tpl__label">标签:</div>
                <div class="tpl__control">
                  <Input v-model="modalForm.tags" placeholder="多个标签用顿号分隔（如：系统、爽文）" />
                  <div class="tpl__chips" role="list" aria-label="标签建议">
                    <button
                      v-for="s in tagSuggestions"
                      :key="s"
                      type="button"
                      class="tpl__chip"
                      role="listitem"
                      @click="appendTag(s)"
                    >
                      {{ s }}
                    </button>
                  </div>
                </div>
              </div>

              <div class="tpl__field tpl__field--textarea">
                <div class="tpl__label">描述:</div>
                <div class="tpl__control">
                  <div class="tpl__textarea-wrap">
                    <Textarea v-model="modalForm.description" :rows="4" placeholder="一句话概括故事亮点：主角身份 + 核心冲突 + 看点" />
                    <div class="tpl__counter">{{ modalForm.description.length }}/300</div>
                  </div>
                  <div class="tpl__helper">描述：一句话概括故事亮点，建议格式：主角身份 + 核心冲突 + 看点</div>
                </div>
              </div>
            </div>

            <div v-if="saveError" class="tpl__nm-alert tpl__nm-alert--error">{{ saveError }}</div>
          </div>
        </div>

        <div class="tpl__modal-actions">
          <div class="tpl__actions">
            <Button variant="soft" size="sm" shape="pill" :disabled="saving" @click="resetModalForm">重置</Button>
            <Button variant="solid" size="sm" shape="pill" :disabled="saving" @click="submitModal">
              {{ saving ? '保存中…' : modalPrimaryText }}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  </main>
</template>

<style scoped>
.tpl {
  min-height: 100vh;
  background: radial-gradient(circle at 20% 12%, rgba(196, 181, 253, 0.62) 0%, rgba(255, 255, 255, 0.96) 34%, rgba(248, 250, 252, 1) 100%);
  display: flex;
  flex-direction: column;
}

.tpl__top {
  height: 56px;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  padding: 0 18px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.85);
  background: rgba(255, 255, 255, 0.88);
  position: relative;
  z-index: 230;
}

.tpl__back {
  justify-self: start;
  border: 0;
  background: transparent;
  color: color-mix(in oklab, #0b1220 65%, #ffffff);
  font-size: 14px;
  cursor: pointer;
}

.tpl__floating-toggle {
  position: fixed;
  left: 12px;
  top: 12px;
  width: 38px;
  height: 38px;
  border-radius: 14px;
  border: 1px solid rgba(226, 232, 240, 0.95);
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.12);
  cursor: pointer;
  z-index: 240;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #6d28d9;
}

.tpl__floating-toggle:hover {
  border-color: rgba(124, 58, 237, 0.45);
  background: rgba(237, 233, 254, 0.45);
}

.tpl__floating-toggle-icon {
  width: 18px;
  height: 18px;
}

.tpl__topbar {
  justify-self: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1.1;
  gap: 2px;
}

.tpl__topbar-title {
  font-size: 14px;
  font-weight: 900;
  color: #0b1220;
  letter-spacing: 0.2px;
}

.tpl__topbar-sub {
  font-size: 11px;
  color: color-mix(in oklab, #0b1220 42%, #ffffff);
}

.tpl__spacer {
  justify-self: end;
}

.tpl__content {
  flex: 1;
  display: flex;
  align-items: stretch;
  justify-content: stretch;
  padding: 0;
}

.tpl__panel {
  width: 100%;
  height: calc(100vh - 56px);
  border-radius: 0;
  background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
  box-shadow: none;
  border: 0;
  display: grid;
  grid-template-columns: 1fr;
  overflow: hidden;
  margin-left: 240px;
  width: calc(100% - 240px);
  transition: margin-left 260ms ease, width 260ms ease;
}

.tpl.is-hidden .tpl__panel {
  margin-left: 0;
  width: 100%;
}

.tpl__left {
  border-right: 1px solid rgba(226, 232, 240, 0.9);
  padding: 14px 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: rgba(255, 255, 255, 0.92);
  position: fixed;
  left: 0;
  top: 0;
  height: 100vh;
  width: 240px;
  z-index: 240;
  overflow: auto;
  box-shadow: 0 28px 70px rgba(15, 23, 42, 0.18);
}

.tpl__main {
  padding: 20px 22px;
  overflow: auto;
  padding-bottom: 120px;
}

.tpl__nm-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.tpl__nm-title {
  font-size: 14px;
  font-weight: 900;
  color: #0b1220;
}

.tpl__nm-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.tpl__nm-search {
  margin-top: 14px;
}

.tpl__nm-alert {
  margin-top: 14px;
  padding: 12px 12px;
  border-radius: 14px;
  border: 1px solid rgba(226, 232, 240, 0.95);
  background: rgba(255, 255, 255, 0.92);
  color: color-mix(in oklab, #0b1220 70%, #ffffff);
  font-size: 13px;
}

.tpl__nm-alert--error {
  border-color: rgba(244, 63, 94, 0.35);
  background: rgba(255, 228, 230, 0.55);
  color: rgba(159, 18, 57, 0.95);
}

.tpl__nm-list {
  margin-top: 14px;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  justify-content: center;
}

@media (max-width: 1024px) {
  .tpl__nm-list {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 768px) {
  .tpl__nm-list {
    grid-template-columns: repeat(2, 1fr);
  }
}

.tpl__nm-item {
  width: 100%;
  height: 290px;
  padding: 16px;
  border-radius: 16px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(255, 255, 255, 0.93));
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-shadow: 0 14px 32px -24px rgba(15, 23, 42, 0.28);
  transition: box-shadow 180ms ease, transform 180ms ease;
}

.tpl__nm-item:hover {
  box-shadow: 0 20px 40px -24px rgba(79, 70, 229, 0.26);
}

.tpl__nm-cover {
  height: 112px;
  border-radius: 12px;
  border: 1px solid color-mix(in oklab, #e2e8f0 88%, #fff);
  background: #fff;
  overflow: hidden;
  flex: 0 0 auto;
}

.tpl__nm-cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.tpl__nm-cover-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 6px;
  background: linear-gradient(160deg, rgba(237, 233, 254, 0.65), rgba(224, 231, 255, 0.65));
}

.tpl__nm-cover-mark {
  width: 34px;
  height: 34px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 800;
  color: #5b21b6;
  background: rgba(255, 255, 255, 0.85);
  border: 1px solid rgba(124, 58, 237, 0.18);
}

.tpl__nm-cover-text {
  font-size: 12px;
  color: color-mix(in oklab, #0b1220 56%, #fff);
}

.tpl__nm-item-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.tpl__nm-item-title {
  min-width: 0;
  font-size: 14px;
  font-weight: 800;
  color: #0b1220;
  line-height: 1.45;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tpl__nm-item-meta {
  flex-shrink: 0;
  font-size: 12px;
  color: color-mix(in oklab, #0b1220 48%, #ffffff);
  line-height: 1.5;
}

.tpl__nm-item-desc {
  font-size: 13px;
  color: color-mix(in oklab, #0b1220 66%, #ffffff);
  line-height: 1.7;
  flex: 1;
  min-height: 1.7em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tpl__nm-item-desc.is-empty {
  color: transparent;
}

.tpl__nm-item-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex: 0 0 auto;
  margin-top: auto;
  padding-top: 10px;
  border-top: 1px solid color-mix(in oklab, #e2e8f0 88%, #fff);
}

.tpl__nm-item-tags {
  font-size: 12px;
  color: color-mix(in oklab, #0b1220 54%, #ffffff);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tpl__nm-item-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.tpl__nm-empty {
  margin-top: 12px;
  padding: 18px 14px;
  border-radius: 14px;
  border: 1px dashed rgba(226, 232, 240, 0.95);
  background: rgba(255, 255, 255, 0.7);
  color: color-mix(in oklab, #0b1220 48%, #ffffff);
  font-size: 13px;
}

.tpl__nm-pager {
  margin-top: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 220;
  padding: 10px 12px;
  border-radius: 999px;
  border: 1px solid rgba(226, 232, 240, 0.95);
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(4px);
}

.tpl__modal {
  position: fixed;
  inset: 0;
  z-index: 300;
}

.tpl__modal-mask {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.35);
  backdrop-filter: blur(3px);
}

.tpl__modal-panel {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: min(860px, calc(100vw - 28px));
  max-height: calc(100vh - 28px);
  overflow: auto;
  border-radius: 16px;
  border: 1px solid rgba(226, 232, 240, 0.95);
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 32px 80px rgba(15, 23, 42, 0.22);
}

.tpl__modal-head {
  padding: 14px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.85);
}

.tpl__modal-title {
  font-size: 14px;
  font-weight: 900;
  color: #0b1220;
}

.tpl__modal-close {
  width: 34px;
  height: 34px;
  border-radius: 12px;
  border: 1px solid rgba(226, 232, 240, 0.95);
  background: rgba(255, 255, 255, 0.92);
  cursor: pointer;
  color: color-mix(in oklab, #0b1220 55%, #ffffff);
}

.tpl__modal-body {
  padding: 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.tpl__modal-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.tpl__modal-actions {
  padding: 14px 16px;
  border-top: 1px solid rgba(226, 232, 240, 0.85);
  display: block;
}

.tpl__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

@media (max-width: 820px) {
  .tpl__modal-grid {
    grid-template-columns: 1fr;
  }
}


.tpl__tab {
  display: grid;
  grid-template-columns: 1fr 1fr;
  background: rgba(241, 245, 249, 0.8);
  border: 1px solid rgba(226, 232, 240, 0.9);
  border-radius: 8px;
  padding: 4px;
  gap: 6px;
}

.tpl__tab--sub {
  grid-template-columns: 1fr 1fr;
}

.tpl__tab-btn {
  border: 0;
  background: transparent;
  border-radius: 7px;
  padding: 8px 6px;
  cursor: pointer;
  font-size: 13px;
  color: color-mix(in oklab, #0b1220 65%, #ffffff);
  font-weight: 700;
}

.tpl__tab-btn--sub {
  font-weight: 700;
}

.tpl__tab-btn.is-active {
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 0 6px 16px rgba(15, 23, 42, 0.08);
  color: #6d28d9;
}

.tpl__hint {
  display: none;
}

.tpl__mid {
  padding: 14px 14px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.tpl__mid-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.tpl__list {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding-right: 6px;
  display: grid;
  grid-template-columns: 1fr;
  grid-template-rows: repeat(4, minmax(0, 1fr));
  gap: 20px;
  align-content: stretch;
}

.tpl__card {
  text-align: left;
  border: 1px solid rgba(226, 232, 240, 0.95);
  background: rgba(255, 255, 255, 0.96);
  border-radius: 14px;
  padding: 18px 18px 16px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 12px;
  transition: border-color 180ms ease, box-shadow 180ms ease;
}

.tpl__card.is-active {
  border-color: rgba(124, 58, 237, 0.75);
  box-shadow: 0 10px 24px rgba(124, 58, 237, 0.16);
}

.tpl__card.is-used {
  border-color: rgba(124, 58, 237, 0.38);
}

.tpl__card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.tpl__card-title {
  font-size: 16px;
  font-weight: 800;
  color: color-mix(in oklab, #0b1220 70%, #ffffff);
}

.tpl__card-stats {
  display: flex;
  gap: 10px;
  font-size: 13px;
  color: color-mix(in oklab, #0b1220 45%, #ffffff);
}

.tpl__stat {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.tpl__card-brief {
  font-size: 13px;
  line-height: 1.7;
  color: color-mix(in oklab, #0b1220 55%, #ffffff);
}

.tpl__card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tpl__tag {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(241, 245, 249, 0.9);
  border: 1px solid rgba(226, 232, 240, 0.9);
  color: color-mix(in oklab, #0b1220 55%, #ffffff);
}

.tpl__card-footer {
  margin-top: auto;
  display: flex;
  justify-content: flex-end;
}

.tpl__card-chip {
  font-size: 12px;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(226, 232, 240, 0.6);
  color: color-mix(in oklab, #0b1220 50%, #ffffff);
}

.tpl__card-use {
  font-size: 12px;
  padding: 8px 14px;
  border-radius: 999px;
  border: 1px solid rgba(124, 58, 237, 0.55);
  background: rgba(237, 233, 254, 0.95);
  color: #5b21b6;
  cursor: pointer;
  font-weight: 800;
}

.tpl__card-use:hover {
  border-color: rgba(124, 58, 237, 0.75);
  background: rgba(237, 233, 254, 1);
}

.tpl__pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding-top: 2px;
}

.tpl__pager-btn {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  border: 1px solid rgba(226, 232, 240, 0.95);
  background: rgba(255, 255, 255, 0.95);
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  color: color-mix(in oklab, #0b1220 65%, #ffffff);
}

.tpl__pager-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.tpl__pager-num {
  font-size: 12px;
  color: color-mix(in oklab, #0b1220 52%, #ffffff);
}

.tpl__right {
  border-left: 1px solid rgba(226, 232, 240, 0.9);
  padding: 26px 26px 30px;
  overflow: auto;
  display: block;
  background: rgba(255, 255, 255, 0.92);
}

.tpl__config-card {
  position: relative;
  width: 100%;
  max-width: 880px;
  margin: 0 auto;
  background: transparent;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  padding: 10px 6px 0;
  overflow: visible;
}

.tpl__config-card::before {
  content: none;
}

.tpl__form-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-top: 2px;
}

.tpl__form-title {
  font-size: 16px;
  font-weight: 900;
  color: color-mix(in oklab, #0b1220 70%, #ffffff);
  margin-bottom: 0;
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.tpl__form-sub {
  margin-top: 8px;
  margin-bottom: 30px;
  font-size: 12px;
  line-height: 1.5;
  color: color-mix(in oklab, #0b1220 46%, #ffffff);
}

.tpl__form-title-icon {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: rgba(237, 233, 254, 0.9);
  border: 1px solid rgba(124, 58, 237, 0.2);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
}

.tpl__form-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 30px;
}

.tpl__group {
  display: flex;
  flex-direction: column;
  gap: 30px;
}

.tpl__clear {
  width: fit-content;
  border: 1px solid rgba(226, 232, 240, 0.95);
  background: rgba(255, 255, 255, 0.9);
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
  color: color-mix(in oklab, #0b1220 58%, #ffffff);
  transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
}

.tpl__clear:hover {
  border-color: rgba(124, 58, 237, 0.35);
  background: rgba(237, 233, 254, 0.5);
}

.tpl__field {
  display: grid;
  grid-template-columns: 84px 1fr;
  align-items: start;
  gap: 14px;
}

.tpl__field--textarea {
  align-items: start;
}

.tpl__label {
  font-size: 12px;
  color: color-mix(in oklab, #0b1220 62%, #ffffff);
  line-height: 32px;
  font-weight: 700;
}

.tpl__control {
  min-width: 0;
}

.tpl__helper {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.4;
  color: color-mix(in oklab, #0b1220 45%, #ffffff);
}

.tpl__tag-suggestions {
  margin-top: 12px;
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

.tpl__tag-suggestion {
  text-align: left;
  border: 1px solid rgba(226, 232, 240, 0.95);
  background: rgba(241, 245, 249, 0.75);
  border-radius: 12px;
  padding: 10px 12px;
  cursor: pointer;
  transition: border-color 160ms ease, background 160ms ease, transform 160ms ease;
}

.tpl__tag-suggestion:hover {
  border-color: rgba(124, 58, 237, 0.35);
  background: rgba(237, 233, 254, 0.28);
  transform: translateY(-1px);
}

.tpl__tag-suggestion-label {
  display: inline-block;
  font-size: 12px;
  font-weight: 900;
  color: color-mix(in oklab, #0b1220 66%, #ffffff);
  margin-right: 6px;
}

.tpl__tag-suggestion-desc {
  display: inline;
  font-size: 12px;
  color: color-mix(in oklab, #0b1220 46%, #ffffff);
}

.tpl__textarea-wrap {
  position: relative;
}

.tpl__counter {
  position: absolute;
  right: 10px;
  bottom: 10px;
  font-size: 12px;
  color: color-mix(in oklab, #0b1220 45%, #ffffff);
  background: rgba(255, 255, 255, 0.9);
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid rgba(226, 232, 240, 0.9);
}

.tpl__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 10px;
}

.tpl__chip {
  border: 1px solid rgba(226, 232, 240, 0.95);
  background: rgba(241, 245, 249, 0.9);
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
  color: color-mix(in oklab, #0b1220 60%, #ffffff);
  transition: border-color 160ms ease, background 160ms ease, transform 160ms ease;
}

.tpl__chip:hover {
  border-color: rgba(124, 58, 237, 0.35);
  background: rgba(237, 233, 254, 0.35);
  transform: translateY(-1px);
}

.tpl__chip.is-on {
  border-color: rgba(124, 58, 237, 0.75);
  background: rgba(124, 58, 237, 0.92);
  color: #ffffff;
}

.tpl__chip-search {
  display: flex;
}

.tpl__selected {
  margin-top: 10px;
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(237, 233, 254, 0.55);
  border: 1px solid rgba(124, 58, 237, 0.18);
}

.tpl__selected-label {
  font-size: 12px;
  font-weight: 800;
  color: #5b21b6;
  flex: 0 0 auto;
}

.tpl__selected-text {
  font-size: 12px;
  color: color-mix(in oklab, #0b1220 58%, #ffffff);
  word-break: break-word;
}

.tpl__radio-pill {
  display: inline-flex;
  padding: 4px;
  border-radius: 999px;
  background: rgba(241, 245, 249, 0.9);
  border: 1px solid rgba(226, 232, 240, 0.95);
  gap: 6px;
}

.tpl__radio2 {
  display: inline-flex;
  position: relative;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: color-mix(in oklab, #0b1220 60%, #ffffff);
  padding: 6px 10px;
  border-radius: 999px;
  cursor: pointer;
}

.tpl__radio2 input {
  margin: 0;
  width: 0;
  height: 0;
  opacity: 0;
  position: absolute;
}

.tpl__radio2.is-on {
  background: rgba(124, 58, 237, 0.92);
  color: #ffffff;
}

.tpl__result {
  margin-top: 30px;
  padding: 14px 14px;
  border-radius: 14px;
  border: 1px solid rgba(226, 232, 240, 0.95);
  background: rgba(255, 255, 255, 0.92);
  color: color-mix(in oklab, #0b1220 70%, #ffffff);
  font-size: 13px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

.tpl__result--error {
  border-color: rgba(244, 63, 94, 0.35);
  background: rgba(255, 228, 230, 0.55);
  color: rgba(159, 18, 57, 0.95);
}

@media (max-width: 1100px) {
  .tpl__form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
