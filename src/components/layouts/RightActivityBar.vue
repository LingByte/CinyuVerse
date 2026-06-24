<script setup lang="ts">
import type { Component } from 'vue';

export type RightActivityBarItem = {
  id: string;
  label: string;
  icon?: Component;
  disabled?: boolean;
};

const props = defineProps<{
  items: RightActivityBarItem[];
  activeId: string | null;
  onActiveChange: (id: string | null) => void;
}>();

function buttonClass(item: RightActivityBarItem, active: boolean) {
  return (
    'w-12 h-12 flex items-center justify-center relative ' +
    (item.disabled ? 'opacity-40 cursor-not-allowed ' : 'hover:bg-gray-100 active:bg-gray-200 ') +
    (active ? 'text-gray-900' : 'text-gray-500')
  );
}

function handleClick(item: RightActivityBarItem) {
  if (item.disabled) return;
  props.onActiveChange(props.activeId === item.id ? null : item.id);
}
</script>

<template>
  <aside class="w-12 bg-white border-l border-gray-200 flex flex-col">
    <div class="flex-1 flex flex-col">
      <button
        v-for="item in items"
        :key="item.id"
        type="button"
        :class="buttonClass(item, item.id === activeId)"
        :aria-label="item.label"
        :title="item.label"
        @click="handleClick(item)"
      >
        <span v-if="item.id === activeId" class="absolute right-0 top-2 bottom-2 w-0.5 bg-blue-500 rounded-l" />
        <span class="w-5 h-5 flex items-center justify-center">
          <component :is="item.icon" v-if="item.icon" class="w-5 h-5" />
        </span>
      </button>
    </div>
  </aside>
</template>
