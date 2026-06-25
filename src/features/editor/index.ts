/** Editor UI: workspace tabs, CodeMirror panel, file type utils. */
export { default as EditorPanel } from '@/components/editor/EditorPanel.vue'
export { default as EditorWorkspace } from '@/components/editor/EditorWorkspace.vue'
export { useEditorSchemeStore } from './stores/editorSchemeStore'
export { detectFileType, isText, parseDelimited, getExt } from './utils/fileTypes'
export type { FileTypeInfo } from './utils/fileTypes'
