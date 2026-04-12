<script setup lang="ts">
import { computed } from 'vue'
import hljs from 'highlight.js/lib/common'

interface Props {
  code: string
  language?: 'vue' | 'html' | 'xml' | 'ts' | 'typescript' | 'css'
}

const props = withDefaults(defineProps<Props>(), {
  language: 'vue',
})

const className = computed(() => {
  return `hljs language-${props.language}`
})

const escapeHtml = (input: string) => {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

const highlightedHtml = computed(() => {
  const code = props.code ?? ''

  try {
    return hljs.highlight(code, { language: props.language }).value
  } catch {
    return escapeHtml(code)
  }
})
</script>

<template>
  <pre class="cv-codeblock"><code :class="className" v-html="highlightedHtml" /></pre>
</template>

<style scoped>
.cv-codeblock {
  overflow: auto;
  border-radius: 0.75rem;
  border: 1px solid var(--border);
  background: var(--surface);
  padding: 0.75rem;
  font-size: 0.75rem;
  line-height: 1.55;
  color: var(--text);
}

.cv-codeblock :deep(code.hljs) {
  background: transparent;
  padding: 0;
}

.cv-codeblock :deep(.hljs) {
  color: var(--text);
}

.cv-codeblock :deep(.hljs-comment),
.cv-codeblock :deep(.hljs-quote) {
  color: color-mix(in oklab, var(--text-muted) 75%, transparent);
}

.cv-codeblock :deep(.hljs-keyword),
.cv-codeblock :deep(.hljs-selector-tag),
.cv-codeblock :deep(.hljs-literal) {
  color: color-mix(in oklab, var(--theme) 75%, white);
}

.cv-codeblock :deep(.hljs-string),
.cv-codeblock :deep(.hljs-attr),
.cv-codeblock :deep(.hljs-attribute),
.cv-codeblock :deep(.hljs-template-variable) {
  color: color-mix(in oklab, var(--theme-strong) 70%, white);
}

.cv-codeblock :deep(.hljs-name),
.cv-codeblock :deep(.hljs-tag) {
  color: color-mix(in oklab, var(--theme) 65%, white);
}

.cv-codeblock :deep(.hljs-number),
.cv-codeblock :deep(.hljs-symbol),
.cv-codeblock :deep(.hljs-bullet) {
  color: color-mix(in oklab, var(--theme) 65%, var(--text));
}

.cv-codeblock :deep(.hljs-title),
.cv-codeblock :deep(.hljs-section) {
  color: color-mix(in oklab, var(--theme-strong) 65%, white);
}
</style>
