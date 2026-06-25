<script setup lang="ts">
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { Moon, Settings } from 'lucide-vue-next'
import DropdownMenu from '@/components/ui/DropdownMenu.vue'
import DropdownMenuItem from '@/components/ui/DropdownMenuItem.vue'
import DropdownMenuSeparator from '@/components/ui/DropdownMenuSeparator.vue'
import Button from '@/components/ui/Button.vue'
import { cn } from '@/lib/utils'
import { useThemeStore } from '@/features/theme/stores/themeStore'

const emit = defineEmits<{
  openSettings: []
}>()

const theme = useThemeStore()
const { lightPresets, darkPresets, customThemes, activeThemeValue, activeThemeLabel } = storeToRefs(theme)
const open = ref(false)

function itemClass(active: boolean) {
  return active ? 'text-[var(--accent)]' : undefined
}
</script>

<template>
  <div class="flex items-center gap-1 [-webkit-app-region:no-drag]">
    <DropdownMenu @update:open="(v: boolean) => open = v">
      <template #trigger>
        <Button
          variant="ghost"
          size="sm"
          :class="cn(
            '!max-w-[180px] h-6 px-2 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]',
            open && 'text-[var(--accent)]',
          )"
          as="div"
        >
          <span class="flex min-w-0 items-center gap-1.5">
            <Moon class="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
            <span class="truncate">{{ activeThemeLabel }}</span>
          </span>
        </Button>
      </template>

      <DropdownMenuItem
        v-for="p in lightPresets"
        :key="p.id"
        :class="itemClass(activeThemeValue === p.id)"
        @click="theme.selectTheme(p.id); open = false"
      >
        {{ p.name }}
      </DropdownMenuItem>

      <DropdownMenuSeparator />

      <DropdownMenuItem
        v-for="p in darkPresets"
        :key="p.id"
        :class="itemClass(activeThemeValue === p.id)"
        @click="theme.selectTheme(p.id); open = false"
      >
        {{ p.name }}
      </DropdownMenuItem>

      <template v-if="customThemes.length > 0">
        <DropdownMenuSeparator />
        <DropdownMenuItem
          v-for="c in customThemes"
          :key="c.id"
          :class="itemClass(activeThemeValue === `custom:${c.id}`)"
          @click="theme.selectTheme(`custom:${c.id}`)"
        >
          {{ c.name }}
        </DropdownMenuItem>
      </template>

      <DropdownMenuSeparator />

      <DropdownMenuItem @click="emit('openSettings')">
        <Settings class="mr-2 h-3.5 w-3.5" />
        外观与主题…
      </DropdownMenuItem>
    </DropdownMenu>
  </div>
</template>
