import { defineStore } from 'pinia'
import { ref } from 'vue'

/** 编辑器选区临时状态 — AI 工具栏激活控制 */
export const useEditorSelectionStore = defineStore('editorSelection', () => {
  const hasSelection = ref(false)
  const selectionText = ref('')
  const selectionFrom = ref(0)
  const selectionTo = ref(0)

  function setSelection(from: number, to: number, text: string) {
    selectionFrom.value = from
    selectionTo.value = to
    selectionText.value = text
    hasSelection.value = from !== to && text.trim().length > 0
  }

  function clearSelection() {
    hasSelection.value = false
    selectionText.value = ''
    selectionFrom.value = 0
    selectionTo.value = 0
  }

  return {
    hasSelection,
    selectionText,
    selectionFrom,
    selectionTo,
    setSelection,
    clearSelection,
  }
})
