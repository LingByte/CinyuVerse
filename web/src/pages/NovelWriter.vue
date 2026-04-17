<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Avatar from '@/components/Avatar.vue'
import Button from '@/components/Button.vue'
import CodeEditor from '@/components/CodeEditor.vue'
import Input from '@/components/Input.vue'
import Modal from '@/components/feedback/Modal.vue'
import Select from '@/components/Select.vue'
import Textarea from '@/components/Textarea.vue'
import novelsApi, { type Novel } from '@/api/novels'
import { createNovelChapter, getNovelChapterMarkdown, loadNovelDraftState, updateNovelChapterMarkdown } from '@/utils/novelDraftStorage'

type FeatureKey = 'outline' | 'characters' | 'ideas' | 'ai'

const props = defineProps<{
  novelId: number | string
  volumeId: string
  chapterId: string
}>()

const emit = defineEmits<{
  (e: 'back'): void
}>()

const sidebarHidden = ref(window.localStorage.getItem('novelWriter_sidebarHidden') === '1')
watch(sidebarHidden, (v) => window.localStorage.setItem('novelWriter_sidebarHidden', v ? '1' : '0'))
const toggleHidden = () => {
  sidebarHidden.value = !sidebarHidden.value
}

const novel = ref<Novel | null>(null)
const headerError = ref('')
const saveMessage = ref('')

const volumeTitle = ref('')
const chapterTitle = ref('')
const currentVolumeId = ref(props.volumeId)
const currentChapterId = ref(props.chapterId)
const draftState = ref(loadNovelDraftState(props.novelId))
const genrePresets = ['都市', '言情', '玄幻', '奇幻', '武侠', '仙侠', '科幻', '悬疑', '推理', '恐怖/惊悚', '历史', '架空历史', '军事', '游戏', '体育']

const refreshTitles = () => {
  draftState.value = loadNovelDraftState(props.novelId)
  volumeTitle.value = draftState.value.volumes.find((v) => v.id === currentVolumeId.value)?.title ?? ''
  chapterTitle.value = draftState.value.chapters.find((c) => c.id === currentChapterId.value)?.title ?? ''
}

const parseGenres = (value: string) =>
  (value || '')
    .split(/[、,，/|]/)
    .map((x) => x.trim())
    .filter(Boolean)

const syncAiGenreFromNovel = () => {
  aiGenres.value = parseGenres(novel.value?.genre?.trim() || '')
}

const volumeOptions = computed(() =>
  draftState.value.volumes.map((v) => ({
    label: v.title,
    value: v.id,
  })),
)

const chapterOptions = computed(() =>
  draftState.value.chapters
    .filter((c) => c.volumeId === currentVolumeId.value)
    .map((c) => ({
      label: c.title,
      value: c.id,
    })),
)

const persistCurrentChapter = () => {
  if (!currentChapterId.value) return
  updateNovelChapterMarkdown(props.novelId, currentChapterId.value, markdownValue.value)
}

const loadCurrentChapter = () => {
  refreshTitles()
  markdownValue.value = currentChapterId.value ? getNovelChapterMarkdown(props.novelId, currentChapterId.value) : ''
}

const onVolumeChange = (volumeId: string) => {
  persistCurrentChapter()
  currentVolumeId.value = volumeId
  refreshTitles()

  const chaptersOfVolume = draftState.value.chapters.filter((c) => c.volumeId === volumeId)
  if (!chaptersOfVolume.length) {
    const ch = createNovelChapter(props.novelId, volumeId, '第一章')
    currentChapterId.value = ch.id
  } else {
    currentChapterId.value = chaptersOfVolume[0].id
  }

  loadCurrentChapter()
}

const onChapterChange = (chapterId: string) => {
  persistCurrentChapter()
  currentChapterId.value = chapterId
  loadCurrentChapter()
}

const saveNow = () => {
  persistCurrentChapter()
  saveMessage.value = '已保存'
  window.setTimeout(() => {
    saveMessage.value = ''
  }, 1200)
}

onMounted(async () => {
  headerError.value = ''
  try {
    const res = await novelsApi.getOne<Novel>(props.novelId)
    novel.value = res.data as unknown as Novel
    syncAiGenreFromNovel()
  } catch (e: unknown) {
    headerError.value = (e as { msg?: string })?.msg || '加载小说失败'
    novel.value = null
    syncAiGenreFromNovel()
  }

  refreshTitles()
  await fetchCreatedNovels()

  selectedNovelId.value = String(props.novelId)
  loadCurrentChapter()
})

watch(
  () => props.novelId,
  async () => {
    headerError.value = ''
    try {
      const res = await novelsApi.getOne<Novel>(props.novelId)
      novel.value = res.data as unknown as Novel
      syncAiGenreFromNovel()
    } catch (e: unknown) {
      headerError.value = (e as { msg?: string })?.msg || '加载小说失败'
      novel.value = null
      syncAiGenreFromNovel()
    }
    selectedNovelId.value = String(props.novelId)
    refreshTitles()
    loadCurrentChapter()
  },
)

watch(
  () => [props.novelId, props.volumeId, props.chapterId],
  async () => {
    currentVolumeId.value = props.volumeId
    currentChapterId.value = props.chapterId
    refreshTitles()
    loadCurrentChapter()
  },
)

const featureModal = ref<FeatureKey | null>(null)
const openFeature = (key: FeatureKey) => {
  featureModal.value = key
}
const closeFeature = () => {
  featureModal.value = null
}

const markdownValue = ref('')

const appendMarkdown = (text: string) => {
  const t = (text ?? '').trim()
  if (!t) return
  const cur = markdownValue.value.trim()
  markdownValue.value = cur ? `${cur}\n\n${t}` : t
}

const openAiWithContext = (source: string, text: string) => {
  const payload = text.trim()
  if (!payload) return
  const block = `【${source}】\n${payload}`
  aiPrompt.value = aiPrompt.value.trim() ? `${aiPrompt.value.trim()}\n\n${block}` : block
  featureModal.value = 'ai'
}

// ---------- Sidebar feature: outline ----------
const createdNovels = ref<Novel[]>([])
const selectedNovelId = ref<string>(window.localStorage.getItem('novelWriter_selectedNovelId') || '')

const fetchCreatedNovels = async () => {
  try {
    const res = await novelsApi.list({ page: 1, size: 100 })
    const data = res.data as unknown as { novels?: Novel[] }
    createdNovels.value = data.novels ?? []
  } catch {
    createdNovels.value = []
  }
}

watch(selectedNovelId, (v) => window.localStorage.setItem('novelWriter_selectedNovelId', v))

const selectedNovel = computed(() => createdNovels.value.find((n) => String(n.id) === selectedNovelId.value) ?? null)

const novelOptions = computed(() => [
  { label: '当前小说', value: String(props.novelId) },
  ...createdNovels.value.map((n) => ({ label: `#${n.id} ${n.title}`, value: String(n.id) })),
])

const outlineText = ref<string>(window.localStorage.getItem('novelWriter_outlineText') || '')
const outlineTheme = ref<string>(window.localStorage.getItem('novelWriter_outlineTheme') || '')
const outlineHook = ref<string>(window.localStorage.getItem('novelWriter_outlineHook') || '')
const outlineTone = ref<string>(window.localStorage.getItem('novelWriter_outlineTone') || '热血成长')

watch(outlineText, (v) => window.localStorage.setItem('novelWriter_outlineText', v))
watch(outlineTheme, (v) => window.localStorage.setItem('novelWriter_outlineTheme', v))
watch(outlineHook, (v) => window.localStorage.setItem('novelWriter_outlineHook', v))
watch(outlineTone, (v) => window.localStorage.setItem('novelWriter_outlineTone', v))

const generateOutlineDraft = () => {
  const fromNovel = selectedNovel.value
  const theme = outlineTheme.value.trim() || fromNovel?.theme?.trim() || '未命名主题'
  const hook = outlineHook.value.trim() || '主角在平静生活中遭遇突发危机'
  const genre = fromNovel?.genre?.trim() || '待定类型'
  const tags = fromNovel?.tags?.trim() || '待补充标签'
  const sourceTitle = fromNovel?.title?.trim() || novel.value?.title?.trim() || '当前作品'

  outlineText.value = `【故事线草案｜${outlineTone.value}】
项目：${sourceTitle}
类型：${genre}
标签：${tags}
1. 开端：围绕“${theme}”建立世界观与人物关系。
2. 引爆点：${hook}。
3. 推进：主角为达成阶段目标，连续面对三次升级阻碍。
4. 反转：关键盟友立场变化，主角被迫重构策略。
5. 高潮：主角在核心冲突中做出代价性选择。
6. 收束：主线阶段性完成，并埋下下一卷悬念。`
}

const resetOutline = () => {
  outlineText.value = ''
}

const sendOutlineToAi = () => {
  if (!outlineText.value.trim()) generateOutlineDraft()
  aiPlot.value = outlineText.value.trim()
  openAiWithContext('故事线生成', outlineText.value)
}

// ---------- Sidebar feature: characters ----------
const characterText = ref<string>(window.localStorage.getItem('novelWriter_characterText') || '')
const characterName = ref<string>(window.localStorage.getItem('novelWriter_characterName') || '')
const characterIdentity = ref<string>(window.localStorage.getItem('novelWriter_characterIdentity') || '')
const characterGoal = ref<string>(window.localStorage.getItem('novelWriter_characterGoal') || '')
const characterWeakness = ref<string>(window.localStorage.getItem('novelWriter_characterWeakness') || '')

watch(characterText, (v) => window.localStorage.setItem('novelWriter_characterText', v))
watch(characterName, (v) => window.localStorage.setItem('novelWriter_characterName', v))
watch(characterIdentity, (v) => window.localStorage.setItem('novelWriter_characterIdentity', v))
watch(characterGoal, (v) => window.localStorage.setItem('novelWriter_characterGoal', v))
watch(characterWeakness, (v) => window.localStorage.setItem('novelWriter_characterWeakness', v))

const buildCharacterCard = () => {
  const name = characterName.value.trim() || '未命名角色'
  const identity = characterIdentity.value.trim() || '身份待补充'
  const goal = characterGoal.value.trim() || '目标待补充'
  const weakness = characterWeakness.value.trim() || '弱点待补充'

  characterText.value = `【人物设定卡】
姓名：${name}
身份：${identity}
核心目标：${goal}
性格弱点：${weakness}
成长弧线：在关键事件中从“逃避”走向“承担”。`
}

const resetCharacter = () => {
  characterText.value = ''
  characterName.value = ''
  characterIdentity.value = ''
  characterGoal.value = ''
  characterWeakness.value = ''
}

const sendCharacterToAi = () => {
  if (!characterText.value.trim()) buildCharacterCard()
  aiCharacters.value = characterText.value.trim()
  openAiWithContext('人物设定', characterText.value)
}

// ---------- Sidebar feature: ideas ----------
const ideaLibrary = ref<string[]>(
  (() => {
    const raw = window.localStorage.getItem('novelWriter_ideaLibrary')
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw) as string[]
      return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : []
    } catch {
      return []
    }
  })(),
)
watch(
  ideaLibrary,
  (v) => window.localStorage.setItem('novelWriter_ideaLibrary', JSON.stringify(v)),
  { deep: true },
)

const ideaInput = ref<string>('')
const ideasText = ref<string>(window.localStorage.getItem('novelWriter_ideasText') || '')
watch(ideasText, (v) => window.localStorage.setItem('novelWriter_ideasText', v))

const addIdea = () => {
  const value = ideaInput.value.trim()
  if (!value) return
  if (!ideaLibrary.value.includes(value)) ideaLibrary.value.unshift(value)
  ideaInput.value = ''
}

const removeIdea = (item: string) => {
  ideaLibrary.value = ideaLibrary.value.filter((x) => x !== item)
}

const useIdea = (item: string) => {
  ideasText.value = item
  appendMarkdown(item)
}

const resetIdeas = () => {
  ideasText.value = ''
}

const generateIdeasFromAi = () => {
  const genre = aiGenreText.value || novel.value?.genre?.trim() || '通用类型'
  const plot = aiPlot.value.trim() || outlineText.value.trim() || '主线待补充'
  const prompt = aiPrompt.value.trim() || '多给反转与金句'

  ideasText.value = `【素材库、灵感｜AI生成】
- 类型氛围：${genre}
- 场景灵感：在“${plot}”中加入一次高压对峙
- 台词灵感：给主角一句体现立场转变的关键台词
- 反转灵感：让看似盟友的角色在中段动摇
- 节奏提示：${prompt}`
}

const sendIdeasToAi = () => {
  openAiWithContext('素材库、灵感', ideasText.value)
}

// ---------- Sidebar feature: ai writing ----------
const aiPlot = ref<string>(window.localStorage.getItem('novelWriter_aiPlot') || '')
const aiCharacters = ref<string>(window.localStorage.getItem('novelWriter_aiCharacters') || '')
const aiIdeas = ref<string>(window.localStorage.getItem('novelWriter_aiIdeas') || '')
const aiGenres = ref<string[]>(
  (() => {
    const raw = window.localStorage.getItem('novelWriter_aiGenres')
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as string[]
        if (Array.isArray(parsed)) return parsed.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim())
      } catch {
        // ignore parse failure
      }
    }
    return parseGenres(window.localStorage.getItem('novelWriter_aiGenre') || '')
  })(),
)
const aiGenreSearch = ref('')
const aiPrompt = ref<string>(window.localStorage.getItem('novelWriter_aiPrompt') || '')
const aiDraft = ref<string>(window.localStorage.getItem('novelWriter_aiDraft') || '')
const aiGenreText = computed(() => aiGenres.value.join('、'))
const filteredAiGenres = computed(() => {
  const q = aiGenreSearch.value.trim()
  if (!q) return genrePresets
  return genrePresets.filter((g) => g.includes(q))
})
const toggleAiGenre = (genre: string) => {
  if (aiGenres.value.includes(genre)) {
    aiGenres.value = aiGenres.value.filter((g) => g !== genre)
    return
  }
  aiGenres.value = [...aiGenres.value, genre]
}

watch(aiPlot, (v) => window.localStorage.setItem('novelWriter_aiPlot', v))
watch(aiCharacters, (v) => window.localStorage.setItem('novelWriter_aiCharacters', v))
watch(aiIdeas, (v) => window.localStorage.setItem('novelWriter_aiIdeas', v))
watch(
  aiGenres,
  (v) => window.localStorage.setItem('novelWriter_aiGenres', JSON.stringify(v)),
  { deep: true },
)
watch(aiPrompt, (v) => window.localStorage.setItem('novelWriter_aiPrompt', v))
watch(aiDraft, (v) => window.localStorage.setItem('novelWriter_aiDraft', v))

const generateAiPlot = () => {
  const title = novel.value?.title?.trim() || '当前小说'
  const genre = aiGenreText.value || novel.value?.genre?.trim() || '待定类型'
  const prompt = aiPrompt.value.trim() || '冲突明确，节奏紧凑，埋伏笔'
  aiPlot.value = `小说：${title}\n类型：${genre}\n主线：主角在危机中被迫踏上成长之路，围绕核心目标推进，并在关键反转处做出代价性选择。\n补充要求：${prompt}`
}

const generateAiCharacters = () => {
  const title = novel.value?.title?.trim() || '当前小说'
  const plot = aiPlot.value.trim() || '主线待补充'
  const prompt = aiPrompt.value.trim() || '人物动机清晰，关系张力强'
  aiCharacters.value = `主角：为达成目标不断升级对抗，外冷内热。\n关键配角：与主角立场相近但方法不同，易产生冲突。\n反派/对手：掌握资源与规则，逼迫主角改变。\n关系：围绕“${plot}”形成合作-背叛-和解的张力链。\n备注：${title}；${prompt}`
}

const generateAiIdeas = () => {
  const genre = aiGenreText.value || '通用类型'
  const plot = aiPlot.value.trim() || '主线待补充'
  const prompt = aiPrompt.value.trim() || '多给反转与金句'
  aiIdeas.value = `【素材库、灵感｜AI生成】\n- 类型氛围：${genre}\n- 场景灵感：在“${plot}”中加入一次高压对峙\n- 台词灵感：给主角一句体现立场转变的关键台词\n- 反转灵感：让看似盟友的角色在中段动摇\n- 节奏提示：${prompt}`
}

const generateAiDraft = () => {
  const title = novel.value?.title?.trim() || '当前小说'
  const plot = aiPlot.value.trim() || '待补充故事情节'
  const characters = aiCharacters.value.trim() || '待补充人物设定'
  const genre = aiGenreText.value || novel.value?.genre?.trim() || '待定类型'
  const prompt = aiPrompt.value.trim() || '请根据以上信息创作本章节内容'

  aiDraft.value = `【AI写作草稿】
小说：${title}
卷章：${volumeTitle.value || '当前卷'} · ${chapterTitle.value || '当前章节'}
类型：${genre}
故事情节：${plot}
人物设定：${characters}
用户描述：${prompt}

---
请按上述要求输出：
1. 先给本章一句话主旨；
2. 给出3-5段可直接使用的正文（Markdown）；
3. 保持人物性格一致，贴合小说类型与世界观。`
}

const generateChapterToMarkdown = () => {
  if (!aiDraft.value.trim()) generateAiDraft()
  appendMarkdown(aiDraft.value)
  closeFeature()
}

const resetAiWriting = () => {
  aiPlot.value = ''
  aiCharacters.value = ''
  aiIdeas.value = ''
  aiPrompt.value = ''
  aiDraft.value = ''
  aiGenreSearch.value = ''
  syncAiGenreFromNovel()
}

// ---------- Save ----------
let saveTimer: number | null = null
watch(
  markdownValue,
  (v) => {
    if (saveTimer) window.clearTimeout(saveTimer)
    saveTimer = window.setTimeout(() => {
      if (!currentChapterId.value) return
      updateNovelChapterMarkdown(props.novelId, currentChapterId.value, v)
    }, 400)
  },
  { immediate: false },
)

onBeforeUnmount(() => {
  if (saveTimer) window.clearTimeout(saveTimer)
  persistCurrentChapter()
})

const modalTitle = computed(() => {
  if (featureModal.value === 'outline') return '故事线生成'
  if (featureModal.value === 'characters') return '人物设定'
  if (featureModal.value === 'ideas') return '素材库、灵感'
  if (featureModal.value === 'ai') return 'AI写作'
  return ''
})
</script>

<template>
  <main class="writer" :class="{ 'is-hidden': sidebarHidden }">
    <button
      v-if="sidebarHidden"
      type="button"
      class="writer__floating-toggle"
      aria-label="显示侧边栏"
      @click="toggleHidden"
    >
      <svg viewBox="0 0 24 24" class="writer__sidebar-toggle-icon" aria-hidden="true">
        <path
          d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5zm6 0H6v14h4V5zm2 0v14h6V5h-6z"
          fill="currentColor"
        />
      </svg>
    </button>

    <aside class="writer__sidebar" :aria-hidden="sidebarHidden" :class="{ 'is-hidden': sidebarHidden }">
      <div class="writer__sidebar-brand" aria-label="QinyuSpiritBook">
        <span class="writer__brand-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" class="writer__brand-icon" aria-hidden="true">
            <path
              d="M6 4.5A2.5 2.5 0 0 1 8.5 2H18a2 2 0 0 1 2 2v15.5a1.5 1.5 0 0 1-2.3 1.26L14.5 19l-3.2 1.76A1.5 1.5 0 0 1 9 19.5V4.5A1.5 1.5 0 0 0 7.5 3H6v1.5z"
              fill="currentColor"
            />
          </svg>
        </span>
        <span class="writer__brand-text">QinyuSpiritBook</span>
      </div>

      <div class="writer__sidebar-features" aria-label="写作工具">
        <div class="writer__sidebar-features-head">
          <div class="writer__sidebar-features-title">写作工具</div>
        </div>

        <button type="button" class="writer__feature" @click="openFeature('ai')">
          <span class="writer__feature-text">AI写作</span>
        </button>
      </div>

      <div class="writer__sidebar-footer">
        <button type="button" class="writer__profile-card" @click="emit('back')">
          <Avatar name="Doubao" size="34px" status="online" />
          <div class="writer__profile">
            <div class="writer__name">返回小说详情</div>
            <div class="writer__status">正在写作</div>
          </div>
        </button>

        <button
          type="button"
          class="writer__collapse"
          :aria-label="sidebarHidden ? '显示侧边栏' : '收起侧边栏'"
          @click="toggleHidden"
        >
          收起
        </button>
      </div>
    </aside>

    <section class="writer__main">
      <header class="writer__topbar">
        <button type="button" class="writer__topbar-btn" aria-label="返回小说详情" @click="emit('back')">返回</button>
        <div class="writer__topbar-title">{{ novel?.title || '小说写作' }}</div>
        <div class="writer__topbar-controls">
          <Select
            :model-value="currentVolumeId"
            :options="volumeOptions"
            placeholder="选择卷"
            @update:model-value="onVolumeChange"
          />
          <Select
            :model-value="currentChapterId"
            :options="chapterOptions"
            placeholder="选择章节"
            @update:model-value="onChapterChange"
          />
          <Button variant="solid" size="sm" shape="rounded" @click="saveNow">保存</Button>
        </div>
        <div class="writer__topbar-sub">{{ saveMessage || `${volumeTitle || '未选卷'} · ${chapterTitle || '未选章节'}` }}</div>
      </header>

      <div class="writer__center">
        <div class="writer__pane">
          <div class="writer__pane-head">编辑（Markdown）</div>
          <CodeEditor class="writer__editor" v-model="markdownValue" language="markdown" />
        </div>

        <div v-if="headerError" class="writer__error">{{ headerError }}</div>
      </div>
    </section>

    <Modal :open="!!featureModal" :title="modalTitle" @close="closeFeature">
      <div v-if="featureModal === 'outline'" class="writer__modal-body">
        <div class="writer__modal-field">
          <div class="writer__modal-label">选择已创建小说</div>
          <Select v-model="selectedNovelId" :options="novelOptions" placeholder="从小说管理中选择一部小说" />
        </div>

        <div class="writer__modal-grid">
          <Input v-model="outlineTheme" placeholder="故事主题（例：废土复仇）" />
          <Input v-model="outlineHook" placeholder="开篇钩子（例：主角被通缉）" />
        </div>

        <div class="writer__modal-actions writer__modal-actions--start">
          <Button variant="soft" size="sm" @click="outlineTone = '热血成长'">热血成长</Button>
          <Button variant="soft" size="sm" @click="outlineTone = '悬疑反转'">悬疑反转</Button>
          <Button variant="soft" size="sm" @click="outlineTone = '群像史诗'">群像史诗</Button>
          <Button variant="outline" size="sm" @click="generateOutlineDraft">生成故事线草案</Button>
          <Button variant="outline" size="sm" @click="resetOutline">重置</Button>
        </div>

        <Textarea v-model="outlineText" :rows="8" placeholder="粘贴或整理你的小说大纲…" />

        <div class="writer__modal-actions">
          <Button variant="outline" size="sm" @click="appendMarkdown(outlineText)">插入到编辑器</Button>
          <Button variant="solid" size="sm" @click="sendOutlineToAi">发送到AI写作</Button>
        </div>
      </div>

      <div v-else-if="featureModal === 'characters'" class="writer__modal-body">
        <div class="writer__modal-grid">
          <Input v-model="characterName" placeholder="角色姓名" />
          <Input v-model="characterIdentity" placeholder="身份（例：落魄皇子）" />
          <Input v-model="characterGoal" placeholder="核心目标" />
          <Input v-model="characterWeakness" placeholder="性格弱点" />
        </div>

        <div class="writer__modal-actions writer__modal-actions--start">
          <Button variant="outline" size="sm" @click="buildCharacterCard">一键生成人设卡</Button>
          <Button variant="outline" size="sm" @click="resetCharacter">重置</Button>
        </div>

        <Textarea v-model="characterText" :rows="8" placeholder="人物设定（姓名/性格/背景/关系）…" />

        <div class="writer__modal-actions">
          <Button variant="outline" size="sm" @click="appendMarkdown(characterText)">插入到编辑器</Button>
          <Button variant="solid" size="sm" @click="sendCharacterToAi">发送到AI写作</Button>
        </div>
      </div>

      <div v-else-if="featureModal === 'ideas'" class="writer__modal-body">
        <div class="writer__modal-grid writer__modal-grid--ideas">
          <Input v-model="ideaInput" placeholder="记录一条灵感（场景/台词/反转）" />
          <Button variant="outline" size="sm" @click="addIdea">加入素材库</Button>
        </div>

        <div v-if="ideaLibrary.length" class="writer__idea-list">
          <button
            v-for="item in ideaLibrary"
            :key="item"
            type="button"
            class="writer__idea-item"
            @click="useIdea(item)"
          >
            <span class="writer__idea-text">{{ item }}</span>
            <span class="writer__idea-remove" @click.stop="removeIdea(item)">删除</span>
          </button>
        </div>

        <Textarea v-model="ideasText" :rows="8" placeholder="灵感碎片、场景片段、金句…" />

        <div class="writer__modal-actions">
          <Button variant="outline" size="sm" @click="appendMarkdown(ideasText)">插入到编辑器</Button>
          <Button variant="outline" size="sm" @click="generateIdeasFromAi">AI生成素材灵感</Button>
          <Button variant="outline" size="sm" @click="resetIdeas">重置</Button>
          <Button variant="solid" size="sm" @click="sendIdeasToAi">发送到AI写作</Button>
        </div>
      </div>

      <div v-else-if="featureModal === 'ai'" class="writer__modal-body">
        <div class="writer__modal-grid">
          <Input v-model="aiPlot" placeholder="故事情节（例：主角被逐出宗门后逆袭）" />
        </div>

        <div class="writer__modal-field">
          <div class="writer__modal-label">小说类型（可多选）</div>
          <Input v-model="aiGenreSearch" placeholder="搜索类型" />
          <div class="writer__genre-chips" role="list" aria-label="小说类型">
            <button
              v-for="g in filteredAiGenres"
              :key="g"
              type="button"
              class="writer__genre-chip"
              :class="{ 'is-on': aiGenres.includes(g) }"
              @click="toggleAiGenre(g)"
            >
              {{ g }}
            </button>
          </div>
          <div class="writer__genre-selected">已选：{{ aiGenreText || '未选择' }}</div>
        </div>

        <Textarea v-model="aiCharacters" :rows="4" placeholder="人物设定（主角/配角关系、性格、目标）…" />
        <Textarea v-model="aiPrompt" :rows="4" placeholder="用户描述（你希望AI怎么写：风格、节奏、篇幅、视角）…" />

        <div class="writer__modal-actions writer__modal-actions--start">
          <Button variant="outline" size="sm" @click="generateAiDraft">生成AI写作草稿</Button>
          <Button variant="soft" size="sm" @click="generateAiPlot">AI生成故事情节</Button>
          <Button variant="soft" size="sm" @click="generateAiCharacters">AI生成人物设定</Button>
          <Button variant="soft" size="sm" @click="generateAiIdeas">AI生成素材库</Button>
          <Button variant="outline" size="sm" @click="resetAiWriting">重置</Button>
        </div>

        <Textarea v-model="aiDraft" :rows="10" placeholder="AI写作草稿会显示在这里…" />
        <Textarea v-model="aiIdeas" :rows="6" placeholder="素材库（可由AI生成，也可手动整理）…" />

        <div class="writer__modal-actions">
          <Button variant="outline" size="sm" @click="appendMarkdown(aiDraft)">插入到编辑器</Button>
          <Button variant="solid" size="sm" @click="generateChapterToMarkdown">生成章节</Button>
        </div>
      </div>
    </Modal>
  </main>
</template>

<style scoped>
.writer {
  min-height: 100vh;
  background: #ffffff;
}

.writer__sidebar {
  position: fixed;
  left: 0;
  top: 0;
  width: 280px;
  height: 100vh;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow: hidden;
  transition: transform 260ms ease, opacity 260ms ease;
  background: #ffffff;
  z-index: 95;
  border-top-right-radius: 18px;
  border-bottom-right-radius: 18px;
  box-shadow: 12px 0 28px -24px rgba(2, 6, 23, 0.35);
}

.writer.is-hidden .writer__sidebar {
  transform: translateX(-100%);
  opacity: 0;
  pointer-events: none;
}

.writer__sidebar-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 2px 6px 10px;
  user-select: none;
}

.writer__brand-mark {
  width: 26px;
  height: 26px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(226, 232, 240, 0.95);
  background: rgba(255, 255, 255, 0.96);
}

.writer__brand-icon {
  width: 16px;
  height: 16px;
  color: #6d28d9;
}

.writer__brand-text {
  font-size: 14px;
  font-weight: 650;
  letter-spacing: 0.2px;
  color: #0b1220;
}

.writer__sidebar-features {
  padding: 8px 6px 4px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.writer__sidebar-features-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.writer__sidebar-features-title {
  font-size: 12px;
  font-weight: 850;
  color: color-mix(in oklab, #0b1220 42%, #ffffff);
}

.writer__feature {
  width: 100%;
  border: 1px solid color-mix(in oklab, var(--border) 85%, transparent);
  background: color-mix(in oklab, var(--surface) 96%, transparent);
  border-radius: 12px;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  color: color-mix(in oklab, #0b1220 62%, #ffffff);
  text-align: left;
}

.writer__feature:hover {
  border-color: color-mix(in oklab, var(--theme) 30%, transparent);
  background: color-mix(in oklab, var(--surface-strong) 65%, transparent);
}

.writer__feature-text {
  font-size: 13px;
  font-weight: 750;
}

.writer__sidebar-footer {
  margin-top: auto;
  padding-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.writer__profile-card {
  width: 100%;
  border: 1px solid color-mix(in oklab, var(--border) 85%, transparent);
  background: #ffffff;
  border-radius: 14px;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  text-align: left;
}

.writer__profile-card:hover {
  border-color: color-mix(in oklab, var(--theme) 30%, transparent);
  box-shadow: 0 18px 40px -34px rgba(2, 6, 23, 0.25);
}

.writer__profile {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.writer__name {
  font-weight: 900;
  color: #0b1220;
  font-size: 13px;
}

.writer__status {
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 750;
}

.writer__collapse {
  width: 100%;
  border: 1px solid rgba(226, 232, 240, 0.95);
  background: rgba(255, 255, 255, 0.92);
  border-radius: 14px;
  padding: 10px 12px;
  cursor: pointer;
  font-weight: 850;
  color: #0b1220;
}

.writer__collapse:hover {
  border-color: rgba(124, 58, 237, 0.35);
  background: rgba(237, 233, 254, 0.25);
}

.writer.is-hidden .writer__main {
  margin-left: 0;
  width: 100%;
}

.writer__main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: 100vh;
  overflow: hidden;
  margin-left: 280px;
  transition: margin-left 260ms ease;
}

.writer__topbar {
  min-height: 56px;
  border-bottom: 1px solid color-mix(in oklab, var(--border) 85%, transparent);
  background: rgba(255, 255, 255, 0.88);
  display: flex;
  align-items: center;
  padding: 0 16px;
  gap: 10px;
  flex-wrap: wrap;
}

.writer__topbar-btn {
  border: 0;
  background: transparent;
  cursor: pointer;
  font-weight: 900;
  color: #0b1220;
}

.writer__topbar-title {
  font-size: 14px;
  font-weight: 950;
  color: #0b1220;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.writer__topbar-sub {
  font-size: 12px;
  font-weight: 800;
  color: color-mix(in oklab, #0b1220 42%, #ffffff);
  white-space: nowrap;
}

.writer__topbar-controls {
  display: grid;
  grid-template-columns: minmax(120px, 180px) minmax(140px, 220px) auto;
  gap: 8px;
  align-items: center;
}

@media (max-width: 1200px) {
  .writer__topbar {
    padding: 8px 12px;
  }
  .writer__topbar-controls {
    width: 100%;
    grid-template-columns: 1fr 1fr auto;
  }
  .writer__topbar-sub {
    width: 100%;
    white-space: normal;
  }
}

.writer__center {
  flex: 1;
  overflow: hidden;
  padding: 8px;
  min-height: 0;
}

.writer__pane {
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.writer__pane-head {
  display: none;
}

.writer__editor {
  flex: 1;
  min-height: 0;
}

.writer__editor :deep(> div) {
  height: 100%;
  border-radius: 10px;
  border: 1px solid color-mix(in oklab, var(--border) 72%, transparent);
  box-shadow: 0 12px 30px -24px rgba(2, 6, 23, 0.25);
  padding: 0;
}

.writer__editor :deep(.cmp-code-editor__inner) {
  height: 100%;
  min-height: 0;
  border-radius: 10px;
  border: 0;
}

.writer__editor :deep(.cmp-code-editor__inner .cm-editor) {
  height: 100%;
  border-radius: 10px;
}

.writer__editor :deep(.cmp-code-editor__inner .cm-scroller) {
  height: 100%;
}

.writer__error {
  margin-top: 14px;
  padding: 12px;
  border-radius: 14px;
  border: 1px solid rgba(244, 63, 94, 0.35);
  background: rgba(255, 228, 230, 0.55);
  color: rgba(159, 18, 57, 0.95);
}

.writer__floating-toggle {
  position: fixed;
  left: 12px;
  top: 12px;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  border: 1px solid color-mix(in oklab, var(--border) 85%, transparent);
  background: #ffffff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 120;
  color: #0b1220;
}

.writer__sidebar-toggle-icon {
  width: 18px;
  height: 18px;
}

.writer__modal-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: min(76vh, 760px);
  overflow-y: auto;
  padding-right: 4px;
}

.writer__modal-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.writer__modal-label {
  font-size: 12px;
  font-weight: 900;
  color: #0b1220;
}

.writer__modal-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.writer__modal-grid--ideas {
  grid-template-columns: 1fr auto;
}

.writer__genre-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.writer__genre-chip {
  border: 1px solid rgba(226, 232, 240, 0.95);
  background: rgba(255, 255, 255, 0.92);
  border-radius: 999px;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
  color: color-mix(in oklab, #0b1220 62%, #ffffff);
}

.writer__genre-chip.is-on {
  border-color: rgba(139, 92, 246, 0.7);
  background: linear-gradient(120deg, rgba(139, 92, 246, 0.92), rgba(167, 139, 250, 0.92));
  color: #fff;
}

.writer__genre-selected {
  font-size: 12px;
  font-weight: 800;
  color: color-mix(in oklab, #0b1220 52%, #ffffff);
}

@media (max-width: 720px) {
  .writer__modal-grid {
    grid-template-columns: 1fr;
  }
  .writer__modal-grid--ideas {
    grid-template-columns: 1fr;
  }
}

.writer__modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}

.writer__modal-actions--start {
  justify-content: flex-start;
}

.writer__modal-body::-webkit-scrollbar {
  width: 8px;
}

.writer__modal-body::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: color-mix(in oklab, var(--theme-soft) 72%, var(--theme));
}

.writer__modal-body::-webkit-scrollbar-track {
  background: color-mix(in oklab, var(--surface-strong) 82%, transparent);
}

.writer__idea-list {
  max-height: 180px;
  overflow: auto;
  border: 1px solid rgba(226, 232, 240, 0.95);
  border-radius: 12px;
  padding: 8px;
  display: grid;
  gap: 8px;
}

.writer__idea-item {
  border: 1px solid rgba(226, 232, 240, 0.95);
  background: rgba(255, 255, 255, 0.92);
  border-radius: 12px;
  padding: 8px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  cursor: pointer;
}

.writer__idea-item:hover {
  border-color: rgba(124, 58, 237, 0.35);
  background: rgba(237, 233, 254, 0.25);
}

.writer__idea-text {
  font-size: 13px;
  font-weight: 900;
  color: #0b1220;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.writer__idea-remove {
  font-size: 12px;
  color: #ef4444;
  font-weight: 800;
}
</style>

