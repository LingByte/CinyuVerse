export interface WorkspaceItem {
  id: string
  book_name: string
  type: string
  world_view: string
  character: string
  outline: string
  style: string
  created_at: string
  updated_at: string
}

export interface VolumeItem {
  id: string
  title: string
  order_no: number
}

export interface ChapterItem {
  id: string
  title: string
  file_name: string
  order_no: number
  word_count: number
  saved: boolean
}

export interface WorkspaceDetail extends WorkspaceItem {
  volumes: VolumeDetail[]
}

export interface VolumeDetail extends VolumeItem {
  chapters: ChapterItem[]
}

export interface CharacterCard {
  id: string
  name: string
  age: string
  identity: string
  personality: string
  relations: string
  storyline: string
  dialogue_style: string
}

export interface GlossaryEntry {
  id: string
  term: string
  category: string
  definition: string
}

export interface WordStats {
  total_words: number
  body_words: number
  volume_stats: {
    volume_id: string
    title: string
    total_words: number
    chapters: { chapter_id: string; title: string; words: number; body_words: number }[]
  }[]
  target_words: number
  target_progress: number
}

export interface OutlineNode {
  id: string
  title: string
  content: string
  chapter_id?: string
  vol_id?: string
  children?: OutlineNode[]
}

export interface TimelineEvent {
  id: string
  title: string
  date_label: string
  description: string
  characters?: string[]
}

export interface ProjectOutline {
  book_outline: string
  volume_nodes: OutlineNode[]
  timeline: TimelineEvent[]
}

export interface ChatMessageItem {
  id: number
  sessionId: number
  seq: number
  role: string
  content: string
  createdAt: string
}

export interface ChatSessionItem {
  id: number
  title: string
  workspaceId?: string
  createdAt: string
  updatedAt: string
}
