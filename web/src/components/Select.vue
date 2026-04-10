<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'

interface SelectOption {
  label: string
  value: string
}

interface Props {
  modelValue: string
  options: SelectOption[]
  placeholder?: string
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: '请选择',
})
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const open = ref(false)
const rootRef = ref<HTMLElement | null>(null)

const selectedLabel = computed(
  () => props.options.find((item) => item.value === props.modelValue)?.label ?? props.placeholder,
)

const toggleOpen = () => {
  open.value = !open.value
}

const selectOption = (value: string) => {
  emit('update:modelValue', value)
  open.value = false
}

const closeOnOutside = (event: MouseEvent) => {
  const target = event.target as Node
  if (rootRef.value && !rootRef.value.contains(target)) {
    open.value = false
  }
}

window.addEventListener('click', closeOnOutside)
onBeforeUnmount(() => {
  window.removeEventListener('click', closeOnOutside)
})
</script>

<template>
  <div ref="rootRef" class="relative inline-block w-full">
    <button
      type="button"
      class="inline-flex min-h-11 w-full items-center justify-between rounded-xl border border-[var(--border)] bg-[color-mix(in_oklab,var(--surface)_92%,transparent)] px-3.5 py-2.5 text-left text-sm font-medium text-[var(--text)] transition-all duration-200 hover:border-[var(--theme)] hover:bg-[color-mix(in_oklab,var(--surface)_88%,var(--theme-soft))] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--theme-soft)]"
      :aria-expanded="open"
      aria-haspopup="listbox"
      @click="toggleOpen"
    >
      <span>{{ selectedLabel }}</span>
      <svg
        class="size-4 text-[var(--theme-strong)] transition-transform duration-200"
        :class="open ? 'rotate-180' : ''"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M7 10L12 15L17 10"
          stroke="currentColor"
          stroke-width="2.1"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>

    <transition enter-active-class="transition duration-200" leave-active-class="transition duration-150" enter-from-class="opacity-0 -translate-y-1 scale-[0.98]" leave-to-class="opacity-0 -translate-y-1 scale-[0.98]">
      <ul
        v-if="open"
        class="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-30 m-0 list-none rounded-2xl border border-[color-mix(in_oklab,var(--border)_70%,var(--theme))] bg-[color-mix(in_oklab,var(--surface)_93%,white)] p-1.5 shadow-[0_24px_50px_-26px_var(--theme-strong),0_10px_25px_-14px_var(--ring)] backdrop-blur-lg"
        role="listbox"
      >
        <li v-for="item in options" :key="item.value">
          <button
            type="button"
            class="inline-flex min-h-9 w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm font-semibold text-[var(--text)] transition-all duration-150 hover:translate-x-0.5 hover:bg-[color-mix(in_oklab,var(--theme-soft)_70%,var(--surface))] hover:text-[var(--theme-strong)]"
            :class="item.value === modelValue ? 'bg-[linear-gradient(90deg,color-mix(in_oklab,var(--theme-soft)_82%,transparent),color-mix(in_oklab,var(--theme-soft)_40%,transparent))] text-[var(--theme-strong)]' : ''"
            @click="selectOption(item.value)"
          >
            <span>{{ item.label }}</span>
            <span v-if="item.value === modelValue" class="text-sm leading-none">✓</span>
          </button>
        </li>
      </ul>
    </transition>
  </div>
</template>
