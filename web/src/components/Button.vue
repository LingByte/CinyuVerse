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
  'relative inline-flex items-center justify-center gap-2 overflow-hidden border font-bold leading-none transition-all duration-200 ease-out active:translate-y-px active:scale-[0.985]',
  props.size === 'sm' ? 'min-h-9 px-4 py-2 text-sm' : '',
  props.size === 'md' ? 'min-h-10 px-4.5 py-2.5 text-[0.95rem]' : '',
  props.size === 'lg' ? 'min-h-12 px-5.5 py-3 text-base' : '',
  props.shape === 'rounded' ? 'rounded-xl' : '',
  props.shape === 'pill' ? 'rounded-full' : '',
  props.shape === 'square' ? 'rounded-lg' : '',
  props.shape === 'circle' ? 'rounded-full px-0 aspect-square' : '',
  props.variant === 'solid'
    ? 'text-white border-transparent bg-[linear-gradient(145deg,var(--btn),var(--btn-strong))] shadow-[0_12px_24px_-14px_var(--btn-strong)] hover:-translate-y-0.5 hover:shadow-[0_18px_30px_-16px_var(--btn-strong)]'
    : '',
  props.variant === 'soft'
    ? 'text-[color-mix(in_oklab,var(--btn-strong)_88%,black)] border-[color-mix(in_oklab,var(--btn)_45%,transparent)] bg-[var(--btn-soft)] hover:-translate-y-0.5 hover:bg-[color-mix(in_oklab,var(--btn-soft)_85%,#fff)]'
    : '',
  props.variant === 'outline'
    ? 'text-[var(--btn-strong)] border-[var(--btn)] bg-transparent hover:-translate-y-0.5 hover:bg-[var(--btn-soft)]'
    : '',
])

const buttonStyle = computed<Record<string, string>>(() => {
  const style: Record<string, string> = {}

  if (props.color && !['orange', 'green', 'purple', 'blue'].includes(props.color)) {
    style['--btn'] = props.color
  }
  if (props.color === 'orange') {
    style['--btn'] = '#fb923c'
    style['--btn-strong'] = '#f97316'
    style['--btn-soft'] = 'rgba(251, 146, 60, 0.2)'
  }
  if (props.color === 'green') {
    style['--btn'] = '#4ade80'
    style['--btn-strong'] = '#22c55e'
    style['--btn-soft'] = 'rgba(74, 222, 128, 0.2)'
  }
  if (props.color === 'blue') {
    style['--btn'] = '#60a5fa'
    style['--btn-strong'] = '#3b82f6'
    style['--btn-soft'] = 'rgba(96, 165, 250, 0.2)'
  }
  if (!props.color || props.color === 'purple') {
    style['--btn'] = '#a78bfa'
    style['--btn-strong'] = '#8b5cf6'
    style['--btn-soft'] = 'rgba(167, 139, 250, 0.2)'
  }

  if (props.radius) style.borderRadius = props.radius
  if (props.width) style.width = props.width
  if (props.height) style.height = props.height
  if (props.padding) style.padding = props.padding
  if (props.fontSize) style.fontSize = props.fontSize

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
    <span
      :key="waveKey"
      class="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[0_10px_22px_-14px_var(--btn)] animate-ping"
      aria-hidden="true"
    />
    <slot />
  </button>
</template>
