<script setup lang="ts">
import { cn } from '@/lib/utils'
import {
  DropdownMenuItem as RadixDropdownMenuItem,
} from 'radix-vue'

defineOptions({ inheritAttrs: false })

const props = defineProps<{
  class?: string
  inset?: boolean
}>()
</script>

<template>
  <RadixDropdownMenuItem
    v-bind="$attrs"
    :class="cn(
      'relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors',
      'focus:bg-accent focus:text-accent-foreground',
      'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      '[&>svg]:size-4 [&>svg]:shrink-0',
      inset && 'pl-8',
      props.class,
    )"
  >
    <slot />
  </RadixDropdownMenuItem>
</template>
