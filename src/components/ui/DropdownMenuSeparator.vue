<script setup lang="ts">
import { cn } from '@/lib/utils'
import {
  DropdownMenuSeparator as RadixDropdownMenuSeparator,
} from 'radix-vue'

const props = defineProps<{
  class?: string
}>()
</script>

<template>
  <RadixDropdownMenuSeparator
    :class="cn('-mx-1 my-1 h-px bg-muted', props.class)"
  />
</template>
