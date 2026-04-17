import { ref } from 'vue'

export type ThemeName = 'lavender' | 'ocean' | 'rose'
const theme = ref<ThemeName>('lavender')

export const useTheme = () => {
  const setTheme = (next: ThemeName) => {
    theme.value = next
    if (typeof document !== 'undefined') document.documentElement.setAttribute('data-theme', next)
  }

  return { theme, setTheme }
}
