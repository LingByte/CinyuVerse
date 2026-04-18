/** 与 internal/handlers/novels.go、novel_ai.go 字段对齐 */

export interface Novel {
  id: number
  title: string
  status: string
  genre: string
  audience: string
  theme: string
  description: string
  worldSetting: string
  tags: string
  coverImage: string
  styleGuide: string
  createdAt: string
  updatedAt: string
  createBy: string
  updateBy: string
}

export interface PaginatedNovels {
  novels: Novel[]
  total: number
  page: number
  size: number
}

/** POST /novels */
export interface CreateNovelBody {
  title: string
  status?: string
  genre?: string
  audience?: string
  theme?: string
  description?: string
  worldSetting?: string
  tags?: string
  coverImage?: string
  styleGuide?: string
}

/** PUT /novels/:id — 与 UpdateNovelRequest 一致，空串不传则后端不更新该字段 */
export interface UpdateNovelBody {
  title?: string
  status?: string
  genre?: string
  audience?: string
  theme?: string
  description?: string
  worldSetting?: string
  tags?: string
  coverImage?: string
  styleGuide?: string
}

export interface GeneratedNovelDraft {
  title: string
  status: string
  genre: string
  audience: string
  theme: string
  description: string
  worldSetting: string
  tags: string
  coverImage: string
  styleGuide: string
}

export interface GenerateNovelByAIResponse {
  draft: GeneratedNovelDraft
  raw: string
}

/** POST /novels/generate */
export interface GenerateNovelBody {
  message: string
  model?: string
  temperature?: number
  maxTokens?: number
  baseDraft?: GeneratedNovelDraft
  lockedFields?: string[]
  feedback?: string
}

export interface UploadNovelCoverResult {
  url: string
  objectKey: string
  fileName: string
}
