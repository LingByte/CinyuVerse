<script setup lang="ts">
import { computed, ref } from 'vue'

interface Props {
  variant?: 'solid' | 'soft' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  shape?: 'rounded' | 'pill' | 'square' | 'circle'
  color?: string
  radius?: string
  width?: string
  height?: string
  padding?: string
  fontSize?: string
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'solid',
  size: 'md',
  shape: 'rounded',
  color: 'purple',
})

const buttonClass = computed(() => [
  'cmp-btn2',
  `cmp-btn2--${props.variant}`,
  `cmp-btn2--${props.size}`,
  `cmp-btn2--${props.shape}`,
  props.color && ['orange', 'green', 'purple', 'blue'].includes(props.color) ? `cmp-btn2--${props.color}` : null,
])

const buttonStyle = computed<Record<string, string>>(() => {
  const style: Record<string, string> = {}

  if (props.color && !['orange', 'green', 'purple', 'blue'].includes(props.color)) {
    style['--btn2'] = props.color
  }

  if (props.radius) style['--btn2-radius'] = props.radius
  if (props.width) style['--btn2-width'] = props.width
  if (props.height) style['--btn2-height'] = props.height
  if (props.padding) style['--btn2-padding'] = props.padding
  if (props.fontSize) style['--btn2-font-size'] = props.fontSize

  return style
})

const waveKey = ref(0)

const triggerWave = () => {
  waveKey.value += 1
}

const onPointerDown = () => {
  triggerWave()
}

const onMouseDown = () => {
  triggerWave()
}
</script>

<template>
  <button
    type="button"
    :class="buttonClass"
    :style="buttonStyle"
    @pointerdown="onPointerDown"
    @mousedown="onMouseDown"
  >
    <span :key="waveKey" class="cmp-btn2__wave" aria-hidden="true" />
    <slot />
  </button>
</template>
