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
  <div ref="rootRef" class="cmp-select-wrap">
    <button
      type="button"
      class="cmp-select cmp-select-trigger"
      :aria-expanded="open"
      aria-haspopup="listbox"
      @click="toggleOpen"
    >
      <span>{{ selectedLabel }}</span>
      <svg class="cmp-select-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M7 10L12 15L17 10"
          stroke="currentColor"
          stroke-width="2.1"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>

    <transition name="cmp-select-pop">
      <ul v-if="open" class="cmp-select-dropdown" role="listbox">
        <li v-for="item in options" :key="item.value">
          <button
            type="button"
            class="cmp-select-option"
            :class="{ 'is-active': item.value === modelValue }"
            @click="selectOption(item.value)"
          >
            <span>{{ item.label }}</span>
            <span v-if="item.value === modelValue" class="cmp-select-check">✓</span>
          </button>
        </li>
      </ul>
    </transition>
  </div>
</template>
