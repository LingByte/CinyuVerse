<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { detectMacPlatform, isModKey, modEnterLabel } from '@/utils/platform'

const notes = ref<{ id: string; content: string; created_at: string }[]>([])
const draft = ref('')
const wsId = ref('default')
const saveShortcutLabel = ref(modEnterLabel())

async function load() {
  if (window.electronAPI?.listInspiration) {
    notes.value = await window.electronAPI.listInspiration(wsId.value)
  } else {
    try {
      const raw = localStorage.getItem('cinyuverse-inspiration-' + wsId.value)
      notes.value = raw ? JSON.parse(raw) : []
    } catch { notes.value = [] }
  }
}

async function save() {
  const text = draft.value.trim()
  if (!text) return
  const note = { id: String(Date.now()), content: text, created_at: new Date().toISOString() }
  if (window.electronAPI?.addInspiration) {
    notes.value = await window.electronAPI.addInspiration(wsId.value, note)
  } else {
    notes.value.unshift(note)
    localStorage.setItem('cinyuverse-inspiration-' + wsId.value, JSON.stringify(notes.value))
  }
  draft.value = ''
}

function onDraftKeydown(e: KeyboardEvent) {
  if (isModKey(e) && e.key === 'Enter') {
    e.preventDefault()
    save()
  }
}

onMounted(async () => {
  const p = new URLSearchParams(window.location.search)
  wsId.value = p.get('wsId') || 'default'
  saveShortcutLabel.value = modEnterLabel(await detectMacPlatform())
  load()
  window.electronAPI?.onInspirationSaved?.(() => load())
})
</script>

<template>
  <div class="inspiration-page">
    <h3>灵感草稿箱</h3>
    <textarea v-model="draft" class="draft" placeholder="随手记录灵感…" @keydown="onDraftKeydown" />
    <button class="save-btn" @click="save">保存 ({{ saveShortcutLabel }})</button>
    <div class="list">
      <div v-for="n in notes" :key="n.id" class="note">{{ n.content }}</div>
      <div v-if="notes.length === 0" class="empty">暂无灵感记录</div>
    </div>
  </div>
</template>

<style scoped>
.inspiration-page {
  height: 100vh;
  padding: 12px;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  color: var(--text-main);
}
h3 { margin: 0 0 8px; font-size: 14px; }
.draft {
  flex-shrink: 0;
  min-height: 72px;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-input);
  color: var(--text-main);
  font-size: 13px;
  resize: vertical;
}
.save-btn {
  margin: 8px 0;
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  background: var(--accent);
  color: #fff;
  cursor: pointer;
  align-self: flex-end;
}
.list { flex: 1; overflow-y: auto; }
.note {
  padding: 8px;
  margin-bottom: 6px;
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 12px;
  background: var(--bg-card);
}
.empty { color: var(--text-sub); font-size: 12px; text-align: center; padding: 16px; }
</style>
