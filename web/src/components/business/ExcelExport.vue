<script setup lang="ts">
const props = defineProps<{ rows: Record<string, unknown>[]; filename?: string }>()
const download = () => {
  if (!props.rows.length) return
  const headers = Object.keys(props.rows[0])
  const lines = [headers.join(',')]
  props.rows.forEach((row) => lines.push(headers.map((k) => JSON.stringify(row[k] ?? '')).join(',')))
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = props.filename ?? 'export.csv'
  link.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <button type="button" class="rounded-lg border px-3 py-1.5 text-sm" @click="download">导出 Excel(CSV)</button>
</template>
