<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { TabsContent } from 'radix-vue'
import { cn } from '@/lib/utils'

defineProps<{ class?: HTMLAttributes['class']; value: string }>()
</script>

<template>
  <TabsContent
    :value="value"
    :class="cn('flex-1 min-h-0 outline-none data-[state=inactive]:hidden', $props.class)"
  >
    <slot />
  </TabsContent>
</template>
