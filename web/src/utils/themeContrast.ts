/** 解析 #rgb / #rrggbb 为 RGB */
function parseHex(hex: string): [number, number, number] | null {
  const h = hex.replace('#', '').trim()
  if (h.length === 3) {
    return [
      parseInt(h[0] + h[0], 16),
      parseInt(h[1] + h[1], 16),
      parseInt(h[2] + h[2], 16),
    ]
  }
  if (h.length === 6) {
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ]
  }
  return null
}

function luminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

/** WCAG 对比度（1–21） */
export function contrastRatio(color1: string, color2: string): number {
  const a = parseHex(color1)
  const b = parseHex(color2)
  if (!a || !b) return 21
  const l1 = luminance(...a)
  const l2 = luminance(...b)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

/** 正文对比度建议 ≥ 4.5 */
export function isReadableText(text: string, background: string, minRatio = 4.5): boolean {
  return contrastRatio(text, background) >= minRatio
}
