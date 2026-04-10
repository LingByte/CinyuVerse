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

const badgeClass = computed(() => {
  const base =
    'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold tracking-wide transition-transform duration-200 hover:-translate-y-0.5'

  const variantMap = {
    soft: 'border border-[var(--border)] bg-[var(--theme-soft)] text-[var(--theme-strong)]',
    solid: 'bg-gradient-to-br from-[var(--theme)] to-[var(--theme-strong)] text-white',
    outline: 'border border-[var(--theme)] bg-transparent text-[var(--theme-strong)]',
  }

  return [base, variantMap[props.variant], props.pulse ? 'shadow-[0_0_0_0_var(--theme-soft)]' : '']
})
</script>

<template>
  <span :class="badgeClass">
    <span
      class="size-2 rounded-full bg-current"
      :class="props.pulse ? 'animate-pulse' : ''"
    />
    <slot />
  </span>
</template>
