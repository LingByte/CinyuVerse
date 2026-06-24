<script setup lang="ts">
import { Button, Textarea, Label, Alert, AlertDescription } from '@/components/ui'

const props = defineProps<{
  modelValue: string
  disabled?: boolean
  aiBusy?: boolean
  aiError?: string
  canAi?: boolean
  canCommit?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  commit: []
  'generate-ai': []
}>()

function onKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault()
    if (props.canCommit && !props.disabled) emit('commit')
  }
}
</script>

<template>
  <div class="space-y-2">
    <Label for="scm-commit-message" class="sr-only">Commit message</Label>
    <Textarea
      id="scm-commit-message"
      :model-value="modelValue"
      placeholder="Message (Ctrl+Enter to commit)"
      class="min-h-[72px] resize-none text-xs leading-relaxed"
      rows="3"
      :disabled="disabled || aiBusy"
      @update:model-value="emit('update:modelValue', $event)"
      @keydown="onKeydown"
    />
    <div class="flex justify-end gap-2">
      <Button
        variant="outline"
        size="sm"
        title="Generate commit message with AI"
        :disabled="disabled || aiBusy || !canAi"
        @click="emit('generate-ai')"
      >
        <slot name="ai-icon" />
        {{ aiBusy ? 'Generating…' : 'AI' }}
      </Button>
      <Button size="sm" :disabled="disabled || !canCommit" @click="emit('commit')">
        <slot name="commit-icon" />
        Commit
      </Button>
    </div>
    <Alert v-if="aiError" variant="destructive">
      <AlertDescription>{{ aiError }}</AlertDescription>
    </Alert>
  </div>
</template>
