<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { IconSend, IconFolder } from '@arco-design/web-vue/es/icon'
import { Message } from '@arco-design/web-vue'
import { inspirationLastSessionKey } from '@/composables/inspirationStorage'
import { useInspirationStore } from '@/stores/inspiration'
import { getChatSession, updateChatSession } from '@/api/ai/sessions'
import { listNovels } from '@/api/novels'
import { postChatTurnStream } from '@/api/ai/stream'
import { postRecognizeDocument } from '@/api/recognize'
import type { ChatSseEvent } from '@/types/chat'
import type { Novel } from '@/types/novel'
import MarkdownRender from '@/components/markdown/MarkdownRender.vue'
import StreamingAssistantMarkdown from '@/components/chat/StreamingAssistantMarkdown.vue'

const route = useRoute()
const router = useRouter()
const store = useInspirationStore()
const draft = ref('')
const sending = ref(false)
const streamCtl = ref<AbortController | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const recognizing = ref(false)
const recognizeAppendix = ref('')
const recognizeFileName = ref('')

const novels = ref<Novel[]>([])
const sessionNovelId = ref<number | undefined>(undefined)
const novelOptions = computed(() =>
  novels.value.map((n) => ({ label: n.title || `小说 #${n.id}`, value: n.id })),
)

const sessionId = computed(() => {
  if (route.name !== 'inspiration-session') {
    return ''
  }
  const raw = route.params.sessionId
  const id = Array.isArray(raw) ? raw[0] : raw
  return typeof id === 'string' && id ? id : ''
})

const thread = computed(() =>
  sessionId.value ? store.threads.find((t) => t.id === sessionId.value) : undefined,
)

const threadTitle = computed(() => thread.value?.title ?? '对话')

const messages = computed(() => (sessionId.value ? store.getMessages(sessionId.value) : []))

watch(
  sessionId,
  async (id) => {
    if (!id) {
      sessionNovelId.value = undefined
      return
    }
    localStorage.setItem(inspirationLastSessionKey, id)
    store.touchSession(id)
    try {
      await store.loadThreadMessages(id)
      const s = await getChatSession(Number(id))
      sessionNovelId.value = s.novelId && s.novelId > 0 ? s.novelId : undefined
    } catch (e) {
      Message.error(`加载历史失败：${String((e as Error)?.message || e)}`)
      await router.replace({ name: 'inspiration-root' })
    }
  },
  { immediate: true },
)

onMounted(async () => {
  try {
    const res = await listNovels({ page: 1, size: 100 })
    novels.value = res.novels
  } catch {
    /* 忽略 */
  }
})

async function onSessionNovelChange(v: unknown) {
  const sid = sessionId.value
  if (!sid) {
    return
  }
  let novelId: number | undefined
  if (typeof v === 'number' && Number.isFinite(v)) {
    novelId = v
  } else if (typeof v === 'string' && /^\d+$/.test(v)) {
    novelId = Number(v)
  } else if (v === false || v === undefined || v === null || v === '') {
    novelId = undefined
  } else {
    novelId = undefined
  }
  try {
    await updateChatSession(Number(sid), { novelId: novelId ?? 0 })
    sessionNovelId.value = novelId
    Message.success('已更新关联小说，后续回复将带入该书摘要与正文节选')
    await store.refreshSessions()
  } catch (e) {
    Message.error(String((e as Error)?.message || e))
  }
}

function abortInFlight() {
  streamCtl.value?.abort()
  streamCtl.value = null
}

onUnmounted(() => {
  abortInFlight()
})

function triggerPickFile() {
  fileInputRef.value?.click()
}

async function onFileInputChange(ev: Event) {
  const el = ev.target as HTMLInputElement
  const file = el.files?.[0]
  el.value = ''
  if (!file) {
    return
  }
  recognizing.value = true
  try {
    const r = await postRecognizeDocument(file)
    recognizeAppendix.value = `--- 附件「${r.fileName}」识别内容 ---\n${r.text}`
    recognizeFileName.value = r.fileName
    Message.success('识别完成，已附加到本次发送内容末尾')
  } catch (e) {
    Message.error(String((e as Error)?.message || e))
  } finally {
    recognizing.value = false
  }
}

function clearAttachment() {
  recognizeAppendix.value = ''
  recognizeFileName.value = ''
}

async function onSend() {
  const sidStr = sessionId.value
  const textPart = draft.value.trim()
  const appendix = recognizeAppendix.value.trim()
  const merged = [textPart, appendix].filter(Boolean).join('\n\n')
  if (!merged || sending.value) {
    return
  }
  draft.value = ''
  clearAttachment()
  store.appendUserMessage(sidStr, merged)
  store.appendAssistantPlaceholder(sidStr)
  sending.value = true
  abortInFlight()
  const ac = new AbortController()
  streamCtl.value = ac

  const onEvent = (ev: ChatSseEvent) => {
    if (ev.type === 'meta') {
      if (ev.session) {
        store.applySessionMeta(ev.session)
      }
      store.patchLastUserFromServer(sidStr, ev.userMessage)
    } else if (ev.type === 'delta') {
      if (ev.text) {
        store.appendDeltaToLastAssistant(sidStr, ev.text)
      }
    } else if (ev.type === 'done') {
      store.finishLastAssistant(sidStr, ev.assistantMessage)
      void store.refreshSessions()
    } else if (ev.type === 'error') {
      Message.error(ev.msg)
      store.removeStreamingAssistant(sidStr)
    }
  }

  try {
    await postChatTurnStream(Number(sidStr), { message: merged }, { signal: ac.signal, onEvent })
  } catch (e) {
    const err = e as Error
    if (err?.name !== 'AbortError') {
      Message.error(String(err?.message || e))
      store.removeStreamingAssistant(sidStr)
    }
  } finally {
    sending.value = false
    streamCtl.value = null
  }
}
</script>

<template>
  <div class="insp-chat">
    <div class="insp-chat__thread">
      <div class="insp-chat__toolbar">
        <span class="insp-chat__thread-title">{{ threadTitle }}</span>
      </div>
      <div class="insp-chat__novel-bar">
        <span class="insp-chat__novel-label">关联小说</span>
        <a-select
          :model-value="sessionNovelId"
          allow-clear
          placeholder="不关联（普通闲聊）"
          :options="novelOptions"
          class="insp-chat__novel-select"
          @change="onSessionNovelChange"
        />
        <span class="insp-chat__novel-hint">关联后会话将带入该书前序摘要与最近章正文节选，便于讨论后续发展。</span>
      </div>
      <div class="insp-chat__messages">
        <template v-for="m in messages" :key="m.localId">
          <div v-if="m.role === 'user'" class="insp-chat__row insp-chat__row--user">
            <div class="insp-chat__bubble insp-chat__bubble--user">
              {{ m.content }}
            </div>
          </div>
          <div v-else class="insp-chat__row insp-chat__row--assistant">
            <div class="insp-chat__bubble insp-chat__bubble--assistant">
              <StreamingAssistantMarkdown
                v-if="m.streaming"
                :text="m.content"
                :streaming="true"
              />
              <MarkdownRender v-else :source="m.content" />
            </div>
          </div>
        </template>
        <div v-if="messages.length === 0" class="insp-chat__bubble insp-chat__bubble--hint">
          暂无消息，输入内容或上传附件识别后发送。
        </div>
      </div>
      <div class="insp-chat__composer">
        <input
          ref="fileInputRef"
          type="file"
          class="insp-chat__file"
          accept=".pdf,.doc,.docx,.txt,.md,.xlsx,.xls,.ppt,.pptx"
          @change="onFileInputChange"
        />
        <div v-if="recognizeFileName" class="insp-chat__attach-bar">
          <a-tag closable color="arcoblue" @close="clearAttachment">
            已附：{{ recognizeFileName }}
          </a-tag>
        </div>
        <div class="insp-chat__composer-row">
          <a-textarea
            v-model="draft"
            class="insp-chat__input"
            :auto-size="{ minRows: 1, maxRows: 6 }"
            :disabled="sending || recognizing"
            placeholder="输入想法；可上传附件识别后一并发送（Shift+Enter 换行）…"
            @keydown.enter.exact.prevent="onSend"
          />
          <div class="insp-chat__actions">
            <a-button :loading="recognizing" @click="triggerPickFile">
              <template #icon>
                <IconFolder />
              </template>
              附件识别
            </a-button>
            <a-button type="primary" :loading="sending" @click="onSend">
              <template #icon>
                <IconSend />
              </template>
              发送
            </a-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.insp-chat {
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--color-fill-1);
}
.insp-chat__thread {
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.insp-chat__toolbar {
  flex-shrink: 0;
  padding: 12px 20px;
  border-bottom: 1px solid var(--color-border-2);
  background: var(--color-bg-2);
}
.insp-chat__thread-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-1);
}
.insp-chat__novel-bar {
  flex-shrink: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 10px 20px;
  border-bottom: 1px solid var(--color-border-2);
  background: var(--color-bg-1);
}
.insp-chat__novel-label {
  font-size: 13px;
  color: var(--color-text-2);
  flex-shrink: 0;
}
.insp-chat__novel-select {
  min-width: 200px;
  max-width: 360px;
}
.insp-chat__novel-hint {
  font-size: 12px;
  color: var(--color-text-3);
  flex: 1 1 200px;
}
.insp-chat__messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.insp-chat__row {
  display: flex;
}
.insp-chat__row--user {
  justify-content: flex-end;
}
.insp-chat__row--assistant {
  justify-content: flex-start;
}
.insp-chat__bubble {
  max-width: min(720px, 100%);
  padding: 12px 14px;
  border-radius: 10px;
  font-size: 14px;
  line-height: 1.6;
}
.insp-chat__bubble--hint {
  align-self: flex-start;
  color: var(--color-text-3);
  font-size: 13px;
  background: var(--color-bg-2);
  border: 1px solid var(--color-border-2);
}
.insp-chat__bubble--user {
  background: rgb(var(--primary-6));
  color: #fff;
  white-space: pre-wrap;
}
.insp-chat__bubble--assistant {
  background: var(--color-bg-2);
  border: 1px solid var(--color-border-2);
  color: var(--color-text-2);
}
.insp-chat__composer {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 20px 20px;
  border-top: 1px solid var(--color-border-2);
  background: var(--color-bg-2);
}
.insp-chat__file {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  pointer-events: none;
}
.insp-chat__attach-bar {
  display: flex;
  align-items: center;
}
.insp-chat__composer-row {
  display: flex;
  gap: 10px;
  align-items: flex-end;
}
.insp-chat__input {
  flex: 1;
}
.insp-chat__actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}
</style>
