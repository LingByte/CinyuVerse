import axios from 'axios'
import { getApiBaseURL } from '@/config/apiConfig'

const API_BASE = getApiBaseURL()

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

export interface TrashItem {
  id: string
  workspace_id: string
  type: 'volume' | 'chapter'
  volume_id?: string
  chapter_id?: string
  title: string
  deleted_at: string
  expires_at: string
}

export interface ChapterSnapshot {
  id: string
  created_at: string
  word_count: number
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

// ── Workspace ──────────────────────────────────────────────

export async function listWorkspaces(): Promise<WorkspaceItem[]> {
  const { data } = await axios.get(`${API_BASE}/workspace/list`)
  return data.data || []
}

export async function createWorkspace(book_name: string): Promise<WorkspaceItem> {
  const { data } = await axios.post(`${API_BASE}/workspace`, { book_name })
  return data.data
}

export async function getWorkspace(id: string): Promise<WorkspaceDetail> {
  const { data } = await axios.get(`${API_BASE}/workspace/${id}`)
  return data.data
}

export async function updateWorkspace(id: string, body: Partial<WorkspaceItem>): Promise<WorkspaceDetail> {
  const { data } = await axios.put(`${API_BASE}/workspace/${id}`, body)
  return data.data
}

export async function deleteWorkspace(id: string): Promise<void> {
  await axios.delete(`${API_BASE}/workspace/${id}`)
}

// ── Volumes ────────────────────────────────────────────────

export async function deleteVolume(wsId: string, volId: string): Promise<void> {
  await axios.delete(`${API_BASE}/workspace/${wsId}/volumes/${volId}`)
}

// ── Chapters ───────────────────────────────────────────────

export async function createVolume(wsId: string, title: string): Promise<VolumeItem> {
  const { data } = await axios.post(`${API_BASE}/workspace/${wsId}/volumes`, { title })
  return data.data
}

// ── Chapters ───────────────────────────────────────────────

export async function createChapter(wsId: string, volId: string, title: string): Promise<ChapterItem> {
  const { data } = await axios.post(`${API_BASE}/workspace/${wsId}/volumes/${volId}/chapters`, { title })
  return data.data
}

export async function getChapterContent(wsId: string, volId: string, chId: string): Promise<string> {
  const { data } = await axios.get(`${API_BASE}/workspace/${wsId}/volumes/${volId}/chapters/${chId}`)
  return data.data?.content || ''
}

export async function saveChapterContent(wsId: string, volId: string, chId: string, content: string): Promise<void> {
  await axios.put(`${API_BASE}/workspace/${wsId}/volumes/${volId}/chapters/${chId}`, { content })
}

export async function deleteChapter(wsId: string, volId: string, chId: string): Promise<void> {
  await axios.delete(`${API_BASE}/workspace/${wsId}/volumes/${volId}/chapters/${chId}`)
}

// ── Snapshots ────────────────────────────────────────────────

export async function listChapterSnapshots(wsId: string, volId: string, chId: string): Promise<ChapterSnapshot[]> {
  const { data } = await axios.get(`${API_BASE}/workspace/${wsId}/volumes/${volId}/chapters/${chId}/snapshots`)
  return data.data || []
}

export async function getChapterSnapshot(wsId: string, volId: string, chId: string, snapId: string): Promise<string> {
  const { data } = await axios.get(`${API_BASE}/workspace/${wsId}/volumes/${volId}/chapters/${chId}/snapshots/${snapId}`)
  return data.data?.content || ''
}

export async function restoreChapterSnapshot(wsId: string, volId: string, chId: string, snapId: string): Promise<string> {
  const { data } = await axios.post(`${API_BASE}/workspace/${wsId}/volumes/${volId}/chapters/${chId}/snapshots/${snapId}/restore`)
  return data.data?.content || ''
}

// ── Characters / Glossary ──────────────────────────────────

export async function getCharacters(wsId: string): Promise<CharacterCard[]> {
  const { data } = await axios.get(`${API_BASE}/workspace/${wsId}/characters`)
  return data.data || []
}

export async function saveCharacters(wsId: string, cards: CharacterCard[]): Promise<CharacterCard[]> {
  const { data } = await axios.put(`${API_BASE}/workspace/${wsId}/characters`, cards)
  return data.data || []
}

export async function getGlossary(wsId: string): Promise<GlossaryEntry[]> {
  const { data } = await axios.get(`${API_BASE}/workspace/${wsId}/glossary`)
  return data.data || []
}

export async function saveGlossary(wsId: string, entries: GlossaryEntry[]): Promise<GlossaryEntry[]> {
  const { data } = await axios.put(`${API_BASE}/workspace/${wsId}/glossary`, entries)
  return data.data || []
}

// ── Trash ────────────────────────────────────────────────────

export async function listTrash(wsId: string): Promise<TrashItem[]> {
  const { data } = await axios.get(`${API_BASE}/workspace/${wsId}/trash`)
  return data.data || []
}

export async function restoreTrash(wsId: string, trashId: string): Promise<void> {
  await axios.post(`${API_BASE}/workspace/${wsId}/trash/${trashId}/restore`)
}

// ── Word Count ─────────────────────────────────────────────

export async function getWordCount(wsId: string): Promise<number> {
  const { data } = await axios.get(`${API_BASE}/workspace/${wsId}/wordcount`)
  return data.data?.total_words || 0
}

export async function getWordStats(wsId: string, target = 0): Promise<WordStats> {
  const params = target > 0 ? `?target=${target}` : ''
  const { data } = await axios.get(`${API_BASE}/workspace/${wsId}/stats${params}`)
  return data.data
}

// ── Export ─────────────────────────────────────────────────

export async function exportTxt(wsId: string): Promise<Blob> {
  const { data } = await axios.get(`${API_BASE}/export/${wsId}/txt`, { responseType: 'blob' })
  return data
}

export async function exportMd(wsId: string): Promise<Blob> {
  const { data } = await axios.get(`${API_BASE}/export/${wsId}/md`, { responseType: 'blob' })
  return data
}

export async function exportEpub(wsId: string): Promise<Blob> {
  const { data } = await axios.get(`${API_BASE}/export/${wsId}/epub`, { responseType: 'blob' })
  return data
}

export async function exportDocx(wsId: string): Promise<Blob> {
  const { data } = await axios.get(`${API_BASE}/export/${wsId}/docx`, { responseType: 'blob' })
  return data
}

export async function exportPlatform(wsId: string, platform: 'fanqie' | 'qidian' | 'jjwxc'): Promise<Blob> {
  const { data } = await axios.get(`${API_BASE}/export/${wsId}/platform/${platform}`, { responseType: 'blob' })
  return data
}

export async function exportOutlineMd(wsId: string): Promise<Blob> {
  const { data } = await axios.get(`${API_BASE}/export/${wsId}/outline-md`, { responseType: 'blob' })
  return data
}

// ── Outline ─────────────────────────────────────────────────

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

export async function getOutline(wsId: string): Promise<ProjectOutline> {
  const { data } = await axios.get(`${API_BASE}/workspace/${wsId}/outline`)
  return data.data
}

export async function saveOutline(wsId: string, outline: ProjectOutline): Promise<ProjectOutline> {
  const { data } = await axios.put(`${API_BASE}/workspace/${wsId}/outline`, outline)
  return data.data
}

export async function importOutlineMd(wsId: string, content: string): Promise<ProjectOutline> {
  const { data } = await axios.post(`${API_BASE}/workspace/${wsId}/outline/import-md`, { content })
  return data.data
}
