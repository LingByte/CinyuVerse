<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue';

export type ContextMenuItem = {
  id: string;
  label: string;
  disabled?: boolean;
  onClick: () => void;
};

const props = defineProps<{
  open: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}>();

const menuRef = ref<HTMLDivElement | null>(null);

function onMouseDown(e: MouseEvent) {
  const el = menuRef.value;
  if (!el) return;
  if (e.target instanceof Node && el.contains(e.target)) return;
  props.onClose();
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') props.onClose();
}

watch(
  () => props.open,
  (open, _prev, onCleanup) => {
    if (!open) return;
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);
    onCleanup(() => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown);
    });
  },
);

onUnmounted(() => {
  window.removeEventListener('mousedown', onMouseDown);
  window.removeEventListener('keydown', onKeyDown);
});

function itemClass(disabled?: boolean) {
  return (
    'w-full text-left px-3 py-2 text-sm ' +
    (disabled ? 'text-gray-300 cursor-not-allowed' : 'text-gray-700 hover:bg-gray-100 active:bg-gray-200')
  );
}

function handleItemClick(item: ContextMenuItem) {
  if (item.disabled) return;
  item.onClick();
  props.onClose();
}
</script>

<template>
  <div
    v-if="open"
    ref="menuRef"
    class="fixed z-[9999] min-w-44 bg-white border border-gray-200 rounded-md shadow-lg py-1"
    :style="{ left: x, top: y }"
    role="menu"
  >
    <button
      v-for="it in items"
      :key="it.id"
      type="button"
      :class="itemClass(it.disabled)"
      :disabled="it.disabled"
      role="menuitem"
      @click="handleItemClick(it)"
    >
      {{ it.label }}
    </button>
  </div>
</template>
