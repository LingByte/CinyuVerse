function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function sanitizeUrl(url: string): string {
  const trimmed = url.trim()
  if (/^(https?:|mailto:|#|\/)/i.test(trimmed)) return trimmed
  return '#'
}

function stashHtml(blocks: string[], html: string): string {
  const token = `\x00B${blocks.length}\x00`
  blocks.push(html)
  return token
}

/** Lightweight Markdown → safe HTML for chat bubbles (no external deps). */
export function renderMarkdown(source: string): string {
  if (!source.trim()) return ''

  const blocks: string[] = []
  let text = source.replace(/\r\n/g, '\n')

  text = text.replace(/```([\w-]*)\n([\s\S]*?)```/g, (_, _lang, code) =>
    stashHtml(blocks, `<pre><code>${escapeHtml(String(code).replace(/\n$/, ''))}</code></pre>`),
  )

  text = text.replace(/`([^`\n]+)`/g, (_, code) =>
    stashHtml(blocks, `<code>${escapeHtml(code)}</code>`),
  )

  text = escapeHtml(text)

  text = text
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    .replace(/_([^_\n]+)_/g, '<em>$1</em>')

  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
    const safe = sanitizeUrl(url.replace(/&amp;/g, '&'))
    return `<a href="${escapeHtml(safe)}" target="_blank" rel="noopener noreferrer">${label}</a>`
  })

  const lines = text.split('\n')
  const out: string[] = []
  let i = 0

  const isBlockToken = (line: string) => /^\x00B\d+\x00$/.test(line.trim())

  while (i < lines.length) {
    const line = lines[i]

    if (isBlockToken(line)) {
      out.push(line.trim())
      i++
      continue
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/)
    if (heading) {
      const level = heading[1].length
      out.push(`<h${level}>${heading[2]}</h${level}>`)
      i++
      continue
    }

    if (/^&gt;\s?/.test(line)) {
      const quoteLines: string[] = []
      while (i < lines.length && /^&gt;\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^&gt;\s?/, ''))
        i++
      }
      out.push(`<blockquote>${quoteLines.join('<br>')}</blockquote>`)
      continue
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(`<li>${lines[i].replace(/^[-*]\s+/, '')}</li>`)
        i++
      }
      out.push(`<ul>${items.join('')}</ul>`)
      continue
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(`<li>${lines[i].replace(/^\d+\.\s+/, '')}</li>`)
        i++
      }
      out.push(`<ol>${items.join('')}</ol>`)
      continue
    }

    if (line.trim() === '') {
      i++
      continue
    }

    const para: string[] = []
    while (
      i < lines.length
      && lines[i].trim() !== ''
      && !/^(#{1,4})\s/.test(lines[i])
      && !/^&gt;\s?/.test(lines[i])
      && !/^[-*]\s+/.test(lines[i])
      && !/^\d+\.\s+/.test(lines[i])
      && !isBlockToken(lines[i])
    ) {
      para.push(lines[i])
      i++
    }
    out.push(`<p>${para.join('<br>')}</p>`)
  }

  return out.join('\n').replace(/\x00B(\d+)\x00/g, (_, idx) => blocks[Number(idx)] ?? '')
}
