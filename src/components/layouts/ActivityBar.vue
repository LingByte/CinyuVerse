<script setup lang="ts">
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { ActivityBarItem } from '@/types/activity-bar'

const props = withDefaults(
  defineProps<{
    items: ActivityBarItem[]
    bottomItems?: ActivityBarItem[]
    activeId: string
    onActiveChange: (id: string) => void
  }>(),
  {
    bottomItems: () => [],
  },
)

function isActive(item: ActivityBarItem) {
  return item.active ?? item.id === props.activeId
}

function handleClick(item: ActivityBarItem) {
  if (item.disabled) return
  if (item.onSelect) item.onSelect()
  else props.onActiveChange(item.id)
}
</script>

<template>
  <aside class="flex w-12 shrink-0 flex-col border-r border-border bg-background">
    <div class="flex flex-1 flex-col">
      <Button
        v-for="item in items"
        :key="item.id"
        variant="ghost"
        size="icon"
        :class="
          cn(
            'relative h-12 w-12 rounded-none',
            isActive(item) ? 'text-foreground' : 'text-muted-foreground',
          )
        "
        :disabled="item.disabled"
        :aria-label="item.label"
        :title="item.label"
        @click="handleClick(item)"
      >
        <span
          v-if="isActive(item)"
          class="absolute bottom-2 left-0 top-2 w-0.5 rounded-r bg-primary"
        />
        <component :is="item.icon" v-if="item.icon" class="h-5 w-5" />
      </Button>
    </div>

    <div v-if="bottomItems.length > 0" class="border-t border-border">
      <Button
        v-for="item in bottomItems"
        :key="item.id"
        variant="ghost"
        size="icon"
        :class="
          cn(
            'relative h-12 w-12 rounded-none',
            isActive(item) ? 'text-foreground' : 'text-muted-foreground',
          )
        "
        :disabled="item.disabled"
        :aria-label="item.label"
        :title="item.label"
        @click="handleClick(item)"
      >
        <span
          v-if="isActive(item)"
          class="absolute bottom-2 left-0 top-2 w-0.5 rounded-r bg-primary"
        />
        <component :is="item.icon" v-if="item.icon" class="h-5 w-5" />
      </Button>
    </div>
  </aside>
</template>
