<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { RefreshCw, GitBranch, Check, ArrowDown, ArrowUp, Sparkles } from 'lucide-vue-next'
import GitCommitGraph, { type GitGraphLine } from '@/components/ui/GitCommitGraph.vue'
import { ScmCollapsible, Button, Input, Alert, AlertDescription, Label, Modal } from '@/components/ui'
import GitFileRow from '@/components/git/GitFileRow.vue'
import GitBranchPicker from '@/components/git/GitBranchPicker.vue'
import ScmCommitMessage from '@/components/git/ScmCommitMessage.vue'

type GitBranch = { name: string; isCurrent: boolean; isRemote: boolean }
type GitStatusItem = { path: string; status: string; isStaged: boolean }
type GitGraphLine = { graph: string; hash: string; message: string; author: string; timestamp: number; refs: string }

const props = defineProps<{
  rootPath: string
  onOutput?: (title: string, text: string) => void
}>()

const loading = ref(false)
const error = ref('')
const isRepo = ref(false)
const currentBranch = ref('')
const branches = ref<GitBranch[]>([])
const statusItems = ref<GitStatusItem[]>([])
const graphLines = ref<GitGraphLine[]>([])
const selectedPaths = ref<Record<string, boolean>>({})
const selectedStagedPaths = ref<Record<string, boolean>>({})
const actionBusy = ref(false)
const actionError = ref('')
const stagedExpanded = ref(false)
const changesExpanded = ref(false)
const graphExpanded = ref(false)
const selectedCommitHash = ref('')
const commitDetailBusy = ref(false)
const commitMessage = ref('')
const commitAiBusy = ref(false)
const commitAiError = ref('')
const aheadBy = ref(0)
const behindBy = ref(0)
const createLocalOpen = ref(false)
const createLocalName = ref('')
const createRemoteOpen = ref(false)
const createRemoteName = ref('')
const createRemoteLocalName = ref('')
const diffOpen = ref(false)
const diffLoading = ref(false)
const diffError = ref('')
const diffFile = ref('')
const diffData = ref<Record<string, unknown> | null>(null)

function errMsg(e: unknown, fallback: string) {
  return typeof e === 'string' ? e : e instanceof Error ? e.message : fallback
}

async function openDiff(file: string) {
  if (!props.rootPath || !file) return
  diffOpen.value = true
  diffFile.value = file
  diffLoading.value = true
  diffError.value = ''
  diffData.value = null
  try {
    const { invoke } = await import('@tauri-apps/api/tauri')
    diffData.value = (await invoke('git_diff', { path: props.rootPath, file })) as Record<string, unknown>
  } catch (e: unknown) {
    diffError.value = errMsg(e, 'Failed to load diff.')
  } finally {
    diffLoading.value = false
  }
}

async function refresh() {
  if (!props.rootPath) {
    isRepo.value = false
    currentBranch.value = ''
    branches.value = []
    statusItems.value = []
    graphLines.value = []
    selectedPaths.value = {}
    selectedStagedPaths.value = {}
    aheadBy.value = 0
    behindBy.value = 0
    error.value = ''
    return
  }
  loading.value = true
  error.value = ''
  try {
    const { invoke } = await import('@tauri-apps/api/tauri')
    const repo = await invoke<boolean>('is_git_repository', { path: props.rootPath })
    isRepo.value = !!repo
    if (!repo) {
      currentBranch.value = ''
      branches.value = []
      statusItems.value = []
      graphLines.value = []
      selectedPaths.value = {}
      selectedStagedPaths.value = {}
      aheadBy.value = 0
      behindBy.value = 0
      return
    }
    currentBranch.value = (await invoke<string | null>('git_current_branch', { path: props.rootPath })) ?? ''
    const raw = await invoke<unknown[]>('git_branches', { path: props.rootPath })
    branches.value = Array.isArray(raw)
      ? raw.map((x) => {
          const item = x as Record<string, unknown>
          return { name: String(item.name ?? ''), isCurrent: !!item.isCurrent, isRemote: !!item.isRemote }
        }).filter((x) => x.name)
      : []
    const rawStatus = await invoke<unknown[]>('git_status', { path: props.rootPath })
    statusItems.value = Array.isArray(rawStatus)
      ? rawStatus.map((x) => {
          const item = x as Record<string, unknown>
          return { path: String(item.path ?? ''), status: String(item.status ?? ''), isStaged: !!item.isStaged }
        }).filter((x) => x.path)
      : []
    const rawGraph = (await invoke('git_branch_graph', { path: props.rootPath })) as Record<string, unknown>
    const rawLines = rawGraph?.lines
    graphLines.value = Array.isArray(rawLines)
      ? rawLines.map((x) => {
          const item = x as Record<string, unknown>
          return {
            graph: String(item.graph ?? ''),
            hash: String(item.hash ?? ''),
            message: String(item.message ?? ''),
            author: String(item.author ?? ''),
            timestamp: typeof item.timestamp === 'number' ? item.timestamp : 0,
            refs: String(item.refs ?? ''),
          }
        }).filter((x) => x.hash)
      : []
    try {
      const porcelain = await invoke<string>('execute_command', {
        command: 'git status --porcelain=2 --branch',
        working_dir: props.rootPath,
      })
      const lines = String(porcelain || '').split(/\r?\n/)
      const abLine = lines.find((l) => l.startsWith('# branch.ab')) ?? ''
      const abMatch = abLine.match(/#\s+branch\.ab\s+\+(\d+)\s+\-(\d+)/)
      if (abMatch) {
        aheadBy.value = Number(abMatch[1]) || 0
        behindBy.value = Number(abMatch[2]) || 0
      } else {
        const sb = await invoke<string>('execute_command', { command: 'git status -sb', working_dir: props.rootPath })
        const firstLine = String(sb || '').split(/\r?\n/)[0] ?? ''
        aheadBy.value = Number(firstLine.match(/\[.*?ahead\s+(\d+).*?\]/)?.[1]) || 0
        behindBy.value = Number(firstLine.match(/\[.*?behind\s+(\d+).*?\]/)?.[1]) || 0
      }
    } catch {
      aheadBy.value = 0
      behindBy.value = 0
    }
  } catch (e: unknown) {
    error.value = errMsg(e, 'Failed to load git info.')
    isRepo.value = false
    currentBranch.value = ''
    branches.value = []
    statusItems.value = []
    graphLines.value = []
    selectedPaths.value = {}
    selectedStagedPaths.value = {}
    aheadBy.value = 0
    behindBy.value = 0
  } finally {
    loading.value = false
  }
}

async function runAction(fn: (invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>) => Promise<void>) {
  if (!props.rootPath) return
  actionBusy.value = true
  actionError.value = ''
  try {
    const { invoke } = await import('@tauri-apps/api/tauri')
    await fn(invoke)
    selectedPaths.value = {}
    selectedStagedPaths.value = {}
    await refresh()
  } catch (e: unknown) {
    actionError.value = errMsg(e, 'Action failed.')
  } finally {
    actionBusy.value = false
  }
}

async function checkoutBranch(name: string) {
  await runAction(async (invoke) => {
    await invoke('git_checkout', { path: props.rootPath, branch: name })
  })
}

function openCreateLocal() {
  createLocalName.value = ''
  createLocalOpen.value = true
}

async function submitCreateLocal() {
  const name = createLocalName.value.trim()
  if (!name) return
  await runAction(async (invoke) => {
    await invoke('git_create_branch', { path: props.rootPath, branch: name })
    await invoke('git_checkout', { path: props.rootPath, branch: name })
  })
  createLocalOpen.value = false
  createLocalName.value = ''
}

function openCreateFromRemote(remoteName: string) {
  createRemoteName.value = remoteName
  createRemoteLocalName.value = remoteName.includes('/') ? remoteName.split('/').slice(1).join('/') : remoteName
  createRemoteOpen.value = true
}

async function submitCreateFromRemote() {
  const remoteName = createRemoteName.value.trim()
  const localName = createRemoteLocalName.value.trim()
  if (!remoteName || !localName) return
  await runAction(async (invoke) => {
    await invoke('execute_command', {
      command: `git checkout -b "${localName.replace(/"/g, "'")}" --track "${remoteName.replace(/"/g, "'")}"`,
      working_dir: props.rootPath,
    })
  })
  createRemoteOpen.value = false
  createRemoteName.value = ''
  createRemoteLocalName.value = ''
}

async function stagePaths(paths: string[]) {
  if (!paths.length) return
  await runAction(async (invoke) => {
    await invoke('git_add', { path: props.rootPath, files: paths })
  })
}

async function unstagePaths(paths: string[]) {
  if (!paths.length) return
  const args = paths.map((p) => `"${String(p).replace(/"/g, "'")}"`).join(' ')
  await runAction(async (invoke) => {
    await invoke('execute_command', { command: `git reset HEAD -- ${args}`, working_dir: props.rootPath })
  })
}

async function pull() {
  props.onOutput?.('git pull', 'START')
  try {
    let out = ''
    await runAction(async (invoke) => {
      out = String((await invoke('git_pull', { path: props.rootPath })) ?? '')
    })
    props.onOutput?.('git pull', out || 'DONE')
  } catch (e: unknown) {
    props.onOutput?.('git pull', `ERROR: ${errMsg(e, 'Git pull failed.')}`)
  }
}

async function push() {
  props.onOutput?.('git push', 'START')
  try {
    let out = ''
    await runAction(async (invoke) => {
      out = String((await invoke('git_push', { path: props.rootPath })) ?? '')
    })
    props.onOutput?.('git push', out || 'DONE')
  } catch (e: unknown) {
    props.onOutput?.('git push', `ERROR: ${errMsg(e, 'Git push failed.')}`)
  }
}

async function commitAll() {
  const msg = commitMessage.value.trim()
  if (!msg) return
  const safeMsg = msg.replace(/\r?\n/g, ' ').replace(/"/g, "'")
  await runAction(async (invoke) => {
    await invoke('execute_command', { command: 'git add -A', working_dir: props.rootPath })
    await invoke('git_commit', { path: props.rootPath, message: safeMsg })
  })
  commitMessage.value = ''
}

async function generateCommitMessageWithAi() {
  if (!props.rootPath || commitAiBusy.value) return
  commitAiBusy.value = true
  commitAiError.value = ''
  try {
    const { invoke } = await import('@tauri-apps/api/tauri')
    const stagedLocal = statusItems.value.filter((s) => s.isStaged)
    const unstagedLocal = statusItems.value.filter((s) => !s.isStaged)
    const uniquePaths = Array.from(new Set([...unstagedLocal.map((s) => s.path), ...stagedLocal.map((s) => s.path)].filter(Boolean)))
    if (!uniquePaths.length) {
      commitAiError.value = '没有检测到改动文件'
      return
    }
    let buf = ''
    let usedFiles = 0
    let truncated = false
    for (const file of uniquePaths.slice(0, 20)) {
      let diff: Record<string, unknown> | null = null
      try {
        diff = (await invoke('git_diff', { path: props.rootPath, file })) as Record<string, unknown>
      } catch {
        diff = null
      }
      let diffText = ''
      const hunks = Array.isArray(diff?.hunks) ? diff.hunks : []
      for (const h of hunks as Record<string, unknown>[]) {
        const lines = Array.isArray(h.lines) ? h.lines : []
        for (const ln of lines as Record<string, unknown>[]) {
          const t = String(ln.type || 'context')
          diffText += (t === 'added' ? '+' : t === 'deleted' ? '-' : ' ') + String(ln.content ?? '') + '\n'
          if (diffText.length > 2000) {
            diffText += '...(diff truncated)\n'
            break
          }
        }
        if (diffText.includes('...(diff truncated)')) break
      }
      const chunk = `### ${file}\n+${diff?.additions ?? ''} -${diff?.deletions ?? ''}\n\n${diffText}\n`
      if (buf.length + chunk.length > 12000) {
        truncated = true
        break
      }
      buf += chunk
      usedFiles++
    }
    if (uniquePaths.length > usedFiles) truncated = true
    const aiConfig = (await invoke('ai_get_config')) as Record<string, unknown>
    const model = typeof aiConfig.model === 'string' && aiConfig.model.trim() ? aiConfig.model : 'gpt-3.5-turbo'
    const system = `你是 GoPilot 的 Git commit message 生成助手。请根据提供的改动信息生成一个高质量、信息全面、符合 Conventional Commits 的 commit message。

输出格式要求（严格）：
- 只输出 commit message 纯文本，不要解释、不要 markdown、不要代码块
- 第一行必须是 Conventional Commits header：<type>(<scope>): <subject> 或 <type>: <subject>
- type 必须从：feat, fix, refactor, perf, docs, test, chore, build, ci, style, revert 里选
- subject 必须是具体内容，禁止出现占位符/模板
- subject 使用英文小写开头（除专有名词），尽量 <= 72 字符
- 如有必要，可以追加 body（空一行后），用条目列出关键改动点（每条以 - 开头）

内容要求：
- 必须覆盖最重要的用户可感知变化与关键技术改动
- 如果信息不足，做最合理的概括，但不要编造不存在的功能`
    const user = `项目路径：${props.rootPath}\n当前分支：${currentBranch.value || '(unknown)'}\n\n改动文件总数：${uniquePaths.length}${truncated ? '（diff 已截断/压缩）' : ''}\n\nStaged files:\n${stagedLocal.map((s) => `${s.status}\t${s.path}`).join('\n') || '(none)'}\n\nUnstaged files:\n${unstagedLocal.map((s) => `${s.status}\t${s.path}`).join('\n') || '(none)'}\n\nDiff:\n${buf}`
    const resp = (await invoke('ai_chat', {
      request: { model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature: 0.2, max_tokens: 320, stream: false },
    })) as Record<string, unknown>
    const choices = resp.choices as Record<string, unknown>[] | undefined
    const message = choices?.[0]?.message as Record<string, unknown> | undefined
    const text = message?.content != null ? String(message.content) : ''
    const cleaned = String(text || '').replace(/```[a-zA-Z]*\n?/g, '').replace(/```/g, '').replace(/\r\n/g, '\n').trim()
    const lines = cleaned.split('\n').map((l) => l.trim()).filter(Boolean)
    const headerRe = /^(feat|fix|refactor|perf|docs|test|chore|build|ci|style|revert)(\([^)]+\))?(!)?:\s+.+/i
    let headerLine = lines.find((l) => headerRe.test(l)) ?? lines.find((l) => /:/.test(l)) ?? ''
    headerLine = headerLine.replace(/^\s*(type\s*:|scope\s*:|subject\s*:)/i, '').trim()
    if (!headerLine || !headerRe.test(headerLine)) {
      commitAiError.value = 'AI 返回的 commit message 不符合 Conventional Commits header 格式'
      return
    }
    const bodyLines: string[] = []
    let inBody = false
    for (const l of lines) {
      if (!inBody) {
        if (l === headerLine) inBody = true
        continue
      }
      if (/^breaking change\s*:/i.test(l) || l.startsWith('- ')) bodyLines.push(l)
    }
    const next = [headerLine, bodyLines.length ? '' : null, bodyLines.length ? bodyLines.join('\n') : null].filter((x) => x != null).join('\n').trim()
    if (!next) {
      commitAiError.value = 'AI 未返回 commit message'
      return
    }
    commitMessage.value = next
  } catch (e: unknown) {
    commitAiError.value = errMsg(e, 'AI 生成失败')
  } finally {
    commitAiBusy.value = false
  }
}

const localBranches = computed(() => branches.value.filter((b) => !b.isRemote))
const remoteBranches = computed(() => branches.value.filter((b) => b.isRemote))
const staged = computed(() => statusItems.value.filter((s) => s.isStaged))
const unstaged = computed(() => statusItems.value.filter((s) => !s.isStaged))
const repoFolderName = computed(() => {
  if (!props.rootPath) return ''
  return props.rootPath.split(/[/\\]/).filter(Boolean).pop() ?? props.rootPath
})
const syncLabel = computed(() => {
  if (aheadBy.value > 0 && behindBy.value > 0) return `↓${behindBy.value} ↑${aheadBy.value}`
  if (aheadBy.value > 0) return `↑${aheadBy.value}`
  if (behindBy.value > 0) return `↓${behindBy.value}`
  return ''
})

async function showCommitDetail(line: GitGraphLine) {
  if (!props.rootPath || commitDetailBusy.value) return
  selectedCommitHash.value = line.hash
  commitDetailBusy.value = true
  try {
    const { invoke } = await import('@tauri-apps/api/tauri')
    const detail = await invoke<string>('git_show', { path: props.rootPath, commit: line.hash })
    const when = line.timestamp
      ? new Date(line.timestamp * 1000).toLocaleString()
      : ''
    const summary = [
      `commit ${line.hash}`,
      `Author: ${line.author ?? 'unknown'}`,
      when ? `Date:   ${when}` : '',
      '',
      `    ${line.message}`,
      line.refs ? `\nRefs: ${line.refs}` : '',
      '',
      '─'.repeat(60),
      '',
      detail,
    ]
      .filter((x) => x !== '')
      .join('\n')
    props.onOutput?.(`git show ${line.hash}`, summary)
  } catch (e: unknown) {
    props.onOutput?.('git show', errMsg(e, 'Failed to load commit details.'))
  } finally {
    commitDetailBusy.value = false
  }
}

function togglePath(path: string) {
  selectedPaths.value = { ...selectedPaths.value, [path]: !selectedPaths.value[path] }
}

function toggleStagedPath(path: string) {
  selectedStagedPaths.value = { ...selectedStagedPaths.value, [path]: !selectedStagedPaths.value[path] }
}

watch(() => props.rootPath, () => void refresh(), { immediate: true })
</script>

<template>
  <div class="flex h-full flex-col bg-background">
    <div class="flex h-10 shrink-0 items-center justify-between border-b border-border px-3">
      <div class="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Source Control</div>
      <div class="flex gap-1">
        <Button variant="ghost" size="icon-sm" title="Refresh" :disabled="loading || actionBusy" @click="refresh">
          <RefreshCw :class="loading ? 'animate-spin' : ''" />
        </Button>
        <Button variant="ghost" size="icon-sm" title="Pull" :disabled="actionBusy" @click="pull">
          <ArrowDown />
        </Button>
        <Button variant="ghost" size="icon-sm" title="Push" :disabled="actionBusy || aheadBy <= 0" @click="push">
          <ArrowUp />
        </Button>
      </div>
    </div>

    <Alert v-if="error" variant="destructive" class="mx-3 mt-2">
      <AlertDescription>{{ error }}</AlertDescription>
    </Alert>
    <Alert v-if="actionError" variant="destructive" class="mx-3 mt-2">
      <AlertDescription>{{ actionError }}</AlertDescription>
    </Alert>

    <div v-if="!rootPath" class="p-3 text-xs text-muted-foreground">Open a folder to view source control.</div>
    <div v-else-if="loading" class="p-3 text-xs text-muted-foreground">Loading…</div>
    <div v-else-if="!isRepo" class="p-3 text-xs text-muted-foreground">No Git repository found in this folder.</div>

    <div v-else class="flex flex-col flex-1 min-h-0 overflow-hidden">
      <Modal :open="createLocalOpen" title="Create Branch" @close="createLocalOpen = false">
        <Label class="mb-1 text-[11px] text-muted-foreground">Branch name</Label>
        <Input
          v-model="createLocalName"
          placeholder="feature/my-work"
          :disabled="actionBusy"
          @keydown.enter="submitCreateLocal"
        />
        <template #footer>
          <div class="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" @click="createLocalOpen = false">Cancel</Button>
            <Button size="sm" :disabled="actionBusy || !createLocalName.trim()" @click="submitCreateLocal">
              Create
            </Button>
          </div>
        </template>
      </Modal>

      <Modal
        :open="diffOpen"
        :title="diffFile ? `Diff: ${diffFile}` : 'Diff'"
        width-class-name="w-[720px]"
        @close="diffOpen = false"
      >
        <div v-if="diffLoading" class="text-xs text-muted-foreground">Loading…</div>
        <div v-else-if="diffError" class="text-xs text-destructive whitespace-pre-wrap">{{ diffError }}</div>
        <div v-else-if="!diffData" class="text-xs text-muted-foreground">—</div>
        <div v-else class="text-xs font-mono overflow-auto">
          <div v-if="Array.isArray(diffData.hunks) && diffData.hunks.length" class="space-y-3">
            <div
              v-for="(h, idx) in diffData.hunks as Record<string, unknown>[]"
              :key="idx"
              class="rounded border border-border"
            >
              <div class="border-b border-border bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground">
                @@ -{{ h.oldStart ?? 0 }},{{ h.oldLines ?? 0 }} +{{ h.newStart ?? 0 }},{{ h.newLines ?? 0 }} @@
              </div>
              <div class="px-2 py-1 overflow-auto">
                <div
                  v-for="(ln, i) in (h.lines as Record<string, unknown>[] ?? [])"
                  :key="i"
                  class="whitespace-pre"
                  :class="
                    String(ln.type) === 'added'
                      ? 'text-green-700 dark:text-green-400'
                      : String(ln.type) === 'deleted'
                        ? 'text-red-700 dark:text-red-400'
                        : 'text-foreground'
                  "
                >
                  {{ String(ln.type) === 'added' ? '+' : String(ln.type) === 'deleted' ? '-' : ' ' }}{{ ln.content }}
                </div>
              </div>
            </div>
          </div>
          <div v-else class="text-xs text-muted-foreground">No diff.</div>
        </div>
        <template #footer>
          <div class="flex items-center justify-between">
            <div class="text-[11px] text-muted-foreground">
              {{
                diffData?.additions != null || diffData?.deletions != null
                  ? `+${diffData?.additions ?? 0}  -${diffData?.deletions ?? 0}`
                  : ''
              }}
            </div>
            <Button variant="outline" size="sm" @click="diffOpen = false">Close</Button>
          </div>
        </template>
      </Modal>

      <Modal :open="createRemoteOpen" title="Create Tracking Branch" @close="createRemoteOpen = false">
        <Label class="mb-1 text-[11px] text-muted-foreground">Remote</Label>
        <div class="mb-3 font-mono text-sm text-foreground">{{ createRemoteName || '—' }}</div>
        <Label class="mb-1 text-[11px] text-muted-foreground">Local branch name</Label>
        <Input
          v-model="createRemoteLocalName"
          placeholder="feature/my-work"
          :disabled="actionBusy"
          @keydown.enter="submitCreateFromRemote"
        />
        <template #footer>
          <div class="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" @click="createRemoteOpen = false">Cancel</Button>
            <Button size="sm" :disabled="actionBusy || !createRemoteLocalName.trim()" @click="submitCreateFromRemote">
              Create
            </Button>
          </div>
        </template>
      </Modal>

      <div class="shrink-0">
      <div class="flex shrink-0 items-center gap-2 px-3 pb-1 pt-2.5">
        <GitBranch class="h-4 w-4 shrink-0 text-muted-foreground" />
        <div class="min-w-0 flex-1">
          <div class="truncate text-xs font-medium text-foreground">{{ repoFolderName }}</div>
          <div v-if="syncLabel" class="text-[10px] text-muted-foreground">{{ syncLabel }}</div>
        </div>
      </div>

      <GitBranchPicker
        :current-branch="currentBranch"
        :local-branches="localBranches"
        :remote-branches="remoteBranches"
        :disabled="actionBusy"
        @checkout="checkoutBranch"
        @create-local="openCreateLocal"
        @create-from-remote="openCreateFromRemote"
      />

      <div class="border-b border-border px-3 pb-3">
        <ScmCommitMessage
          v-model="commitMessage"
          :disabled="actionBusy"
          :ai-busy="commitAiBusy"
          :ai-error="commitAiError"
          :can-ai="!!(unstaged.length || staged.length)"
          :can-commit="!!commitMessage.trim()"
          @commit="commitAll"
          @generate-ai="generateCommitMessageWithAi"
        >
          <template #ai-icon>
            <Sparkles class="h-3.5 w-3.5" />
          </template>
          <template #commit-icon>
            <Check class="h-3.5 w-3.5" />
          </template>
        </ScmCommitMessage>
      </div>
      </div>

      <div class="pointer-events-none min-h-0 flex-1" />

      <div class="shrink-0 max-h-[68%] overflow-auto border-t border-border bg-background">
      <ScmCollapsible v-model:open="stagedExpanded" title="Staged Changes" :count="staged.length">
        <template #actions>
          <Button
            variant="ghost"
            size="icon-sm"
            class="h-5 w-5 text-sm"
            title="Unstage all"
            :disabled="actionBusy || !staged.length"
            @click.stop="unstagePaths(staged.map((s) => s.path))"
          >
            −
          </Button>
        </template>
        <div v-if="!staged.length" class="px-5 py-1 text-xs text-muted-foreground">No staged changes.</div>
        <GitFileRow
          v-for="s in staged"
          :key="`staged:${s.path}`"
          :path="s.path"
          :status="s.status"
          staged
          :selected="!!selectedStagedPaths[s.path]"
          :disabled="actionBusy"
          @click="toggleStagedPath(s.path)"
          @stage="unstagePaths([s.path])"
          @unstage="unstagePaths([s.path])"
          @diff="openDiff(s.path)"
        />
      </ScmCollapsible>

      <ScmCollapsible v-model:open="changesExpanded" title="Changes" :count="unstaged.length">
        <template #actions>
          <Button
            variant="ghost"
            size="icon-sm"
            class="h-5 w-5 text-sm"
            title="Stage all"
            :disabled="actionBusy || !unstaged.length"
            @click.stop="stagePaths(unstaged.map((s) => s.path))"
          >
            +
          </Button>
        </template>
        <div v-if="!unstaged.length && !staged.length" class="px-5 py-1 text-xs text-muted-foreground">
          Working tree clean.
        </div>
        <div v-else-if="!unstaged.length" class="px-5 py-1 text-xs text-muted-foreground">No unstaged changes.</div>
        <GitFileRow
          v-for="s in unstaged"
          :key="`unstaged:${s.path}`"
          :path="s.path"
          :status="s.status"
          :selected="!!selectedPaths[s.path]"
          :disabled="actionBusy"
          @click="togglePath(s.path)"
          @stage="stagePaths([s.path])"
          @diff="openDiff(s.path)"
        />
      </ScmCollapsible>

      <ScmCollapsible v-model:open="graphExpanded" title="Graph" :count="graphLines.length">
        <div v-if="!graphLines.length" class="px-5 py-1 text-xs text-muted-foreground">No commits to display.</div>
        <GitCommitGraph
          v-else
          :lines="graphLines"
          :selected-hash="selectedCommitHash"
          @select="showCommitDetail"
        />
      </ScmCollapsible>
      </div>
    </div>
  </div>
</template>
