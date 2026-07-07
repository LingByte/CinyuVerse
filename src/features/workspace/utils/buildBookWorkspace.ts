import type { BookState } from '@/core/types/story'
import type { WorkspaceDetail } from '@/core/types/workspace'
import { chapterFilePath } from '@/features/workspace/utils/bookProjectPaths'

/** Build IDE workspace model from folder-backed book index. */
export function buildBookWorkspace(
  bookRoot: string,
  state: BookState,
): { workspace: WorkspaceDetail; filePaths: Map<string, string>; chapterPaths: Map<number, string> } {
  const filePaths = new Map<string, string>()
  const chapterPaths = new Map<number, string>()
  const chapters = state.chapters
    .slice()
    .sort((a, b) => a.meta.number - b.meta.number)
    .map((ch) => {
      const absPath = chapterFilePath(bookRoot, ch.meta.fileName)
      filePaths.set(absPath, absPath)
      chapterPaths.set(ch.meta.number, absPath)
      return {
        id: absPath,
        title: ch.meta.title,
        file_name: ch.meta.fileName,
        order_no: ch.meta.number,
        word_count: ch.meta.wordCount || [...ch.content].length,
        saved: true,
      }
    })

  const workspace: WorkspaceDetail = {
    id: `book:${bookRoot}`,
    book_name: state.config.title,
    type: state.config.genre,
    world_view: '',
    character: '',
    outline: '',
    style: '',
    created_at: state.config.createdAt,
    updated_at: state.config.updatedAt,
    volumes: [
      {
        id: 'vol:chapters',
        title: '章节',
        order_no: 1,
        chapters,
      },
    ],
  }

  return { workspace, filePaths, chapterPaths }
}
