<script setup lang="ts">
import { ref, watch } from 'vue'
import { ChevronDown, Check, Plus } from 'lucide-vue-next'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'

export type GitBranchItem = { name: string; isCurrent: boolean; isRemote: boolean }

const props = defineProps<{
  currentBranch: string
  localBranches: GitBranchItem[]
  remoteBranches: GitBranchItem[]
  disabled?: boolean
}>()

const emit = defineEmits<{
  checkout: [name: string]
  'create-local': []
  'create-from-remote': [remoteName: string]
}>()

const open = ref(false)

function onDocumentDown(e: MouseEvent) {
  const el = e.target as HTMLElement | null
  if (!el?.closest('[data-git-branch-picker]')) open.value = false
}

watch(open, (isOpen) => {
  if (!isOpen) return
  document.addEventListener('mousedown', onDocumentDown)
  return () => document.removeEventListener('mousedown', onDocumentDown)
})

function pickLocal(name: string) {
  open.value = false
  if (!props.disabled) emit('checkout', name)
}

function pickCreateLocal() {
  open.value = false
  if (!props.disabled) emit('create-local')
}

function pickRemote(name: string) {
  open.value = false
  if (!props.disabled) emit('create-from-remote', name)
}
</script>

<template>
  <div class="relative z-20 px-2 pb-2" data-git-branch-picker>
    <Button
      variant="outline"
      size="sm"
      class="h-7 w-full justify-between gap-2 px-2.5 font-mono text-xs"
      :disabled="disabled"
      @click="open = !open"
    >
      <span class="truncate">{{ currentBranch || 'detached' }}</span>
      <ChevronDown class="h-3.5 w-3.5 shrink-0 opacity-60" />
    </Button>

    <div
      v-if="open"
      class="absolute left-2 right-2 top-[calc(100%+4px)] z-[100] max-h-[280px] overflow-auto rounded-md border border-border bg-popover shadow-lg"
      @mousedown.stop
    >
      <div class="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        Local Branches
      </div>
      <button
        v-for="b in localBranches"
        :key="`local:${b.name}`"
        type="button"
        :class="
          cn(
            'flex min-h-[26px] w-full items-center gap-2 px-2.5 py-1 text-left text-xs hover:bg-accent',
            b.isCurrent && 'bg-primary/10',
          )
        "
        :disabled="disabled"
        @click="pickLocal(b.name)"
      >
        <Check v-if="b.isCurrent" class="h-3.5 w-3.5 shrink-0 text-primary" />
        <span v-else class="w-3.5 shrink-0" />
        <span class="truncate font-mono">{{ b.name }}</span>
      </button>
      <button
        type="button"
        class="flex min-h-[26px] w-full items-center gap-2 px-2.5 py-1 text-left text-xs text-primary hover:bg-accent"
        :disabled="disabled"
        @click="pickCreateLocal"
      >
        <Plus class="h-3.5 w-3.5 shrink-0" />
        <span>Create branch…</span>
      </button>

      <div
        v-if="remoteBranches.length"
        class="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground"
      >
        Remote Branches
      </div>
      <button
        v-for="b in remoteBranches"
        :key="`remote:${b.name}`"
        type="button"
        class="flex min-h-[26px] w-full items-center gap-2 px-2.5 py-1 text-left text-xs hover:bg-accent"
        :disabled="disabled"
        @click="pickRemote(b.name)"
      >
        <span class="w-3.5 shrink-0" />
        <span class="truncate font-mono">{{ b.name }}</span>
      </button>
    </div>
  </div>
</template>
