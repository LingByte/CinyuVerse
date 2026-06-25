/**
 * VSCode Seti-inspired file icon color mapping
 * Colors from extensions/theme-seti/icons/vs-seti-icon-theme.json
 */

export interface FileIconInfo {
  icon: string    // SVG path data or character
  color: string   // hex color
}

// Seti theme colors (dark theme mapping)
const SETI_COLORS = {
  blue: '#519aba',
  yellow: '#cbcb41',
  green: '#8dc149',
  red: '#cc3e44',
  orange: '#e37933',
  purple: '#a074c4',
  pink: '#f55385',
  grey: '#6d8086',
  folder: '#dcb67a',    // folder golden
  folderOpen: '#dcb67a',
  default: '#cccccc',
} as const

// Extension → color mapping based on Seti theme
const extColorMap: Record<string, string> = {
  // JavaScript
  'js': SETI_COLORS.yellow,
  'mjs': SETI_COLORS.yellow,
  'cjs': SETI_COLORS.yellow,
  'jsx': SETI_COLORS.blue,
  // TypeScript
  'ts': SETI_COLORS.blue,
  'tsx': SETI_COLORS.blue,
  'mts': SETI_COLORS.blue,
  'cts': SETI_COLORS.blue,
  // Vue / Svelte
  'vue': SETI_COLORS.green,
  'svelte': SETI_COLORS.orange,
  // JSON / Config
  'json': SETI_COLORS.yellow,
  'jsonc': SETI_COLORS.yellow,
  // Markdown
  'md': SETI_COLORS.blue,
  'mdx': SETI_COLORS.blue,
  'markdown': SETI_COLORS.blue,
  // Python
  'py': SETI_COLORS.blue,
  'pyx': SETI_COLORS.blue,
  'pyw': SETI_COLORS.blue,
  // HTML / CSS
  'html': SETI_COLORS.orange,
  'htm': SETI_COLORS.orange,
  'css': SETI_COLORS.blue,
  'scss': SETI_COLORS.pink,
  'sass': SETI_COLORS.pink,
  'less': SETI_COLORS.blue,
  // Go / Rust / Java / etc
  'go': SETI_COLORS.blue,
  'rs': SETI_COLORS.grey,
  'java': SETI_COLORS.red,
  'kt': SETI_COLORS.orange,
  'kts': SETI_COLORS.orange,
  'swift': SETI_COLORS.orange,
  'dart': SETI_COLORS.blue,
  // Shell / Scripts
  'sh': SETI_COLORS.green,
  'bash': SETI_COLORS.green,
  'zsh': SETI_COLORS.green,
  'fish': SETI_COLORS.green,
  'ps1': SETI_COLORS.blue,
  // Config files
  'yml': SETI_COLORS.grey,
  'yaml': SETI_COLORS.grey,
  'toml': SETI_COLORS.grey,
  'ini': SETI_COLORS.grey,
  'cfg': SETI_COLORS.grey,
  'env': SETI_COLORS.grey,
  // XML
  'xml': SETI_COLORS.orange,
  'svg': SETI_COLORS.orange,
  // C family
  'c': SETI_COLORS.blue,
  'h': SETI_COLORS.purple,
  'cpp': SETI_COLORS.blue,
  'hpp': SETI_COLORS.purple,
  'cs': SETI_COLORS.blue,
  // PHP / Ruby
  'php': SETI_COLORS.purple,
  'rb': SETI_COLORS.red,
  // Docker / Cloud
  'dockerfile': SETI_COLORS.blue,
  'sql': SETI_COLORS.blue,
  'graphql': SETI_COLORS.pink,
  'gql': SETI_COLORS.pink,
  // Lock files
  'lock': SETI_COLORS.grey,
  // Other text formats
  'txt': SETI_COLORS.default,
  'log': SETI_COLORS.default,
  'csv': SETI_COLORS.green,
  'tsv': SETI_COLORS.green,
  // Images (non-text but shown in tree)
  'png': SETI_COLORS.blue,
  'jpg': SETI_COLORS.blue,
  'jpeg': SETI_COLORS.blue,
  'gif': SETI_COLORS.blue,
  'webp': SETI_COLORS.blue,
  'ico': SETI_COLORS.blue,
  'bmp': SETI_COLORS.blue,
  // PDF
  'pdf': SETI_COLORS.red,
  // Office
  'xlsx': SETI_COLORS.green,
  'xls': SETI_COLORS.green,
  'docx': SETI_COLORS.blue,
  'doc': SETI_COLORS.blue,
  'pptx': SETI_COLORS.orange,
  'ppt': SETI_COLORS.orange,
  // License / Readme etc (by filename)
  'license': SETI_COLORS.default,
  'readme': SETI_COLORS.blue,
}

export function getFileColor(fileName: string): string {
  const lc = fileName.toLowerCase()
  const ext = lc.includes('.') ? lc.split('.').pop()! : ''
  return extColorMap[ext] || SETI_COLORS.default
}

export function getFolderColor(): string {
  return SETI_COLORS.folder
}

// VSCode codicon SVG paths (16x16 viewBox)
export const CODICONS = {
  // folder icon
  folder: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M1.5 3.5h4.5l1 1.5H14.5v7.5H1.5V3.5z" fill="currentColor" opacity="0.9"/>
  </svg>`,

  // folder open icon
  folderOpen: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M1.5 3.5h4.5l1 1.5H14.5v.5l-1.2 5H2.7L1.5 3.5z" fill="currentColor" opacity="0.9"/>
  </svg>`,

  // file icon (simple document)
  file: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M3 2h6l4 4v8H3V2z" fill="currentColor" opacity="0.8"/>
    <path d="M9 2v4h4" fill="none" stroke="var(--bg-secondary)" stroke-width="1"/>
  </svg>`,

  // new file icon
  newFile: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M3 2h6l4 4v8H3V2z" fill="currentColor" opacity="0.8"/>
    <path d="M9 2v4h4" fill="none" stroke="var(--bg-secondary)" stroke-width="1"/>
    <line x1="8" y1="7" x2="8" y2="11" stroke="var(--bg-secondary)" stroke-width="1.5"/>
    <line x1="6" y1="9" x2="10" y2="9" stroke="var(--bg-secondary)" stroke-width="1.5"/>
  </svg>`,

  // new folder icon
  newFolder: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M1.5 3.5h4.5l1 1.5H14.5v7.5H1.5V3.5z" fill="currentColor" opacity="0.9"/>
    <line x1="8" y1="7" x2="8" y2="11" stroke="var(--bg-secondary)" stroke-width="1.5"/>
    <line x1="6" y1="9" x2="10" y2="9" stroke="var(--bg-secondary)" stroke-width="1.5"/>
  </svg>`,

  // refresh icon
  refresh: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M13.5 8A5.5 5.5 0 008 2.5c-1.8 0-3.3.7-4.3 1.8L2 5.5V2.5H1V7h4.5V6H3.2C4 4.7 5.9 3.5 8 3.5A4.5 4.5 0 0112.5 8h1zM2.5 8A5.5 5.5 0 008 13.5c1.8 0 3.3-.7 4.3-1.8L14 10.5v3h1V9h-4.5v1h2.2C11.9 11.3 10 12.5 8 12.5A4.5 4.5 0 013.5 8h-1z" fill="currentColor"/>
  </svg>`,

  // collapse all icon
  collapseAll: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M8 2L4 6h8L8 2zM2 13l2-2.5L6 13h2L4 8 0 13h2zM10 13l2-2.5 2 2.5h2L12 8l-4 5h2z" fill="currentColor"/>
  </svg>`,

  // close / clear icon
  close: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M8 8.7l4.6 4.6.7-.7L8.7 8l4.6-4.6-.7-.7L8 7.3 3.4 2.7l-.7.7L7.3 8l-4.6 4.6.7.7L8 8.7z" fill="currentColor"/>
  </svg>`,
}
