<script setup lang="ts">
import { computed } from 'vue'
import { getFileIconInfo } from '@/features/editor/utils/fileIcons'

const props = withDefaults(defineProps<{
  name: string
  isDirectory?: boolean
  isOpen?: boolean
  size?: number
}>(), {
  isDirectory: false,
  isOpen: false,
  size: 16,
})

const iconInfo = computed(() =>
  getFileIconInfo(props.name, { isDirectory: props.isDirectory, isOpen: props.isOpen }),
)
</script>

<template>
  <component
    :is="iconInfo.icon"
    :size="size"
    :stroke-width="1.75"
    class="file-tree-icon"
    :style="{ color: iconInfo.color }"
  />
</template>

<style scoped>
.file-tree-icon {
  flex-shrink: 0;
}
</style>
