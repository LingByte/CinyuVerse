import request from '@/utils/request'
import type {
  CreateNovelBody,
  GenerateNovelBody,
  GenerateNovelByAIResponse,
  Novel,
  PaginatedNovels,
  UpdateNovelBody,
  UploadNovelCoverResult,
} from '@/types/novel'

export interface ListNovelsParams {
  page?: number
  size?: number
}

export interface SearchNovelsParams {
  keyword: string
  page?: number
  size?: number
}

export function listNovels(params?: ListNovelsParams) {
  return request.get<PaginatedNovels>('/novels', { params }).then((res) => res.data)
}

export function searchNovels(params: SearchNovelsParams) {
  return request.get<PaginatedNovels>('/novels/search', { params }).then((res) => res.data)
}

export function getNovel(id: number) {
  return request.get<Novel>(`/novels/${id}`).then((res) => res.data)
}

export function createNovel(body: CreateNovelBody) {
  return request.post<Novel>('/novels', body).then((res) => res.data)
}

export function updateNovel(id: number, body: UpdateNovelBody) {
  return request.put<Novel>(`/novels/${id}`, body).then((res) => res.data)
}

export function deleteNovel(id: number) {
  return request.delete(`/novels/${id}`).then((res) => res.data)
}

export function generateNovelByAI(body: GenerateNovelBody) {
  return request.post<GenerateNovelByAIResponse>('/novels/generate', body).then((res) => res.data)
}

export function uploadNovelCover(file: File) {
  const body = new FormData()
  body.append('file', file)
  return request
    .post<UploadNovelCoverResult>('/novels/cover/upload', body, {
      timeout: 120_000,
    })
    .then((res) => res.data)
}
