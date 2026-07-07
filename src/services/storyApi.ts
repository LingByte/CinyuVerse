/**
 * Go story backend HTTP client — maps to backend/internal/api routes.
 * Base URL from VITE_API_BASE_URL (default http://localhost:4567).
 */
import { createApiClient, get, post, put, LONG_TIMEOUT } from '@/utils/http'
import type {
  AgentInput,
  AgentResponse,
  BookAnalytics,
  BookConfig,
  BookState,
  ChapterDetail,
  ChapterMeta,
  CreateBookInput,
  CreateBookResult,
  DaemonConfig,
  DaemonRuntimeState,
  DetectionConfig,
  Genre,
  InteractionSession,
  ProjectConfig,
  ReviseChapterInput,
  WriteChapterInput,
  WriteNextResult,
} from '@/core/types/story'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4567'

const api = createApiClient(BASE_URL)
const longApi = createApiClient(BASE_URL, { timeout: LONG_TIMEOUT })

function bookPath(id: string, suffix = '') {
  return `/api/v1/books/${encodeURIComponent(id)}${suffix}`
}

async function apiGet<T>(url: string): Promise<T> {
  const res = await api.get<T>(url)
  return res.data
}

async function apiPost<T>(url: string, data?: unknown, long = false): Promise<T> {
  const client = long ? longApi : api
  const res = await client.post<T>(url, data)
  return res.data
}

async function apiPut<T>(url: string, data?: unknown): Promise<T> {
  const res = await api.put<T>(url, data)
  return res.data
}

// ── System ──────────────────────────────────────────────────

export function getBaseUrl() {
  return BASE_URL
}

export async function healthCheck(): Promise<{ status: string }> {
  return apiGet('/api/v1/health')
}

export async function listAgents(): Promise<unknown[]> {
  return apiGet('/api/v1/agents')
}

export async function listGenres(): Promise<Genre[]> {
  return apiGet('/api/v1/genres')
}

export async function getLogs(): Promise<unknown[]> {
  return apiGet('/api/v1/logs')
}

// ── Project ─────────────────────────────────────────────────

export async function getProject(): Promise<ProjectConfig> {
  return apiGet('/api/v1/project')
}

export async function updateProject(config: ProjectConfig): Promise<ProjectConfig> {
  return apiPut('/api/v1/project', config)
}

export async function getGovernanceMode(): Promise<{ mode: string }> {
  return apiGet('/api/v1/project/input-governance-mode')
}

export async function getDetectionConfig(): Promise<DetectionConfig> {
  return apiGet('/api/v1/project/detection')
}

// ── Daemon ──────────────────────────────────────────────────

export async function getDaemonStatus(): Promise<{
  runtime: DaemonRuntimeState
  config: DaemonConfig
}> {
  return apiGet('/api/v1/daemon')
}

export async function startDaemon(): Promise<{ status: string }> {
  return apiPost('/api/v1/daemon/start')
}

export async function stopDaemon(): Promise<{ status: string }> {
  return apiPost('/api/v1/daemon/stop')
}

// ── Books ───────────────────────────────────────────────────

export async function listBooks(): Promise<BookConfig[]> {
  return apiGet('/api/v1/books')
}

export async function getBook(id: string): Promise<BookConfig> {
  return apiGet(bookPath(id))
}

export async function createBook(input: CreateBookInput): Promise<CreateBookResult> {
  return apiPost('/api/v1/books/create', input, true)
}

export async function listChapters(bookId: string): Promise<ChapterMeta[]> {
  return apiGet(bookPath(bookId, '/chapters'))
}

export async function getChapter(bookId: string, num: number): Promise<ChapterDetail> {
  return apiGet(bookPath(bookId, `/chapters/${num}`))
}

export async function saveChapter(
  bookId: string,
  num: number,
  title: string,
  content: string,
): Promise<ChapterMeta> {
  return apiPut(bookPath(bookId, `/chapters/${num}`), { title, content })
}

// ── Writing pipeline ────────────────────────────────────────

export async function writeNextChapter(
  bookId: string,
  input?: WriteChapterInput & { state?: BookState },
): Promise<WriteNextResult> {
  return apiPost(bookPath(bookId, '/write-next'), input ?? {}, true)
}

export async function planChapter(bookId: string, guidance?: string): Promise<unknown> {
  return apiPost(bookPath(bookId, '/plan'), { guidance: guidance ?? '' }, true)
}

export async function composeChapter(bookId: string, guidance?: string): Promise<unknown> {
  return apiPost(bookPath(bookId, '/compose'), { guidance: guidance ?? '' }, true)
}

export async function draftChapter(
  bookId: string,
  input?: WriteChapterInput,
): Promise<unknown> {
  return apiPost(bookPath(bookId, '/draft'), input ?? {}, true)
}

export async function rewriteChapter(
  bookId: string,
  chapter: number,
  guidance?: string,
  wordCount?: number,
): Promise<unknown> {
  return apiPost(bookPath(bookId, '/rewrite'), { chapter, guidance, wordCount }, true)
}

export async function polishChapter(
  bookId: string,
  chapter?: number,
  content?: string,
): Promise<{ content: string }> {
  return apiPost(bookPath(bookId, '/polish'), { chapter, content }, true)
}

export async function auditChapter(bookId: string, chapter: number): Promise<unknown> {
  return apiPost(bookPath(bookId, `/audit/${chapter}`), {}, true)
}

export async function reviseChapter(
  bookId: string,
  chapter: number,
  input?: ReviseChapterInput,
): Promise<unknown> {
  return apiPost(bookPath(bookId, `/revise/${chapter}`), input ?? {}, true)
}

export async function approveChapter(bookId: string, num: number): Promise<{ status: string }> {
  return apiPost(bookPath(bookId, `/chapters/${num}/approve`))
}

export async function rejectChapter(bookId: string, num: number): Promise<{ status: string }> {
  return apiPost(bookPath(bookId, `/chapters/${num}/reject`))
}

// ── Analytics / export ──────────────────────────────────────

export async function getBookAnalytics(bookId: string): Promise<BookAnalytics> {
  return apiGet(bookPath(bookId, '/analytics'))
}

export async function exportBook(bookId: string, format: 'md' | 'txt' = 'md'): Promise<string> {
  const res = await api.get<string>(bookPath(bookId, '/export'), {
    params: { format },
    responseType: 'text',
  })
  return res.data
}

// ── Interaction / Agent ───────────────────────────────────────

export async function getInteractionSession(bookId: string): Promise<InteractionSession> {
  return apiGet(`/api/v1/interaction/session?bookId=${encodeURIComponent(bookId)}`)
}

export async function sendAgentInstruction(input: AgentInput): Promise<AgentResponse> {
  return apiPost('/api/v1/agent', input, true)
}

// ── References ──────────────────────────────────────────────

export async function listReferences(): Promise<unknown> {
  return apiGet('/api/v1/references')
}

export async function syncReferences(force = false): Promise<unknown> {
  const q = force ? '?force=true' : ''
  return apiPost(`/api/v1/references/sync${q}`)
}

// ── Truth files ─────────────────────────────────────────────

export async function listTruthFiles(bookId: string): Promise<{ bookId: string; files: string[] }> {
  return apiGet(bookPath(bookId, '/truth'))
}

export async function getTruthFile(bookId: string, file: string): Promise<string> {
  const res = await api.get<string>(bookPath(bookId, `/truth/${file}`), {
    responseType: 'text',
  })
  return res.data
}

export async function putTruthFile(
  bookId: string,
  file: string,
  content: string,
): Promise<{ status: string }> {
  return apiPut(bookPath(bookId, `/truth/${file}`), { content })
}

// ── SSE events ──────────────────────────────────────────────

export function subscribeEvents(
  onEvent: (data: unknown) => void,
  filterType?: string,
): () => void {
  const url = new URL('/api/v1/events', BASE_URL)
  if (filterType) url.searchParams.set('type', filterType)
  const es = new EventSource(url.toString())
  es.onmessage = (e) => {
    try {
      onEvent(JSON.parse(e.data))
    } catch {
      onEvent(e.data)
    }
  }
  es.onerror = () => {
    // EventSource auto-reconnects; caller may handle via onEvent
  }
  return () => es.close()
}

/** Re-export thin helpers that use default client (empty baseURL) — prefer storyApi methods above. */
export { get, post, put, BASE_URL as STORY_API_BASE_URL }
