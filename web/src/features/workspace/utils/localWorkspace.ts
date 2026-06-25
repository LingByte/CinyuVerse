import type { FileEntry as LocalFileEntry } from '@/core/types/desktop'
import type { WorkspaceDetail, VolumeDetail } from '@/core/types/workspace'

export type { LocalFileEntry }

/** 将本地扫描结果转为 IDE 文件树结构 */
export function buildLocalWorkspace(
  folderPath: string,
  files: LocalFileEntry[],
): { workspace: WorkspaceDetail; filePaths: Map<string, string> } {
  const folderName = folderPath.split(/[/\\]/).pop() || '本地文件夹'
  const filePaths = new Map<string, string>()
  const volumeMap = new Map<string, VolumeDetail>()

  const base: WorkspaceDetail = {
    id: `local:${folderPath}`,
    book_name: folderName,
    type: '',
    world_view: '',
    character: '',
    outline: '',
    style: '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    volumes: [],
  }

  for (const file of files) {
    const parts = file.relativePath.split('/')
    parts.pop()
    const dirKey = parts.join('/') || '__root__'
    if (!volumeMap.has(dirKey)) {
      volumeMap.set(dirKey, {
        id: `vol:${dirKey}`,
        title: dirKey === '__root__' ? folderName : (parts[parts.length - 1] || folderName),
        order_no: volumeMap.size + 1,
        chapters: [],
      })
    }
    const vol = volumeMap.get(dirKey)!
    const chId = file.path
    filePaths.set(chId, file.path)
    vol.chapters.push({
      id: chId,
      title: file.name.replace(/\.(md|txt)$/i, ''),
      file_name: file.name,
      order_no: vol.chapters.length + 1,
      word_count: [...file.content].length,
      saved: true,
    })
  }

  base.volumes = Array.from(volumeMap.values())
  return { workspace: base, filePaths }
}

export function buildLocalSingleFileWorkspace(
  filePath: string,
  fileName: string,
  content: string,
): { workspace: WorkspaceDetail; filePaths: Map<string, string> } {
  const filePaths = new Map<string, string>()
  filePaths.set(filePath, filePath)
  const title = fileName.replace(/\.(md|txt)$/i, '')
  return {
    workspace: {
      id: `local:file:${filePath}`,
      book_name: title,
      type: '',
      world_view: '',
      character: '',
      outline: '',
      style: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      volumes: [
        {
          id: 'vol:file',
          title: '文件',
          order_no: 1,
          chapters: [
            {
              id: filePath,
              title,
              file_name: fileName,
              order_no: 1,
              word_count: [...content].length,
              saved: true,
            },
          ],
        },
      ],
    },
    filePaths,
  }
}
