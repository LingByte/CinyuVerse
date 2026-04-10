<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'

interface Props {
  modelValue: string
  label?: string
  placeholder?: string
  rows?: number
  disabled?: boolean
  error?: string
}

const props = withDefaults(defineProps<Props>(), {
  label: '',
  placeholder: '',
  rows: 4,
  disabled: false,
  error: '',
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const textareaRef = ref<HTMLTextAreaElement | null>(null)

const resizeToContent = async () => {
  await nextTick()
  const el = textareaRef.value
  if (!el) return
  el.style.height = '0px'
  el.style.height = `${el.scrollHeight}px`
}

watch(
  () => [textareaRef.value, props.modelValue],
  async () => {
    await resizeToContent()
  },
)

onMounted(async () => {
  await resizeToContent()
})
</script>

<template>
  <label class="grid gap-1.5">
    <span v-if="label" class="text-xs font-bold text-[var(--text-muted)]">{{ label }}</span>
    <textarea
      ref="textareaRef"
      class="w-full min-h-24 resize-none overflow-hidden rounded-xl border bg-[color-mix(in_oklab,var(--surface)_90%,transparent)] px-3.5 py-2.5 text-sm text-[var(--text)] transition-all duration-200 outline-none placeholder:text-[var(--text-muted)]/70 hover:border-[var(--theme)] focus:border-[var(--theme-strong)] focus:ring-4 focus:ring-[var(--theme-soft)] disabled:cursor-not-allowed disabled:opacity-60"
      :class="error ? 'border-rose-600' : 'border-[var(--border)]'"
      :rows="rows"
      :placeholder="placeholder"
      :disabled="disabled"
      :value="modelValue"
      @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
    />
    <span v-if="error" class="text-xs text-rose-600">{{ error }}</span>
  </label>
</template>
