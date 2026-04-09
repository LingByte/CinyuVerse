<script setup lang="ts">
import { computed, ref } from 'vue'
import Badge from './components/Badge.vue'
import Button2 from './components/Button2.vue'
import Card from './components/Card.vue'
import CardBody from './components/CardBody.vue'
import CardHeader from './components/CardHeader.vue'
import Icon from './components/Icon.vue'
import Select from './components/Select.vue'
import Container from './components/layout/Container.vue'
import Flex from './components/layout/Flex.vue'
import Stack from './components/layout/Stack.vue'
import { useI18n, type Locale } from './i18n'

const { t, locale, setLocale } = useI18n()

const localeOptions = computed<{ label: string; value: string }[]>(() => [
  { label: t('lang.zh'), value: 'zh' },
  { label: t('lang.en'), value: 'en' },
  { label: t('lang.ja'), value: 'ja' },
  { label: t('lang.ru'), value: 'ru' },
])

const localeModel = computed<string>({
  get: () => locale.value || 'zh',
  set: (v: string) => setLocale((v || 'zh') as Locale),
})

const button2VariantOptions = [
  { label: '实心', value: 'solid' },
  { label: '柔和', value: 'soft' },
  { label: '描边', value: 'outline' },
]

const button2SizeOptions = [
  { label: 'SM', value: 'sm' },
  { label: 'MD', value: 'md' },
  { label: 'LG', value: 'lg' },
]

const button2ColorOptions = [
  { label: '紫色（预设）', value: 'purple' },
  { label: '橙色（预设）', value: 'orange' },
  { label: '绿色（预设）', value: 'green' },
  { label: '蓝色（预设）', value: 'blue' },
  { label: '自定义', value: 'custom' },
]

const layoutSurfaceOptions = [
  { label: '无', value: 'none' },
  { label: '柔和', value: 'soft' },
  { label: '强调', value: 'strong' },
]

const layoutPresetOptions = [
  { label: '侧栏布局', value: 'aside' },
  { label: '上下布局', value: 'stacked' },
  { label: '卡片网格', value: 'cards' },
]

const cardShadowOptions = [
  { label: '无', value: 'none' },
  { label: '轻', value: 'sm' },
  { label: '中', value: 'md' },
]

const cardInteractiveOptions = [
  { label: '无', value: 'none' },
  { label: 'Hover', value: 'hover' },
  { label: 'Press', value: 'press' },
]

type Button2Variant = 'solid' | 'soft' | 'outline'
type Button2Size = 'sm' | 'md' | 'lg'
type Button2ColorMode = 'purple' | 'orange' | 'green' | 'blue' | 'custom'

interface Button2PlaygroundState {
  variant: Button2Variant
  size: Button2Size
  colorMode: Button2ColorMode
  customColor: string
  radius: string
  width: string
  height: string
  padding: string
  fontSize: string
  label: string
}

const button2Playground = ref<Button2PlaygroundState>({
  variant: 'solid',
  size: 'md',
  colorMode: 'purple',
  customColor: '#8b5cf6',
  radius: '18px',
  width: '',
  height: '',
  padding: '',
  fontSize: '',
  label: '预览按钮',
})

const button2ResolvedColor = computed(() =>
  button2Playground.value.colorMode === 'custom'
    ? button2Playground.value.customColor
    : button2Playground.value.colorMode,
)

const button2UsageCode = computed(() => {
  const attrs: string[] = []

  if (button2Playground.value.variant !== 'solid') attrs.push(`variant="${button2Playground.value.variant}"`)
  if (button2Playground.value.size !== 'md') attrs.push(`size="${button2Playground.value.size}"`)

  if (button2Playground.value.colorMode === 'custom') {
    attrs.push(`color="${button2Playground.value.customColor}"`)
  } else {
    attrs.push(`color="${button2Playground.value.colorMode}"`)
  }

  if (button2Playground.value.radius) attrs.push(`radius="${button2Playground.value.radius}"`)
  if (button2Playground.value.width) attrs.push(`width="${button2Playground.value.width}"`)
  if (button2Playground.value.height) attrs.push(`height="${button2Playground.value.height}"`)
  if (button2Playground.value.padding) attrs.push(`padding="${button2Playground.value.padding}"`)
  if (button2Playground.value.fontSize) attrs.push(`font-size="${button2Playground.value.fontSize}"`)

  const attrText = attrs.length ? ` ${attrs.join(' ')}` : ''
  return `<Button2${attrText}>${button2Playground.value.label}</Button2>`
})

const button2SfcCode = computed(() => {
  return `<script setup lang="ts">
import Button2 from './components/Button2.vue'
<\/script>

<template>
  ${button2UsageCode.value}
</template>
`
})

const button2MainTsCode = computed(() => {
  return `import { createApp } from 'vue'
import './style/global.css'
import App from './App.vue'

createApp(App).mount('#app')
`
})

const copyButton2Code = async () => {
  try {
    await navigator.clipboard.writeText(button2SfcCode.value)
  } catch {
    return
  }
}

type LayoutSurfaceTone = 'none' | 'soft' | 'strong'
type LayoutPreset = 'aside' | 'stacked' | 'cards'

type CardSurfaceTone = 'none' | 'soft' | 'strong'
type CardShadow = 'none' | 'sm' | 'md'
type CardInteractive = 'none' | 'hover' | 'press'

interface LayoutPlaygroundState {
  preset: LayoutPreset
  surface: LayoutSurfaceTone
  bordered: boolean
  radius: string
  padding: string

  containerMaxWidth: string

  stackGap: string
  flexGap: string

  gridMin: string
  gridGap: string
}

const layoutPlayground = ref<LayoutPlaygroundState>({
  preset: 'aside',
  surface: 'soft',
  bordered: true,
  radius: '18px',
  padding: '18px',

  containerMaxWidth: '980px',

  stackGap: '14px',
  flexGap: '12px',

  gridMin: '160px',
  gridGap: '12px',
})

const layoutUsageCode = computed(() => {
  const containerAttrs: string[] = []

  if (layoutPlayground.value.containerMaxWidth) {
    containerAttrs.push(`max-width="${layoutPlayground.value.containerMaxWidth}"`)
  }

  if (layoutPlayground.value.surface !== 'none') containerAttrs.push(`surface="${layoutPlayground.value.surface}"`)
  if (layoutPlayground.value.bordered) containerAttrs.push('bordered')
  if (layoutPlayground.value.radius) containerAttrs.push(`radius="${layoutPlayground.value.radius}"`)
  if (layoutPlayground.value.padding) containerAttrs.push(`padding="${layoutPlayground.value.padding}"`)

  const containerText = containerAttrs.length ? ` ${containerAttrs.join(' ')}` : ''
  const asideWidth = layoutPlayground.value.gridMin || '160px'
  const flexGap = layoutPlayground.value.flexGap || '12px'
  const gridGap = layoutPlayground.value.gridGap || '12px'

  const preset = layoutPlayground.value.preset

  if (preset === 'stacked') {
    return `<Container${containerText}>
  <Stack gap="${layoutPlayground.value.stackGap}">
    <div class="layout-skeleton-header">Header</div>
    <div class="layout-skeleton-main">Main</div>
    <div class="layout-skeleton-footer">Footer</div>
  </Stack>
</Container>`
  }

  if (preset === 'cards') {
    return `<Container${containerText}>
  <Stack gap="${layoutPlayground.value.stackGap}">
    <div class="layout-skeleton-header">Topbar</div>
    <Flex justify="between" gap="${flexGap}">
      <div class="layout-skeleton-chip">Filter</div>
      <div class="layout-skeleton-chip">Sort</div>
      <div class="layout-skeleton-chip">Action</div>
    </Flex>
    <div class="layout-skeleton-cards" style="gap: ${gridGap};">
      <div class="layout-skeleton-card">Card</div>
      <div class="layout-skeleton-card">Card</div>
      <div class="layout-skeleton-card">Card</div>
      <div class="layout-skeleton-card">Card</div>
    </div>
  </Stack>
</Container>`
  }

  return `<Container${containerText}>
  <Flex align="stretch" gap="${flexGap}">
    <div class="layout-skeleton-aside" style="width: ${asideWidth};">Aside</div>
    <Stack class="layout-skeleton-right" gap="${layoutPlayground.value.stackGap}">
      <div class="layout-skeleton-header">Header</div>
      <div class="layout-skeleton-main">Main</div>
      <div class="layout-skeleton-footer">Footer</div>
    </Stack>
  </Flex>
</Container>`
})

const layoutSfcCode = computed(() => {
  return `<script setup lang="ts">
import Container from './components/layout/Container.vue'
import Stack from './components/layout/Stack.vue'
import Flex from './components/layout/Flex.vue'
<\/script>

<template>
  ${layoutUsageCode.value}
</template>`
})

const copyLayoutCode = async () => {
  try {
    await navigator.clipboard.writeText(layoutSfcCode.value)
  } catch {
    return
  }
}

interface CardPlaygroundState {
  surface: CardSurfaceTone
  bordered: boolean
  radius: string
  padding: string
  shadow: CardShadow
  interactive: CardInteractive
  title: string
  subtitle: string
  body: string
}

const cardPlaygroundCards = ref<CardPlaygroundState[]>([
  {
    surface: 'strong',
    bordered: true,
    radius: '18px',
    padding: '',
    shadow: 'sm',
    interactive: 'none',
    title: '基础卡片',
    subtitle: 'Default',
    body: '用于展示信息的基础容器。',
  },
  {
    surface: 'soft',
    bordered: true,
    radius: '18px',
    padding: '',
    shadow: 'md',
    interactive: 'hover',
    title: '悬浮卡片',
    subtitle: 'Hover',
    body: '鼠标移入会有更明显的浮起效果。',
  },
  {
    surface: 'none',
    bordered: true,
    radius: '18px',
    padding: '',
    shadow: 'none',
    interactive: 'press',
    title: '按压反馈',
    subtitle: 'Press',
    body: '按下时会有轻微缩放/位移的交互反馈。',
  },
])

const activeCardIndex = ref(0)

const activeCard = computed<CardPlaygroundState>(() => {
  return cardPlaygroundCards.value[Math.max(0, Math.min(activeCardIndex.value, cardPlaygroundCards.value.length - 1))]
})

const cardIndexOptions = computed(() =>
  cardPlaygroundCards.value.map((_, idx) => ({
    label: `卡片 ${idx + 1}`,
    value: String(idx),
  })),
)

const activeCardIndexModel = computed({
  get: () => String(activeCardIndex.value),
  set: (v: string) => {
    const next = Number(v)
    activeCardIndex.value = Number.isFinite(next) ? next : 0
  },
})

const addCard = () => {
  const base: CardPlaygroundState = {
    ...activeCard.value,
    title: `自定义卡片 ${cardPlaygroundCards.value.length + 1}`,
    subtitle: 'Custom',
  }
  cardPlaygroundCards.value.push(base)
  activeCardIndex.value = cardPlaygroundCards.value.length - 1
}

const removeActiveCard = () => {
  if (cardPlaygroundCards.value.length <= 1) return
  cardPlaygroundCards.value.splice(activeCardIndex.value, 1)
  activeCardIndex.value = Math.max(0, Math.min(activeCardIndex.value, cardPlaygroundCards.value.length - 1))
}

const cardUsageCode = computed(() => {
  const blocks = cardPlaygroundCards.value
    .map((c) => {
      const attrs: string[] = []

      if (c.surface !== 'none') attrs.push(`surface="${c.surface}"`)
      if (c.bordered) attrs.push('bordered')
      if (c.radius) attrs.push(`radius="${c.radius}"`)
      if (c.padding) attrs.push(`padding="${c.padding}"`)
      if (c.shadow !== 'sm') attrs.push(`shadow="${c.shadow}"`)
      if (c.interactive !== 'none') attrs.push(`interactive="${c.interactive}"`)

      const attrText = attrs.length ? ` ${attrs.join(' ')}` : ''
      return `<Card${attrText}>
  <CardHeader title="${c.title}" subtitle="${c.subtitle}" />
  <CardBody>
    ${c.body}
  </CardBody>
</Card>`
    })
    .join('\n\n')

  return `<Stack gap="12px">\n${blocks.replaceAll('\n', '\n  ')}\n</Stack>`
})

const cardSfcCode = computed(() => {
  return `<script setup lang="ts">
import Card from './components/Card.vue'
import CardHeader from './components/CardHeader.vue'
import CardBody from './components/CardBody.vue'
import CardFooter from './components/CardFooter.vue'
import Stack from './components/layout/Stack.vue'
<\/script>

<template>
  ${cardUsageCode.value}
</template>`
})

const copyCardCode = async () => {
  try {
    await navigator.clipboard.writeText(cardSfcCode.value)
  } catch {
    return
  }
}

interface IconPlaygroundState {
  scriptUrl: string
  name: string
  size: string
  color: string
  rotate: string
  spin: boolean
}

const iconPlayground = ref<IconPlaygroundState>({
  scriptUrl: '//at.alicdn.com/t/c/font_5142790_3fc9joii8pv.js',
  name: 'icon-GitHub',
  size: '22px',
  color: 'currentColor',
  rotate: '0',
  spin: false,
})

const iconRotateNumber = computed(() => {
  const n = Number(iconPlayground.value.rotate)
  return Number.isFinite(n) ? n : 0
})

const iconUsageCode = computed(() => {
  const attrs: string[] = []

  attrs.push(`type="symbol"`)
  if (iconPlayground.value.scriptUrl) attrs.push(`script-url="${iconPlayground.value.scriptUrl}"`)
  if (iconPlayground.value.name) attrs.push(`name="${iconPlayground.value.name}"`)
  if (iconPlayground.value.size) attrs.push(`size="${iconPlayground.value.size}"`)
  if (iconPlayground.value.color) attrs.push(`color="${iconPlayground.value.color}"`)
  if (iconRotateNumber.value) attrs.push(`:rotate="${iconRotateNumber.value}"`)
  if (iconPlayground.value.spin) attrs.push('spin')

  const attrText = attrs.length ? ` ${attrs.join(' ')}` : ''
  return `<Icon${attrText} />`
})

const iconSfcCode = computed(() => {
  return `<script setup lang="ts">
import Icon from './components/Icon.vue'
<\/script>

<template>
  ${iconUsageCode.value}
</template>`
})

const copyIconCode = async () => {
  try {
    await navigator.clipboard.writeText(iconSfcCode.value)
  } catch {
    return
  }
}
</script>

<template>
  <main class="showcase-page" data-theme="lavender">
    <section class="glass-card p-7 md:p-10">
      <div class="mb-7 flex flex-wrap items-center gap-3">
        <Badge variant="solid">CinyuVerse UI</Badge>
        <Badge variant="soft" pulse>动画中</Badge>
        <Badge variant="outline">可主题化</Badge>
      </div>

      <h1 class="mb-3 text-3xl font-extrabold tracking-tight md:text-4xl">{{ t('app.title') }}</h1>
      <p class="mb-8 max-w-2xl text-sm leading-relaxed text-[var(--text-muted)] md:text-base">
        {{ t('app.subtitle') }}
      </p>

      <div class="mb-8 grid gap-4 md:grid-cols-3">
        <div class="space-y-2">
          <div class="text-xs font-semibold text-[var(--text-muted)]">{{ t('common.language') }}</div>
          <Select v-model="localeModel" :options="localeOptions" />
        </div>
      </div>

      <article class="mt-7 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
          <h2 class="text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            {{ t('section.button2') }}
          </h2>
          <div class="text-xs text-[var(--text-muted)]">{{ t('section.button2.hint') }}</div>
        </div>

        <div class="grid gap-5 lg:grid-cols-3">
          <div class="space-y-4 lg:col-span-2">
            <div class="grid gap-4 md:grid-cols-2">
              <div class="space-y-2">
                <div class="text-xs font-semibold text-[var(--text-muted)]">
                  {{ t('field.variant') }}
                  <span class="ml-1 font-normal text-[var(--text-muted)]/80">Variant</span>
                </div>
                <Select v-model="button2Playground.variant" :options="button2VariantOptions" />
              </div>
              <div class="space-y-2">
                <div class="text-xs font-semibold text-[var(--text-muted)]">
                  {{ t('field.size') }}
                  <span class="ml-1 font-normal text-[var(--text-muted)]/80">Size</span>
                </div>
                <Select v-model="button2Playground.size" :options="button2SizeOptions" />
              </div>
            </div>

            <div class="grid gap-4 md:grid-cols-3">
              <div class="space-y-2">
                <div class="text-xs font-semibold text-[var(--text-muted)]">
                  {{ t('field.color') }}
                  <span class="ml-1 font-normal text-[var(--text-muted)]/80">Color</span>
                </div>
                <Select v-model="button2Playground.colorMode" :options="button2ColorOptions" />
              </div>
              <div v-if="button2Playground.colorMode === 'custom'" class="space-y-2">
                <div class="text-xs font-semibold text-[var(--text-muted)]">{{ t('field.custom_color') }}</div>
                <div class="flex items-center gap-3">
                  <input v-model="button2Playground.customColor" type="color"
                    class="h-10 w-12 cursor-pointer rounded-lg border border-[var(--border)] bg-transparent" />
                  <input v-model="button2Playground.customColor" type="text"
                    class="h-10 w-full rounded-xl border border-[var(--border)] bg-transparent px-3 text-sm" />
                </div>
              </div>
              <div class="space-y-2">
                <div class="text-xs font-semibold text-[var(--text-muted)]">{{ t('field.radius') }}</div>
                <input v-model="button2Playground.radius" type="text" placeholder="例如：18px / 999px / 1rem"
                  class="h-10 w-full rounded-xl border border-[var(--border)] bg-transparent px-3 text-sm" />
              </div>
            </div>

            <div class="grid gap-4 md:grid-cols-4">
              <div class="space-y-2">
                <div class="text-xs font-semibold text-[var(--text-muted)]">{{ t('field.width') }}</div>
                <input v-model="button2Playground.width" type="text" placeholder="例如：180px"
                  class="h-10 w-full rounded-xl border border-[var(--border)] bg-transparent px-3 text-sm" />
              </div>
              <div class="space-y-2">
                <div class="text-xs font-semibold text-[var(--text-muted)]">{{ t('field.height') }}</div>
                <input v-model="button2Playground.height" type="text" placeholder="例如：44px"
                  class="h-10 w-full rounded-xl border border-[var(--border)] bg-transparent px-3 text-sm" />
              </div>
              <div class="space-y-2 md:col-span-2">
                <div class="text-xs font-semibold text-[var(--text-muted)]">{{ t('field.padding') }}</div>
                <input v-model="button2Playground.padding" type="text" placeholder="例如：14px 26px / 0 22px"
                  class="h-10 w-full rounded-xl border border-[var(--border)] bg-transparent px-3 text-sm" />
              </div>
            </div>

            <div class="grid gap-4 md:grid-cols-2">
              <div class="space-y-2">
                <div class="text-xs font-semibold text-[var(--text-muted)]">{{ t('field.font_size') }}</div>
                <input v-model="button2Playground.fontSize" type="text" placeholder="例如：16px"
                  class="h-10 w-full rounded-xl border border-[var(--border)] bg-transparent px-3 text-sm" />
              </div>
              <div class="space-y-2">
                <div class="text-xs font-semibold text-[var(--text-muted)]">{{ t('field.label') }}</div>
                <input v-model="button2Playground.label" type="text"
                  class="h-10 w-full rounded-xl border border-[var(--border)] bg-transparent px-3 text-sm" />
              </div>
            </div>

            <div class="flex flex-wrap items-center justify-between gap-3">
              <button type="button"
               class="cmp-btn2 cmp-btn2--soft"
                @click="copyButton2Code">
                {{ t('common.copy') }}
              </button>
            </div>

            <details class="rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] p-4">
              <summary class="cursor-pointer text-sm font-semibold text-[var(--text-muted)]">{{ t('common.preview') }}</summary>
              <div class="mt-3 space-y-3">
                <div>
                  <div class="mb-2 text-xs font-semibold text-[var(--text-muted)]">{{ t('common.example_component') }}</div>
                  <pre
                    class="overflow-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs leading-relaxed text-[var(--text)]"><code>{{ button2SfcCode }}</code></pre>
                </div>
                <div>
                  <div class="mb-2 text-xs font-semibold text-[var(--text-muted)]">{{ t('common.entry_styles') }}</div>
                  <pre
                    class="overflow-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs leading-relaxed text-[var(--text)]"><code>{{ button2MainTsCode }}</code></pre>
                </div>
              </div>
            </details>
          </div>

          <div
            class="flex flex-col justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] p-5">
            <div class="flex flex-wrap items-center gap-x-4 gap-y-4">
              <Button2 :variant="button2Playground.variant" :size="button2Playground.size" :color="button2ResolvedColor"
                :radius="button2Playground.radius || undefined" :width="button2Playground.width || undefined"
                :height="button2Playground.height || undefined" :padding="button2Playground.padding || undefined"
                :font-size="button2Playground.fontSize || undefined">
                {{ button2Playground.label }}
              </Button2>
              <div class="w-full" />
              <Button2 :variant="button2Playground.variant" :size="button2Playground.size" shape="pill"
                :color="button2ResolvedColor" :radius="button2Playground.radius || undefined">
                Pill
              </Button2>
              <Button2 :variant="button2Playground.variant" :size="button2Playground.size" shape="square"
                :color="button2ResolvedColor" :radius="button2Playground.radius || undefined">
                Square
              </Button2>
              <Button2 :variant="button2Playground.variant" :size="button2Playground.size" shape="circle"
                :color="button2ResolvedColor" :radius="button2Playground.radius || undefined">
                ★
              </Button2>
              <Button2 variant="outline" :size="button2Playground.size" :color="button2ResolvedColor"
                :radius="button2Playground.radius || undefined">
                Outline
              </Button2>
            </div>
          </div>
        </div>
      </article>

      <article class="mt-7 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
          <h2 class="text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            {{ t('section.layout') }}
          </h2>
          <div class="text-xs text-[var(--text-muted)]">{{ t('section.layout.hint') }}</div>
        </div>

        <div class="space-y-5">
          <div class="space-y-4">
            <div class="grid gap-4 md:grid-cols-3">
              <div class="space-y-2">
                <div class="text-xs font-semibold text-[var(--text-muted)]">
                  {{ t('layout.field.surface') }}
                  <span class="ml-1 font-normal text-[var(--text-muted)]/80">Surface</span>
                </div>
                <Select v-model="layoutPlayground.surface" :options="layoutSurfaceOptions" />
              </div>
              <div class="space-y-2">
                <div class="text-xs font-semibold text-[var(--text-muted)]">
                  {{ t('layout.field.preset') }}
                  <span class="ml-1 font-normal text-[var(--text-muted)]/80">Preset</span>
                </div>
                <Select v-model="layoutPlayground.preset" :options="layoutPresetOptions" />
              </div>
              <div class="space-y-2">
                <div class="text-xs font-semibold text-[var(--text-muted)]">{{ t('field.radius') }}</div>
                <input v-model="layoutPlayground.radius" type="text" placeholder="例如：18px / 1rem"
                  class="h-10 w-full rounded-xl border border-[var(--border)] bg-transparent px-3 text-sm" />
              </div>
            </div>

            <div class="grid gap-4 md:grid-cols-3">
              <div class="space-y-2">
                <div class="text-xs font-semibold text-[var(--text-muted)]">{{ t('layout.field.max_width') }}</div>
                <input v-model="layoutPlayground.containerMaxWidth" type="text" placeholder="例如：980px"
                  class="h-10 w-full rounded-xl border border-[var(--border)] bg-transparent px-3 text-sm" />
              </div>
              <div class="flex items-end">
                <label class="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                  <input v-model="layoutPlayground.bordered" type="checkbox" class="h-4 w-4" />
                  <span>{{ t('layout.field.border') }}</span>
                </label>
              </div>
            </div>

            <div class="grid gap-4 md:grid-cols-3">
              <div class="space-y-2">
                <div class="text-xs font-semibold text-[var(--text-muted)]">{{ t('layout.field.stack_gap') }}</div>
                <input v-model="layoutPlayground.stackGap" type="text" placeholder="例如：14px"
                  class="h-10 w-full rounded-xl border border-[var(--border)] bg-transparent px-3 text-sm" />
              </div>
              <div class="space-y-2">
                <div class="text-xs font-semibold text-[var(--text-muted)]">{{ t('layout.field.flex_gap') }}</div>
                <input v-model="layoutPlayground.flexGap" type="text" placeholder="例如：12px"
                  class="h-10 w-full rounded-xl border border-[var(--border)] bg-transparent px-3 text-sm" />
              </div>
              <div class="space-y-2">
                <div class="text-xs font-semibold text-[var(--text-muted)]">{{ t('layout.field.grid_min') }}</div>
                <input v-model="layoutPlayground.gridMin" type="text" placeholder="例如：160px"
                  class="h-10 w-full rounded-xl border border-[var(--border)] bg-transparent px-3 text-sm" />
              </div>
            </div>

            <div class="grid gap-4 md:grid-cols-3">
              <div class="space-y-2">
                <div class="text-xs font-semibold text-[var(--text-muted)]">{{ t('layout.field.grid_gap') }}</div>
                <input v-model="layoutPlayground.gridGap" type="text" placeholder="例如：12px"
                  class="h-10 w-full rounded-xl border border-[var(--border)] bg-transparent px-3 text-sm" />
              </div>
              <div class="flex items-end justify-end">
                <button type="button" class="cmp-btn2 cmp-btn2--soft" @click="copyLayoutCode">{{ t('common.copy') }}</button>
              </div>
            </div>

            <details class="rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] p-4">
              <summary class="cursor-pointer text-sm font-semibold text-[var(--text-muted)]">{{ t('common.preview') }}</summary>
              <div class="mt-3 space-y-3">
                <div>
                  <div class="mb-2 text-xs font-semibold text-[var(--text-muted)]">{{ t('common.example_component') }}</div>
                  <pre
                    class="overflow-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs leading-relaxed text-[var(--text)]"><code>{{ layoutSfcCode }}</code></pre>
                </div>
              </div>
            </details>
          </div>

          <div class="rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] p-5">
            <Container :max-width="layoutPlayground.containerMaxWidth || undefined" :surface="layoutPlayground.surface"
              :bordered="layoutPlayground.bordered" :radius="layoutPlayground.radius || undefined"
              :padding="layoutPlayground.padding || undefined">
              <div class="layout-skeleton-stage">
                <template v-if="layoutPlayground.preset === 'stacked'">
                  <Stack :gap="layoutPlayground.stackGap || undefined" height="100%">
                    <div class="layout-skeleton-header">Header</div>
                    <div class="layout-skeleton-main">Main</div>
                    <div class="layout-skeleton-footer">Footer</div>
                  </Stack>
                </template>
                <template v-else-if="layoutPlayground.preset === 'cards'">
                  <Stack :gap="layoutPlayground.stackGap || undefined" height="100%">
                    <div class="layout-skeleton-header">Topbar</div>
                    <Flex justify="between" :gap="layoutPlayground.gridGap || undefined">
                      <div class="layout-skeleton-chip">Filter</div>
                      <div class="layout-skeleton-chip">Sort</div>
                      <div class="layout-skeleton-chip">Action</div>
                    </Flex>
                    <div class="layout-skeleton-cards" :style="{ gap: layoutPlayground.gridGap || '12px' }">
                      <div class="layout-skeleton-card">Card</div>
                      <div class="layout-skeleton-card">Card</div>
                      <div class="layout-skeleton-card">Card</div>
                      <div class="layout-skeleton-card">Card</div>
                    </div>
                  </Stack>
                </template>
                <template v-else>
                  <Flex align="stretch" :gap="layoutPlayground.gridGap || undefined" width="100%" height="100%">
                    <div class="layout-skeleton-aside" :style="{ width: layoutPlayground.gridMin || '160px' }">Aside</div>
                    <Stack class="layout-skeleton-right" :gap="layoutPlayground.stackGap || undefined" height="100%">
                      <div class="layout-skeleton-header">Header</div>
                      <div class="layout-skeleton-main">Main</div>
                      <div class="layout-skeleton-footer">Footer</div>
                    </Stack>
                  </Flex>
                </template>
              </div>
            </Container>
          </div>
        </div>
      </article>

      <article class="mt-7 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
          <h2 class="text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            {{ t('section.card') }}
          </h2>
          <div class="text-xs text-[var(--text-muted)]">{{ t('section.card.hint') }}</div>
        </div>

        <div class="space-y-5">
          <div class="space-y-4">
            <div class="grid gap-4 md:grid-cols-3">
              <div class="space-y-2">
                <div class="text-xs font-semibold text-[var(--text-muted)]">{{ t('card.field.edit') }}</div>
                <Select v-model="activeCardIndexModel" :options="cardIndexOptions" />
              </div>
              <div class="flex items-end gap-3 md:col-span-2">
                <button type="button" class="cmp-btn2 cmp-btn2--soft" @click="addCard">{{ t('card.action.add') }}</button>
                <button type="button" class="cmp-btn2 cmp-btn2--soft" @click="removeActiveCard">{{ t('card.action.remove') }}</button>
              </div>
            </div>

            <div class="grid gap-4 md:grid-cols-3">
              <div class="space-y-2">
                <div class="text-xs font-semibold text-[var(--text-muted)]">{{ t('card.field.surface') }}</div>
                <Select v-model="activeCard.surface" :options="layoutSurfaceOptions" />
              </div>
              <div class="space-y-2">
                <div class="text-xs font-semibold text-[var(--text-muted)]">{{ t('card.field.shadow') }}</div>
                <Select v-model="activeCard.shadow" :options="cardShadowOptions" />
              </div>
              <div class="space-y-2">
                <div class="text-xs font-semibold text-[var(--text-muted)]">{{ t('card.field.interactive') }}</div>
                <Select v-model="activeCard.interactive" :options="cardInteractiveOptions" />
              </div>
            </div>

            <div class="grid gap-4 md:grid-cols-3">
              <div class="space-y-2">
                <div class="text-xs font-semibold text-[var(--text-muted)]">{{ t('field.radius') }}</div>
                <input v-model="activeCard.radius" type="text" placeholder="例如：18px / 1rem"
                  class="h-10 w-full rounded-xl border border-[var(--border)] bg-transparent px-3 text-sm" />
              </div>
              <div class="space-y-2">
                <div class="text-xs font-semibold text-[var(--text-muted)]">{{ t('field.padding') }}</div>
                <input v-model="activeCard.padding" type="text" :placeholder="t('card.placeholder.padding')"
                  class="h-10 w-full rounded-xl border border-[var(--border)] bg-transparent px-3 text-sm" />
              </div>
              <div class="flex items-end">
                <label class="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                  <input v-model="activeCard.bordered" type="checkbox" class="h-4 w-4" />
                  <span>{{ t('card.field.border') }}</span>
                </label>
              </div>
            </div>

            <div class="grid gap-4 md:grid-cols-2">
              <div class="space-y-2">
                <div class="text-xs font-semibold text-[var(--text-muted)]">{{ t('card.field.title') }}</div>
                <input v-model="activeCard.title" type="text"
                  class="h-10 w-full rounded-xl border border-[var(--border)] bg-transparent px-3 text-sm" />
              </div>
              <div class="space-y-2">
                <div class="text-xs font-semibold text-[var(--text-muted)]">{{ t('card.field.subtitle') }}</div>
                <input v-model="activeCard.subtitle" type="text"
                  class="h-10 w-full rounded-xl border border-[var(--border)] bg-transparent px-3 text-sm" />
              </div>
            </div>

            <div class="space-y-2">
              <div class="text-xs font-semibold text-[var(--text-muted)]">{{ t('card.field.body') }}</div>
              <textarea v-model="activeCard.body" rows="3"
                class="w-full resize-none rounded-xl border border-[var(--border)] bg-transparent px-3 py-2 text-sm" />
            </div>

            <div class="flex items-center justify-end">
              <button type="button" class="cmp-btn2 cmp-btn2--soft" @click="copyCardCode">{{ t('common.copy') }}</button>
            </div>

            <details class="rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] p-4">
              <summary class="cursor-pointer text-sm font-semibold text-[var(--text-muted)]">{{ t('common.preview') }}</summary>
              <div class="mt-3 space-y-3">
                <div>
                  <div class="mb-2 text-xs font-semibold text-[var(--text-muted)]">{{ t('common.example_component') }}</div>
                  <pre
                    class="overflow-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs leading-relaxed text-[var(--text)]"><code>{{ cardSfcCode }}</code></pre>
                </div>
              </div>
            </details>
          </div>

          <div class="rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] p-5">
            <div class="card-demo-grid">
              <Card v-for="(c, idx) in cardPlaygroundCards" :key="idx" :surface="c.surface" :bordered="c.bordered"
                :radius="c.radius || undefined" :padding="c.padding || undefined" :shadow="c.shadow"
                :interactive="c.interactive" width="100%">
                <CardHeader :title="c.title" :subtitle="c.subtitle" />
                <CardBody>
                  <div class="card-demo-body">{{ c.body }}</div>
                </CardBody>
              </Card>
            </div>
          </div>
        </div>
      </article>

      <article class="mt-7 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
          <h2 class="text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            {{ t('section.icon') }}
          </h2>
          <div class="text-xs text-[var(--text-muted)]">{{ t('section.icon.hint') }}</div>
        </div>

        <div class="space-y-5">
          <div class="space-y-4">
            <div class="grid gap-4 md:grid-cols-2">
              <div class="space-y-2">
                <div class="text-xs font-semibold text-[var(--text-muted)]">{{ t('icon.field.script_url') }}</div>
                <input v-model="iconPlayground.scriptUrl" type="text" placeholder="//at.alicdn.com/t/c/font_xxx.js"
                  class="h-10 w-full rounded-xl border border-[var(--border)] bg-transparent px-3 text-sm" />
              </div>
              <div class="space-y-2">
                <div class="text-xs font-semibold text-[var(--text-muted)]">{{ t('icon.field.name') }}</div>
                <input v-model="iconPlayground.name" type="text" placeholder="例如：icon-github"
                  class="h-10 w-full rounded-xl border border-[var(--border)] bg-transparent px-3 text-sm" />
              </div>
            </div>

            <div class="grid gap-4 md:grid-cols-4">
              <div class="space-y-2">
                <div class="text-xs font-semibold text-[var(--text-muted)]">{{ t('icon.field.size') }}</div>
                <input v-model="iconPlayground.size" type="text" placeholder="例如：22px / 1.2rem"
                  class="h-10 w-full rounded-xl border border-[var(--border)] bg-transparent px-3 text-sm" />
              </div>
              <div class="space-y-2">
                <div class="text-xs font-semibold text-[var(--text-muted)]">{{ t('icon.field.color') }}</div>
                <input v-model="iconPlayground.color" type="text" placeholder="currentColor / #8b5cf6"
                  class="h-10 w-full rounded-xl border border-[var(--border)] bg-transparent px-3 text-sm" />
              </div>
              <div class="space-y-2">
                <div class="text-xs font-semibold text-[var(--text-muted)]">{{ t('icon.field.rotate') }}</div>
                <input v-model="iconPlayground.rotate" type="text" placeholder="例如：0 / 90"
                  class="h-10 w-full rounded-xl border border-[var(--border)] bg-transparent px-3 text-sm" />
              </div>
              <div class="flex items-end">
                <label class="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                  <input v-model="iconPlayground.spin" type="checkbox" class="h-4 w-4" />
                  <span>{{ t('icon.field.spin') }}</span>
                </label>
              </div>
            </div>

            <div class="flex items-center justify-end">
              <button type="button" class="cmp-btn2 cmp-btn2--soft" @click="copyIconCode">{{ t('common.copy') }}</button>
            </div>

            <details class="rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] p-4">
              <summary class="cursor-pointer text-sm font-semibold text-[var(--text-muted)]">{{ t('common.preview') }}</summary>
              <div class="mt-3 space-y-3">
                <div>
                  <div class="mb-2 text-xs font-semibold text-[var(--text-muted)]">{{ t('common.example_component') }}</div>
                  <pre
                    class="overflow-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs leading-relaxed text-[var(--text)]"><code>{{ iconSfcCode }}</code></pre>
                </div>
              </div>
            </details>
          </div>

          <div class="rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] p-5">
            <div class="icon-demo-grid">
              <div class="icon-demo-tile">
                <Icon type="symbol" :script-url="iconPlayground.scriptUrl" name="icon-GitHub" size="22px" />
                <div class="icon-demo-label">{{ t('icon.label.github') }}</div>
              </div>
              <div class="icon-demo-tile">
                <Icon type="symbol" :script-url="iconPlayground.scriptUrl" name="icon-bilibili" size="22px" />
                <div class="icon-demo-label">{{ t('icon.label.bilibili') }}</div>
              </div>
              <div class="icon-demo-tile">
                <Icon type="symbol" :script-url="iconPlayground.scriptUrl" name="icon-wangyiyunyinle" size="22px" />
                <div class="icon-demo-label">{{ t('icon.label.music') }}</div>
              </div>
              <div class="icon-demo-tile">
                <Icon type="symbol" :script-url="iconPlayground.scriptUrl" name="icon-boke" size="22px" />
                <div class="icon-demo-label">{{ t('icon.label.blog') }}</div>
              </div>
            </div>
          </div>
        </div>
      </article>
    </section>
  </main>
</template>

<style scoped>
.layout-skeleton-aside,
.layout-skeleton-header,
.layout-skeleton-main,
.layout-skeleton-footer {
  border: 1px solid var(--border);
  color: color-mix(in oklab, var(--text) 72%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 750;
  letter-spacing: 0.02em;
}

.layout-skeleton-stage {
  height: 260px;
}

.layout-skeleton-aside {
  height: 100%;
  min-height: 220px;
  border-radius: 14px;
  background: color-mix(in oklab, var(--theme-soft) 80%, transparent);
}

.layout-skeleton-right {
  min-width: 0;
  height: 100%;
  width: 100%;
  flex: 1 1 auto;
}

.layout-skeleton-header {
  width: 100%;
  height: 56px;
  border-radius: 14px;
  background: color-mix(in oklab, var(--theme-soft) 72%, transparent);
}

.layout-skeleton-chip {
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0.35rem 0.65rem;
  font-weight: 750;
  background: color-mix(in oklab, var(--surface) 90%, transparent);
  color: color-mix(in oklab, var(--text) 72%, transparent);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 78px;
}

.layout-skeleton-cards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  flex: 1 1 auto;
  min-height: 0;
}

.layout-skeleton-card {
  border: 1px solid var(--border);
  border-radius: 14px;
  background: color-mix(in oklab, var(--surface) 92%, transparent);
  color: color-mix(in oklab, var(--text) 72%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 72px;
  font-weight: 800;
  letter-spacing: 0.02em;
}

.layout-skeleton-main {
  width: 100%;
  min-height: 132px;
  border-radius: 14px;
  background: color-mix(in oklab, var(--surface) 88%, transparent);
  flex: 1 1 auto;
  min-height: 0;
}

.layout-skeleton-footer {
  width: 100%;
  height: 56px;
  border-radius: 14px;
  background: color-mix(in oklab, var(--theme-soft) 72%, transparent);
}

.card-demo-body {
  color: var(--text-muted);
  font-size: 0.9rem;
  line-height: 1.6;
}

.card-demo-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.icon-demo-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.icon-demo-tile {
  border: 1px solid var(--border);
  border-radius: 16px;
  background: color-mix(in oklab, var(--surface) 92%, transparent);
  padding: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.icon-demo-label {
  font-size: 0.8rem;
  color: var(--text-muted);
  font-weight: 650;
}

@media (max-width: 1024px) {
  .icon-demo-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 1024px) {
  .card-demo-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .card-demo-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
