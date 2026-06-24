<script setup lang="ts">
import { X } from 'lucide-vue-next';

withDefaults(
  defineProps<{
    open: boolean;
    title?: string;
    widthClassName?: string;
    onClose?: () => void;
  }>(),
  {
    widthClassName: 'w-80 min-w-80',
  },
);
</script>

<template>
  <aside v-if="open" :class="widthClassName + ' border-l border-gray-200 bg-white flex flex-col'">
    <div class="h-10 px-3 flex items-center justify-between border-b border-gray-200">
      <div class="text-sm font-medium text-gray-800 truncate">{{ title ?? '' }}</div>
      <button
        v-if="onClose"
        type="button"
        class="p-1.5 rounded-md hover:bg-gray-100 active:bg-gray-200"
        aria-label="Close"
        title="Close"
        @click="onClose"
      >
        <X class="w-4 h-4 text-gray-600" />
      </button>
    </div>

    <div class="flex-1 min-h-0 overflow-auto">
      <slot />
    </div>
  </aside>
</template>
