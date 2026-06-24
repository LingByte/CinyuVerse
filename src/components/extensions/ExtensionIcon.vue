<script setup lang="ts">
import { computed } from 'vue'
import { Package } from 'lucide-vue-next'
import { cn } from '@/lib/utils'

const props = withDefaults(
  defineProps<{
    iconKey: string
    label: string
    iconDataUrls: Record<string, string>
    iconFailed: Record<string, boolean>
    iconLoading?: Record<string, boolean>
    size?: 'sm' | 'md' | 'lg'
    fallback?: 'letter' | 'package'
  }>(),
  {
    size: 'md',
    fallback: 'letter',
  },
)

const sizeClass = computed(() => {
  if (props.size === 'lg') return 'h-16 w-16 text-xl'
  if (props.size === 'md') return 'h-10 w-10 text-sm'
  return 'h-8 w-8 text-xs'
})

const dataUrl = computed(() => props.iconDataUrls[props.iconKey])
const failed = computed(() => props.iconFailed[props.iconKey])
const loading = computed(() => props.iconLoading?.[props.iconKey])

function initial(label: string) {
  return (label || '?').trim().slice(0, 1).toUpperCase()
}
</script>

<template>
  <img
    v-if="dataUrl"
    :src="dataUrl"
    :class="cn('shrink-0 rounded-md border border-border bg-background object-cover', sizeClass)"
    alt=""
    @error="$emit('error')"
  />
  <div
    v-else-if="loading"
    :class="
      cn(
        'flex shrink-0 items-center justify-center rounded-md border border-border bg-muted/60 text-muted-foreground',
        sizeClass,
      )
    "
  >
    <span class="animate-pulse text-[10px]">…</span>
  </div>
  <div
    v-else-if="failed && fallback === 'package'"
    :class="
      cn(
        'flex shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground',
        sizeClass,
      )
    "
  >
    <Package :class="size === 'lg' ? 'h-8 w-8' : 'h-5 w-5'" />
  </div>
  <div
    v-else
    :class="
      cn(
        'flex shrink-0 items-center justify-center rounded-md border border-border bg-muted font-semibold text-muted-foreground',
        sizeClass,
      )
    "
  >
    {{ initial(label) }}
  </div>
</template>
