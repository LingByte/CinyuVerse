<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { getExtensionActivationError, getWebviewHtml } from '@/extensions/runtime';

const props = defineProps<{
  title: string;
  views: Array<{ id: string; name: string }>;
  extId: string;
  main?: string;
  browser?: string;
  activationEvents?: string[];
}>();

const tick = ref(0);

function onChanged() {
  tick.value += 1;
}

onMounted(() => {
  window.addEventListener('extensions-webviews-changed', onChanged);
});

onUnmounted(() => {
  window.removeEventListener('extensions-webviews-changed', onChanged);
});

const activationError = computed(() => {
  void tick.value;
  return getExtensionActivationError(props.extId);
});

const webviewHtml = computed(() => {
  void tick.value;
  const firstViewId = props.views[0]?.id ?? '';
  return firstViewId ? getWebviewHtml(firstViewId) : '';
});
</script>

<template>
  <div class="h-full flex flex-col bg-white">
    <div
      class="h-10 px-3 flex items-center border-b border-gray-200 text-sm font-medium text-gray-800"
    >
      {{ title }}
    </div>
    <div
      :class="webviewHtml ? 'flex-1 min-h-0 overflow-auto' : 'flex-1 min-h-0 overflow-auto p-3'"
    >
      <div v-if="views.length === 0" class="space-y-2">
        <div class="text-[11px] text-gray-500 leading-5">
          <div>Extension: {{ extId }}</div>
          <div>main: {{ main ? main : '(none)' }}</div>
          <div>browser: {{ browser ? browser : '(none)' }}</div>
          <div>
            activationEvents: {{ Array.isArray(activationEvents) ? activationEvents.length : 0 }}
          </div>
        </div>
        <div
          v-if="activationError"
          class="text-xs text-red-700 border border-red-200 bg-red-50 rounded p-2"
        >
          {{ activationError }}
        </div>
        <div class="text-xs text-gray-600 leading-5">
          <div class="font-medium text-gray-800">This is a contributed view container.</div>
          <div>
            The extension UI is not executed yet, so this panel is a placeholder (stage 1).
          </div>
        </div>
        <div class="text-xs text-gray-500">
          No contributed views were declared for this container.
        </div>
      </div>

      <div v-else class="space-y-3">
        <div
          v-if="webviewHtml"
          class="border border-gray-200 rounded overflow-auto bg-white"
        >
          <div class="p-2" v-html="webviewHtml" />
        </div>
        <div v-else class="space-y-2">
          <div class="text-[11px] text-gray-500 leading-5">
            <div>Extension: {{ extId }}</div>
            <div>main: {{ main ? main : '(none)' }}</div>
            <div>browser: {{ browser ? browser : '(none)' }}</div>
            <div>
              activationEvents:
              {{ Array.isArray(activationEvents) ? activationEvents.length : 0 }}
            </div>
          </div>
          <div
            v-if="activationError"
            class="text-xs text-red-700 border border-red-200 bg-red-50 rounded p-2"
          >
            {{ activationError }}
          </div>
          <div class="text-xs text-gray-600 leading-5">
            <div class="font-medium text-gray-800">This is a contributed view container.</div>
            <div>
              The extension UI is not executed yet, so this panel is a placeholder (stage 1).
            </div>
          </div>
          <div class="text-xs text-gray-500">
            No contributed views were declared for this container.
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
