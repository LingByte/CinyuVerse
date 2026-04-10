<script setup lang="ts">
import { computed } from 'vue'

type SurfaceTone = 'none' | 'soft' | 'strong'

interface Props {
  maxWidth?: string
  padding?: string
  center?: boolean

  surface?: SurfaceTone
  bordered?: boolean
  radius?: string

  width?: string
}

const props = withDefaults(defineProps<Props>(), {
  maxWidth: '1100px',
  padding: '20px',
  center: true,

  surface: 'none',
  bordered: false,
})

const rootStyle = computed<Record<string, string>>(() => {
  const style: Record<string, string> = {}

  if (props.width) {
    style.width = props.width
  } else {
    style.width = '100%'
  }

  if (props.maxWidth) style.maxWidth = props.maxWidth
  if (props.center) {
    style.marginLeft = 'auto'
    style.marginRight = 'auto'
  }

  if (props.padding) style.padding = props.padding
  if (props.radius) style.borderRadius = props.radius

  return style
})

const rootClass = computed(() => {
  return [
    'cv-container',
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
.cv-container {
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
