import { del, get, post, put } from '@/utils/request'

export interface Novel {
  id: number
  title: string
  authorId: number
  status: string
  genre: string
  audience: string
  theme: string
  description: string
  worldSetting: string
  tags: string
  coverImage: string
  styleGuide: string
  referenceNovel: string
  createdAt: string
  updatedAt: string
  createBy: string
  updateBy: string
}

export interface PaginatedNovels {
  novels: Novel[]
  total: number
  page: number
  size: number
}

export interface CreateNovelBody {
  title: string
  authorId: number
  status?: string
  genre?: string
  audience?: string
  theme?: string
  description?: string
  worldSetting?: string
  tags?: string
  coverImage?: string
  styleGuide?: string
  referenceNovel?: string
}

export interface UpdateNovelBody {
  title?: string
  status?: string
  genre?: string
  audience?: string
  theme?: string
  description?: string
  worldSetting?: string
  tags?: string
  coverImage?: string
  styleGuide?: string
  referenceNovel?: string
}

export const novelsApi = {
  create<T = Novel>(data: CreateNovelBody) {
    return post<T>('/novels', data)
  },

  list<T = PaginatedNovels>(params: { page?: number; size?: number }) {
    return get<T>('/novels', { params })
  },

  search<T = PaginatedNovels>(params: { keyword: string; page?: number; size?: number }) {
    return get<T>('/novels/search', { params })
  },

  getOne<T = Novel>(id: number | string) {
    return get<T>(`/novels/${encodeURIComponent(String(id))}`)
  },

  update<T = Novel>(id: number | string, data: UpdateNovelBody) {
    return put<T>(`/novels/${encodeURIComponent(String(id))}`, data)
  },

  remove<T = unknown>(id: number | string) {
    return del<T>(`/novels/${encodeURIComponent(String(id))}`)
  },

  restore<T = unknown>(id: number | string) {
    return post<T>(`/novels/${encodeURIComponent(String(id))}/restore`, {})
  },
}

export default novelsApi
