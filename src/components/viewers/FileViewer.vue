<script setup lang="ts">
import { computed, unref } from 'vue';
import type { FileViewerRenderer, FileViewerRenderParams } from './types';
import { useViewerRenderers } from './ViewerRegistry';

const props = defineProps<FileViewerRenderParams & { renderers?: FileViewerRenderer[] }>();

const injected = useViewerRenderers();

const effectiveRenderers = computed(() => {
  if (props.renderers?.length) return props.renderers;
  const registry = injected ? unref(injected) : null;
  if (registry?.length) return registry;
  return [];
});

const renderer = computed(() => {
  const list = effectiveRenderers.value;
  const explicit = list.find((r) => r.id === props.tab.viewerId);
  return explicit ?? list.find((r) => r.match(props.tab.path)) ?? list[list.length - 1];
});

const componentProps = computed(() => {
  const r = renderer.value;
  if (!r) return {};
  const params: FileViewerRenderParams = {
    tab: props.tab,
    onChange: props.onChange,
    assetUrl: props.assetUrl,
  };
  return r.props ? r.props(params) : params;
});
</script>

<template>
  <component
    v-if="renderer"
    :is="renderer.component"
    v-bind="componentProps"
  />
  <div v-else class="flex items-center justify-center h-full text-sm text-gray-500">
    Loading viewer...
  </div>
</template>
