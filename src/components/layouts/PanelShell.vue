<script setup lang="ts">
defineProps<{
  title: string
  subtitle?: string
}>()
</script>

<template>
  <div class="flex h-full flex-col bg-background">
    <div class="flex h-10 shrink-0 items-center justify-between border-b border-border px-3">
      <div class="min-w-0">
        <div class="truncate text-sm font-medium text-foreground">{{ title }}</div>
        <div v-if="subtitle" class="truncate text-[10px] text-muted-foreground">{{ subtitle }}</div>
      </div>
      <div class="flex shrink-0 items-center gap-1">
        <slot name="actions" />
      </div>
    </div>

    <slot name="toolbar" />

    <div v-if="$slots.alert" class="px-3 pt-2">
      <slot name="alert" />
    </div>

    <div v-if="$slots.status" class="px-3 py-2 text-xs text-muted-foreground">
      <slot name="status" />
    </div>

    <div class="min-h-0 flex-1 overflow-auto">
      <slot />
    </div>

    <div v-if="$slots.footer" class="shrink-0 border-t border-border">
      <slot name="footer" />
    </div>
  </div>
</template>
