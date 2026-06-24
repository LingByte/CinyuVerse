<script setup lang="ts">
import { ref } from 'vue';
import MonacoEditor from '@/components/editor/MonacoEditor.vue';

const code = ref(
  `function hello(name: string) {\n  return "Hello, " + name;\n}\n\nconsole.log(hello("GoPilot"));\n`,
);
</script>

<template>
  <div class="min-h-screen bg-gray-50 text-gray-900">
    <div class="max-w-6xl mx-auto px-6 py-6">
      <div class="mb-4">
        <h1 class="text-2xl font-semibold tracking-tight">Home</h1>
        <p class="mt-1 text-sm text-gray-600">Monaco editor preview</p>
      </div>

      <div class="rounded-lg overflow-hidden border border-gray-200 bg-white">
        <MonacoEditor v-model="code" language="typescript" height="70vh" />
      </div>
    </div>
  </div>
</template>
