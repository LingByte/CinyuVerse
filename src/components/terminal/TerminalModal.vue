<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import Modal from '@/components/ui/Modal.vue';

type Line = {
  kind: 'cmd' | 'out' | 'err';
  text: string;
};

const props = defineProps<{
  open: boolean;
  rootPath: string;
}>();

const emit = defineEmits<{
  close: [];
}>();

const cmd = ref('');
const busy = ref(false);
const lines = ref<Line[]>([]);
const outputRef = ref<HTMLDivElement | null>(null);

const title = computed(() => {
  const p = props.rootPath?.trim();
  return p ? `Terminal — ${p}` : 'Terminal';
});

watch(
  () => [props.open, lines.value.length] as const,
  () => {
    if (!props.open) return;
    const t = window.setTimeout(() => {
      const el = outputRef.value;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
    }, 0);
    return () => window.clearTimeout(t);
  },
);

async function run() {
  const c = cmd.value.trim();
  if (!c || busy.value) return;

  busy.value = true;
  lines.value = [...lines.value, { kind: 'cmd', text: c }];
  cmd.value = '';

  try {
    const { invoke } = await import('@tauri-apps/api/tauri');
    const out = await invoke<string>('execute_command', {
      command: c,
      working_dir: props.rootPath || undefined,
    });
    const text = String(out ?? '');
    if (text.trim()) {
      lines.value = [...lines.value, { kind: 'out', text }];
    }
  } catch (e: any) {
    const msg = typeof e === 'string' ? e : e?.message ? String(e.message) : 'Command failed.';
    lines.value = [...lines.value, { kind: 'err', text: msg }];
  } finally {
    busy.value = false;
  }
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault();
    void run();
  }
}
</script>

<template>
  <Modal
    :open="open"
    :title="title"
    width-class-name="w-[900px]"
    @close="emit('close')"
  >
    <div class="space-y-2">
      <div
        ref="outputRef"
        class="h-[45vh] overflow-auto rounded border border-gray-200 bg-black text-gray-100 p-2"
      >
        <div v-if="lines.length === 0" class="text-xs text-gray-400">Type a command below.</div>
        <div v-else class="space-y-1">
          <pre
            v-for="(l, idx) in lines"
            :key="idx"
            :class="[
              'text-xs whitespace-pre-wrap break-words',
              l.kind === 'cmd' ? 'text-blue-200' : l.kind === 'err' ? 'text-red-300' : 'text-gray-100',
            ]"
          >
            {{ l.kind === 'cmd' ? `$ ${l.text}` : l.text }}
          </pre>
        </div>
      </div>

      <input
        v-model="cmd"
        :placeholder="rootPath ? 'Enter command and press Enter…' : 'Open a workspace first…'"
        class="w-full text-sm px-3 py-2 border border-gray-200 rounded"
        :disabled="busy || !rootPath"
        @keydown="onKeyDown"
      />
    </div>

    <template #footer>
      <div class="flex items-center justify-between gap-2">
        <div class="text-[11px] text-gray-500 truncate">{{ rootPath || 'No workspace selected' }}</div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="text-xs px-3 py-1.5 rounded border border-gray-200 hover:bg-gray-50"
            :disabled="busy"
            @click="lines = []"
          >
            Clear
          </button>
          <button
            type="button"
            class="text-xs px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700"
            :disabled="busy || !cmd.trim()"
            @click="run"
          >
            Run
          </button>
        </div>
      </div>
    </template>
  </Modal>
</template>
