<script setup lang="ts">
import { computed } from 'vue'
import MarkdownRender from '@/components/markdown/MarkdownRender.vue'

const props = withDefaults(
  defineProps<{
    /** 当前助手完整文本（流式累加） */
    text: string
    streaming?: boolean
    /** 滑动窗口起点：较短时整段展示 */
    baseWindow?: number
    /** 窗口上限字符数，避免极长回复拖垮渲染 */
    maxWindow?: number
    /** 随全文变长放大可视窗口：window ≈ min(max, base + len * growth) */
    growth?: number
  }>(),
  {
    streaming: false,
    baseWindow: 520,
    maxWindow: 14000,
    growth: 1.15,
  },
)

/** 尾部滑动窗口：后端输出越长，可视片段越大（有上限） */
const windowed = computed(() => {
  const t = props.text
  const len = t.length
  const cap = Math.min(props.maxWindow, props.baseWindow + Math.floor(len * props.growth))
  if (len <= cap) {
    return t
  }
  return t.slice(len - cap)
})
</script>

<template>
  <div class="sa-md" :class="{ 'sa-md--stream': streaming }">
    <MarkdownRender :source="windowed" />
    <span v-if="streaming" class="sa-md__caret" aria-hidden="true" />
  </div>
</template>

<style scoped>
.sa-md {
  position: relative;
}
.sa-md--stream :deep(.md-render) {
  min-height: 1.2em;
}
.sa-md__caret {
  display: inline-block;
  width: 7px;
  height: 1.1em;
  margin-left: 2px;
  vertical-align: text-bottom;
  border-radius: 1px;
  background: rgb(var(--primary-6));
  animation: sa-caret-blink 0.95s step-end infinite;
}
@keyframes sa-caret-blink {
  50% {
    opacity: 0;
  }
}
</style>
