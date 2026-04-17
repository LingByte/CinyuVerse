<script setup lang="ts">
import { provide, reactive } from 'vue'

const props = withDefaults(defineProps<{ model: Record<string, unknown> }>(), { model: () => ({}) })
const errors = reactive<Record<string, string>>({})
const setError = (key: string, value: string) => {
  errors[key] = value
}
provide('cvFormModel', props.model)
provide('cvFormErrors', errors)
provide('cvFormSetError', setError)
</script>

<template>
  <form class="grid gap-4" @submit.prevent>
    <slot :errors="errors" />
  </form>
</template>
