<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useStoryStore } from '@/features/story/stores/storyStore'
import { storyChapterPath, storyChapterFileDir } from '@/core/types/story'
import { RefreshCw, Plus, PenLine, Loader2, Wifi, WifiOff } from 'lucide-vue-next'

const emit = defineEmits<{
  openChapter: [path: string, title: string, content: string, bookId: string, chapterNum: number]
}>()

const storyStore = useStoryStore()
const {
  connected,
  connecting,
  lastError,
  baseUrl,
  currentBookId,
  loadingBooks,
  loadingChapters,
  writing,
} = storeToRefs(storyStore)

const books = computed(() => storyStore.books ?? [])
const chapters = computed(() => storyStore.chapters ?? [])

const newTitle = ref('')
const newBrief = ref('')
const showCreate = ref(false)
const creating = ref(false)
const localError = ref('')

onMounted(() => {
  void storyStore.init()
})

async function refresh() {
  localError.value = ''
  try {
    if (!connected.value) {
      await storyStore.ping()
    }
    if (connected.value) {
      await storyStore.fetchBooks()
      if (currentBookId.value) {
        await storyStore.fetchChapters(currentBookId.value)
      }
    }
  } catch (e: unknown) {
    localError.value = e instanceof Error ? e.message : '刷新失败'
  }
}

async function onCreateBook() {
  const title = newTitle.value.trim()
  if (!title) return
  creating.value = true
  localError.value = ''
  try {
    await storyStore.createBook(title, newBrief.value.trim())
    newTitle.value = ''
    newBrief.value = ''
    showCreate.value = false
  } catch (e: unknown) {
    localError.value = e instanceof Error ? e.message : '创建书籍失败'
  } finally {
    creating.value = false
  }
}

async function onSelectBook(id: string) {
  localError.value = ''
  try {
    await storyStore.selectBook(id)
  } catch (e: unknown) {
    localError.value = e instanceof Error ? e.message : '加载书籍失败'
  }
}

async function onOpenChapter(ch: { number: number; title: string }) {
  if (!currentBookId.value) return
  try {
    const detail = await storyStore.loadChapter(currentBookId.value, ch.number)
    const path = storyChapterPath(currentBookId.value, ch.number)
    emit(
      'openChapter',
      path,
      detail.meta.title || ch.title,
      detail.content,
      currentBookId.value,
      ch.number,
    )
  } catch (e: unknown) {
    localError.value = e instanceof Error ? e.message : '打开章节失败'
  }
}

async function onWriteNext() {
  localError.value = ''
  try {
    await storyStore.writeNext()
    const list = chapters.value
    if (list.length > 0) {
      await onOpenChapter(list[list.length - 1])
    }
  } catch (e: unknown) {
    localError.value = e instanceof Error ? e.message : '写章失败'
  }
}

const displayError = computed(() => localError.value || lastError.value)

const storageHint = computed(() => {
  if (!currentBookId.value) return ''
  return storyChapterFileDir(currentBookId.value)
})
</script>

<template>
  <div class="story-panel">
    <div class="panel-header">
      <span class="conn" :class="{ ok: connected }">
        <Wifi v-if="connected" :size="12" />
        <WifiOff v-else :size="12" />
        {{ connected ? '后端已连接' : '后端未连接' }}
      </span>
      <button class="icon-btn" title="刷新" :disabled="connecting" @click="refresh">
        <RefreshCw :size="14" :class="{ spin: connecting }" />
      </button>
    </div>

    <div v-if="!connected" class="hint-block">
      <p>无法连接 {{ baseUrl }}</p>
      <p class="sub">请启动 Go 服务：<code>go run ./cmd/server</code></p>
      <button class="action-btn" @click="storyStore.ping()">重试连接</button>
      <p v-if="displayError" class="err">{{ displayError }}</p>
    </div>

    <template v-else>
      <div class="toolbar">
        <button class="action-btn" @click="showCreate = !showCreate">
          <Plus :size="14" /> 新建书籍
        </button>
        <button
          class="action-btn primary"
          :disabled="!currentBookId || writing"
          @click="onWriteNext"
        >
          <Loader2 v-if="writing" :size="14" class="spin" />
          <PenLine v-else :size="14" />
          写下一章
        </button>
      </div>

      <div v-if="showCreate" class="create-form">
        <input v-model="newTitle" class="field" placeholder="书名" />
        <textarea v-model="newBrief" class="field area" placeholder="简介 / 设定（可选）" />
        <button class="action-btn primary" :disabled="creating || !newTitle.trim()" @click="onCreateBook">
          {{ creating ? '创建中…' : '创建' }}
        </button>
      </div>

      <div v-if="loadingBooks" class="hint">加载书籍…</div>

      <div v-else class="book-list">
        <button
          v-for="book in books"
          :key="book.id"
          class="book-item"
          :class="{ active: book.id === currentBookId }"
          @click="onSelectBook(book.id)"
        >
          <span class="book-title">{{ book.title }}</span>
          <span class="book-meta">{{ book.genre }} · {{ book.status }}</span>
        </button>
        <p v-if="books.length === 0" class="hint">暂无书籍，点击「新建书籍」</p>
      </div>

      <div v-if="currentBookId" class="chapter-section">
        <div class="section-title">章节</div>
        <p v-if="storageHint" class="storage-hint" title="相对后端 STORY_PROJECT_ROOT 的路径">
          正文目录：<code>{{ storageHint }}</code>
        </p>
        <div v-if="loadingChapters" class="hint">加载章节…</div>
        <button
          v-for="ch in chapters"
          :key="ch.number"
          class="chapter-item"
          @click="onOpenChapter(ch)"
        >
          <span>第{{ ch.number }}章 {{ ch.title }}</span>
          <span class="ch-meta">{{ ch.wordCount }}字 · {{ ch.status }}</span>
        </button>
        <p v-if="!loadingChapters && chapters.length === 0" class="hint">暂无章节</p>
      </div>

      <p v-if="displayError" class="err">{{ displayError }}</p>
    </template>
  </div>
</template>

<style scoped>
.story-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg-secondary);
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
}

.conn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--danger);
  font-size: 11px;
}
.conn.ok { color: var(--success); }

.icon-btn {
  border: none;
  background: none;
  color: var(--text-sub);
  cursor: pointer;
  padding: 4px;
  display: inline-flex;
}
.icon-btn:hover { color: var(--accent); }

.toolbar {
  display: flex;
  gap: 6px;
  padding: 8px;
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: transparent;
  color: var(--text-sub);
  cursor: pointer;
  font-size: 11px;
}
.action-btn.primary {
  border-color: var(--accent);
  color: var(--accent);
}
.action-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.create-form {
  padding: 8px;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field {
  width: 100%;
  padding: 5px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-input);
  color: var(--text-main);
  font-size: 12px;
  box-sizing: border-box;
}
.area { min-height: 48px; resize: vertical; font-family: inherit; }

.book-list, .chapter-section {
  overflow-y: auto;
  padding: 4px 0;
}

.chapter-section {
  flex: 1;
  border-top: 1px solid var(--border);
}

.section-title {
  padding: 6px 10px;
  font-size: 10px;
  color: var(--text-muted);
  text-transform: uppercase;
}

.storage-hint {
  padding: 0 10px 6px;
  margin: 0;
  font-size: 10px;
  color: var(--text-muted);
  line-height: 1.4;
}
.storage-hint code {
  font-size: 10px;
  background: var(--bg-input);
  padding: 1px 4px;
  border-radius: 3px;
  word-break: break-all;
}

.book-item, .chapter-item {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 8px 10px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  text-align: left;
}
.book-item:hover, .chapter-item:hover { background: var(--bg-hover); }
.book-item.active { background: color-mix(in oklab, var(--accent) 12%, transparent); }

.book-title { font-weight: 600; color: var(--text-main); }
.book-meta, .ch-meta { font-size: 10px; color: var(--text-muted); }

.hint-block, .hint {
  padding: 12px 10px;
  color: var(--text-sub);
  font-size: 11px;
}
.hint-block .sub { margin-top: 4px; color: var(--text-muted); }
.hint-block code {
  font-size: 10px;
  background: var(--bg-input);
  padding: 1px 4px;
  border-radius: 3px;
}

.err {
  padding: 6px 10px;
  color: var(--danger);
  font-size: 11px;
}

.spin { animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
