<script setup lang="ts">
import { computed } from 'vue'

type SurfaceTone = 'none' | 'soft' | 'strong'

type CardShadow = 'none' | 'sm' | 'md'

type CardInteractive = 'none' | 'hover' | 'press'

interface Props {
  as?: 'div' | 'article' | 'section'

  surface?: SurfaceTone
  bordered?: boolean
  radius?: string
  padding?: string

  shadow?: CardShadow
  interactive?: CardInteractive

  width?: string
  height?: string
}

const props = withDefaults(defineProps<Props>(), {
  as: 'div',
  surface: 'none',
  bordered: true,
  shadow: 'sm',
  interactive: 'none',
})

const rootClass = computed(() => {
  return [
    'cv-card',
    props.surface !== 'none' ? `cv-surface--${props.surface}` : null,
    props.bordered ? 'cv-surface--bordered' : null,
    props.shadow !== 'none' ? `cv-card--shadow-${props.shadow}` : null,
    props.interactive !== 'none' ? `cv-card--interactive-${props.interactive}` : null,
  ]
})

const rootStyle = computed<Record<string, string>>(() => {
  const style: Record<string, string> = {}

  if (props.radius) style.borderRadius = props.radius
  if (props.padding) style.padding = props.padding
  if (props.width) style.width = props.width
  if (props.height) style.height = props.height

  return style
})
</script>

<template>
  <component :is="props.as" :class="rootClass" :style="rootStyle">
    <slot />
  </component>
</template>

<style scoped>
.cv-card {
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

.cv-card--shadow-sm {
  box-shadow: 0 12px 28px -24px var(--ring);
}

.cv-card--shadow-md {
  box-shadow: 0 18px 45px -28px var(--ring);
}

.cv-card--interactive-hover {
  transition: transform 180ms cubic-bezier(0.2, 0.65, 0.2, 1), box-shadow 180ms cubic-bezier(0.2, 0.65, 0.2, 1);
}

.cv-card--interactive-hover:hover {
  transform: translateY(-2px);
  box-shadow: 0 20px 55px -32px var(--ring);
}

.cv-card--interactive-press {
  transition: transform 160ms cubic-bezier(0.2, 0.65, 0.2, 1), box-shadow 180ms cubic-bezier(0.2, 0.65, 0.2, 1);
}

.cv-card--interactive-press:active {
  transform: translateY(1px) scale(0.99);
}
</style>
