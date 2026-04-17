<script setup lang="ts">
withDefaults(defineProps<{ variant?: 'solid' | 'soft' | 'outline' }>(), { variant: 'soft' })
</script>

<template>
  <span
    class="inline-flex items-center rounded-[var(--cv-radius-pill)] px-2.5 py-1 text-xs font-semibold"
    :class="{
      'bg-[var(--cv-color-primary-soft)] text-[var(--cv-color-primary-strong)]': variant === 'soft',
      'bg-[var(--cv-color-primary)] text-white': variant === 'solid',
      'border border-[var(--cv-color-border)] text-[var(--cv-color-text)]': variant === 'outline',
    }"
  >
    <slot />
  </span>
</template>
