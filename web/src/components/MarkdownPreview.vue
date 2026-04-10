<script setup lang="ts">
import hljs from 'highlight.js'
import MarkdownIt from 'markdown-it'
import { computed } from 'vue'

interface Props {
  source: string
}

const props = defineProps<Props>()

const escapeHtml = (raw: string) =>
  raw
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  highlight(code: string, lang: string): string {
    if (lang && hljs.getLanguage(lang)) {
      return `<pre class="cmp-md-code"><code>${hljs.highlight(code, { language: lang }).value}</code></pre>`
    }
    return `<pre class="cmp-md-code"><code>${escapeHtml(code)}</code></pre>`
  },
})

const html = computed(() => md.render(props.source || ''))
</script>

<template>
  <article
    class="rounded-2xl border border-[var(--border)] bg-[color-mix(in_oklab,var(--surface)_96%,transparent)] p-4 leading-7 [&_h1]:my-2 [&_h1]:text-2xl [&_h1]:font-extrabold [&_h2]:my-2 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:my-1 [&_h3]:text-base [&_h3]:font-bold [&_p]:my-2 [&_p]:text-[color-mix(in_oklab,var(--text)_86%,transparent)] [&_a]:text-[var(--theme-strong)] [&_ol]:pl-5 [&_pre]:overflow-auto [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-[var(--border)] [&_pre]:bg-slate-900 [&_pre]:p-3 [&_pre]:text-slate-200 [&_ul]:pl-5"
    v-html="html"
  />
</template>
