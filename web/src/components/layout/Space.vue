<script setup lang="ts">
import { computed } from 'vue'

type Direction = 'horizontal' | 'vertical'

type AlignItems = 'stretch' | 'start' | 'center' | 'end' | 'baseline'

type JustifyContent = 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly'

type FlexWrap = 'nowrap' | 'wrap' | 'wrap-reverse'

interface Props {
  direction?: Direction
  size?: string
  align?: AlignItems
  justify?: JustifyContent
  wrap?: FlexWrap
  inline?: boolean

  width?: string
}

const props = withDefaults(defineProps<Props>(), {
  direction: 'horizontal',
  size: '12px',
  align: 'center',
  justify: 'start',
  wrap: 'wrap',
  inline: false,
})

const rootStyle = computed<Record<string, string>>(() => {
  const style: Record<string, string> = {}

  style.display = props.inline ? 'inline-flex' : 'flex'
  style.flexDirection = props.direction === 'vertical' ? 'column' : 'row'
  style.gap = props.size

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

  if (props.width) style.width = props.width

  return style
})
</script>

<template>
  <div class="cv-space" :style="rootStyle">
    <slot />
  </div>
</template>

<style scoped>
.cv-space {
  min-width: 0;
}
</style>
