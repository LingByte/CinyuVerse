<script setup lang="ts">
import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'
import { computed, shallowRef } from 'vue'

const props = defineProps<{
  source: string
}>()

const md = shallowRef(
  new MarkdownIt({
    html: false,
    linkify: true,
    breaks: true,
  }),
)

const html = computed(() => {
  const raw = md.value.render(props.source || '')
  return DOMPurify.sanitize(raw)
})
</script>

<template>
  <div class="md-render" v-html="html" />
</template>

<style scoped>
.md-render {
  font-size: 14px;
  line-height: 1.65;
  color: var(--color-text-2);
  word-break: break-word;
}
.md-render :deep(p) {
  margin: 0 0 0.65em;
}
.md-render :deep(p:last-child) {
  margin-bottom: 0;
}
.md-render :deep(pre) {
  margin: 0.65em 0;
  padding: 12px 14px;
  border-radius: 8px;
  background: var(--color-fill-2);
  border: 1px solid var(--color-border-2);
  overflow: auto;
  font-size: 13px;
}
.md-render :deep(code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  font-size: 0.92em;
}
.md-render :deep(p code),
.md-render :deep(li code) {
  padding: 0.1em 0.35em;
  border-radius: 4px;
  background: var(--color-fill-2);
}
.md-render :deep(ul),
.md-render :deep(ol) {
  margin: 0.35em 0 0.65em;
  padding-left: 1.35em;
}
.md-render :deep(a) {
  color: rgb(var(--primary-6));
}
.md-render :deep(blockquote) {
  margin: 0.65em 0;
  padding: 0.35em 0 0.35em 12px;
  border-left: 3px solid var(--color-border-3);
  color: var(--color-text-3);
}
</style>
