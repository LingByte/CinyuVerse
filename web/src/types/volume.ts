export interface Volume {
  id: number
  novelId: number
  title: string
  subtitle: string
  description: string
  theme: string
  coreConflict: string
  goal: string
  endingHook: string
  status: string
  orderNo: number
  targetChapters: number
  targetWords: number
  chapterStart: number
  chapterEnd: number
  relatedNodeIds: string
  relatedCharacterIds: string
  writingStrategy: string
  tags: string
  createdAt: string
  updatedAt: string
}

export interface PaginatedVolumes {
  volumes: Volume[]
  total: number
  page: number
  size: number
}

export interface CreateVolumeBody {
  novelId: number
  title: string
  subtitle?: string
  description?: string
  theme?: string
  coreConflict?: string
  goal?: string
  endingHook?: string
  status?: string
  orderNo?: number
  targetChapters?: number
  targetWords?: number
  chapterStart?: number
  chapterEnd?: number
  relatedNodeIds?: string
  relatedCharacterIds?: string
  writingStrategy?: string
  tags?: string
}

export interface UpdateVolumeBody {
  novelId?: number
  title?: string
  subtitle?: string
  description?: string
  theme?: string
  coreConflict?: string
  goal?: string
  endingHook?: string
  status?: string
  orderNo?: number
  targetChapters?: number
  targetWords?: number
  chapterStart?: number
  chapterEnd?: number
  relatedNodeIds?: string
  relatedCharacterIds?: string
  writingStrategy?: string
  tags?: string
}

export interface GenerateVolumeBody {
  message: string
  model?: string
  temperature?: number
  maxTokens?: number
  baseDraft?: Partial<Volume>
  lockedFields?: string[]
  feedback?: string
}

export interface GenerateVolumeResult {
  draft: Volume
  raw: string
}
