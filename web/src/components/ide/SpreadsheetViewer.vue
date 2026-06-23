<script setup lang="ts">
import { computed } from 'vue'
import { parseDelimited, getExt } from '@/utils/fileTypes'

const props = defineProps<{
  content: string
  fileName: string
}>()

const rows = computed(() => {
  const ext = getExt(props.fileName)
  return parseDelimited(props.content, ext === 'tsv' ? '\t' : ',')
})

const hasData = computed(() => rows.value.length > 0)
</script>

<template>
  <div class="spreadsheet-viewer">
    <div v-if="hasData" class="table-scroll">
      <table class="data-table">
        <tbody>
          <tr v-for="(row, ri) in rows" :key="ri" :class="{ header: ri === 0 }">
            <td v-for="(cell, ci) in row" :key="ci" class="table-cell">
              {{ cell }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-else class="empty-state">
      <p>文件为空或格式不正确。</p>
    </div>
    <div class="table-info">
      <span>{{ fileName }}</span>
      <span class="row-count">{{ rows.length }} 行</span>
    </div>
  </div>
</template>

<style scoped>
.spreadsheet-viewer {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
}

.table-scroll {
  flex: 1;
  overflow: auto;
}

.data-table {
  border-collapse: collapse;
  font-size: 12px;
  font-family: 'JetBrains Mono', 'SF Mono', monospace;
  line-height: 1.6;
}

tr.header .table-cell {
  font-weight: 700;
  color: var(--text-main);
  background: var(--bg-secondary);
  position: sticky;
  top: 0;
  z-index: 1;
  border-bottom: 2px solid var(--border);
}

tr:not(.header):nth-child(even) {
  background: var(--bg-secondary);
}

.table-cell {
  padding: 4px 12px;
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
  color: var(--text-secondary);
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: 13px;
}

.table-info {
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  font-size: 11px;
  color: var(--text-sub);
  background: var(--bg-secondary);
  border-top: 1px solid var(--border);
}

.row-count {
  opacity: 0.7;
}
</style>
