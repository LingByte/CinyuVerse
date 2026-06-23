import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'
import type { Extension } from '@codemirror/state'
import type { EditorSchemeColors } from '@/config/editorSchemes'

/** 根据配色方案生成 CodeMirror 扩展（语法高亮 + 编辑器 chrome） */
export function buildEditorSchemeExtensions(colors: EditorSchemeColors): Extension[] {
  const highlight = HighlightStyle.define([
    { tag: t.heading, color: colors.heading, fontWeight: 'bold' },
    { tag: [t.heading1, t.heading2, t.heading3, t.heading4], color: colors.heading, fontWeight: 'bold' },
    { tag: t.strong, color: colors.bold, fontWeight: 'bold' },
    { tag: t.emphasis, color: colors.italic, fontStyle: 'italic' },
    { tag: t.link, color: colors.link, textDecoration: 'underline' },
    { tag: t.url, color: colors.link },
    { tag: t.quote, color: colors.quote, fontStyle: 'italic' },
    { tag: [t.monospace, t.processingInstruction], color: colors.code },
    { tag: t.comment, color: colors.comment, fontStyle: 'italic' },
    { tag: t.meta, color: colors.italic },
    { tag: t.content, color: colors.text },
  ])

  const editorTheme = EditorView.theme({
    '&': {
      background: colors.background,
      color: colors.text,
    },
    '.cm-content': { color: colors.text },
    '.cm-cursor': { borderLeftColor: colors.cursor },
    '.cm-activeLine': { background: `${colors.activeLine} !important` },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
      background: `${colors.selection} !important`,
    },
    '.cm-placeholder': { color: `${colors.lineNumber} !important` },
  })

  return [syntaxHighlighting(highlight), editorTheme]
}
