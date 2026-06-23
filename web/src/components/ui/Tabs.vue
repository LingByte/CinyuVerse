<script setup lang="ts">
import { cn } from '@/lib/utils'
import {
  TabsRoot,
  TabsList,
  TabsTrigger,
  TabsContent,
} from 'radix-vue'

defineOptions({ inheritAttrs: false })
</script>

<template>
  <TabsRoot v-bind="$attrs">
    <slot />
  </TabsRoot>
</template>
