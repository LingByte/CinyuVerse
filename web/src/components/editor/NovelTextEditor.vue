<script setup lang="ts">
import { computed } from 'vue'

const model = defineModel<string>({ default: '' })
const props = defineProps<{
  placeholder?: string
  minRows?: number
  maxRows?: number
}>()

const wordCount = computed(() => model.value.trim().length)
</script>

<template>
  <div class="novel-editor">
    <a-textarea
      v-model="model"
      class="novel-editor__textarea"
      :auto-size="{ minRows: props.minRows ?? 10, maxRows: props.maxRows ?? 30 }"
      :placeholder="props.placeholder || '开始创作章节正文...'"
    />
    <div class="novel-editor__footer">字数：{{ wordCount }}</div>
  </div>
</template>

<style scoped>
.novel-editor {
  width: 100%;
}
.novel-editor__textarea {
  width: 100%;
  font-size: 15px;
  line-height: 1.8;
}
.novel-editor__footer {
  margin-top: 6px;
  text-align: right;
  font-size: 12px;
  color: var(--color-text-3);
}
</style>
