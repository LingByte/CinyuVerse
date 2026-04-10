<script setup lang="ts">
import { computed } from 'vue'

type Axis = 'x' | 'y'

interface Props {
  axis?: Axis
  size?: string
  grow?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  axis: 'x',
  size: '12px',
  grow: false,
})

const rootStyle = computed<Record<string, string>>(() => {
  const style: Record<string, string> = {}

  if (props.grow) {
    style.flex = '1 1 auto'
    style.minWidth = '0'
    style.minHeight = '0'
    return style
  }

  if (props.axis === 'x') {
    style.width = props.size
    style.height = '1px'
  } else {
    style.height = props.size
    style.width = '1px'
  }

  style.flex = '0 0 auto'
  return style
})
</script>

<template>
  <div :style="rootStyle" aria-hidden="true" />
</template>
