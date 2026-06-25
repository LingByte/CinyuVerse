<script setup lang="ts">
import { computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useThemeStore } from '@/features/theme/stores/themeStore'

const theme = useThemeStore()
const { backgroundImage, backgroundSize, backgroundOverlay } = storeToRefs(theme)

const visible = computed(() => !!backgroundImage.value)

const layerStyle = computed(() => {
  const img = backgroundImage.value
  if (!img) return undefined
  const overlay = backgroundOverlay.value
  return {
    backgroundColor: 'var(--bg-primary)',
    backgroundImage: `linear-gradient(${overlay}, ${overlay}), url(${JSON.stringify(img)})`,
    backgroundSize: backgroundSize.value,
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    backgroundAttachment: 'fixed',
  } as Record<string, string>
})

watch(
  backgroundImage,
  (img) => {
    document.documentElement.toggleAttribute('data-has-bg-image', !!img)
  },
  { immediate: true },
)
</script>

<template>
  <Teleport to="body">
    <div
      v-show="visible"
      id="cinyuverse-bg-layer"
      class="cinyuverse-bg-layer"
      :style="layerStyle"
      aria-hidden="true"
    />
  </Teleport>
</template>

<style>
.cinyuverse-bg-layer {
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
}
</style>
