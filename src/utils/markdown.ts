import { marked } from 'marked'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js'

marked.setOptions({
  gfm: true,
  breaks: true,
})

marked.use({
  renderer: {
    code({ text, lang }) {
      if (lang && hljs.getLanguage(lang)) {
        const highlighted = hljs.highlight(text, { language: lang }).value
        return `<pre class="bg-gray-900 text-gray-100 p-3 rounded-lg overflow-x-auto"><code class="hljs language-${lang}">${highlighted}</code></pre>`
      }
      return `<pre class="bg-gray-900 text-gray-100 p-3 rounded-lg overflow-x-auto"><code>${text}</code></pre>`
    },
    codespan({ text }) {
      return `<code class="bg-gray-200 text-gray-800 px-1 py-0.5 rounded text-sm">${text}</code>`
    },
    blockquote({ text }) {
      return `<blockquote class="border-l-4 border-blue-500 pl-4 italic text-gray-600">${text}</blockquote>`
    },
    table({ header, body }) {
      return `<div class="overflow-x-auto"><table class="min-w-full border-collapse border border-gray-300"><thead>${header}</thead><tbody>${body}</tbody></table></div>`
    },
    tablerow({ text }) {
      return `<tr>${text}</tr>`
    },
    tablecell(content, flags) {
      const tag = flags.header ? 'th' : 'td'
      const cls = flags.header
        ? 'border border-gray-300 bg-gray-100 px-4 py-2 text-left font-semibold'
        : 'border border-gray-300 px-4 py-2'
      return `<${tag} class="${cls}">${content}</${tag}>`
    },
  },
})

export function renderMarkdown(content: string): string {
  const raw = marked.parse(String(content ?? '')) as string
  return DOMPurify.sanitize(raw)
}
