<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { Label } from 'radix-vue'
import { cn } from '@/lib/utils'

const props = defineProps<{ class?: HTMLAttributes['class']; for?: string }>()
</script>

<template>
  <Label :class="cn('text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70', props.class)" :for="props.for">
    <slot />
  </Label>
</template>
