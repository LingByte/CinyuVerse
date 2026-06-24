<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { TabsTrigger } from 'radix-vue'
import { cn } from '@/lib/utils'

defineProps<{ class?: HTMLAttributes['class']; value: string }>()
</script>

<template>
  <TabsTrigger
    :value="value"
    :class="
      cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-2.5 py-1 text-xs font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow',
        $props.class,
      )
    "
  >
    <slot />
  </TabsTrigger>
</template>
