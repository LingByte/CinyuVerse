<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

interface Props {
  callId: string
  audioUrl: string
  hasAudio: boolean
  durationSeconds: number | null
}

const seekToPercentInWindow = async (percentage: number) => {
  const audio = audioRef.value
  if (!audio) return

  const p = Math.max(0, Math.min(1, percentage))
  const target = segmentStart.value + p * windowSeconds
  audio.currentTime = Math.max(0, Math.min(duration.value || target, target))

  if (!isPlaying.value) {
    try {
      await audio.play()
    } catch {
      return
    }
  }
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

const windowSeconds = 30
const isDragging = ref(false)

const duration = computed(() => props.durationSeconds ?? 0)
const segmentStart = computed(() => {
  if (!duration.value) return 0
  return Math.floor(currentTime.value / windowSeconds) * windowSeconds
})

const segmentProgress = computed(() => {
  const mod = ((currentTime.value % windowSeconds) + windowSeconds) % windowSeconds
  return (mod / windowSeconds) * 100
})

const progress = computed(() => segmentProgress.value)
const fallbackWave = computed(() => Array.from({ length: 100 }, () => 50))
const waveBars = computed(() => (waveformData.value.length ? waveformData.value : fallbackWave.value))

const segmentWaveBars = computed(() => {
  const list = waveBars.value
  const total = duration.value
  if (!total || !list.length) return list

  const startRatio = Math.max(0, Math.min(1, segmentStart.value / total))
  const endRatio = Math.max(0, Math.min(1, (segmentStart.value + windowSeconds) / total))

  const startIdx = Math.floor(startRatio * list.length)
  const endIdx = Math.max(startIdx + 1, Math.floor(endRatio * list.length))
  const sliced = list.slice(startIdx, endIdx)

  if (sliced.length >= list.length) return sliced

  const targetLen = list.length
  const result: number[] = []
  for (let i = 0; i < targetLen; i += 1) {
    const idx = Math.floor((i / Math.max(1, targetLen - 1)) * Math.max(0, sliced.length - 1))
    result.push(sliced[idx] ?? 50)
  }
  return result
})

const trackPaddingX = 14

const cursorLeft = computed(() => {
  const ratio = Math.max(0, Math.min(1, progress.value / 100))
  return `calc(${trackPaddingX}px + (100% - ${trackPaddingX * 2}px) * ${ratio})`
})

const canInteract = computed(() => props.hasAudio && !isLoading.value && !error.value)

const playLabel = computed(() => {
  if (isLoading.value) return '…'
  return isPlaying.value ? 'Pause' : 'Play'
})

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

  const list = segmentWaveBars.value
  const barGap = 2
  const barWidth = Math.max(2, width / list.length - barGap)
  const centerY = height / 2
  const playedCount = Math.floor((progress.value / 100) * list.length)

  for (let i = 0; i < list.length; i += 1) {
    const amp = Math.max(3, (list[i] / 100) * (height * 0.38))
    const x = i * (barWidth + barGap) + barWidth * 0.5
    const color = i <= playedCount ? '#111827' : '#cbd5e1'

    ctx.strokeStyle = color
    ctx.lineWidth = Math.max(2, barWidth)
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(x, centerY - amp)
    ctx.lineTo(x, centerY + amp)
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
  if (isDragging.value) return
  const waveform = waveformRef.value
  if (!waveform) return

  const rect = waveform.getBoundingClientRect()
  const innerWidth = Math.max(1, rect.width - trackPaddingX * 2)
  const innerX = event.clientX - rect.left - trackPaddingX
  const percentage = Math.max(0, Math.min(1, innerX / innerWidth))
  await seekToPercentInWindow(percentage)
}

const onWaveformPointerDown = async (event: PointerEvent) => {
  const waveform = waveformRef.value
  if (!waveform) return
  waveform.setPointerCapture(event.pointerId)
  isDragging.value = true

  const rect = waveform.getBoundingClientRect()
  const innerWidth = Math.max(1, rect.width - trackPaddingX * 2)
  const innerX = event.clientX - rect.left - trackPaddingX
  const percentage = Math.max(0, Math.min(1, innerX / innerWidth))
  await seekToPercentInWindow(percentage)
}

const onWaveformPointerMove = async (event: PointerEvent) => {
  if (!isDragging.value) return
  const waveform = waveformRef.value
  if (!waveform) return
  const rect = waveform.getBoundingClientRect()
  const innerWidth = Math.max(1, rect.width - trackPaddingX * 2)
  const innerX = event.clientX - rect.left - trackPaddingX
  const percentage = Math.max(0, Math.min(1, innerX / innerWidth))
  await seekToPercentInWindow(percentage)
}

const onWaveformPointerUp = () => {
  isDragging.value = false
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
    class="cv-audio-player"
  >
    <div class="cv-audio-player__header">
      <div class="cv-audio-player__title">通话录音</div>
      <div class="cv-audio-player__meta">{{ formatTime(currentTime) }} / {{ formatTime(duration) }}</div>
    </div>

    <audio ref="audioRef" :src="audioUrl" preload="metadata" />
    <div v-if="error" class="cv-audio-player__error">{{ error }}</div>

    <div class="cv-audio-player__row">
      <button
        type="button"
        class="cv-audio-player__btn"
        :class="isPlaying ? 'is-playing' : ''"
        :disabled="!canInteract"
        @click="togglePlayPause"
      >
        <span class="sr-only">{{ playLabel }}</span>
        <svg v-if="!isPlaying" viewBox="0 0 24 24" class="cv-audio-player__icon" aria-hidden="true">
          <path d="M9 8.2v7.6c0 .7.8 1.1 1.4.7l6-3.8a.9.9 0 0 0 0-1.4l-6-3.8c-.6-.4-1.4 0-1.4.7z" fill="currentColor" />
        </svg>
        <svg v-else viewBox="0 0 24 24" class="cv-audio-player__icon" aria-hidden="true">
          <path d="M8.5 7.5c0-.6.4-1 1-1h1c.6 0 1 .4 1 1v9c0 .6-.4 1-1 1h-1c-.6 0-1-.4-1-1v-9zm6 0c0-.6.4-1 1-1h1c.6 0 1 .4 1 1v9c0 .6-.4 1-1 1h-1c-.6 0-1-.4-1-1v-9z" fill="currentColor" />
        </svg>
      </button>

      <div
        ref="waveformRef"
        class="cv-audio-player__wave"
        @click="onWaveformClick"
        @pointerdown="onWaveformPointerDown"
        @pointermove="onWaveformPointerMove"
        @pointerup="onWaveformPointerUp"
        @pointercancel="onWaveformPointerUp"
      >
        <div class="cv-audio-player__track">
          <canvas ref="canvasRef" class="cv-audio-player__canvas" />
          <div class="cv-audio-player__cursor" :style="{ left: cursorLeft }" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cv-audio-player {
  border-radius: 18px;
  border: 1px solid color-mix(in oklab, var(--border) 75%, transparent);
  background: #fff;
  padding: 18px;
  box-shadow: 0 12px 28px -18px rgba(15, 23, 42, 0.25);
}

.cv-audio-player__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.cv-audio-player__title {
  font-size: 1.05rem;
  font-weight: 900;
  color: #0f172a;
}

.cv-audio-player__meta {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  font-size: 0.85rem;
  color: #64748b;
}

.cv-audio-player__error {
  margin-bottom: 10px;
  font-size: 0.75rem;
  color: #ef4444;
}

.cv-audio-player__row {
  display: flex;
  align-items: center;
  gap: 16px;
}

.cv-audio-player__btn {
  width: 72px;
  height: 72px;
  border-radius: 999px;
  border: 0;
  background: #0b0f19;
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
  z-index: 0;
  transition: transform 160ms ease, background 160ms ease, box-shadow 160ms ease;
  box-shadow: 0 18px 38px -26px rgba(2, 6, 23, 0.75);
}

.cv-audio-player__btn::before {
  content: '';
  position: absolute;
  inset: -6px;
  border-radius: 999px;
  z-index: -1;
  background: transparent;
  border: 1px solid color-mix(in oklab, var(--border) 65%, transparent);
  box-shadow: 0 0 0 0 rgba(239, 68, 68, 0);
}

.cv-audio-player__btn::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background: radial-gradient(circle at 30% 22%, rgba(255, 255, 255, 0.22), transparent 52%);
  pointer-events: none;
}

.cv-audio-player__btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 22px 40px -28px rgba(2, 6, 23, 0.65);
}

.cv-audio-player__btn:active {
  transform: translateY(0);
}

.cv-audio-player__btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.cv-audio-player__btn.is-playing {
  background: #0b0f19;
  box-shadow: 0 22px 44px -30px rgba(2, 6, 23, 0.65);
}

.cv-audio-player__btn.is-playing::before {
  animation: cv-audio-ring-pulse 1.25s ease-out infinite;
  border-color: rgba(239, 68, 68, 0.22);
}

.cv-audio-player__icon {
  width: 24px;
  height: 24px;
  position: relative;
  z-index: 1;
}

@keyframes cv-audio-ring-pulse {
  0% {
    transform: scale(1);
    opacity: 1;
    box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.20);
  }
  70% {
    transform: scale(1.18);
    opacity: 0.65;
    box-shadow: 0 0 0 14px rgba(239, 68, 68, 0.08);
  }
  100% {
    transform: scale(1.24);
    opacity: 0;
    box-shadow: 0 0 0 18px rgba(239, 68, 68, 0);
  }
}

.cv-audio-player__wave {
  position: relative;
  flex: 1;
  height: 74px;
  cursor: pointer;
  overflow: visible;
  touch-action: none;
  user-select: none;
}

.cv-audio-player__wave:active {
  cursor: grabbing;
}

.cv-audio-player__track {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 12px;
  background: #f3f4f6;
  overflow: hidden;
}

.cv-audio-player__canvas {
  position: absolute;
  inset: 10px 14px;
  z-index: 1;
  width: auto;
  height: auto;
}

.cv-audio-player__cursor {
  position: absolute;
  top: 10px;
  bottom: 10px;
  z-index: 2;
  width: 3px;
  border-radius: 2px;
  background: #ef4444;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.9);
  transform: translateX(-1.5px);
}
</style>
