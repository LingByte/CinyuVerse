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

/** LLM 深度分析结果 */
export interface StyleAnalysis {
  narrativeVoice: string
  proseRhythm: string
  vocabularyLevel: string
  rhetoricTendency: string
  dialogueStyle: string
  emotionalPalette: string
  structuralHabits: string
  imageryDomains: string[]
  signatureTraits: string[]
  stylePrompt: string
  summary: string
}

/** 统计指标 */
export interface StyleStats {
  sampleCount: number
  totalChars: number
  avgSentenceChars: number
  dialogueRatio: number
  firstPersonRatio: number
  tone: string
  topKeywords: string[]
  paragraphAvgLen: number
  exclamRatio: number
  questionRatio: number
}

/** 完整的学习结果 spec = { stats, analysis } */
export interface StyleLearnedSpec {
  stats: StyleStats
  analysis: StyleAnalysis
}
