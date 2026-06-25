/**
 * VSCode Seti-inspired file icon color mapping + Lucide icon components
 */
import type { Component } from 'vue'
import {
  File,
  FileText,
  FileCode,
  FileJson,
  FileImage,
  FileType,
  FileSpreadsheet,
  FileArchive,
  Folder,
  FolderOpen,
  Terminal,
  Settings,
  Lock,
  Database,
  BookOpen,
} from 'lucide-vue-next'

export interface FileIconInfo {
  icon: Component
  color: string
}

const SETI_COLORS = {
  blue: '#519aba',
  yellow: '#cbcb41',
  green: '#8dc149',
  red: '#cc3e44',
  orange: '#e37933',
  purple: '#a074c4',
  pink: '#f55385',
  grey: '#6d8086',
  folder: '#dcb67a',
  default: '#cccccc',
} as const

const extColorMap: Record<string, string> = {
  js: SETI_COLORS.yellow,
  mjs: SETI_COLORS.yellow,
  cjs: SETI_COLORS.yellow,
  jsx: SETI_COLORS.blue,
  ts: SETI_COLORS.blue,
  tsx: SETI_COLORS.blue,
  mts: SETI_COLORS.blue,
  cts: SETI_COLORS.blue,
  vue: SETI_COLORS.green,
  svelte: SETI_COLORS.orange,
  json: SETI_COLORS.yellow,
  jsonc: SETI_COLORS.yellow,
  md: SETI_COLORS.blue,
  mdx: SETI_COLORS.blue,
  markdown: SETI_COLORS.blue,
  py: SETI_COLORS.blue,
  pyx: SETI_COLORS.blue,
  pyw: SETI_COLORS.blue,
  html: SETI_COLORS.orange,
  htm: SETI_COLORS.orange,
  css: SETI_COLORS.blue,
  scss: SETI_COLORS.pink,
  sass: SETI_COLORS.pink,
  less: SETI_COLORS.blue,
  go: SETI_COLORS.blue,
  rs: SETI_COLORS.grey,
  java: SETI_COLORS.red,
  kt: SETI_COLORS.orange,
  kts: SETI_COLORS.orange,
  swift: SETI_COLORS.orange,
  dart: SETI_COLORS.blue,
  sh: SETI_COLORS.green,
  bash: SETI_COLORS.green,
  zsh: SETI_COLORS.green,
  fish: SETI_COLORS.green,
  ps1: SETI_COLORS.blue,
  yml: SETI_COLORS.grey,
  yaml: SETI_COLORS.grey,
  toml: SETI_COLORS.grey,
  ini: SETI_COLORS.grey,
  cfg: SETI_COLORS.grey,
  env: SETI_COLORS.grey,
  xml: SETI_COLORS.orange,
  svg: SETI_COLORS.orange,
  c: SETI_COLORS.blue,
  h: SETI_COLORS.purple,
  cpp: SETI_COLORS.blue,
  hpp: SETI_COLORS.purple,
  cs: SETI_COLORS.blue,
  php: SETI_COLORS.purple,
  rb: SETI_COLORS.red,
  dockerfile: SETI_COLORS.blue,
  sql: SETI_COLORS.blue,
  graphql: SETI_COLORS.pink,
  gql: SETI_COLORS.pink,
  lock: SETI_COLORS.grey,
  txt: SETI_COLORS.default,
  log: SETI_COLORS.default,
  csv: SETI_COLORS.green,
  tsv: SETI_COLORS.green,
  png: SETI_COLORS.blue,
  jpg: SETI_COLORS.blue,
  jpeg: SETI_COLORS.blue,
  gif: SETI_COLORS.blue,
  webp: SETI_COLORS.blue,
  ico: SETI_COLORS.blue,
  bmp: SETI_COLORS.blue,
  pdf: SETI_COLORS.red,
  xlsx: SETI_COLORS.green,
  xls: SETI_COLORS.green,
  docx: SETI_COLORS.blue,
  doc: SETI_COLORS.blue,
  pptx: SETI_COLORS.orange,
  ppt: SETI_COLORS.orange,
  license: SETI_COLORS.default,
  readme: SETI_COLORS.blue,
}

const extIconMap: Record<string, Component> = {
  js: FileCode,
  mjs: FileCode,
  cjs: FileCode,
  jsx: FileCode,
  ts: FileCode,
  tsx: FileCode,
  mts: FileCode,
  cts: FileCode,
  vue: FileCode,
  svelte: FileCode,
  html: FileCode,
  htm: FileCode,
  css: FileCode,
  scss: FileCode,
  sass: FileCode,
  less: FileCode,
  py: FileCode,
  pyx: FileCode,
  pyw: FileCode,
  go: FileCode,
  rs: FileCode,
  java: FileCode,
  kt: FileCode,
  kts: FileCode,
  swift: FileCode,
  dart: FileCode,
  c: FileCode,
  h: FileCode,
  cpp: FileCode,
  hpp: FileCode,
  cs: FileCode,
  php: FileCode,
  rb: FileCode,
  xml: FileCode,
  json: FileJson,
  jsonc: FileJson,
  md: FileText,
  mdx: FileText,
  markdown: FileText,
  txt: FileText,
  log: FileText,
  readme: BookOpen,
  license: FileText,
  png: FileImage,
  jpg: FileImage,
  jpeg: FileImage,
  gif: FileImage,
  webp: FileImage,
  ico: FileImage,
  bmp: FileImage,
  svg: FileImage,
  pdf: FileType,
  doc: FileType,
  docx: FileType,
  xlsx: FileSpreadsheet,
  xls: FileSpreadsheet,
  csv: FileSpreadsheet,
  tsv: FileSpreadsheet,
  zip: FileArchive,
  tar: FileArchive,
  gz: FileArchive,
  rar: FileArchive,
  '7z': FileArchive,
  sh: Terminal,
  bash: Terminal,
  zsh: Terminal,
  fish: Terminal,
  ps1: Terminal,
  yml: Settings,
  yaml: Settings,
  toml: Settings,
  ini: Settings,
  cfg: Settings,
  env: Settings,
  lock: Lock,
  sql: Database,
  dockerfile: Settings,
}

function getExtension(fileName: string): string {
  const lc = fileName.toLowerCase()
  if (lc === 'dockerfile') return 'dockerfile'
  if (lc === 'license' || lc === 'readme' || lc.startsWith('readme.')) {
    return lc.startsWith('readme.') ? 'readme' : lc
  }
  return lc.includes('.') ? lc.split('.').pop()! : ''
}

export function getFileColor(fileName: string): string {
  const ext = getExtension(fileName)
  return extColorMap[ext] || SETI_COLORS.default
}

export function getFolderColor(): string {
  return SETI_COLORS.folder
}

export function getFileIconComponent(
  fileName: string,
  options?: { isDirectory?: boolean; isOpen?: boolean },
): Component {
  if (options?.isDirectory) {
    return options.isOpen ? FolderOpen : Folder
  }
  const ext = getExtension(fileName)
  return extIconMap[ext] || File
}

export function getFileIconInfo(
  fileName: string,
  options?: { isDirectory?: boolean; isOpen?: boolean },
): FileIconInfo {
  const isDirectory = options?.isDirectory ?? false
  return {
    icon: getFileIconComponent(fileName, options),
    color: isDirectory ? getFolderColor() : getFileColor(fileName),
  }
}
