<script setup lang="ts">
import { computed } from 'vue'
import { Plus, Minus, FileDiff } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const props = defineProps<{
  path: string
  status: string
  staged?: boolean
  selected?: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{
  click: []
  stage: []
  unstage: []
  diff: []
}>()

const fileName = computed(() => props.path.split(/[/\\]/).pop() ?? props.path)
const dirName = computed(() => {
  const parts = props.path.split(/[/\\]/).filter(Boolean)
  if (parts.length <= 1) return ''
  return parts.slice(0, -1).join('/')
})

const statusMeta = computed(() => {
  switch (props.status) {
    case 'added':
      return { letter: 'A', class: 'text-emerald-500' }
    case 'deleted':
      return { letter: 'D', class: 'text-destructive' }
    case 'renamed':
      return { letter: 'R', class: 'text-emerald-500' }
    case 'untracked':
      return { letter: 'U', class: 'text-emerald-500' }
    default:
      return { letter: 'M', class: 'text-amber-600' }
  }
})
</script>

<template>
  <div
    :class="
      cn(
        'group mx-1 flex min-h-[22px] cursor-pointer items-center gap-2 rounded-sm px-2 py-0.5 pl-5 hover:bg-accent/60',
        selected && 'bg-primary/10',
      )
    "
    @click="emit('click')"
  >
    <span :class="cn('w-4 shrink-0 text-center font-mono text-[11px] font-bold', statusMeta.class)">
      {{ statusMeta.letter }}
    </span>
    <div class="min-w-0 flex-1">
      <div class="truncate text-[13px] leading-4 text-foreground">{{ fileName }}</div>
      <div v-if="dirName" class="truncate text-[11px] leading-4 text-muted-foreground">{{ dirName }}</div>
    </div>
    <div class="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100" :class="selected && 'opacity-100'">
      <Button variant="ghost" size="icon-sm" title="Open diff" :disabled="disabled" @click.stop="emit('diff')">
        <FileDiff class="h-3.5 w-3.5" />
      </Button>
      <Button
        v-if="!staged"
        variant="ghost"
        size="icon-sm"
        title="Stage"
        :disabled="disabled"
        @click.stop="emit('stage')"
      >
        <Plus class="h-3.5 w-3.5" />
      </Button>
      <Button v-else variant="ghost" size="icon-sm" title="Unstage" :disabled="disabled" @click.stop="emit('unstage')">
        <Minus class="h-3.5 w-3.5" />
      </Button>
    </div>
  </div>
</template>
