<script setup lang="ts">
import AiCreate from '@/pages/AiCreate.vue'
import Landing from '@/pages/Landing.vue'

type View = 'landing' | 'chat'

import { computed, ref } from 'vue'

const view = ref<View>('landing')

const showLanding = computed(() => view.value === 'landing')
</script>

<template>
  <Landing v-if="showLanding" @goChat="view = 'chat'" />

  <main v-else class="chat">
    <AiCreate @back="view = 'landing'" />
  </main>
</template>

<style scoped>
.chat {
  min-height: 100vh;
}
</style>
