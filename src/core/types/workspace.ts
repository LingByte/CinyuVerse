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
  /** 绑定的本地章节 md 绝对路径 */
  file_path?: string
  /** draft | published | revision */
  status?: 'draft' | 'published' | 'revision'
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

/** `.cinyuverse/project.json` */
export interface ProjectInfo {
  bookName: string
  genre: string
  tags: string[]
  author: string
  status: 'draft' | 'serializing' | 'completed' | string
  worldView: string
  style: string
  styleSample: string
  targetWords: number
  createdAt: string
  updatedAt: string
}

export interface WritingRules {
  rules: string[]
  tone: string
  pov: string
}

export interface ProjectMetaBundle {
  project: ProjectInfo
  characters: CharacterCard[]
  glossary: GlossaryEntry[]
  outline: ProjectOutline
  bannedWords: string[]
  writingRules: WritingRules
}

export interface VersionEntry {
  id: string
  filePath: string
  createdAt: string
  label: string
  size: number
}

export interface BannedWordHit {
  word: string
  index: number
  line: number
}

export interface OocWarning {
  character: string
  message: string
  snippet: string
}

export interface ContentCheckResult {
  bannedHits: BannedWordHit[]
  oocWarnings: OocWarning[]
  wordCount: number
}

export interface PromptBuildRequest {
  workspaceRoot: string
  userInstruction: string
  selection?: string
  contextBefore?: string
  contextAfter?: string
  outlineSnippet?: string
  characterNames?: string[]
  chapterPath?: string
  action?: string
}

export interface PromptBuildResult {
  systemPrompt: string
  userPrompt: string
  contextSummary: string
}

export interface ExportChapter {
  title: string
  content: string
}
