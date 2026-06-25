import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

const STORAGE_KEY = 'cinyuverse-typewriter-mode'

export const useFocusModeStore = defineStore('focusMode', () => {
  const typewriterMode = ref(false)

  function load() {
    try {
      typewriterMode.value = localStorage.getItem(STORAGE_KEY) === '1'
    } catch {
      typewriterMode.value = false
    }
  }

  function toggle() {
    typewriterMode.value = !typewriterMode.value
  }

  function disable() {
    typewriterMode.value = false
  }

  watch(typewriterMode, (v) => {
    localStorage.setItem(STORAGE_KEY, v ? '1' : '0')
    document.documentElement.toggleAttribute('data-typewriter', v)
  }, { immediate: true })

  load()

  return { typewriterMode, toggle, disable, load }
})
