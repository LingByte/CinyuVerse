<script setup lang="ts">
import { computed } from 'vue'
import { renderMarkdown } from '@/utils/markdown'

const props = defineProps<{
  content: string
}>()

const html = computed(() => renderMarkdown(props.content))
</script>

<template>
  <div class="md-content" v-html="html" />
</template>

<style scoped>
.md-content {
  line-height: 1.55;
  color: var(--text-main);
  font-size: 12px;
  word-break: break-word;
}

.md-content :deep(p) {
  margin: 0 0 0.65em;
}
.md-content :deep(p:last-child) {
  margin-bottom: 0;
}

.md-content :deep(h1),
.md-content :deep(h2),
.md-content :deep(h3),
.md-content :deep(h4) {
  margin: 0.8em 0 0.4em;
  font-weight: 600;
  line-height: 1.35;
  color: var(--text-main);
}
.md-content :deep(h1) { font-size: 1.15em; }
.md-content :deep(h2) { font-size: 1.08em; }
.md-content :deep(h3),
.md-content :deep(h4) { font-size: 1em; }

.md-content :deep(ul),
.md-content :deep(ol) {
  margin: 0.4em 0 0.65em;
  padding-left: 1.25em;
}

.md-content :deep(li) {
  margin: 0.2em 0;
}

.md-content :deep(blockquote) {
  margin: 0.5em 0;
  padding: 0.35em 0.65em;
  border-left: 3px solid var(--accent);
  background: color-mix(in oklab, var(--accent) 8%, transparent);
  color: var(--text-secondary);
}

.md-content :deep(code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.92em;
  padding: 0.1em 0.35em;
  border-radius: 4px;
  background: var(--bg-input);
  border: 1px solid var(--border);
}

.md-content :deep(pre) {
  margin: 0.5em 0;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  overflow-x: auto;
}
.md-content :deep(pre code) {
  padding: 0;
  border: none;
  background: transparent;
  font-size: 11px;
}

.md-content :deep(a) {
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.md-content :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 0.5em 0;
  font-size: 11px;
}
.md-content :deep(th),
.md-content :deep(td) {
  border: 1px solid var(--border);
  padding: 4px 6px;
  text-align: left;
}
.md-content :deep(th) {
  background: var(--bg-secondary);
}

.md-content :deep(hr) {
  border: none;
  border-top: 1px solid var(--border);
  margin: 0.75em 0;
}
</style>
