<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
const emit = defineEmits<{ load: [] }>()
const root = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null
onMounted(() => {
  observer = new IntersectionObserver((entries) => {
    if (entries[0]?.isIntersecting) emit('load')
  })
  if (root.value) observer.observe(root.value)
})
onUnmounted(() => observer?.disconnect())
</script>

<template>
  <div ref="root" class="py-2 text-center text-xs text-[var(--cv-color-text-muted)]"><slot>加载更多...</slot></div>
</template>
