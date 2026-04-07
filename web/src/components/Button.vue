<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  variant?: 'solid' | 'soft' | 'outline'
  size?: 'md' | 'lg'
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'solid',
  size: 'md',
})

const buttonClass = computed(() => [
  'cmp-btn',
  `cmp-btn--${props.variant}`,
  `cmp-btn--${props.size}`,
])
</script>

<template>
  <button type="button" :class="buttonClass">
    <slot />
  </button>
</template>
