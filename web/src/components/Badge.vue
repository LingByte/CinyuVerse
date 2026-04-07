<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  variant?: 'solid' | 'soft' | 'outline'
  pulse?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'soft',
  pulse: false,
})

const badgeClass = computed(() => [
  'cmp-badge',
  `cmp-badge--${props.variant}`,
  props.pulse ? 'cmp-badge--pulse' : '',
])
</script>

<template>
  <span :class="badgeClass">
    <span class="cmp-badge__dot" />
    <slot />
  </span>
</template>
