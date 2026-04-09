<script setup lang="ts">
import { computed } from 'vue'

type SurfaceTone = 'none' | 'soft' | 'strong'

type AlignItems = 'stretch' | 'start' | 'center' | 'end' | 'baseline'

type JustifyContent = 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly'

type FlexWrap = 'nowrap' | 'wrap' | 'wrap-reverse'

type Direction = 'row' | 'row-reverse' | 'col' | 'col-reverse'

interface Props {
  direction?: Direction
  gap?: string
  align?: AlignItems
  justify?: JustifyContent
  wrap?: FlexWrap
  inline?: boolean

  surface?: SurfaceTone
  bordered?: boolean
  radius?: string
  padding?: string

  width?: string
  height?: string
}

const props = withDefaults(defineProps<Props>(), {
  direction: 'row',
  gap: '12px',
  align: 'center',
  justify: 'start',
  wrap: 'nowrap',
  inline: false,

  surface: 'none',
  bordered: false,
})

const rootStyle = computed<Record<string, string>>(() => {
  const style: Record<string, string> = {}

  style.display = props.inline ? 'inline-flex' : 'flex'

  const directionMap: Record<Direction, string> = {
    row: 'row',
    'row-reverse': 'row-reverse',
    col: 'column',
    'col-reverse': 'column-reverse',
  }

  style.flexDirection = directionMap[props.direction]
  style.gap = props.gap

  const alignMap: Record<AlignItems, string> = {
    stretch: 'stretch',
    start: 'flex-start',
    center: 'center',
    end: 'flex-end',
    baseline: 'baseline',
  }

  const justifyMap: Record<JustifyContent, string> = {
    start: 'flex-start',
    center: 'center',
    end: 'flex-end',
    between: 'space-between',
    around: 'space-around',
    evenly: 'space-evenly',
  }

  style.alignItems = alignMap[props.align]
  style.justifyContent = justifyMap[props.justify]
  style.flexWrap = props.wrap

  if (props.radius) style.borderRadius = props.radius
  if (props.padding) style.padding = props.padding
  if (props.width) style.width = props.width
  if (props.height) style.height = props.height

  return style
})

const rootClass = computed(() => {
  return [
    'cv-flex',
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
.cv-flex {
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
