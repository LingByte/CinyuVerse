<script setup lang="ts">
import { ref } from 'vue'
import Badge from './components/Badge.vue'
import Button from './components/Button.vue'
import Select from './components/Select.vue'

const theme = ref('lavender')
const selectValue = ref('vue')

const themeOptions = [
  { label: 'Lavender (默认)', value: 'lavender' },
  { label: 'Ocean', value: 'ocean' },
  { label: 'Rose', value: 'rose' },
]

const demoOptions = [
  { label: 'Vue + TypeScript', value: 'vue' },
  { label: 'TailwindCSS v4', value: 'tailwind' },
  { label: 'Design System', value: 'design-system' },
]
</script>

<template>
  <main class="showcase-page" :data-theme="theme">
    <section class="glass-card p-7 md:p-10">
      <div class="mb-7 flex flex-wrap items-center gap-3">
        <Badge variant="solid">CinyuVerse UI</Badge>
        <Badge variant="soft" pulse>动画中</Badge>
        <Badge variant="outline">可主题化</Badge>
      </div>

      <h1 class="mb-3 text-3xl font-extrabold tracking-tight md:text-4xl">自定义组件展示页</h1>
      <p class="mb-8 max-w-2xl text-sm leading-relaxed text-[var(--text-muted)] md:text-base">
        你现在可以基于 Button、Badge、Select 快速构建自己的组件体系。默认主题为淡紫色，并且支持一键切换主题色。
      </p>

      <div class="grid gap-7 md:grid-cols-2">
        <article class="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 class="text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Theme Controller
          </h2>
          <Select v-model="theme" :options="themeOptions" />
          <p class="text-sm text-[var(--text-muted)]">当前主题：{{ theme }}</p>
        </article>

        <article class="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 class="text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Select Preview
          </h2>
          <Select v-model="selectValue" :options="demoOptions" />
          <p class="text-sm text-[var(--text-muted)]">当前选项：{{ selectValue }}</p>
        </article>
      </div>

      <article class="mt-7 space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          Button Variants
        </h2>
        <div class="flex flex-wrap items-center gap-3">
          <Button variant="solid">主要按钮</Button>
          <Button variant="soft">柔和按钮</Button>
          <Button variant="outline">描边按钮</Button>
          <Button variant="solid" size="lg">大尺寸按钮</Button>
        </div>
      </article>
    </section>
  </main>
</template>
