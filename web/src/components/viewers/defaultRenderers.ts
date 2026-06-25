import EditorPanel from '@/components/editor/EditorPanel.vue'
import ImageViewer from './ImageViewer.vue'
import PdfViewer from './PdfViewer.vue'
import SpreadsheetViewer from './SpreadsheetViewer.vue'
import BinaryPlaceholder from './BinaryPlaceholder.vue'
import { detectFileType, getExt } from '@/features/editor/utils/fileTypes'
import { getFileName } from '@/services/desktopApi'
import type { FileViewerRenderer, FileViewerTabModel } from './types'

export function viewerIdFromPath(path: string): FileViewerTabModel['viewerId'] {
  const cat = detectFileType(path).category
  if (cat === 'image') return 'image'
  if (cat === 'pdf') return 'pdf'
  if (cat === 'spreadsheet') return 'spreadsheet'
  if (cat === 'binary') return 'binary'
  return 'text'
}

export const defaultRenderers: FileViewerRenderer[] = [
  {
    id: 'text',
    label: 'Text',
    match: (path) => detectFileType(path).category === 'text',
    component: EditorPanel,
    props: ({ tab }) => ({
      content: tab.value,
      encoding: tab.encoding,
      title: tab.title,
      wordCount: [...tab.value].length,
      dirty: tab.isDirty ?? false,
      currentFilePath: tab.path,
      embedded: true,
    }),
  },
  {
    id: 'image',
    label: 'Image',
    match: (path) => detectFileType(path).category === 'image',
    component: ImageViewer,
    props: ({ tab }) => ({
      base64: tab.encoding === 'base64' ? tab.value : btoa(tab.value),
      mimeType: detectFileType(tab.path).mimeType,
      fileName: getFileName(tab.path),
    }),
  },
  {
    id: 'pdf',
    label: 'PDF',
    match: (path) => detectFileType(path).category === 'pdf',
    component: PdfViewer,
    props: ({ tab }) => ({
      base64: tab.value,
      fileName: getFileName(tab.path),
    }),
  },
  {
    id: 'spreadsheet',
    label: 'Spreadsheet',
    match: (path) => detectFileType(path).category === 'spreadsheet',
    component: SpreadsheetViewer,
    props: ({ tab }) => ({ content: tab.value, fileName: getFileName(tab.path) }),
  },
  {
    id: 'binary',
    label: 'Binary',
    match: () => true,
    component: BinaryPlaceholder,
    props: ({ tab }) => ({
      fileName: getFileName(tab.path),
      extension: getExt(tab.path),
    }),
  },
]
