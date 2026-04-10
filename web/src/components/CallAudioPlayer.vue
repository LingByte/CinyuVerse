<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

interface Props {
  callId: string
  audioUrl: string
  hasAudio: boolean
  durationSeconds: number | null
}

const props = defineProps<Props>()

const audioRef = ref<HTMLAudioElement | null>(null)
const waveformRef = ref<HTMLDivElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const isPlaying = ref(false)
const currentTime = ref(0)
const isLoading = ref(false)
const error = ref<string | null>(null)
const waveformData = ref<number[]>([])

const duration = computed(() => props.durationSeconds ?? 0)
const progress = computed(() => (duration.value > 0 ? (currentTime.value / duration.value) * 100 : 0))
const fallbackWave = computed(() => Array.from({ length: 100 }, () => 50))
const waveBars = computed(() => (waveformData.value.length ? waveformData.value : fallbackWave.value))

const formatTime = (seconds: number) => {
  const minute = Math.floor(seconds / 60)
  const sec = Math.floor(seconds % 60)
  return `${minute}:${String(sec).padStart(2, '0')}`
}

const generateWaveform = async () => {
  const audio = audioRef.value
  if (!audio || !audio.src || !props.hasAudio) return

  try {
    if ((props.durationSeconds ?? 0) > 120) {
      waveformData.value = Array.from(
        { length: 180 },
        (_, i) => 35 + Math.sin((i / 100) * Math.PI * 6) * 15 + Math.random() * 10,
      )
      return
    }

    const response = await fetch(audio.src)
    const arrayBuffer = await response.arrayBuffer()
    const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) throw new Error('AudioContext is not supported')
    const audioContext = new AudioCtx()
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
    const rawData = audioBuffer.getChannelData(0)
    const samples = 180
    const blockSize = Math.max(1, Math.floor(rawData.length / samples))
    const filteredData: number[] = []

    for (let i = 0; i < samples; i += 1) {
      const blockStart = blockSize * i
      let sum = 0
      for (let j = 0; j < blockSize; j += 1) {
        sum += Math.abs(rawData[blockStart + j] ?? 0)
      }
      filteredData.push(sum / blockSize)
    }

    const max = Math.max(...filteredData, 1)
    waveformData.value = filteredData.map((n) => (n / max) * 100)
    void audioContext.close()
  } catch {
    waveformData.value = Array.from({ length: 180 }, () => Math.random() * 80 + 20)
  }
}

const drawWaveform = () => {
  const canvas = canvasRef.value
  if (!canvas) return

  const dpr = window.devicePixelRatio || 1
  const width = canvas.clientWidth
  const height = canvas.clientHeight

  canvas.width = Math.floor(width * dpr)
  canvas.height = Math.floor(height * dpr)

  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, width, height)

  const list = waveBars.value
  const barGap = 1
  const barWidth = Math.max(1, width / list.length - barGap)
  const centerY = height / 2
  const playedCount = Math.floor((progress.value / 100) * list.length)

  for (let i = 0; i < list.length; i += 1) {
    const amp = Math.max(3, (list[i] / 100) * (height * 0.38))
    const x = i * (barWidth + barGap)
    const color = i <= playedCount ? 'var(--theme-strong)' : '#cbd5e1'

    ctx.strokeStyle = color
    ctx.lineWidth = Math.max(1, barWidth)
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(x, centerY)
    ctx.quadraticCurveTo(x + barWidth * 0.5, centerY - amp, x + barWidth, centerY)
    ctx.quadraticCurveTo(x + barWidth * 0.5, centerY + amp, x, centerY)
    ctx.stroke()
  }
}

const togglePlayPause = async () => {
  const audio = audioRef.value
  if (!audio) return
  if (isPlaying.value) {
    audio.pause()
  } else {
    await audio.play()
  }
}

const onWaveformClick = async (event: MouseEvent) => {
  const audio = audioRef.value
  const waveform = waveformRef.value
  if (!audio || !waveform || !duration.value) return

  const rect = waveform.getBoundingClientRect()
  const percentage = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
  audio.currentTime = percentage * duration.value
  if (!isPlaying.value) await audio.play()
}

const bindAudioEvents = () => {
  const audio = audioRef.value
  if (!audio) return () => {}

  const onTime = () => {
    currentTime.value = audio.currentTime
  }
  const onEnd = () => {
    isPlaying.value = false
    currentTime.value = 0
  }
  const onLoad = () => {
    isLoading.value = true
    error.value = null
  }
  const onCanPlay = () => {
    isLoading.value = false
  }
  const onError = () => {
    error.value = '音频加载失败'
    isLoading.value = false
  }
  const onPlay = () => {
    isPlaying.value = true
  }
  const onPause = () => {
    isPlaying.value = false
  }

  audio.addEventListener('timeupdate', onTime)
  audio.addEventListener('ended', onEnd)
  audio.addEventListener('loadstart', onLoad)
  audio.addEventListener('canplay', onCanPlay)
  audio.addEventListener('error', onError)
  audio.addEventListener('play', onPlay)
  audio.addEventListener('pause', onPause)

  return () => {
    audio.removeEventListener('timeupdate', onTime)
    audio.removeEventListener('ended', onEnd)
    audio.removeEventListener('loadstart', onLoad)
    audio.removeEventListener('canplay', onCanPlay)
    audio.removeEventListener('error', onError)
    audio.removeEventListener('play', onPlay)
    audio.removeEventListener('pause', onPause)
  }
}

let cleanupAudioEvents = () => {}

onMounted(() => {
  cleanupAudioEvents = bindAudioEvents()
  window.addEventListener('resize', drawWaveform)
})

onBeforeUnmount(() => {
  cleanupAudioEvents()
  window.removeEventListener('resize', drawWaveform)
})

watch(
  () => [props.audioUrl, props.durationSeconds, props.hasAudio],
  async () => {
    waveformData.value = []
    currentTime.value = 0
    await generateWaveform()
  },
  { immediate: true },
)

watch([waveBars, progress], () => {
  drawWaveform()
})
</script>

<template>
  <div
    v-if="hasAudio"
    class="rounded-2xl border border-[var(--border)] bg-[color-mix(in_oklab,var(--surface)_95%,transparent)] p-3"
  >
    <div class="mb-2 flex items-center justify-between">
      <h3 class="m-0 text-sm font-extrabold">通话录音</h3>
      <div class="font-mono text-xs text-[var(--text-muted)]">
        {{ formatTime(currentTime) }} / {{ formatTime(duration) }}
      </div>
    </div>

    <audio ref="audioRef" :src="audioUrl" preload="metadata" />
    <div v-if="error" class="mb-2 text-xs text-rose-500">{{ error }}</div>

    <div class="flex items-center gap-2.5">
      <button
        type="button"
        class="size-9 rounded-full bg-slate-900 text-white transition-all duration-200 hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="isLoading"
        @click="togglePlayPause"
      >
        {{ isPlaying ? 'II' : '▶' }}
      </button>

      <div
        ref="waveformRef"
        class="relative h-12 flex-1 cursor-pointer overflow-hidden rounded-lg border border-[var(--border)] bg-[color-mix(in_oklab,var(--surface-strong)_90%,transparent)]"
        @click="onWaveformClick"
      >
        <canvas ref="canvasRef" class="absolute inset-0 z-[1] size-full" />
        <div class="absolute bottom-0 top-0 z-[2] w-0.5 bg-rose-500" :style="{ left: `${progress}%` }" />
      </div>
    </div>
  </div>
</template>
