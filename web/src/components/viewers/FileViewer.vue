<script setup lang="ts">
import { computed, unref } from 'vue'
import type { FileViewerRenderer, FileViewerRenderParams } from './types'
import { useViewerRenderers } from './ViewerRegistry'

const props = defineProps<FileViewerRenderParams & { renderers?: FileViewerRenderer[] }>()

const emit = defineEmits<{
  save: []
}>()

const injected = useViewerRenderers()

const effectiveRenderers = computed(() => {
  if (props.renderers?.length) return props.renderers
  const registry = injected ? unref(injected) : null
  if (registry?.length) return registry
  return []
})

const renderer = computed(() => {
  const list = effectiveRenderers.value
  const explicit = list.find((r) => r.id === props.tab.viewerId)
  return explicit ?? list.find((r) => r.match(props.tab.path)) ?? list[list.length - 1]
})

const componentProps = computed(() => {
  const r = renderer.value
  if (!r) return {}
  const params: FileViewerRenderParams = {
    tab: props.tab,
    onChange: props.onChange,
    assetUrl: props.assetUrl,
  }
  return r.props ? r.props(params) : params
})

function onUpdateContent(value: string) {
  props.onChange(value)
}
</script>

<template>
  <component
    v-if="renderer"
    :is="renderer.component"
    v-bind="componentProps"
    @update-content="onUpdateContent"
    @save="emit('save')"
  />
  <div v-else class="viewer-empty">无法预览此文件</div>
</template>

<style scoped>
.viewer-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-muted);
  font-size: 13px;
}
</style>
