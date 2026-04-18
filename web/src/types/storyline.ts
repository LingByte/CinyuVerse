export interface Storyline {
  id: number
  novelId: number
  name: string
  version: number
  status: string
  theme: string
  promise: string
  forbidden: string
  description: string
  currentNodeId: string
  createdAt?: string
  updatedAt?: string
}

export interface StorylineNode {
  id: number
  storylineId: number
  novelId: number
  nodeId: string
  type: string
  title: string
  summary: string
  status: string
  chapterNo: number
  volumeNo: number
  priority: number
  props: string
  createdAt?: string
  updatedAt?: string
}

export interface StorylineEdge {
  id: number
  storylineId: number
  novelId: number
  edgeId: string
  fromNodeId: string
  toNodeId: string
  relation: string
  weight: number
  status: string
  props: string
  createdAt?: string
  updatedAt?: string
}

export interface StorylineFact {
  id: number
  storylineId: number
  novelId: number
  factKey: string
  factValue: string
  sourceNodeId: string
  validFromChap: number
  validToChap: number
  confidence: number
  createdAt?: string
  updatedAt?: string
}

export interface PaginatedStorylineItems<T> {
  items: T[]
  total: number
  page: number
  size: number
}

export interface StorylineGraphNode {
  id: string
  label: string
  type: string
  props: Record<string, unknown>
}

export interface StorylineGraphEdge {
  id: string
  source: string
  target: string
  type: string
  props: Record<string, unknown>
}

export interface StorylineGraphStats {
  totalNodes: number
  totalEdges: number
  eventCount: number
  clueCount: number
  twistCount: number
  factCount: number
}

export interface StorylineGraph {
  nodes: StorylineGraphNode[]
  edges: StorylineGraphEdge[]
  stats: StorylineGraphStats
}

/** AI 返回的故事线 + 图草稿（与后端 aiStorylineGraphDraft 对齐） */
export interface StorylineAIDraft {
  storyline: Storyline
  nodes: StorylineNode[]
  edges: StorylineEdge[]
  facts: StorylineFact[]
}

export interface GenerateStorylineBody {
  message: string
  model?: string
  temperature?: number
  maxTokens?: number
  detailLevel?: string
  nodeLimit?: number
  edgeLimit?: number
  factLimit?: number
  baseDraft?: StorylineAIDraft
  lockedFields?: string[]
  feedback?: string
}

export interface GenerateStorylineResult {
  draft: StorylineAIDraft
  raw: string
  regenerated?: boolean
}
