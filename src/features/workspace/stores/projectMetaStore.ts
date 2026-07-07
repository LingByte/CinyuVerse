import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { CharacterCard, GlossaryEntry, ProjectInfo, WritingRules } from '@/core/types/workspace'
import { EMPTY_OUTLINE } from '@/features/workspace/utils/localDataStore'
import { desktopApi } from '@/services/desktopApi'
import { isDesktop } from '@/services/runtime'

function defaultProject(): ProjectInfo {
  const now = new Date().toISOString()
  return {
    bookName: '',
    genre: '',
    tags: [],
    author: '',
    status: 'draft',
    worldView: '',
    style: '',
    styleSample: '',
    targetWords: 0,
    createdAt: now,
    updatedAt: now,
  }
}

function defaultWritingRules(): WritingRules {
  return { rules: [], tone: '', pov: '' }
}

export const useProjectMetaStore = defineStore('projectMeta', () => {
  const workspaceRoot = ref<string | null>(null)
  const dirty = ref(false)
  const project = ref<ProjectInfo>(defaultProject())
  const characters = ref<CharacterCard[]>([])
  const glossary = ref<GlossaryEntry[]>([])
  const bannedWords = ref<string[]>([])
  const writingRules = ref<WritingRules>(defaultWritingRules())

  async function loadFromRoot(root: string) {
    workspaceRoot.value = root
    if (!isDesktop()) return
    try {
      await desktopApi.ensureProjectMeta(root)
      const bundle = await desktopApi.loadProjectMeta(root) as {
        project?: ProjectInfo
        characters?: CharacterCard[]
        glossary?: GlossaryEntry[]
        banned_words?: string[]
        writing_rules?: WritingRules
      }
      project.value = bundle.project ?? defaultProject()
      characters.value = bundle.characters ?? []
      glossary.value = bundle.glossary ?? []
      bannedWords.value = bundle.banned_words ?? []
      writingRules.value = bundle.writing_rules ?? defaultWritingRules()
      dirty.value = false
    } catch {
      // keep defaults
    }
  }

  async function saveAll() {
    if (!workspaceRoot.value || !isDesktop()) return
    await desktopApi.ensureProjectMeta(workspaceRoot.value)
    const root = workspaceRoot.value
    const now = new Date().toISOString()
    project.value.updatedAt = now
    await desktopApi.saveProjectMeta(root, 'project', JSON.stringify(project.value))
    await desktopApi.saveProjectMeta(root, 'characters', JSON.stringify(characters.value))
    await desktopApi.saveProjectMeta(root, 'glossary', JSON.stringify(glossary.value))
    await desktopApi.saveProjectMeta(root, 'banned_words', JSON.stringify(bannedWords.value))
    await desktopApi.saveProjectMeta(root, 'writing_rules', JSON.stringify(writingRules.value))
    void EMPTY_OUTLINE
    dirty.value = false
  }

  function reset() {
    workspaceRoot.value = null
    project.value = defaultProject()
    characters.value = []
    glossary.value = []
    bannedWords.value = []
    writingRules.value = defaultWritingRules()
    dirty.value = false
  }

  return {
    workspaceRoot,
    dirty,
    project,
    characters,
    glossary,
    bannedWords,
    writingRules,
    loadFromRoot,
    saveAll,
    reset,
  }
})
