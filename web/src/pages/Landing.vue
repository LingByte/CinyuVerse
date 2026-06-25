<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import { Sparkles, Pencil } from 'lucide-vue-next'
import ParallaxFloatingPreview from '@/components/fancy/image/ParallaxFloatingPreview.vue'

const emit = defineEmits<{
  (e: 'goChat'): void
  (e: 'enterIde'): void
}>()
</script>

<template>
  <main class="relative min-h-screen overflow-hidden bg-[var(--bg-primary)] px-[clamp(14px,2.2vw,18px)] py-[clamp(18px,3.2vw,28px)] text-[var(--text-main)]">
    <div class="pointer-events-none absolute inset-0 z-0">
      <ParallaxFloatingPreview as-background :show-overlay="false" />
    </div>

    <div class="relative z-10 mx-auto flex min-h-[calc(100vh-56px)] w-full max-w-[1280px] flex-col items-center justify-center gap-[clamp(26px,4.8vh,42px)] text-center">
      <section class="flex max-w-[720px] flex-col items-center">
        <div class="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[color-mix(in_oklab,var(--bg-card)_88%,transparent)] px-3 py-1 text-xs text-[var(--text-sub)] backdrop-blur-sm">
          <Sparkles :size="14" class="text-[var(--accent)]" />
          AI 驱动创作工作台
        </div>

        <h1 class="m-0 text-[clamp(34px,4.4vw,52px)] leading-[1.06] font-black tracking-[-0.03em]">
          你的
          <span class="bg-gradient-to-r from-[var(--accent)] to-violet-400 bg-clip-text text-transparent">
            AI 驱动
          </span>
          小说创作
          <br />
          工作台
        </h1>

        <p class="mt-[clamp(12px,2.2vh,18px)] max-w-[560px] text-[clamp(13px,1.35vw,14px)] leading-[1.7] text-[var(--text-sub)]">
          CinyuVerse 是新一代 AI 小说编辑器，集创作、续写、润色于一体。
        </p>

        <div class="mt-[clamp(14px,2.6vh,22px)] flex flex-wrap justify-center gap-3.5">
          <Button
            size="lg"
            class="!px-9 !py-3.5 !text-base gap-2"
            @click="emit('enterIde')"
          >
            <Pencil :size="16" />
            进入编辑器
          </Button>
        </div>

        <p class="mt-[clamp(10px,1.8vh,14px)] text-[clamp(11px,1.15vw,12px)] text-[var(--text-muted)]">
          已有 <span class="font-extrabold text-[var(--accent)]">30,000+</span> 创作者信赖
        </p>
      </section>

      <section class="flex w-full max-w-[900px] flex-wrap items-center justify-center gap-[clamp(12px,2.6vw,22px)] opacity-55" aria-label="支持的模型">
        <div v-for="brand in ['通义千问', '文心一言', 'Gemini', 'DeepSeek', '月之暗面', 'Meta']" :key="brand" class="text-[clamp(16px,2.2vw,22px)] font-bold tracking-tight text-[var(--text-muted)]">
          {{ brand }}
        </div>
      </section>
    </div>
  </main>
</template>
