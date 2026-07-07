<script setup lang="ts">
import { ref } from 'vue'
import WorkspaceAiPanel, { type PipelineTrigger } from '@/components/ai/WorkspaceAiPanel.vue'
import AiChatPanel from '@/components/ai/AiChatPanel.vue'
import { MessageSquare, Server } from 'lucide-vue-next'

const props = defineProps<{
  workspaceRoot: string | null
  workspaceId: string | null
  currentChapterPath?: string | null
  pipelineTrigger?: PipelineTrigger | null
}>()

const emit = defineEmits<{
  insert: [text: string]
  chapterWritten: [path: string, content: string]
  storyChapterWritten: [bookId: string, chapterNum: number, title: string, content: string]
}>()

type Surface = 'local' | 'backend'

const surface = ref<Surface>('local')
</script>

<template>
  <div class="unified-ai">
    <div class="surface-tabs">
      <button
        type="button"
        class="surface-tab"
        :class="{ active: surface === 'local' }"
        @click="surface = 'local'"
      >
        <MessageSquare :size="13" />
        <span>本地对话·创作</span>
      </button>
      <button
        type="button"
        class="surface-tab"
        :class="{ active: surface === 'backend' }"
        @click="surface = 'backend'"
      >
        <Server :size="13" />
        <span>后端对话·创作</span>
      </button>
    </div>

    <div v-show="surface === 'local'" class="surface-body">
      <WorkspaceAiPanel
        :workspace-root="workspaceRoot"
        :workspace-id="workspaceId"
        :current-chapter-path="currentChapterPath"
        :pipeline-trigger="pipelineTrigger"
        @insert="emit('insert', $event)"
        @chapter-written="emit('chapterWritten', $event[0], $event[1])"
      />
    </div>

    <div v-show="surface === 'backend'" class="surface-body">
      <AiChatPanel
        :current-chapter-path="currentChapterPath"
        @insert="emit('insert', $event)"
        @chapter-written="(bookId, num, title, content) => emit('storyChapterWritten', bookId, num, title, content)"
      />
    </div>
  </div>
</template>

<style scoped>
.unified-ai {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.surface-tabs {
  display: flex;
  gap: 4px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.surface-tab {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 6px 8px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--text-sub);
  font-size: 11px;
  cursor: pointer;
}

.surface-tab:hover {
  background: var(--bg-hover);
  color: var(--text-main);
}

.surface-tab.active {
  border-color: var(--accent);
  color: var(--accent);
  background: color-mix(in oklab, var(--accent) 10%, transparent);
}

.surface-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.surface-body :deep(.workspace-ai),
.surface-body :deep(.agent-panel) {
  height: 100%;
}
</style>
