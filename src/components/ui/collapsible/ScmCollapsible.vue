<script setup lang="ts">
import { type HTMLAttributes } from 'vue'
import { CollapsibleContent, CollapsibleRoot, CollapsibleTrigger } from 'radix-vue'
import { ChevronRight } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const open = defineModel<boolean>('open', { default: true })

defineProps<{
  title: string
  count?: number
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <CollapsibleRoot v-model:open="open" :class="cn('border-t border-border', $props.class)">
    <CollapsibleTrigger
      class="flex h-[26px] w-full items-center gap-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:bg-accent/60 transition-colors"
    >
      <ChevronRight
        class="h-3.5 w-3.5 shrink-0 transition-transform duration-200"
        :class="open ? 'rotate-90' : ''"
      />
      <span class="truncate">{{ title }}</span>
      <Badge
        v-if="count && count > 0"
        variant="muted"
        class="ml-1 h-4 min-w-4 rounded-full px-1.5 text-[10px] font-semibold normal-case tracking-normal"
      >
        {{ count }}
      </Badge>
      <span class="flex-1" />
      <slot name="actions" />
    </CollapsibleTrigger>
    <CollapsibleContent
      class="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
    >
      <div class="pb-1">
        <slot />
      </div>
    </CollapsibleContent>
  </CollapsibleRoot>
</template>
