<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import type { WorkspaceDetail } from '@/core/types/workspace'
import { desktopApi } from '@/services/desktopApi'
import { isDesktop } from '@/services/runtime'

const props = defineProps<{
  visible: boolean
  workspace: WorkspaceDetail | null
  workspaceRoot: string | null
  loadChapterContent: (volId: string, chId: string) => Promise<string>
}>()

const emit = defineEmits<{ close: [] }>()

const format = ref<'epub' | 'docx' | 'fanqie' | 'qidian' | 'jinjiang' | 'volume_zip' | 'full_zip'>('epub')
const volumeId = ref('')
const exporting = ref(false)
const error = ref('')

const volumeOptions = computed(() =>
  (props.workspace?.volumes ?? []).map((v) => ({ id: v.id, title: v.title })),
)

watch(
  () => props.visible,
  (v) => {
    if (v && volumeOptions.value.length) volumeId.value = volumeOptions.value[0].id
  },
)

async function collectChapters() {
  const chapters: { title: string; content: string }[] = []
  if (!props.workspace) return chapters
  for (const vol of props.workspace.volumes) {
    for (const ch of vol.chapters) {
      const content = await props.loadChapterContent(vol.id, ch.id)
      chapters.push({ title: ch.title, content })
    }
  }
  return chapters
}

async function doExport() {
  if (!props.workspace || !props.workspaceRoot || !isDesktop()) {
    error.value = '需要桌面端并已打开工作区'
    return
  }
  exporting.value = true
  error.value = ''
  try {
    const chapters = await collectChapters()
    const book = props.workspace.book_name

    if (format.value === 'epub' || format.value === 'docx') {
      const dest = `${props.workspaceRoot}/${book}.${format.value === 'docx' ? 'docx' : 'epub'}`
      await desktopApi.exportBook({
        workspace_root: props.workspaceRoot,
        dest_path: dest,
        format: format.value,
        chapters,
      })
    } else if (format.value === 'volume_zip') {
      const dest = `${props.workspaceRoot}/${book}_${volumeId.value}.zip`
      await desktopApi.exportVolumeBundle(props.workspaceRoot, volumeId.value, dest)
    } else if (format.value === 'full_zip') {
      const dest = `${props.workspaceRoot}/.cinyuverse/backups/${book}_export.zip`
      await desktopApi.backupWorkspace(props.workspaceRoot, dest)
    } else {
      const dest = `${props.workspaceRoot}/${book}_${format.value}.txt`
      await desktopApi.exportPlatform(props.workspaceRoot, format.value, dest, chapters)
    }
    emit('close')
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '导出失败'
  } finally {
    exporting.value = false
  }
}
</script>

<template>
  <div v-if="visible" class="export-overlay" @click.self="emit('close')">
    <div class="export-dialog">
      <header>
        <h2>导出书籍</h2>
        <button type="button" class="close-btn" @click="emit('close')">✕</button>
      </header>
      <div class="body">
        <label class="field">
          <span>格式</span>
          <select v-model="format">
            <option value="epub">EPUB</option>
            <option value="docx">Word (.docx)</option>
            <option value="fanqie">番茄小说 TXT</option>
            <option value="qidian">起点中文网 TXT</option>
            <option value="jinjiang">晋江文学城 TXT</option>
            <option value="volume_zip">按分卷打包 ZIP</option>
            <option value="full_zip">全书 ZIP 压缩包</option>
          </select>
        </label>
        <label v-if="format === 'volume_zip'" class="field">
          <span>分卷</span>
          <select v-model="volumeId">
            <option v-for="v in volumeOptions" :key="v.id" :value="v.id">{{ v.title }}</option>
          </select>
        </label>
        <p class="hint">导出到工作区根目录或 `.cinyuverse/backups/`。</p>
        <p v-if="error" class="error">{{ error }}</p>
      </div>
      <footer>
        <button type="button" class="btn-secondary" @click="emit('close')">取消</button>
        <button type="button" class="btn-primary" :disabled="exporting" @click="doExport">
          {{ exporting ? '导出中…' : '开始导出' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.export-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: color-mix(in srgb, #000 45%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
}

.export-dialog {
  width: 400px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
}

header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
}

header h2 {
  margin: 0;
  font-size: 15px;
}

.close-btn {
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--text-muted);
}

.body {
  padding: 16px;
}

.hint {
  font-size: 12px;
  color: var(--text-muted);
  margin: 0 0 12px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
}

.field select {
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-input);
  color: var(--text-main);
}

.error {
  color: var(--danger);
  font-size: 12px;
  margin-top: 8px;
}

footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--border);
}

.btn-primary,
.btn-secondary {
  padding: 7px 14px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  border: 1px solid var(--border);
}

.btn-primary {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}

.btn-secondary {
  background: transparent;
  color: var(--text-sub);
}
</style>
