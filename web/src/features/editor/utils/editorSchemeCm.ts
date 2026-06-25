import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'
import type { Extension } from '@codemirror/state'
import type { EditorSchemeColors } from '@/features/theme/config/editorSchemes'

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
      background: 'var(--editor-bg)',
      color: 'var(--editor-fg)',
    },
    '.cm-scroller': {
      background: 'var(--editor-bg)',
    },
    '.cm-content': {
      color: 'var(--editor-fg)',
      caretColor: colors.cursor,
    },
    '.cm-line': {
      color: 'var(--editor-fg)',
    },
    '.cm-cursor': { borderLeftColor: colors.cursor },
    '.cm-activeLine': { background: 'var(--editor-active-line) !important' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
      background: 'var(--editor-selection, ' + colors.selection + ') !important',
    },
    '.cm-placeholder': { color: 'var(--editor-placeholder) !important' },
  })

  return [syntaxHighlighting(highlight), editorTheme]
}
