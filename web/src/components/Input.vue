<script setup lang="ts">
interface Props {
  modelValue: string
  size?: 'sm' | 'md' | 'lg'
  status?: 'default' | 'success' | 'warning' | 'danger'
  label?: string
  placeholder?: string
  type?: string
  disabled?: boolean
  error?: string
  block?: boolean
}

withDefaults(defineProps<Props>(), {
  label: '',
  size: 'md',
  status: 'default',
  placeholder: '',
  type: 'text',
  disabled: false,
  error: '',
  block: true,
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <label class="grid gap-1.5">
    <span v-if="label" class="text-xs font-bold text-[var(--text-muted)]">{{ label }}</span>
    <input
      class="rounded-xl border bg-[color-mix(in_oklab,var(--surface)_90%,transparent)] text-sm text-[var(--text)] transition-all duration-200 outline-none placeholder:text-[var(--text-muted)]/70 hover:border-[var(--theme)] focus:border-[var(--theme-strong)] focus:ring-4 focus:ring-[var(--theme-soft)] disabled:cursor-not-allowed disabled:opacity-60"
      :class="[
        block ? 'w-full' : 'w-auto',
        size === 'sm' ? 'min-h-9 px-3 py-2 text-xs' : '',
        size === 'md' ? 'min-h-11 px-3.5 py-2.5 text-sm' : '',
        size === 'lg' ? 'min-h-12 px-4 py-3 text-base' : '',
        error || status === 'danger' ? 'border-rose-600' : 'border-[var(--border)]',
        status === 'success' ? 'border-emerald-500 focus:ring-emerald-100' : '',
        status === 'warning' ? 'border-amber-500 focus:ring-amber-100' : '',
      ]"
      :type="type"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <span v-if="error" class="text-xs text-rose-600">{{ error }}</span>
  </label>
</template>
