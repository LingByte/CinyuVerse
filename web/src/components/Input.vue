<script setup lang="ts">
interface Props {
  modelValue: string
  label?: string
  placeholder?: string
  type?: string
  disabled?: boolean
  error?: string
}

withDefaults(defineProps<Props>(), {
  label: '',
  placeholder: '',
  type: 'text',
  disabled: false,
  error: '',
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <label class="grid gap-1.5">
    <span v-if="label" class="text-xs font-bold text-[var(--text-muted)]">{{ label }}</span>
    <input
      class="w-full min-h-11 rounded-xl border bg-[color-mix(in_oklab,var(--surface)_90%,transparent)] px-3.5 py-2.5 text-sm text-[var(--text)] transition-all duration-200 outline-none placeholder:text-[var(--text-muted)]/70 hover:border-[var(--theme)] focus:border-[var(--theme-strong)] focus:ring-4 focus:ring-[var(--theme-soft)] disabled:cursor-not-allowed disabled:opacity-60"
      :class="error ? 'border-rose-600' : 'border-[var(--border)]'"
      :type="type"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <span v-if="error" class="text-xs text-rose-600">{{ error }}</span>
  </label>
</template>
