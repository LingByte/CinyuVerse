<script setup lang="ts">
import { computed, useSlots } from 'vue'

type DividerDirection = 'horizontal' | 'vertical'

type DividerContentPosition = 'left' | 'center' | 'right'

interface Props {
  direction?: DividerDirection
  contentPosition?: DividerContentPosition

  dashed?: boolean

  color?: string
  thickness?: string
  margin?: string

  text?: string
}

const props = withDefaults(defineProps<Props>(), {
  direction: 'horizontal',
  contentPosition: 'center',
  dashed: false,
  color: 'var(--border)',
  thickness: '1px',
  margin: '14px 0',
  text: '',
})

const slots = useSlots()

const isVertical = computed(() => props.direction === 'vertical')

const rootClass = computed(() => {
  const hasText = !!props.text || !!slots.default
  return [
    'cv-divider',
    isVertical.value ? 'cv-divider--vertical' : 'cv-divider--horizontal',
    props.dashed ? 'cv-divider--dashed' : null,
    !isVertical.value && hasText ? `cv-divider--pos-${props.contentPosition}` : null,
  ]
})

const rootStyle = computed<Record<string, string>>(() => {
  const style: Record<string, string> = {}

  style['--cv-divider-color'] = props.color
  style['--cv-divider-thickness'] = props.thickness
  style.margin = props.margin

  return style
})

const shouldRenderText = computed(() => !isVertical.value && (!!props.text || !!slots.default))
</script>

<template>
  <div :class="rootClass" :style="rootStyle" role="separator" :aria-orientation="isVertical ? 'vertical' : 'horizontal'">
    <span v-if="shouldRenderText" class="cv-divider__text">
      <slot>{{ props.text }}</slot>
    </span>
  </div>
</template>

<style scoped>
.cv-divider {
  color: var(--text-muted);
}

.cv-divider--horizontal {
  position: relative;
  width: 100%;
  height: 0;
  border-top: var(--cv-divider-thickness) solid var(--cv-divider-color);
}

.cv-divider--vertical {
  display: inline-block;
  width: 0;
  height: 1em;
  border-left: var(--cv-divider-thickness) solid var(--cv-divider-color);
  margin: 0 12px;
}

.cv-divider--dashed.cv-divider--horizontal {
  border-top-style: dashed;
}

.cv-divider--dashed.cv-divider--vertical {
  border-left-style: dashed;
}

.cv-divider__text {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  padding: 0 12px;
  background: var(--surface);
  font-size: 0.85rem;
  font-weight: 650;
  color: var(--text-muted);
}

.cv-divider--pos-left .cv-divider__text {
  left: 0;
}

.cv-divider--pos-center .cv-divider__text {
  left: 50%;
  transform: translate(-50%, -50%);
}

.cv-divider--pos-right .cv-divider__text {
  right: 0;
}
</style>
