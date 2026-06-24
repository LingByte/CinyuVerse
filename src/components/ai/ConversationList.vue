<script setup lang="ts">
import { ref } from 'vue'
import { Plus, Trash2, Clock, CheckCircle } from 'lucide-vue-next'
import type { Conversation } from '@/types/conversation'
import { useConversationStore } from '@/stores/conversation'

const props = defineProps<{
  onNewConversation: () => void
}>()

const store = useConversationStore()
const deletingId = ref<string | null>(null)

async function handleSelectConversation(id: string) {
  if (id === store.currentConversation?.id) return
  try {
    await store.loadConversation(id)
  } catch (err) {
    console.error('加载会话失败:', err)
  }
}

async function handleDeleteConversation(e: MouseEvent, id: string) {
  e.stopPropagation()
  if (deletingId.value === id) return
  deletingId.value = id
  try {
    await store.deleteConversation(id)
  } catch (err) {
    console.error('删除会话失败:', err)
  } finally {
    deletingId.value = null
  }
}

function formatTime(timestamp: number) {
  const date = new Date(timestamp * 1000)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays > 0) return `${diffDays}天前`
  if (diffHours > 0) return `${diffHours}小时前`
  return '刚刚'
}

function getLastMessage(conversation: Conversation) {
  const messages = conversation.messages
  if (messages.length === 0) return '暂无消息'
  const lastMessage = messages[messages.length - 1]
  const content = lastMessage.content
  return content.length > 50 ? content.substring(0, 50) + '...' : content
}
</script>

<template>
  <div class="flex flex-col h-full bg-gray-50 border-r border-gray-200">
    <div class="p-4 border-b border-gray-200">
      <button
        type="button"
        class="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        :disabled="store.isLoading"
        @click="props.onNewConversation"
      >
        <Plus class="w-4 h-4" />
        新建会话
      </button>
    </div>

    <div class="flex-1 overflow-y-auto">
      <div
        v-if="store.conversations.length === 0"
        class="flex flex-col items-center justify-center h-full text-gray-500 p-4"
      >
        <Plus class="w-12 h-12 mb-3 text-gray-300" />
        <p class="text-sm text-center">还没有会话</p>
        <p class="text-xs text-center mt-1">点击上方按钮创建第一个会话</p>
      </div>
      <div v-else class="p-2 space-y-1">
        <div
          v-for="conversation in store.conversations"
          :key="conversation.id"
          class="group p-3 rounded-lg cursor-pointer transition-colors"
          :class="
            store.currentConversation?.id === conversation.id
              ? 'bg-blue-100 border border-blue-200'
              : 'bg-white hover:bg-gray-100 border border-transparent'
          "
          @click="handleSelectConversation(conversation.id)"
        >
          <div class="flex items-start justify-between">
            <div class="flex-1 min-w-0">
              <h3 class="text-sm font-medium text-gray-900 truncate">
                {{ conversation.title }}
              </h3>
              <p class="text-xs text-gray-500 mt-1 truncate">
                {{ getLastMessage(conversation) }}
              </p>
              <div class="flex items-center gap-2 mt-2">
                <span class="flex items-center gap-1 text-xs text-gray-400">
                  <Clock class="w-3 h-3" />
                  {{ formatTime(conversation.updated_at) }}
                </span>
                <span class="flex items-center gap-1 text-xs text-gray-400">
                  <Plus class="w-3 h-3" />
                  {{ conversation.messages.length }}
                </span>
              </div>
            </div>

            <button
              type="button"
              class="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-600 transition-all"
              :disabled="deletingId === conversation.id || store.isLoading"
              @click="handleDeleteConversation($event, conversation.id)"
            >
              <div
                v-if="deletingId === conversation.id"
                class="w-4 h-4 animate-spin rounded-full border-2 border-red-600 border-t-transparent"
              />
              <Trash2 v-else class="w-4 h-4" />
            </button>
          </div>

          <div
            v-if="store.currentConversation?.id === conversation.id"
            class="flex items-center gap-1 mt-2"
          >
            <CheckCircle class="w-3 h-3 text-blue-600" />
            <span class="text-xs text-blue-600">当前会话</span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="store.conversations.length > 0" class="p-3 border-t border-gray-200 bg-white">
      <div class="text-xs text-gray-500 text-center">
        共 {{ store.conversations.length }} 个会话
      </div>
    </div>
  </div>
</template>
