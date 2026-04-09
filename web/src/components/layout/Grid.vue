<script setup lang="ts">
import { computed } from 'vue'

type SurfaceTone = 'none' | 'soft' | 'strong'

type AlignItems = 'stretch' | 'start' | 'center' | 'end'

type JustifyContent = 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly'

interface Props {
  cols?: string
  min?: string
  gap?: string
  rowGap?: string
  colGap?: string
  align?: AlignItems
  justify?: JustifyContent

  surface?: SurfaceTone
  bordered?: boolean
  radius?: string
  padding?: string

  width?: string
}

const props = withDefaults(defineProps<Props>(), {
  cols: '',
  min: '',
  gap: '12px',
  rowGap: '',
  colGap: '',
  align: 'stretch',
  justify: 'start',

  surface: 'none',
  bordered: false,
})

const rootStyle = computed<Record<string, string>>(() => {
  const style: Record<string, string> = {}

  style.display = 'grid'

  if (props.min) {
    style.gridTemplateColumns = `repeat(auto-fit, minmax(${props.min}, 1fr))`
  } else if (props.cols) {
    style.gridTemplateColumns = `repeat(${props.cols}, minmax(0, 1fr))`
  } else {
    style.gridTemplateColumns = 'repeat(12, minmax(0, 1fr))'
  }

  if (props.rowGap || props.colGap) {
    if (props.rowGap) style.rowGap = props.rowGap
    if (props.colGap) style.columnGap = props.colGap
  } else {
    style.gap = props.gap
  }

  const alignMap: Record<AlignItems, string> = {
    stretch: 'stretch',
    start: 'start',
    center: 'center',
    end: 'end',
  }

  const justifyMap: Record<JustifyContent, string> = {
    start: 'start',
    center: 'center',
    end: 'end',
    between: 'space-between',
    around: 'space-around',
    evenly: 'space-evenly',
  }

  style.alignItems = alignMap[props.align]
  style.justifyItems = justifyMap[props.justify]

  if (props.radius) style.borderRadius = props.radius
  if (props.padding) style.padding = props.padding
  if (props.width) style.width = props.width

  return style
})

const rootClass = computed(() => {
  return [
    'cv-grid',
    props.surface !== 'none' ? `cv-surface--${props.surface}` : null,
    props.bordered ? 'cv-surface--bordered' : null,
  ]
})
</script>

<template>
  <div :class="rootClass" :style="rootStyle">
    <slot />
  </div>
</template>

<style scoped>
.cv-grid {
  min-width: 0;
}

.cv-surface--soft {
  background: var(--surface-strong);
}

.cv-surface--strong {
  background: var(--surface);
}

.cv-surface--bordered {
  border: 1px solid var(--border);
}
</style>
