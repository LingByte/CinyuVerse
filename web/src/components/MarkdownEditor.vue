<script setup lang="ts">
import Textarea from '@/components/Textarea.vue'

interface Props {
  modelValue: string
  placeholder?: string
}

withDefaults(defineProps<Props>(), {
  placeholder: '# 输入 Markdown...',
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <div
    class="rounded-2xl border border-[color-mix(in_oklab,var(--border)_80%,transparent)] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--surface)_98%,white),color-mix(in_oklab,var(--surface)_94%,var(--surface-strong)))] p-2 shadow-[0_20px_44px_-34px_var(--ring)]"
  >
    <Textarea
      :model-value="modelValue"
      :placeholder="placeholder"
      @update:model-value="emit('update:modelValue', $event)"
    />
  </div>
</template>
