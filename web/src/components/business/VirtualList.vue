<script setup lang="ts">
import { computed, ref } from 'vue'
const props = withDefaults(defineProps<{ items: string[]; itemHeight?: number; height?: number }>(), { itemHeight: 32, height: 240 })
const scrollTop = ref(0)
const start = computed(() => Math.floor(scrollTop.value / props.itemHeight))
const visibleCount = computed(() => Math.ceil(props.height / props.itemHeight) + 2)
const end = computed(() => Math.min(props.items.length, start.value + visibleCount.value))
const offsetY = computed(() => start.value * props.itemHeight)
const visibleItems = computed(() => props.items.slice(start.value, end.value))
</script>

<template>
  <div class="overflow-auto rounded-lg border" :style="{ height: `${height}px` }" @scroll="scrollTop = ($event.target as HTMLElement).scrollTop">
    <div :style="{ height: `${items.length * itemHeight}px`, position: 'relative' }">
      <div :style="{ transform: `translateY(${offsetY}px)` }">
        <div v-for="item in visibleItems" :key="item" class="h-8 border-b px-2 text-sm leading-8">{{ item }}</div>
      </div>
    </div>
  </div>
</template>
