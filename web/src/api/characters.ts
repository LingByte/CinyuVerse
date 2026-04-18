import request from '@/utils/request'
import type {
  Character,
  CreateCharacterBody,
  GenerateCharacterBody,
  GenerateCharacterResult,
  PaginatedCharacters,
  UpdateCharacterBody,
} from '@/types/character'

export interface ListCharactersParams {
  novelId?: number
  keyword?: string
  page?: number
  size?: number
}

export function listCharacters(params: ListCharactersParams) {
  return request.get<PaginatedCharacters>('/characters', { params }).then((res) => res.data)
}

export function getCharacter(id: number) {
  return request.get<Character>(`/characters/${id}`).then((res) => res.data)
}

export function createCharacter(body: CreateCharacterBody) {
  return request.post<Character>('/characters', body).then((res) => res.data)
}

export function updateCharacter(id: number, body: UpdateCharacterBody) {
  return request.put<Character>(`/characters/${id}`, body).then((res) => res.data)
}

export function deleteCharacter(id: number) {
  return request.delete(`/characters/${id}`).then((res) => res.data)
}

export function generateCharacterByAI(body: GenerateCharacterBody) {
  return request.post<GenerateCharacterResult>('/characters/generate', body).then((res) => res.data)
}
