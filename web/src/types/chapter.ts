export interface Chapter {
  id: number
  novelId: number
  volumeId: number
  title: string
  content: string
  orderNo: number
  wordCount: number
  summary: string
  characterIds: string
  plotPointIds: string
  previousChapterId: number
  outline: string
  relatedNodeIds: string
  promptMemo: string
  status: string
  createdAt: string
  updatedAt: string
}

export interface PaginatedChapters {
  chapters: Chapter[]
  total: number
  page: number
  size: number
}

export interface CreateChapterBody {
  novelId: number
  volumeId: number
  title: string
  content?: string
  orderNo?: number
  wordCount?: number
  summary?: string
  characterIds?: string
  plotPointIds?: string
  previousChapterId?: number
  outline?: string
  relatedNodeIds?: string
  promptMemo?: string
  status?: string
}

export interface UpdateChapterBody {
  title?: string
  content?: string
  orderNo?: number
  wordCount?: number
  summary?: string
  characterIds?: string
  plotPointIds?: string
  previousChapterId?: number
  outline?: string
  relatedNodeIds?: string
  promptMemo?: string
  status?: string
}

export interface GenerateChapterBody {
  message: string
  model?: string
  temperature?: number
  maxTokens?: number
  baseDraft?: Partial<Chapter>
  lockedFields?: string[]
  feedback?: string
}

export interface GenerateChapterResult {
  draft: Chapter
  raw: string
}
