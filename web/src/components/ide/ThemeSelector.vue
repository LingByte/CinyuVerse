<script setup lang="ts">
import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { Dropdown, Button } from '@kousum/semi-ui-vue'
import type { DropDownMenuItem } from '@kousum/semi-ui-vue'
import { IconMoon, IconSetting } from '@kousum/semi-icons-vue'
import { useThemeStore } from '@/stores/themeStore'

const emit = defineEmits<{
  openSettings: []
}>()

const theme = useThemeStore()
const { lightPresets, darkPresets, customThemes, activeThemeValue, activeThemeLabel } = storeToRefs(theme)
const open = ref(false)

const menu = computed<DropDownMenuItem[]>(() => {
  const items: DropDownMenuItem[] = []
  for (const p of lightPresets.value) {
    items.push({
      node: 'item',
      name: p.name,
      active: activeThemeValue.value === p.id,
      onClick: () => { theme.selectTheme(p.id); open.value = false },
    })
  }
  items.push({ node: 'divider' })
  for (const p of darkPresets.value) {
    items.push({
      node: 'item',
      name: p.name,
      active: activeThemeValue.value === p.id,
      onClick: () => { theme.selectTheme(p.id); open.value = false },
    })
  }
  if (customThemes.value.length > 0) {
    items.push({ node: 'divider' })
    for (const c of customThemes.value) {
      const value = `custom:${c.id}`
      items.push({
        node: 'item',
        name: c.name,
        active: activeThemeValue.value === value,
        onClick: () => { theme.selectTheme(value); open.value = false },
      })
    }
  }
  items.push({ node: 'divider' })
  items.push({
    node: 'item',
    name: '更多主题设置…',
    onClick: () => { open.value = false; emit('openSettings') },
  })
  return items
})
</script>

<template>
  <div class="flex items-center gap-1 [-webkit-app-region:no-drag]">
    <Dropdown
      trigger="click"
      position="bottomRight"
      :menu="menu"
      :visible="open"
      @visible-change="(v: boolean) => { open = v }"
    >
      <Button
        theme="light"
        type="tertiary"
        size="small"
        class="!max-w-[180px]"
        :class="{ 'is-active': open }"
      >
        <span class="flex min-w-0 items-center gap-1.5">
          <IconMoon :size="'small'" class="shrink-0 text-[var(--accent)]" />
          <span class="truncate text-[11px]">{{ activeThemeLabel }}</span>
        </span>
      </Button>
    </Dropdown>
    <Button
      theme="borderless"
      type="tertiary"
      size="small"
      :icon="IconSetting"
      title="更多主题设置"
      @click="emit('openSettings')"
    />
  </div>
</template>
