<script setup lang="ts">
import { type HTMLAttributes, watch } from 'vue'
import { TabsRoot } from 'radix-vue'
import { cn } from '@/lib/utils'

defineProps<{ class?: HTMLAttributes['class']; modelValue?: string }>()

const modelValue = defineModel<string>()
</script>

<template>
  <TabsRoot v-model="modelValue" :class="cn('flex flex-col', $props.class)">
    <slot />
  </TabsRoot>
</template>
