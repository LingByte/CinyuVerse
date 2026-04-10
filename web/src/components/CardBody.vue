<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  padding?: string
}

const props = withDefaults(defineProps<Props>(), {
  padding: '16px',
})

const rootStyle = computed<Record<string, string>>(() => {
  const style: Record<string, string> = {}
  if (props.padding) style.padding = props.padding
  return style
})
</script>

<template>
  <div class="cv-card__body" :style="rootStyle">
    <slot />
  </div>
</template>

<style scoped>
.cv-card__body {
  color: var(--text);
}
</style>
