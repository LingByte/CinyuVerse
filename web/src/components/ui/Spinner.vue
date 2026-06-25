<script setup lang="ts">
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-vue-next'

const props = withDefaults(defineProps<{
  class?: string
  size?: 'sm' | 'default' | 'lg'
}>(), {
  size: 'default',
})
</script>

<template>
  <Loader2
    :class="cn(
      'animate-spin text-muted-foreground',
      props.size === 'sm' && 'h-4 w-4',
      props.size === 'default' && 'h-6 w-6',
      props.size === 'lg' && 'h-8 w-8',
      props.class,
    )"
  />
</template>
