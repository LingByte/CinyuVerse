<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  src?: string
  alt?: string
  name?: string
  size?: string
  shape?: 'circle' | 'rounded'
  status?: 'online' | 'offline' | 'busy'
}

const props = withDefaults(defineProps<Props>(), {
  src: '',
  alt: 'avatar',
  name: '',
  size: '44px',
  shape: 'circle',
  status: 'offline',
})

const initials = computed(() => {
  if (!props.name.trim()) return '?'
  return props.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
})
</script>

<template>
  <div
    class="relative inline-flex items-center justify-center overflow-hidden border border-[var(--border)] bg-gradient-to-br from-[color-mix(in_oklab,var(--theme-soft)_70%,white)] to-[var(--surface)] shadow-[0_10px_30px_-20px_var(--ring)]"
    :class="shape === 'rounded' ? 'rounded-xl' : 'rounded-full'"
    :style="{ width: size, height: size }"
  >
    <img v-if="src" :src="src" :alt="alt" class="size-full object-cover" />
    <span v-else class="text-xs font-extrabold text-[var(--theme-strong)]">{{ initials }}</span>
    <span
      class="absolute bottom-0 right-0 size-3 rounded-full border-2 border-[var(--surface)]"
      :class="{
        'bg-emerald-500': status === 'online',
        'bg-slate-400': status === 'offline',
        'bg-rose-500': status === 'busy',
      }"
    />
  </div>
</template>
