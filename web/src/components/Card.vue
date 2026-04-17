<script setup lang="ts">
import { computed } from 'vue'

defineOptions({ inheritAttrs: false })

type SurfaceTone = 'none' | 'soft' | 'strong'

type CardShadow = 'none' | 'sm' | 'md'

type CardInteractive = 'none' | 'hover' | 'press'

interface Props {
  as?: 'div' | 'article' | 'section' | 'button'
  status?: 'default' | 'success' | 'warning' | 'danger'

  surface?: SurfaceTone
  bordered?: boolean
  radius?: string
  padding?: string

  shadow?: CardShadow
  interactive?: CardInteractive

  width?: string
  height?: string

  buttonType?: 'button' | 'submit' | 'reset'
}

const props = withDefaults(defineProps<Props>(), {
  as: 'div',
  surface: 'none',
  bordered: true,
  shadow: 'sm',
  interactive: 'none',
  buttonType: 'button',
  status: 'default',
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
  if (props.status === 'success') style.borderColor = 'rgba(16, 185, 129, 0.5)'
  if (props.status === 'warning') style.borderColor = 'rgba(245, 158, 11, 0.5)'
  if (props.status === 'danger') style.borderColor = 'rgba(239, 68, 68, 0.5)'

  return style
})
</script>

<template>
  <component
    :is="props.as"
    v-bind="$attrs"
    :type="props.as === 'button' ? props.buttonType : undefined"
    :class="rootClass"
    :style="rootStyle"
  >
    <slot />
  </component>
</template>

<style scoped>
.cv-card {
  box-sizing: border-box;
  min-width: 0;
  border-radius: 12px;
  overflow: hidden;
  background: var(--surface, #fff);
  transition: box-shadow 180ms cubic-bezier(0.2, 0.65, 0.2, 1), transform 180ms cubic-bezier(0.2, 0.65, 0.2, 1),
    border-color 180ms cubic-bezier(0.2, 0.65, 0.2, 1);
}

.cv-surface--soft {
  background: var(--surface-strong);
}

.cv-surface--strong {
  background: var(--surface);
}

.cv-surface--bordered {
  border: 1px solid color-mix(in oklab, var(--border) 92%, #fff);
}

.cv-card--shadow-sm {
  box-shadow: 0 8px 24px -20px color-mix(in oklab, var(--ring) 85%, #fff);
}

.cv-card--shadow-md {
  box-shadow: 0 14px 34px -22px color-mix(in oklab, var(--ring) 86%, #fff);
}

.cv-card--interactive-hover {
  cursor: pointer;
}

.cv-card--interactive-hover:hover {
  transform: translateY(-3px);
  box-shadow: 0 18px 40px -26px color-mix(in oklab, var(--ring) 88%, #fff);
}

.cv-card--interactive-press {
  transition: transform 160ms cubic-bezier(0.2, 0.65, 0.2, 1), box-shadow 180ms cubic-bezier(0.2, 0.65, 0.2, 1);
}

.cv-card--interactive-press:active {
  transform: translateY(1px) scale(0.99);
}

.cv-card:focus-visible {
  outline: 2px solid color-mix(in oklab, var(--ring) 50%, #fff);
  outline-offset: 2px;
}
</style>
