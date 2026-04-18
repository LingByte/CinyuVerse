export interface StyleProfile {
  id: number
  name: string
  status: 'draft' | 'active' | 'archived'
  description: string
  constraints: string
  learnedSpec?: string
  learnedSummary?: string
  learnedAt?: string
  createdAt?: string
  updatedAt?: string
}

export interface StyleSample {
  id: number
  profileId: number
  title: string
  source: 'manual' | 'upload' | 'chapter'
  content: string
  wordCount: number
  createdAt?: string
}

export interface PaginatedStyleItems<T> {
  items: T[]
  total: number
  page: number
  size: number
}
