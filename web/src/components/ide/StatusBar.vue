<script setup lang="ts">
import { computed } from 'vue'
import { TypographyText } from '@kousum/semi-ui-vue'
import { IconFile } from '@kousum/semi-icons-vue'
import { detectFileType } from '@/utils/fileTypes'

const props = defineProps<{
  wordCount: number
  filePath: string | null
  saveStatus: string
}>()

const fileTypeLabel = computed(() => {
  if (!props.filePath) return null
  const ft = detectFileType(props.filePath)
  if (ft.category === 'text') return `${props.wordCount.toLocaleString()} 字`
  return ft.extension.toUpperCase()
})
</script>

<template>
  <div class="ide-status-bar">
    <div class="status-left">
      <TypographyText v-if="fileTypeLabel" class="status-label">
        {{ fileTypeLabel }}
      </TypographyText>
      <TypographyText
        v-if="filePath"
        class="status-path"
        :ellipsis="{ showTooltip: true }"
      >
        <IconFile :size="'small'" />
        {{ filePath }}
      </TypographyText>
    </div>
    <TypographyText class="status-save">
      {{ saveStatus }}
    </TypographyText>
  </div>
</template>

<style scoped>
.ide-status-bar {
  height: 24px;
  min-height: 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid var(--border);
  background: var(--bg-primary);
  padding: 0 12px;
  font-size: 11px;
  color: var(--text-sub);
}

.status-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.status-label {
  white-space: nowrap;
}

.status-path {
  display: flex;
  align-items: center;
  gap: 4px;
  max-width: 50vw;
  min-width: 0;
  color: var(--text-muted);
}

.status-save {
  flex-shrink: 0;
  font-style: italic;
  opacity: 0.8;
}
</style>
