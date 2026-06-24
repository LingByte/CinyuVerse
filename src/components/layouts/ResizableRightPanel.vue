<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import type { Component } from 'vue';
import { X, ChevronLeft, ChevronRight } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type RightActivityBarItem = {
  id: string;
  label: string;
  icon?: Component;
  disabled?: boolean;
};

export type RightPanelContent = {
  id: string;
  title: string;
  minWidth?: number;
  defaultWidth?: number;
};

const props = defineProps<{
  items: RightActivityBarItem[];
  panels: RightPanelContent[];
  activeId: string | null;
  onActiveChange: (id: string | null) => void;
}>();

const isCollapsed = ref(false);
const panelWidth = ref<Record<string, number>>({});
const isDragging = ref(false);
const dragStartX = ref(0);
const dragStartWidth = ref(0);
const activePanelRef = ref<string | null>(null);

const activePanel = computed(() => props.panels.find((p) => p.id === props.activeId));

function getPanelWidth(panelId: string) {
  const panel = props.panels.find((p) => p.id === panelId);
  const storedWidth = panelWidth.value[panelId];
  if (storedWidth) return storedWidth;
  const defaultWidth = panel?.defaultWidth || 320;
  const minWidth = panel?.minWidth || 200;
  return Math.max(defaultWidth, minWidth);
}

const currentWidth = computed(() => (props.activeId ? getPanelWidth(props.activeId) : 0));

function handleMouseDown(e: MouseEvent) {
  if (!props.activeId) return;
  e.preventDefault();
  e.stopPropagation();

  dragStartX.value = e.clientX;
  dragStartWidth.value = getPanelWidth(props.activeId);
  activePanelRef.value = props.activeId;

  const onMove = (ev: MouseEvent) => {
    isDragging.value = true;
    handleMouseMove(ev);
  };

  const stopDrag = () => {
    isDragging.value = false;
    activePanelRef.value = null;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', stopDrag);
    window.removeEventListener('blur', stopDrag);
    document.removeEventListener('keydown', onKeyDown);
  };

  const onKeyDown = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') stopDrag();
  };

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', stopDrag);
  window.addEventListener('blur', stopDrag);
  document.addEventListener('keydown', onKeyDown);
}

function handleMouseMove(e: MouseEvent) {
  if (!isDragging.value || !activePanelRef.value) return;

  const deltaX = dragStartX.value - e.clientX;
  const newWidth = dragStartWidth.value + deltaX;
  const panel = props.panels.find((p) => p.id === activePanelRef.value);
  const minWidth = panel?.minWidth || 200;
  const maxWidth = window.innerWidth * 0.6;

  const finalWidth = Math.max(minWidth, Math.min(newWidth, maxWidth));

  panelWidth.value = {
    ...panelWidth.value,
    [activePanelRef.value]: finalWidth,
  };
}

function handleMouseUp() {
  isDragging.value = false;
  activePanelRef.value = null;
}

watch(isDragging, (dragging) => {
  if (!dragging) {
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  }
});

onUnmounted(() => {
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', handleMouseUp);
});

function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value;
}

watch(
  () => props.activeId,
  (activeId) => {
    if (activeId && isCollapsed.value) {
      isCollapsed.value = false;
    }
  },
);

function handleActiveChange(newActiveId: string | null) {
  if (newActiveId && isCollapsed.value) {
    isCollapsed.value = false;
  }
  props.onActiveChange(newActiveId);
}

function itemButtonClass(item: RightActivityBarItem, active: boolean) {
  return cn(
    'relative h-12 w-12 rounded-none',
    item.disabled ? 'opacity-40 cursor-not-allowed' : '',
    active ? 'text-foreground' : 'text-muted-foreground',
  );
}

function handleItemClick(item: RightActivityBarItem) {
  if (item.disabled) return;
  handleActiveChange(item.id);
}
</script>

<template>
  <div v-if="!activePanel" class="flex">
    <aside class="flex w-12 shrink-0 flex-col border-l border-border bg-background">
      <div class="flex flex-1 flex-col">
        <Button
          v-for="item in items"
          :key="item.id"
          variant="ghost"
          size="icon"
          :class="itemButtonClass(item, item.id === activeId)"
          :disabled="item.disabled"
          :aria-label="item.label"
          :title="item.label"
          @click="handleItemClick(item)"
        >
          <span
            v-if="item.id === activeId"
            class="absolute bottom-2 right-0 top-2 w-0.5 rounded-l bg-primary"
          />
          <component :is="item.icon" v-if="item.icon" class="h-5 w-5" />
        </Button>
      </div>
    </aside>
  </div>

  <div v-else class="flex relative">
    <div
      v-if="isDragging"
      class="fixed inset-0 z-50 cursor-ew-resizing"
      style="cursor: ew-resize"
      @mouseup="isDragging = false"
    />

    <aside
      v-if="activeId && !isCollapsed"
      class="relative flex flex-col border-l border-border bg-background shadow-lg transition-all duration-300 ease-in-out"
      :style="{
        width: currentWidth + 'px',
        minWidth: (activePanel?.minWidth || 200) + 'px',
        zIndex: isDragging ? 51 : 'auto',
      }"
    >
      <div class="flex h-10 shrink-0 items-center justify-between border-b border-border px-3">
        <div class="truncate text-sm font-medium text-foreground">{{ activePanel.title }}</div>
        <div class="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" aria-label="Collapse" title="Collapse panel" @click="toggleCollapse">
            <ChevronRight class="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Close" title="Close panel" @click="onActiveChange(null)">
            <X class="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div class="min-h-0 flex-1 overflow-auto">
        <slot :name="activePanel.id" />
      </div>

      <div
        class="absolute bottom-0 left-0 top-0 z-10 w-1"
        :class="isDragging ? 'cursor-ew-resize bg-primary' : 'cursor-ew-resize bg-transparent hover:bg-primary/40'"
        style="touch-action: none"
        @mousedown.stop="handleMouseDown"
      />
    </aside>

    <aside v-if="isCollapsed && activeId" class="flex w-12 flex-col border-l border-border bg-background">
      <div class="flex flex-1 flex-col">
        <Button
          variant="ghost"
          size="icon"
          class="h-12 w-12 rounded-none"
          aria-label="Expand panel"
          title="Expand panel"
          @click="handleActiveChange(activeId)"
        >
          <ChevronLeft class="h-5 w-5" />
        </Button>
      </div>
    </aside>

    <aside v-else class="flex w-12 shrink-0 flex-col border-l border-border bg-background">
      <div class="flex flex-1 flex-col">
        <Button
          v-for="item in items"
          :key="item.id"
          variant="ghost"
          size="icon"
          :class="itemButtonClass(item, item.id === activeId)"
          :disabled="item.disabled"
          :aria-label="item.label"
          :title="isCollapsed ? item.label : ''"
          @click="handleItemClick(item)"
        >
          <span
            v-if="item.id === activeId"
            class="absolute bottom-2 right-0 top-2 w-0.5 rounded-l bg-primary"
          />
          <component :is="item.icon" v-if="item.icon" class="h-5 w-5" />
        </Button>
      </div>
    </aside>
  </div>
</template>
