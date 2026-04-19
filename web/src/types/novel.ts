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
  /** 关联「风格学习」档案 id，0 表示未绑定 */
  styleProfileId: number
  /** 档案名称（列表/详情接口可能返回） */
  styleProfileName?: string
  /** 全书本章 word_count 之和 */
  totalWordCount?: number
  /** 章节篇数 */
  chapterCount?: number
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
  styleProfileId?: number
}

/** PUT /novels/:id — 与 UpdateNovelRequest 一致，空串不传则后端不更新字符串字段；styleProfileId 传数字（含 0）会更新绑定 */
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
  styleProfileId?: number
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
