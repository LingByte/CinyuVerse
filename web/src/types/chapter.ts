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
  /** 前序章节 ID，逗号分隔；与 previousChapterId（首项）同源 */
  previousChapterIds?: string
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
  previousChapterIds?: string
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
  previousChapterIds?: string
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

export interface PlotPrediction {
  direction: string
  summary: string
}

export interface PredictPlotBody {
  novelId: number
  volumeId?: number
  previousChapterId?: number
  previousChapterIds?: string
  characterIds?: string
  direction?: string
  count?: number
  model?: string
}

export interface PredictPlotResult {
  predictions: PlotPrediction[]
  raw: string
}

export interface GenerateChapterFieldBody {
  novelId: number
  volumeId?: number
  previousChapterId?: number
  previousChapterIds?: string
  characterIds?: string
  model?: string
  feedback?: string
  baseDraft?: Partial<Chapter>
}

export interface GenerateChapterFieldResult {
  value: string
  raw: string
}
