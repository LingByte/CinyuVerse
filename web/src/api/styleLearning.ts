import request from '@/utils/request'
import type { PaginatedStyleItems, StyleProfile, StyleSample } from '@/types/styleLearning'

export function listStyleProfiles(params: { page?: number; size?: number }) {
  return request.get<PaginatedStyleItems<StyleProfile>>('/style-profiles', { params }).then((res) => res.data)
}

export function createStyleProfile(body: Partial<StyleProfile>) {
  return request.post<StyleProfile>('/style-profiles', body).then((res) => res.data)
}

export function getStyleProfile(id: number) {
  return request.get<StyleProfile>(`/style-profiles/${id}`).then((res) => res.data)
}

export function updateStyleProfile(id: number, body: Partial<StyleProfile>) {
  return request.put<StyleProfile>(`/style-profiles/${id}`, body).then((res) => res.data)
}

export function deleteStyleProfile(id: number) {
  return request.delete(`/style-profiles/${id}`).then((res) => res.data)
}

export function listStyleSamples(profileId: number, params: { page?: number; size?: number } = {}) {
  return request
    .get<PaginatedStyleItems<StyleSample>>(`/style-profiles/${profileId}/samples`, { params })
    .then((res) => res.data)
}

export function createStyleSample(profileId: number, body: Partial<StyleSample>) {
  return request.post<StyleSample>(`/style-profiles/${profileId}/samples`, body).then((res) => res.data)
}

export function deleteStyleSample(sampleId: number) {
  return request.delete(`/style-profiles/samples/${sampleId}`).then((res) => res.data)
}

export function learnStyleProfile(profileId: number) {
  return request.post(`/style-profiles/${profileId}/learn`).then((res) => res.data)
}
