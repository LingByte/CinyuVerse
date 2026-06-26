/** Types aligned with backend/pkg/story/models and internal/api handlers. */

export type StoryLanguage = 'zh' | 'en'

export type BookStatus = 'draft' | 'active' | 'complete'

export type ChapterStatus =
  | 'draft'
  | 'ready-for-review'
  | 'approved'
  | 'rejected'
  | 'audit-failed'

export interface BookConfig {
  id: string
  title: string
  genre: string
  language: StoryLanguage
  chapterWordCount: number
  targetChapters?: number
  status: BookStatus
  createdAt: string
  updatedAt: string
}

export interface ChapterMeta {
  number: number
  title: string
  wordCount: number
  status: ChapterStatus
  fileName: string
  updatedAt: string
}

export interface ChapterDetail {
  meta: ChapterMeta
  content: string
}

export interface Genre {
  id: string
  name: string
  language: string
  description: string
}

export interface ProjectConfig {
  language: StoryLanguage
  chapterReviewMode?: string
  inputGovernanceMode?: string
  writing?: { reviewRetries: number; chapterWordCount?: number }
  foundation?: { reviewRetries: number }
  modelOverrides?: Record<string, string>
  detection?: DetectionConfig
  daemon: DaemonConfig
  updatedAt: string
}

export interface DetectionConfig {
  enabled: boolean
  provider?: string
  region?: string
  bizType?: string
  threshold?: number
  autoRevise?: boolean
  maxCharsPerCall?: number
  referenceAutoSync?: boolean
}

export interface DaemonConfig {
  enabled: boolean
  schedule: { writeIntervalMinutes: number; radarIntervalMinutes: number }
  maxConcurrentBooks: number
  chaptersPerCycle: number
  retryDelayMs: number
  cooldownAfterChapterMs: number
  maxChaptersPerDay: number
  qualityGates: {
    maxAuditRetries: number
    pauseAfterConsecutiveFailures: number
    retryTemperatureStep: number
  }
  autoBookIds?: string[]
}

export interface DaemonRuntimeState {
  running: boolean
  startedAt?: string
  lastCycleAt?: string
  chaptersWrittenToday: number
  dayStarted?: string
  pausedBookIds?: string[]
  lastError?: string
}

export interface CreateBookInput {
  title: string
  id?: string
  genre?: string
  language?: StoryLanguage
  brief?: string
}

export interface WriteChapterInput {
  guidance?: string
  wordCount?: number
}

export interface ReviseChapterInput {
  mode?: string
  dryRun?: boolean
  force?: boolean
}

export interface AgentInput {
  bookId: string
  instruction: string
  language?: string
}

export interface AgentResponse {
  response: string
}

export interface InteractionSession {
  bookId: string
  messages: { role: string; content: string }[]
}

export interface BookAnalytics {
  bookId: string
  chapterCount: number
  totalWords: number
  approvedCount: number
  rejectedCount: number
  pendingCount: number
  avgWordsPerChapter: number
}

export interface StoryEvent {
  type: string
  timestamp?: string
  bookId?: string
  chapter?: number
  agent?: string
  message?: string
  data?: Record<string, unknown>
}

export interface AgentMessage {
  role: string
  content: string
}

/** Virtual editor path for backend chapters (treated as markdown in the editor). */
export function storyChapterPath(bookId: string, chapterNum: number) {
  return `cinyuverse://story/${encodeURIComponent(bookId)}/chapter/${chapterNum}.md`
}

export function isStoryChapterPath(path: string): boolean {
  return /^cinyuverse:\/\/story\//.test(path)
}

export function parseStoryChapterPath(path: string): { bookId: string; chapterNum: number } | null {
  const m = path.match(/^cinyuverse:\/\/story\/([^/]+)\/chapter\/(\d+)(?:\.md)?$/)
  if (!m) return null
  return { bookId: decodeURIComponent(m[1]), chapterNum: parseInt(m[2], 10) }
}

/** On-disk layout relative to STORY_PROJECT_ROOT on the Go backend. */
export function storyBookDir(bookId: string) {
  return `books/${bookId}/`
}

export function storyChapterFileDir(bookId: string) {
  return `books/${bookId}/chapters/`
}
