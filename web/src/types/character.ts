export interface Character {
  id: number
  novelId: number
  name: string
  roleType: string
  gender: string
  age: string
  personality: string
  background: string
  goal: string
  relationship: string
  appearance: string
  abilities: string
  notes: string
  createdAt: string
  updatedAt: string
}

export interface PaginatedCharacters {
  characters: Character[]
  total: number
  page: number
  size: number
}

export interface CreateCharacterBody {
  novelId: number
  name: string
  roleType?: string
  gender?: string
  age?: string
  personality?: string
  background?: string
  goal?: string
  relationship?: string
  appearance?: string
  abilities?: string
  notes?: string
}

export interface UpdateCharacterBody {
  novelId?: number
  name?: string
  roleType?: string
  gender?: string
  age?: string
  personality?: string
  background?: string
  goal?: string
  relationship?: string
  appearance?: string
  abilities?: string
  notes?: string
}

export interface GenerateCharacterBody {
  message: string
  model?: string
  temperature?: number
  maxTokens?: number
  baseDraft?: Character
  lockedFields?: string[]
  feedback?: string
}

export interface GenerateCharacterResult {
  draft: Character
  raw: string
}
