<script setup lang="ts">
import { Settings } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'

defineProps<{
  onSettingsClick?: () => void
}>()

async function tryClose() {
  try {
    const mod = await import('@tauri-apps/api/window')
    await mod.appWindow.close()
  } catch {
    window.close()
  }
}

async function tryMinimize() {
  try {
    const mod = await import('@tauri-apps/api/window')
    await mod.appWindow.minimize()
  } catch {
    return
  }
}

async function tryToggleMaximize() {
  try {
    const mod = await import('@tauri-apps/api/window')
    const isMax = await mod.appWindow.isMaximized()
    if (isMax) await mod.appWindow.unmaximize()
    else await mod.appWindow.maximize()
  } catch {
    return
  }
}
</script>

<template>
  <header
    class="sticky top-0 z-50 flex h-11 w-full shrink-0 items-center justify-between border-b border-border bg-background px-3"
    data-tauri-drag-region
  >
    <div class="flex items-center gap-2" data-tauri-drag-region>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        class="h-3 w-3 rounded-full bg-red-500 p-0 hover:bg-red-400"
        aria-label="Close"
        @click="tryClose()"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        class="h-3 w-3 rounded-full bg-yellow-500 p-0 hover:bg-yellow-400"
        aria-label="Minimize"
        @click="tryMinimize()"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        class="h-3 w-3 rounded-full bg-green-500 p-0 hover:bg-green-400"
        aria-label="Maximize"
        @click="tryToggleMaximize()"
      />
    </div>

    <div class="flex items-center" data-tauri-drag-region>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Settings"
        data-tauri-drag-region="false"
        @click="onSettingsClick?.()"
      >
        <Settings class="h-5 w-5" />
      </Button>
    </div>
  </header>
</template>
