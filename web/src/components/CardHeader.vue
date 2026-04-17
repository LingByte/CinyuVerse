<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  title?: string
  subtitle?: string
  padding?: string
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
  subtitle: '',
  padding: '16px 16px 0 16px',
})

const rootStyle = computed<Record<string, string>>(() => {
  const style: Record<string, string> = {}
  if (props.padding) style.padding = props.padding
  return style
})
</script>

<template>
  <header class="cv-card__header" :style="rootStyle">
    <div v-if="props.title || props.subtitle" class="cv-card__headerText">
      <div v-if="props.title" class="cv-card__title">{{ props.title }}</div>
      <div v-if="props.subtitle" class="cv-card__subtitle">{{ props.subtitle }}</div>
    </div>
    <slot />
  </header>
</template>

<style scoped>
.cv-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid transparent;
}

.cv-card__headerText {
  min-width: 0;
}

.cv-card__title {
  font-size: 0.95rem;
  font-weight: 800;
  color: var(--text);
  line-height: 1.45;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cv-card__subtitle {
  margin-top: 4px;
  font-size: 0.85rem;
  color: var(--text-muted);
  line-height: 1.5;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
