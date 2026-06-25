<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { RefreshCw, GitBranch, ArrowDown, ArrowUp } from 'lucide-vue-next'
import PanelShell from '@/components/layouts/PanelShell.vue'
import { ideApi, type GitBranch as GitBranchInfo, type GitStatusItem } from '@/services/ideApi'

const props = defineProps<{
  rootPath: string
  onOutput?: (title: string, text: string) => void
}>()

const loading = ref(false)
const error = ref('')
const isRepo = ref(false)
const currentBranch = ref('')
const branches = ref<GitBranchInfo[]>([])
const statusItems = ref<GitStatusItem[]>([])
const commitMessage = ref('')
const actionBusy = ref(false)
const actionError = ref('')
const diffOpen = ref(false)
const diffFile = ref('')
const diffText = ref('')

const unstaged = computed(() => statusItems.value.filter((s) => !s.isStaged))
const staged = computed(() => statusItems.value.filter((s) => s.isStaged))

function errMsg(e: unknown, fallback: string) {
  return typeof e === 'string' ? e : e instanceof Error ? e.message : fallback
}

async function refresh() {
  if (!props.rootPath) {
    isRepo.value = false
    return
  }
  loading.value = true
  error.value = ''
  try {
    isRepo.value = await ideApi.isGitRepository(props.rootPath)
    if (!isRepo.value) {
      currentBranch.value = ''
      branches.value = []
      statusItems.value = []
      return
    }
    currentBranch.value = await ideApi.gitCurrentBranch(props.rootPath)
    branches.value = await ideApi.gitBranches(props.rootPath)
    statusItems.value = await ideApi.gitStatus(props.rootPath)
  } catch (e: unknown) {
    error.value = errMsg(e, '加载 Git 信息失败')
  } finally {
    loading.value = false
  }
}

async function runAction(fn: () => Promise<void>) {
  actionBusy.value = true
  actionError.value = ''
  try {
    await fn()
    await refresh()
  } catch (e: unknown) {
    actionError.value = errMsg(e, '操作失败')
  } finally {
    actionBusy.value = false
  }
}

async function initRepo() {
  await runAction(async () => {
    await ideApi.gitInit(props.rootPath)
    props.onOutput?.('Git', '已初始化仓库')
  })
}

async function stageAll() {
  const files = unstaged.value.map((s) => s.path)
  if (!files.length) return
  await runAction(() => ideApi.gitAdd(props.rootPath, files))
}

async function commit() {
  const msg = commitMessage.value.trim()
  if (!msg) return
  await runAction(async () => {
    await ideApi.gitCommit(props.rootPath, msg)
    commitMessage.value = ''
    props.onOutput?.('Git', `已提交: ${msg}`)
  })
}

async function checkout(name: string) {
  await runAction(() => ideApi.gitCheckout(props.rootPath, name))
}

async function pull() {
  await runAction(async () => {
    await ideApi.gitPull(props.rootPath)
    props.onOutput?.('Git Pull', '拉取完成')
  })
}

async function push() {
  await runAction(async () => {
    await ideApi.gitPush(props.rootPath)
    props.onOutput?.('Git Push', '推送完成')
  })
}

async function showDiff(file: string) {
  diffFile.value = file
  diffOpen.value = true
  diffText.value = '加载中…'
  try {
    const data = await ideApi.gitDiff(props.rootPath, file)
    const hunks = data.hunks as { lines?: string[] }[] | undefined
    if (Array.isArray(hunks)) {
      diffText.value = hunks.flatMap((h) => h.lines ?? []).join('\n') || '（无差异）'
    } else {
      diffText.value = String(data.patch ?? data.diff ?? JSON.stringify(data, null, 2))
    }
  } catch (e: unknown) {
    diffText.value = errMsg(e, '无法加载 diff')
  }
}

watch(() => props.rootPath, () => void refresh(), { immediate: true })
</script>

<template>
  <PanelShell title="源代码管理" subtitle="Git">
    <template #actions>
      <button type="button" class="icon-action" :disabled="loading" title="刷新" @click="refresh">
        <RefreshCw :size="14" :class="{ spin: loading }" />
      </button>
    </template>

    <template v-if="error || actionError" #alert>
      <div class="git-error">{{ error || actionError }}</div>
    </template>

    <div v-if="!rootPath" class="git-empty">请先打开文件夹</div>
    <div v-else-if="!isRepo" class="git-empty">
      <p>当前目录不是 Git 仓库</p>
      <button type="button" class="git-btn" :disabled="actionBusy" @click="initRepo">初始化仓库</button>
    </div>
    <div v-else class="git-body">
      <div class="git-branch">
        <GitBranch :size="14" />
        <select
          class="branch-select"
          :value="currentBranch"
          :disabled="actionBusy"
          @change="checkout(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="b in branches.filter((x: GitBranchInfo) => !x.isRemote)" :key="b.name" :value="b.name">
            {{ b.name }}
          </option>
        </select>
        <button type="button" class="git-btn-sm" :disabled="actionBusy" title="拉取" @click="pull"><ArrowDown :size="12" /></button>
        <button type="button" class="git-btn-sm" :disabled="actionBusy" title="推送" @click="push"><ArrowUp :size="12" /></button>
      </div>

      <div v-if="staged.length" class="git-section">
        <div class="section-title">已暂存 ({{ staged.length }})</div>
        <button
          v-for="s in staged"
          :key="'s-' + s.path"
          type="button"
          class="file-row"
          @click="showDiff(s.path)"
        >
          <span class="status staged">S</span>
          <span class="file-name">{{ s.path }}</span>
        </button>
      </div>

      <div v-if="unstaged.length" class="git-section">
        <div class="section-title">
          更改 ({{ unstaged.length }})
          <button type="button" class="link-btn" :disabled="actionBusy" @click="stageAll">全部暂存</button>
        </div>
        <button
          v-for="s in unstaged"
          :key="'u-' + s.path"
          type="button"
          class="file-row"
          @click="showDiff(s.path)"
        >
          <span class="status">{{ s.status.slice(0, 1).toUpperCase() }}</span>
          <span class="file-name">{{ s.path }}</span>
        </button>
      </div>

      <div v-if="!staged.length && !unstaged.length" class="git-empty">工作区干净</div>

      <div class="commit-box">
        <textarea
          v-model="commitMessage"
          class="commit-input"
          placeholder="提交说明…"
          rows="3"
        />
        <button
          type="button"
          class="git-btn"
          :disabled="actionBusy || !commitMessage.trim()"
          @click="commit"
        >
          提交
        </button>
      </div>
    </div>

    <div v-if="diffOpen" class="diff-overlay" @click.self="diffOpen = false">
      <div class="diff-modal">
        <div class="diff-header">
          <span>{{ diffFile }}</span>
          <button type="button" class="link-btn" @click="diffOpen = false">关闭</button>
        </div>
        <pre class="diff-content">{{ diffText }}</pre>
      </div>
    </div>
  </PanelShell>
</template>

<style scoped>
.icon-action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 4px;
}
.icon-action:hover { background: var(--bg-hover); color: var(--text-main); }
.spin { animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.git-error {
  padding: 6px 12px;
  font-size: 11px;
  color: var(--danger);
}
.git-empty {
  padding: 16px 12px;
  font-size: 11px;
  color: var(--text-muted);
  text-align: center;
}
.git-body {
  padding: 8px 0;
  font-size: 11px;
}
.git-branch {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px 8px;
  color: var(--text-main);
}
.branch-select {
  flex: 1;
  font-size: 11px;
  padding: 4px 6px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-input);
  color: var(--text-main);
}
.git-btn-sm {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-input);
  color: var(--text-sub);
  cursor: pointer;
}
.git-btn-sm:hover { border-color: var(--accent); }
.git-section { margin-bottom: 8px; }
.section-title {
  display: flex;
  justify-content: space-between;
  padding: 4px 12px;
  font-weight: 600;
  color: var(--text-muted);
  font-size: 10px;
  text-transform: uppercase;
}
.file-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 4px 12px;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
  color: var(--text-sub);
  font-size: 11px;
}
.file-row:hover { background: var(--bg-hover); color: var(--text-main); }
.status {
  width: 14px;
  font-weight: 700;
  color: var(--warning);
}
.status.staged { color: var(--success); }
.file-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.link-btn {
  border: none;
  background: none;
  font-size: 10px;
  color: var(--accent);
  cursor: pointer;
}
.commit-box {
  padding: 8px 12px;
  border-top: 1px solid var(--border);
}
.commit-input {
  width: 100%;
  margin-bottom: 6px;
  padding: 6px 8px;
  font-size: 11px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-input);
  color: var(--text-main);
  resize: vertical;
}
.git-btn {
  width: 100%;
  padding: 6px;
  font-size: 11px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-input);
  color: var(--text-main);
  cursor: pointer;
}
.git-btn:hover:not(:disabled) { border-color: var(--accent); }
.git-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.diff-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
}
.diff-modal {
  width: min(720px, 90vw);
  max-height: 80vh;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.diff-header {
  display: flex;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
  color: var(--text-main);
}
.diff-content {
  flex: 1;
  margin: 0;
  padding: 12px;
  overflow: auto;
  font-family: monospace;
  font-size: 11px;
  color: var(--text-sub);
  white-space: pre-wrap;
}
</style>
