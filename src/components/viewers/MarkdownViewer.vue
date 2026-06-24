<script setup lang="ts">
import { computed, ref } from 'vue';
import { marked } from 'marked';
import MonacoEditor from '@/components/editor/MonacoEditor.vue';

const props = defineProps<{
  value: string;
  onChange: (next: string) => void;
  readOnly: boolean;
}>();

const mode = ref<'edit' | 'preview'>('preview');

const html = computed(() => {
  try {
    return marked.parse(props.value) as string;
  } catch {
    return '';
  }
});
</script>

<template>
  <div class="h-full flex flex-col bg-white">
    <div class="h-10 flex items-center justify-between px-3 border-b border-gray-200">
      <div class="text-sm font-medium text-gray-800">Markdown</div>
      <div class="flex items-center gap-2">
        <button
          type="button"
          :class="
            'px-2 py-1 text-xs rounded ' +
            (mode === 'preview' ? 'bg-gray-200 text-gray-900' : 'hover:bg-gray-100 text-gray-600')
          "
          @click="mode = 'preview'"
        >
          Preview
        </button>
        <button
          type="button"
          :class="
            'px-2 py-1 text-xs rounded ' +
            (mode === 'edit' ? 'bg-gray-200 text-gray-900' : 'hover:bg-gray-100 text-gray-600')
          "
          :disabled="readOnly"
          @click="mode = 'edit'"
        >
          Edit
        </button>
      </div>
    </div>

    <div class="flex-1 min-h-0">
      <MonacoEditor
        v-if="mode === 'edit'"
        :value="value"
        @update:value="onChange"
        language="markdown"
        height="100%"
        :read-only="readOnly"
      />
      <div
        v-else
        class="h-full overflow-auto p-4 prose max-w-none"
        v-html="html"
      />
    </div>
  </div>
</template>
