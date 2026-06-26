<script setup lang="ts">
import { computed } from 'vue'
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
</script>

<template>
  <div
    v-show="visible"
    class="cinyuverse-bg-layer"
    :style="layerStyle"
    aria-hidden="true"
  />
</template>

<style scoped>
.cinyuverse-bg-layer {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
}
</style>
