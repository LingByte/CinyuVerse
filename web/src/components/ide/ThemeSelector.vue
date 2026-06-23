<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useThemeStore } from '@/stores/themeStore'

const emit = defineEmits<{
  openSettings: []
}>()

const theme = useThemeStore()
const { lightPresets, darkPresets, customThemes, activeThemeValue, activeThemeLabel } = storeToRefs(theme)

const open = ref(false)
const rootRef = ref<HTMLElement | null>(null)

const groups = computed(() => {
  const result = [
    { label: '浅色主题', items: lightPresets.value.map((p) => ({ value: p.id, label: p.name, swatch: p.colors['--bg-card'] })) },
    { label: '深色主题', items: darkPresets.value.map((p) => ({ value: p.id, label: p.name, swatch: p.colors['--bg-card'] })) },
  ]
  if (customThemes.value.length > 0) {
    result.push({
      label: '自定义',
      items: customThemes.value.map((c) => ({
        value: `custom:${c.id}`,
        label: c.name,
        swatch: c.colors['--bg-card'] ?? '#333',
      })),
    })
  }
  return result
})

function toggleOpen() {
  open.value = !open.value
}

function pick(value: string) {
  theme.selectTheme(value)
  open.value = false
}

function onDocClick(e: MouseEvent) {
  if (rootRef.value && !rootRef.value.contains(e.target as Node)) {
    open.value = false
  }
}

onMounted(() => document.addEventListener('click', onDocClick))
onUnmounted(() => document.removeEventListener('click', onDocClick))
</script>

<template>
  <div ref="rootRef" class="theme-selector" @click.stop>
    <button
      type="button"
      class="theme-trigger"
      :class="{ open }"
      :title="'当前主题：' + activeThemeLabel"
      @click="toggleOpen"
    >
      <svg class="theme-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.2" />
        <path d="M8 1.5a6.5 6.5 0 0 1 0 13V1.5Z" fill="currentColor" opacity="0.35" />
      </svg>
      <span class="theme-label">{{ activeThemeLabel }}</span>
      <svg class="theme-chevron" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
      </svg>
    </button>

    <div v-show="open" class="theme-dropdown">
      <div class="theme-dropdown-scroll">
        <template v-for="group in groups" :key="group.label">
          <div class="theme-group-label">{{ group.label }}</div>
          <button
            v-for="item in group.items"
            :key="item.value"
            type="button"
            class="theme-option"
            :class="{ active: activeThemeValue === item.value }"
            @click="pick(item.value)"
          >
            <span class="theme-swatch" :style="{ background: item.swatch }" />
            <span class="theme-option-label">{{ item.label }}</span>
            <svg v-if="activeThemeValue === item.value" class="theme-check" viewBox="0 0 12 12" fill="none">
              <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
        </template>
      </div>
      <div class="theme-dropdown-footer">
        <button type="button" class="theme-settings-link" @click="open = false; emit('openSettings')">
          更多主题设置…
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.theme-selector {
  position: relative;
  -webkit-app-region: no-drag;
}

.theme-trigger {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 22px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 11px;
  cursor: pointer;
  max-width: 160px;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}

.theme-trigger:hover,
.theme-trigger.open {
  background: var(--bg-hover);
  border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
  color: var(--text-main);
}

.theme-icon {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  color: var(--accent);
}

.theme-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.theme-chevron {
  width: 10px;
  height: 10px;
  flex-shrink: 0;
  opacity: 0.6;
  transition: transform 0.15s;
}

.theme-trigger.open .theme-chevron {
  transform: rotate(180deg);
}

.theme-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 10001;
  width: 220px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  overflow: hidden;
  animation: themeDropIn 0.12s ease;
}

@keyframes themeDropIn {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

.theme-dropdown-scroll {
  max-height: 320px;
  overflow-y: auto;
  padding: 4px 0;
}

.theme-group-label {
  padding: 6px 12px 4px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--text-muted);
  text-transform: uppercase;
}

.theme-option {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 5px 12px;
  border: none;
  background: transparent;
  color: var(--text-main);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  transition: background 0.1s;
}

.theme-option:hover {
  background: var(--bg-hover);
}

.theme-option.active {
  background: var(--accent-light);
  color: var(--text-main);
}

.theme-swatch {
  width: 14px;
  height: 14px;
  border-radius: 3px;
  border: 1px solid var(--border);
  flex-shrink: 0;
}

.theme-option-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.theme-check {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  color: var(--accent);
}

.theme-dropdown-footer {
  border-top: 1px solid var(--border);
  padding: 4px;
}

.theme-settings-link {
  width: 100%;
  padding: 5px 8px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--accent);
  font-size: 11px;
  text-align: left;
  cursor: pointer;
}

.theme-settings-link:hover {
  background: var(--bg-hover);
}
</style>
