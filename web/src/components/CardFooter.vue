<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  padding?: string
  divider?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  padding: '0 16px 16px 16px',
  divider: false,
})

const rootStyle = computed<Record<string, string>>(() => {
  const style: Record<string, string> = {}
  if (props.padding) style.padding = props.padding
  return style
})
</script>

<template>
  <footer class="cv-card__footer" :class="{ 'is-divider': props.divider }" :style="rootStyle">
    <slot />
  </footer>
</template>

<style scoped>
.cv-card__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  min-height: 40px;
}

.cv-card__footer.is-divider {
  border-top: 1px solid color-mix(in oklab, var(--border) 92%, #fff);
  padding-top: 12px;
}
</style>
