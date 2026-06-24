<script setup lang="ts">
import { computed } from 'vue'
import { AppDialog } from '@/components/ui/dialog'

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    description?: string
    widthClassName?: string
  }>(),
  {
    widthClassName: 'sm:max-w-[420px]',
  },
)

const emit = defineEmits<{ close: [] }>()

const dialogOpen = computed({
  get: () => props.open,
  set: (v: boolean) => {
    if (!v) emit('close')
  },
})
</script>

<template>
  <AppDialog
    v-model:open="dialogOpen"
    :title="title"
    :description="description"
    :width-class="widthClassName"
    @close="emit('close')"
  >
    <slot />
    <template v-if="$slots.footer" #footer>
      <slot name="footer" />
    </template>
  </AppDialog>
</template>
