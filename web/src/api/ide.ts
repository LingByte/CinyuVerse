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

export async function deleteWorkspace(id: string): Promise<void> {
  await axios.delete(`${API_BASE}/workspace/${id}`)
}

// ── Volumes ────────────────────────────────────────────────

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

// ── Word Count ─────────────────────────────────────────────

export async function getWordCount(wsId: string): Promise<number> {
  const { data } = await axios.get(`${API_BASE}/workspace/${wsId}/wordcount`)
  return data.data?.total_words || 0
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
