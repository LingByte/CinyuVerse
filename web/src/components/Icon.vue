<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

type IconType = 'symbol' | 'font-class'

interface Props {
  type?: IconType
  name: string

  size?: string
  color?: string
  rotate?: number
  spin?: boolean

  scriptUrl?: string
  baseClass?: string
}

const props = withDefaults(defineProps<Props>(), {
  type: 'symbol',
  size: '1em',
  color: 'currentColor',
  rotate: 0,
  spin: false,
  scriptUrl: '',
  baseClass: 'iconfont',
})

const resolvedScriptUrl = computed(() => {
  if (!props.scriptUrl) return ''
  if (props.scriptUrl.startsWith('http://') || props.scriptUrl.startsWith('https://')) return props.scriptUrl
  if (props.scriptUrl.startsWith('//')) return `${window.location.protocol}${props.scriptUrl}`
  return props.scriptUrl
})

const renderKey = ref(0)

onMounted(() => {
  if (props.type !== 'symbol') return
  const url = resolvedScriptUrl.value
  if (!url) return

  const existing = document.querySelector(`script[data-iconfont-url="${url}"]`)
  if (existing) {
    window.setTimeout(() => {
      renderKey.value += 1
    }, 0)
    return
  }

  const script = document.createElement('script')
  script.src = url
  script.setAttribute('data-iconfont-url', url)
  script.async = true
  script.addEventListener('load', () => {
    renderKey.value += 1
  })
  document.body.appendChild(script)
})

const rootStyle = computed<Record<string, string>>(() => {
  const style: Record<string, string> = {}
  style.width = props.size
  style.height = props.size
  style.color = props.color

  const rotate = props.rotate ?? 0
  if (rotate !== 0) {
    style.transform = `rotate(${rotate}deg)`
  }

  return style
})

const rootClass = computed(() => {
  return ['cv-icon', props.spin ? 'cv-icon--spin' : null]
})

const symbolHref = computed(() => `#${props.name}`)

const fontClass = computed(() => {
  const base = props.baseClass ? props.baseClass.trim() : ''
  const icon = props.name ? props.name.trim() : ''
  return ['cv-icon', 'cv-icon--font', base || null, icon || null, props.spin ? 'cv-icon--spin' : null]
})
</script>

<template>
  <svg v-if="props.type === 'symbol'" :key="renderKey" :class="rootClass" :style="rootStyle" aria-hidden="true">
    <use :href="symbolHref" :xlink:href="symbolHref" />
  </svg>
  <i v-else :class="fontClass" :style="rootStyle" aria-hidden="true" />
</template>

<style scoped>
.cv-icon {
  display: inline-block;
  vertical-align: -0.125em;
  fill: currentColor;
}

.cv-icon--font {
  line-height: 1;
}

.cv-icon--spin {
  animation: cvIconSpin 1s linear infinite;
}
</style>
