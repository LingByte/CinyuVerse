<script setup lang="ts">
import { ref, watch } from 'vue'
import { X } from 'lucide-vue-next'

const props = defineProps<{
  visible: boolean
  summary: string
  markdown: string
  issues: { severity: string; category: string; message: string }[]
}>()

const emit = defineEmits<{ close: [] }>()

const tab = ref<'summary' | 'markdown'>('summary')

watch(() => props.visible, (v) => {
  if (v) tab.value = 'summary'
})
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="overlay" @click.self="emit('close')">
      <div class="dialog">
        <header>
          <h3>剧情审校报告</h3>
          <button type="button" class="close" @click="emit('close')"><X :size="16" /></button>
        </header>
        <div class="tabs">
          <button :class="{ active: tab === 'summary' }" @click="tab = 'summary'">问题列表</button>
          <button :class="{ active: tab === 'markdown' }" @click="tab = 'markdown'">完整报告</button>
        </div>
        <div class="body">
          <p class="summary-line">{{ summary }}</p>
          <div v-if="tab === 'summary'" class="issues">
            <div v-for="(issue, i) in issues" :key="i" class="issue" :class="issue.severity">
              <span class="badge">{{ issue.category }}</span>
              {{ issue.message }}
            </div>
            <p v-if="!issues.length" class="ok">未发现问题</p>
          </div>
          <pre v-else class="md">{{ markdown }}</pre>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 300;
  background: color-mix(in srgb, #000 45%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
}

.dialog {
  width: min(560px, 92vw);
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
}

header {
  display: flex;
  align-items: center;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
}

header h3 {
  margin: 0;
  flex: 1;
  font-size: 14px;
}

.close {
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--text-muted);
}

.tabs {
  display: flex;
  gap: 4px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
}

.tabs button {
  flex: 1;
  padding: 5px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: transparent;
  font-size: 11px;
  cursor: pointer;
}

.tabs button.active {
  border-color: var(--accent);
  color: var(--accent);
}

.body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 14px;
}

.summary-line {
  font-size: 12px;
  color: var(--text-sub);
  margin: 0 0 12px;
}

.issue {
  padding: 8px;
  margin-bottom: 6px;
  border-radius: 6px;
  font-size: 12px;
  border-left: 3px solid var(--border);
  background: var(--bg-secondary);
}

.issue.warning { border-left-color: var(--warning); }
.issue.error { border-left-color: var(--danger); }

.badge {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
  background: var(--bg-hover);
  margin-right: 6px;
}

.ok {
  color: var(--success, #22c55e);
  text-align: center;
  padding: 24px;
}

.md {
  white-space: pre-wrap;
  font-size: 11px;
  line-height: 1.6;
  color: var(--text-secondary);
  margin: 0;
}
</style>
