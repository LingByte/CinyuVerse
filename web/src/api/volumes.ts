import request from '@/utils/request'
import type {
  CreateVolumeBody,
  GenerateVolumeBody,
  GenerateVolumeResult,
  PaginatedVolumes,
  UpdateVolumeBody,
  Volume,
} from '@/types/volume'

export interface ListVolumesParams {
  novelId?: number
  page?: number
  size?: number
}

export function listVolumes(params: ListVolumesParams) {
  return request.get<PaginatedVolumes>('/volumes', { params }).then((res) => res.data)
}

export function createVolume(body: CreateVolumeBody) {
  return request.post<Volume>('/volumes', body).then((res) => res.data)
}

export function updateVolume(id: number, body: UpdateVolumeBody) {
  return request.put<Volume>(`/volumes/${id}`, body).then((res) => res.data)
}

export function deleteVolume(id: number) {
  return request.delete(`/volumes/${id}`).then((res) => res.data)
}

export function generateVolumeByAI(body: GenerateVolumeBody) {
  return request.post<GenerateVolumeResult>('/volumes/generate', body).then((res) => res.data)
}
