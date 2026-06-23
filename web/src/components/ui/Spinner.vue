<script setup lang="ts">
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-vue-next'

defineProps<{
  class?: string
  size?: 'sm' | 'default' | 'lg'
}>()
</script>

<template>
  <Loader2
    :class="cn(
      'animate-spin text-muted-foreground',
      size === 'sm' && 'h-4 w-4',
      size === 'default' && 'h-6 w-6',
      size === 'lg' && 'h-8 w-8',
      !size && 'h-6 w-6',
      props.class,
    )"
  />
</template>
