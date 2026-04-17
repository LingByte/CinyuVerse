<script setup lang="ts">
import AiCreate from '@/pages/AiCreate.vue'
import HotTemplate from '@/pages/HotTemplate.vue'
import Landing from '@/pages/Landing.vue'
import NovelDetail from '@/pages/NovelDetail.vue'
import NovelWriter from '@/pages/NovelWriter.vue'

type View = 'landing' | 'chat' | 'hotTemplate' | 'novelDetail' | 'novelWriter'

import { computed, ref } from 'vue'

const view = ref<View>('landing')

const showLanding = computed(() => view.value === 'landing')

const selectedNovelId = ref<number | string | null>(null)
const selectedVolumeId = ref<string | null>(null)
const selectedChapterId = ref<string | null>(null)

const openNovel = (id: number | string) => {
  selectedNovelId.value = id
  selectedVolumeId.value = null
  selectedChapterId.value = null
  view.value = 'novelDetail'
}

const startCreate = (payload: { volumeId: string; chapterId: string }) => {
  selectedVolumeId.value = payload.volumeId
  selectedChapterId.value = payload.chapterId
  view.value = 'novelWriter'
}
</script>

<template>
  <Transition name="page" mode="out-in">
    <Landing v-if="showLanding" key="landing" @goChat="view = 'chat'" />

    <HotTemplate
      v-else-if="view === 'hotTemplate'"
      key="hotTemplate"
      @back="view = 'chat'"
      @openNovel="openNovel"
    />

    <NovelDetail
      v-else-if="view === 'novelDetail'"
      key="novelDetail"
      :novel-id="selectedNovelId ?? ''"
      @back="view = 'hotTemplate'"
      @startCreate="startCreate"
    />

    <NovelWriter
      v-else-if="view === 'novelWriter'"
      key="novelWriter"
      :novel-id="selectedNovelId ?? ''"
      :volume-id="selectedVolumeId ?? ''"
      :chapter-id="selectedChapterId ?? ''"
      @back="view = 'novelDetail'"
    />

    <main v-else key="chat" class="chat">
      <AiCreate @back="view = 'landing'" @goHotTemplate="view = 'hotTemplate'" />
    </main>
  </Transition>
</template>

<style scoped>
.chat {
  min-height: 100vh;
}

.page-enter-active,
.page-leave-active {
  transition: opacity 220ms ease, transform 260ms ease;
}

.page-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.page-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
