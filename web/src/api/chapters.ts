import request from '@/utils/request'
import type {
  Chapter,
  CreateChapterBody,
  GenerateChapterBody,
  GenerateChapterFieldBody,
  GenerateChapterFieldResult,
  GenerateChapterResult,
  PaginatedChapters,
  PredictPlotBody,
  PredictPlotResult,
  UpdateChapterBody,
} from '@/types/chapter'

export interface ListChaptersParams {
  novelId?: number
  volumeId?: number
  page?: number
  size?: number
}

export function listChapters(params: ListChaptersParams) {
  return request.get<PaginatedChapters>('/chapters', { params }).then((res) => res.data)
}

export function getChapter(id: number) {
  return request.get<Chapter>(`/chapters/${id}`).then((res) => res.data)
}

export function createChapter(body: CreateChapterBody) {
  return request.post<Chapter>('/chapters', body).then((res) => res.data)
}

export function updateChapter(id: number, body: UpdateChapterBody) {
  return request.put<Chapter>(`/chapters/${id}`, body).then((res) => res.data)
}

export function deleteChapter(id: number) {
  return request.delete(`/chapters/${id}`).then((res) => res.data)
}

export function generateChapterContentByAI(body: GenerateChapterBody) {
  return request.post<GenerateChapterResult>('/chapters/generate-content', body).then((res) => res.data)
}

export function predictPlot(body: PredictPlotBody) {
  return request.post<PredictPlotResult>('/chapters/predict-plot', body).then((res) => res.data)
}

export function generateChapterSummary(body: GenerateChapterFieldBody) {
  return request.post<GenerateChapterFieldResult>('/chapters/generate-summary', body).then((res) => res.data)
}

export function generateChapterOutline(body: GenerateChapterFieldBody) {
  return request.post<GenerateChapterFieldResult>('/chapters/generate-outline', body).then((res) => res.data)
}

export function generateChapterBody(body: GenerateChapterFieldBody) {
  return request.post<GenerateChapterFieldResult>('/chapters/generate-body', body).then((res) => res.data)
}
