<script setup lang="ts">
import { computed, inject } from 'vue'
const props = defineProps<{ name: string; label?: string; required?: boolean }>()
const errors = inject<Record<string, string>>('cvFormErrors', {})
const error = computed(() => errors?.[props.name] ?? '')
</script>

<template>
  <label class="grid gap-1.5">
    <span v-if="label" class="text-xs font-semibold text-[var(--cv-color-text-muted)]">
      {{ label }}<span v-if="required" class="text-rose-600"> *</span>
    </span>
    <slot :error="error" />
    <span v-if="error" class="text-xs text-rose-600">{{ error }}</span>
  </label>
</template>
