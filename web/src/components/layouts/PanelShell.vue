<script setup lang="ts">
defineProps<{
  title: string
  subtitle?: string
}>()
</script>

<template>
  <div class="panel-shell">
    <div class="panel-header">
      <div class="panel-title-wrap">
        <div class="panel-title">{{ title }}</div>
        <div v-if="subtitle" class="panel-subtitle">{{ subtitle }}</div>
      </div>
      <div class="panel-actions">
        <slot name="actions" />
      </div>
    </div>

    <slot name="toolbar" />

    <div v-if="$slots.alert" class="panel-alert">
      <slot name="alert" />
    </div>

    <div class="panel-body">
      <slot />
    </div>

    <div v-if="$slots.footer" class="panel-footer">
      <slot name="footer" />
    </div>
  </div>
</template>

<style scoped>
.panel-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-secondary);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 36px;
  flex-shrink: 0;
  padding: 0 12px;
  border-bottom: 1px solid var(--border);
}

.panel-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.panel-subtitle {
  font-size: 10px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.panel-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.panel-alert {
  padding: 8px 12px 0;
}

.panel-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.panel-footer {
  flex-shrink: 0;
  border-top: 1px solid var(--border);
}
</style>
