<script setup lang="ts">
import { cn } from '@/lib/utils'
import {
  DialogRoot,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from 'radix-vue'
import { X } from 'lucide-vue-next'

defineOptions({ inheritAttrs: false })

defineProps<{
  open?: boolean
  title?: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()
</script>

<template>
  <DialogRoot :open="open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay
        class="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0"
      />
      <DialogContent
        :class="cn(
          'fixed left-1/2 top-1/2 z-50 grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 border bg-[var(--bg-secondary)] shadow-lg sm:rounded-lg',
          'max-h-[92vh] overflow-hidden flex flex-col',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
        )"
      >
        <div v-if="title || $slots.title" class="flex items-center justify-between px-4 pt-4 pb-2">
          <DialogTitle v-if="title && !$slots.title" class="text-base font-semibold text-[var(--text-main)]">
            {{ title }}
          </DialogTitle>
          <slot v-else name="title" />
        </div>
        <slot />
        <slot name="footer" />
        <DialogClose
          class="absolute right-3 top-3 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
        >
          <X class="h-4 w-4 text-[var(--text-sub)]" />
          <span class="sr-only">Close</span>
        </DialogClose>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
