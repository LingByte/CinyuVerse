<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  orientation?: 'horizontal' | 'vertical'
  dashed?: boolean
  inset?: string
  label?: string
}

const props = withDefaults(defineProps<Props>(), {
  orientation: 'horizontal',
  dashed: false,
  inset: '0',
  label: '',
})

const dividerClass = computed(() => {
  if (props.orientation === 'vertical') {
    return ['relative h-full w-px border-l border-[var(--border)]', props.dashed ? 'border-dashed' : '']
  }
  return ['relative w-full border-t border-[var(--border)]', props.dashed ? 'border-dashed' : '']
})
</script>

<template>
  <div :class="dividerClass" :style="{ margin: orientation === 'vertical' ? `0 ${inset}` : `${inset} 0` }">
    <span
      v-if="label"
      class="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-0.5 text-[11px] font-bold text-[var(--text-muted)]"
    >
      {{ label }}
    </span>
  </div>
</template>
