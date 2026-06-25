import type { Component } from 'vue'

export type FileViewerTabModel = {
  id: string
  path: string
  title: string
  viewerId: 'text' | 'image' | 'pdf' | 'spreadsheet' | 'binary'
  readOnly: boolean
  value: string
  encoding: 'utf8' | 'base64'
  isDirty?: boolean
}

export type FileViewerRenderParams = {
  tab: FileViewerTabModel
  onChange: (nextValue: string) => void
  assetUrl?: string
}

export type FileViewerRenderer = {
  id: string
  label: string
  match: (path: string) => boolean
  component: Component
  props?: (params: FileViewerRenderParams) => Record<string, unknown>
}
