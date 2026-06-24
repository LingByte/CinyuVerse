<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import {
  applyColorTheme,
  applyThemeMode,
  getStoredColorTheme,
  getStoredThemeMode,
  setStoredColorTheme,
  setStoredThemeMode,
  type ColorTheme,
  type ThemeMode,
} from '@/theme/theme'

type SettingSection = {
  id: string
  title: string
  description?: string
}

const props = defineProps<{ onClose?: () => void }>()
const router = useRouter()

const sections: SettingSection[] = [
  { id: 'general', title: 'General', description: 'Basic application preferences' },
  { id: 'extensions', title: 'Extensions', description: 'Manage installed extensions' },
  { id: 'editor', title: 'Editor', description: 'Font, tab size, formatting' },
]

const active = ref(sections[0]?.id ?? 'general')
const themeMode = ref<ThemeMode>(getStoredThemeMode())
const colorTheme = ref<ColorTheme>(getStoredColorTheme())

const activeSection = computed(() => sections.find((s) => s.id === active.value) ?? sections[0])

watch(themeMode, (mode) => {
  applyThemeMode(mode)
  setStoredThemeMode(mode)
})

watch(colorTheme, (theme) => {
  applyColorTheme(theme)
  setStoredColorTheme(theme)
})

function goBack() {
  if (props.onClose) props.onClose()
  else router.push('/')
}
</script>

<template>
  <div class="flex h-screen flex-col overflow-hidden bg-background">
    <div class="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
      <Button variant="outline" size="sm" @click="goBack">Back</Button>
      <span class="text-sm font-medium text-foreground">Settings</span>
    </div>

    <div class="flex min-h-0 flex-1">
      <ScrollArea class="w-72 min-w-72 border-r border-border">
        <div class="p-2">
          <div class="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Sections
          </div>
          <div class="space-y-1">
            <Button
              v-for="s in sections"
              :key="s.id"
              variant="ghost"
              :class="
                cn(
                  'h-auto w-full flex-col items-start gap-1 rounded-md border border-border px-3 py-2 text-left',
                  s.id === active && 'bg-accent',
                )
              "
              @click="active = s.id"
            >
              <span class="text-sm font-medium text-foreground">{{ s.title }}</span>
              <span v-if="s.description" class="text-[11px] text-muted-foreground">{{ s.description }}</span>
            </Button>
          </div>
        </div>
      </ScrollArea>

      <ScrollArea class="min-w-0 flex-1">
        <div class="p-4">
          <h2 class="text-sm font-medium text-foreground">{{ activeSection?.title ?? 'Settings' }}</h2>

          <div v-if="active === 'general'" class="mt-4 max-w-xl space-y-4">
            <div class="rounded-lg border border-border">
              <div class="border-b border-border px-3 py-2">
                <div class="text-xs font-medium text-foreground">Color Theme</div>
                <p class="mt-1 text-[11px] text-muted-foreground">
                  Choose Light / Dark or follow your system setting.
                </p>
              </div>
              <div class="space-y-2 p-3">
                <Label for="theme-mode">Theme mode</Label>
                <select
                  id="theme-mode"
                  v-model="themeMode"
                  class="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="system">System</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </div>
            </div>

            <div class="rounded-lg border border-border">
              <div class="border-b border-border px-3 py-2">
                <div class="text-xs font-medium text-foreground">Accent Palette</div>
                <p class="mt-1 text-[11px] text-muted-foreground">
                  Switch the primary/accent color set.
                </p>
              </div>
              <div class="space-y-2 p-3">
                <Label for="color-theme">Accent</Label>
                <select
                  id="color-theme"
                  v-model="colorTheme"
                  class="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="default">Default (Blue)</option>
                  <option value="lavender">Lavender (Purple)</option>
                  <option value="cherry">Cherry (Pink)</option>
                  <option value="ocean">Ocean (Teal)</option>
                  <option value="nature">Nature (Green)</option>
                  <option value="fresh">Fresh (Mint)</option>
                  <option value="sunset">Sunset (Orange)</option>
                </select>
              </div>
            </div>
          </div>

          <p v-else class="mt-2 text-xs text-muted-foreground">This section is a placeholder for now.</p>
        </div>
      </ScrollArea>
    </div>
  </div>
</template>
