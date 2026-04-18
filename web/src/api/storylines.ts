import request from '@/utils/request'
import type {
  GenerateStorylineBody,
  GenerateStorylineResult,
  PaginatedStorylineItems,
  Storyline,
  StorylineEdge,
  StorylineFact,
  StorylineGraph,
  StorylineNode,
} from '@/types/storyline'

export interface ListStorylinesParams {
  novelId?: number
  page?: number
  size?: number
}

export function listStorylines(params: ListStorylinesParams) {
  return request.get<PaginatedStorylineItems<Storyline>>('/storylines', { params }).then((res) => res.data)
}

export function getStoryline(id: number) {
  return request.get<Storyline>(`/storylines/${id}`).then((res) => res.data)
}

export function createStoryline(body: Partial<Storyline>) {
  return request.post<Storyline>('/storylines', body).then((res) => res.data)
}

export function updateStoryline(id: number, body: Partial<Storyline>) {
  return request.put<Storyline>(`/storylines/${id}`, body).then((res) => res.data)
}

export function deleteStoryline(id: number) {
  return request.delete(`/storylines/${id}`).then((res) => res.data)
}

export function getStorylineGraph(id: number) {
  return request.get<StorylineGraph>(`/storylines/${id}/graph`).then((res) => res.data)
}

export function generateStorylineByAI(body: GenerateStorylineBody) {
  // Storyline generation may need long time on large graphs/providers.
  return request
    .post<GenerateStorylineResult>('/storylines/ai/generate', body, { timeout: 480_000 })
    .then((res) => res.data)
}

export interface CommitStorylineIncrementBody {
  nodes?: Partial<StorylineNode>[]
  edges?: Partial<StorylineEdge>[]
  facts?: Partial<StorylineFact>[]
  nextCurrentNodeId?: string
}

export function commitStorylineIncrement(storylineId: number, body: CommitStorylineIncrementBody) {
  return request.post(`/storylines/${storylineId}/commit-increment`, body).then((res) => res.data)
}

export function seedStorylineDemo(id: number) {
  return request.post(`/storylines/${id}/seed-demo`).then((res) => res.data)
}

export interface ListStorylineNodesParams {
  storylineId?: number
  novelId?: number
  keyword?: string
  types?: string
  page?: number
  size?: number
}

export function listStorylineNodes(params: ListStorylineNodesParams) {
  return request.get<PaginatedStorylineItems<StorylineNode>>('/storylines/nodes', { params }).then((res) => res.data)
}

export function getStorylineNode(id: number) {
  return request.get<StorylineNode>(`/storylines/nodes/${id}`).then((res) => res.data)
}

export function createStorylineNode(body: Partial<StorylineNode>) {
  return request.post<StorylineNode>('/storylines/nodes', body).then((res) => res.data)
}

export function deleteStorylineNode(id: number) {
  return request.delete(`/storylines/nodes/${id}`).then((res) => res.data)
}

export interface ListStorylineEdgesParams {
  storylineId?: number
  page?: number
  size?: number
}

export function listStorylineEdges(params: ListStorylineEdgesParams) {
  return request.get<PaginatedStorylineItems<StorylineEdge>>('/storylines/edges', { params }).then((res) => res.data)
}

export function createStorylineEdge(body: Partial<StorylineEdge>) {
  return request.post<StorylineEdge>('/storylines/edges', body).then((res) => res.data)
}

export function deleteStorylineEdge(id: number) {
  return request.delete(`/storylines/edges/${id}`).then((res) => res.data)
}

export interface ListStorylineFactsParams {
  storylineId?: number
  page?: number
  size?: number
}

export function listStorylineFacts(params: ListStorylineFactsParams) {
  return request.get<PaginatedStorylineItems<StorylineFact>>('/storylines/facts', { params }).then((res) => res.data)
}

export function createStorylineFact(body: Partial<StorylineFact>) {
  return request.post<StorylineFact>('/storylines/facts', body).then((res) => res.data)
}

export function deleteStorylineFact(id: number) {
  return request.delete(`/storylines/facts/${id}`).then((res) => res.data)
}
