<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { Send, Bot, Sparkles, ArrowLeft } from 'lucide-vue-next'
import { useConversationStore } from '@/stores/conversation'
import { renderMarkdown } from '@/utils/markdown'

const store = useConversationStore()
const input = ref('')
const messagesEndRef = ref<HTMLDivElement | null>(null)

type LocalMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

const localMessages = ref<LocalMessage[]>([])

watch(
  () => store.currentConversation,
  (conversation) => {
    if (conversation) {
      localMessages.value = conversation.messages.map((msg) => ({
        id: msg.id,
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
        timestamp: new Date(msg.timestamp * 1000),
      }))
    } else {
      localMessages.value = []
    }
  },
  { immediate: true, deep: true },
)

watch(
  localMessages,
  async () => {
    await nextTick()
    messagesEndRef.value?.scrollIntoView({ behavior: 'smooth' })
  },
  { deep: true },
)

async function handleSendMessage() {
  if (!input.value.trim() || !store.currentConversation || store.isLoading) return
  const content = input.value
  const userMessage: LocalMessage = {
    id: Date.now().toString(),
    role: 'user',
    content,
    timestamp: new Date(),
  }
  localMessages.value = [...localMessages.value, userMessage]
  input.value = ''
  try {
    await store.sendMessage(content)
  } catch (err) {
    console.error('发送消息失败:', err)
  }
}

function handleKeyPress(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    void handleSendMessage()
  }
}

function handleBack() {
  store.setCurrentConversation(null)
}

function markdownHtml(content: string) {
  return renderMarkdown(content)
}
</script>

<template>
  <div v-if="!store.currentConversation" class="flex-1 flex items-center justify-center text-gray-500">
    <div class="text-center">
      <Bot class="w-16 h-16 mx-auto mb-4 text-gray-300" />
      <p class="text-lg font-medium">选择一个会话开始对话</p>
      <p class="text-sm mt-2">从左侧列表中选择会话，或创建新会话</p>
    </div>
  </div>

  <div v-else class="flex flex-col h-full">
    <div class="flex items-center gap-3 p-4 border-b border-gray-200 bg-white">
      <button
        type="button"
        class="p-2 text-gray-400 hover:text-gray-600 transition-colors"
        @click="handleBack"
      >
        <ArrowLeft class="w-4 h-4" />
      </button>
      <div class="flex-1">
        <h2 class="font-semibold text-gray-900 truncate">
          {{ store.currentConversation.title }}
        </h2>
        <p class="text-xs text-gray-500">{{ localMessages.length }} 条消息</p>
      </div>
      <div class="flex items-center gap-1">
        <Sparkles class="w-4 h-4 text-blue-600" />
        <span class="text-xs text-blue-600">GoPilot</span>
      </div>
    </div>

    <div v-if="store.error" class="mx-4 mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
      <p class="text-sm text-red-600">{{ store.error }}</p>
    </div>

    <div class="flex-1 overflow-y-auto p-4 space-y-4">
      <template v-if="localMessages.length === 0">
        <div class="text-center text-gray-500 py-8">
          <Bot class="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p class="text-sm">开始与 GoPilot 代码助手对话吧！</p>
        </div>
      </template>
      <template v-else>
        <div
          v-for="message in localMessages"
          :key="message.id"
        class="flex gap-3"
        :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
      >
        <div
          v-if="message.role === 'assistant'"
          class="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center"
        >
          <Bot class="w-4 h-4 text-blue-600" />
        </div>

        <div
          class="max-w-[80%] rounded-lg px-3 py-2"
          :class="
            message.role === 'user'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-900'
          "
        >
          <div class="text-sm">
            <div
              v-if="message.role === 'assistant'"
              class="prose prose-sm max-w-none"
              v-html="markdownHtml(message.content)"
            />
            <div v-else class="whitespace-pre-wrap">{{ message.content }}</div>
          </div>
          <div class="text-xs opacity-70 mt-1">
            {{ message.timestamp.toLocaleTimeString() }}
          </div>
        </div>

        <div
          v-if="message.role === 'user'"
          class="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center"
        >
          <span class="text-white text-sm font-medium">U</span>
        </div>
      </template>

      <div v-if="store.isLoading" class="flex gap-3 justify-start">
        <div class="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
          <Bot class="w-4 h-4 text-blue-600" />
        </div>
        <div class="bg-gray-100 rounded-lg px-3 py-2">
          <div class="flex items-center gap-1">
            <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
            <div
              class="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
              style="animation-delay: 0.1s"
            />
            <div
              class="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
              style="animation-delay: 0.2s"
            />
          </div>
        </div>
      </div>

      <div ref="messagesEndRef" />
    </div>

    <div class="border-t border-gray-200 p-4 bg-white">
      <div class="flex gap-2">
        <input
          v-model="input"
          type="text"
          placeholder="输入消息..."
          class="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          :disabled="store.isLoading"
          @keypress="handleKeyPress"
        />
        <button
          type="button"
          class="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          :disabled="store.isLoading || !input.trim()"
          @click="handleSendMessage"
        >
          <Send class="w-4 h-4" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
@import 'highlight.js/styles/github.css';
</style>
