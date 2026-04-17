<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import img1 from '@/assets/501w-J3ROJDQ_2cw.webp'
import img2 from '@/assets/63816781-19e0-43e8-9eae-02a3170ead549129645.jpg'
import img3 from '@/assets/canva-r9EhyrpvJY4.jpg'
import img4 from '@/assets/OIP-C (1).webp'
import img5 from '@/assets/OIP-C (2).webp'
import img6 from '@/assets/OIP-C (3).webp'
import img7 from '@/assets/OIP-C (4).webp'
import img8 from '@/assets/OIP-C.webp'
withDefaults(
  defineProps<{
    asBackground?: boolean
    showOverlay?: boolean
  }>(),
  {
    asBackground: false,
    showOverlay: true,
  },
)

type FloatingItem = {
  id: number
  src: string
  depth: number
  top: string
  left: string
  width: string
  height: string
}

const items: FloatingItem[] = [
  { id: 1, src: img1, depth: 0.5, top: '8%', left: '11%', width: 'clamp(110px, 15vw, 175px)', height: 'clamp(110px, 15vw, 175px)' },
  { id: 2, src: img2, depth: 1, top: '10%', left: '32%', width: 'clamp(130px, 17vw, 205px)', height: 'clamp(130px, 17vw, 205px)' },
  { id: 3, src: img3, depth: 2, top: '2%', left: '53%', width: 'clamp(150px, 20vw, 240px)', height: 'clamp(175px, 24vw, 285px)' },
  { id: 4, src: img4, depth: 1, top: '0%', left: '83%', width: 'clamp(135px, 18vw, 215px)', height: 'clamp(135px, 18vw, 215px)' },
  { id: 5, src: img5, depth: 1, top: '40%', left: '2%', width: 'clamp(140px, 19vw, 225px)', height: 'clamp(140px, 19vw, 225px)' },
  { id: 6, src: img6, depth: 4, top: '73%', left: '15%', width: 'clamp(160px, 22vw, 255px)', height: 'clamp(190px, 27vw, 310px)' },
  { id: 7, src: img7, depth: 1, top: '80%', left: '50%', width: 'clamp(135px, 18vw, 215px)', height: 'clamp(135px, 18vw, 215px)' },
  { id: 8, src: img8, depth: 2, top: '70%', left: '77%', width: 'clamp(150px, 20vw, 235px)', height: 'clamp(170px, 24vw, 270px)' },
]

const containerRef = ref<HTMLElement | null>(null)
const mouse = ref({ x: 0, y: 0 })
const transforms = ref<Record<number, string>>({})
let frameId: number | null = null

const onPointerMove = (event: MouseEvent) => {
  const rect = containerRef.value?.getBoundingClientRect()
  if (!rect) return
  mouse.value = { x: event.clientX - rect.left, y: event.clientY - rect.top }
}

const animate = () => {
  const rect = containerRef.value?.getBoundingClientRect()
  if (!rect) {
    frameId = window.requestAnimationFrame(animate)
    return
  }

  const cx = rect.width / 2
  const cy = rect.height / 2
  const dx = mouse.value.x - cx
  const dy = mouse.value.y - cy

  const next: Record<number, string> = {}
  items.forEach((item) => {
    const strength = item.depth / 22
    // 轻微透视旋转，让悬浮层看起来更“3D”
    const rx = Math.max(-10, Math.min(10, (-dy * strength) / 80))
    const ry = Math.max(-10, Math.min(10, (dx * strength) / 80))
    next[item.id] = `translate3d(${(dx * strength).toFixed(2)}px, ${(dy * strength).toFixed(2)}px, 0) rotateX(${rx.toFixed(
      2,
    )}deg) rotateY(${ry.toFixed(2)}deg)`
  })
  transforms.value = next
  frameId = window.requestAnimationFrame(animate)
}

onMounted(() => {
  window.addEventListener('mousemove', onPointerMove)
  frameId = window.requestAnimationFrame(animate)
})

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onPointerMove)
  if (frameId != null) window.cancelAnimationFrame(frameId)
})
</script>

<template>
  <section ref="containerRef" class="pf" :class="{ 'pf--bg': asBackground }">
    <div v-if="showOverlay" class="pf__overlay">
      <p class="pf__brand">fancy.</p>
      <button type="button" class="pf__btn">Download</button>
    </div>

    <div class="pf__layer">
      <div
        v-for="item in items"
        :key="item.id"
        class="pf__item"
        :style="{ top: item.top, left: item.left, width: item.width, height: item.height, transform: transforms[item.id] ?? 'translate3d(0,0,0)' }"
      >
        <img :src="item.src" alt="" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.pf {
  position: relative;
  width: min(1080px, 100%);
  height: clamp(380px, 62vh, 680px);
  min-height: 0;
  border-radius: clamp(16px, 2.2vw, 22px);
  overflow: hidden;
  background: #020617;
}

.pf--bg {
  width: 100%;
  height: 100%;
  min-height: 0;
  border-radius: 0;
  background: transparent;
}
.pf__overlay {
  position: absolute;
  inset: 0;
  z-index: 4;
  display: grid;
  place-content: center;
  gap: clamp(10px, 1.8vh, 14px);
  text-align: center;
}
.pf__brand {
  margin: 0;
  color: #fff;
  font-size: clamp(46px, 7vw, 86px);
  font-style: italic;
  font-weight: 700;
}
.pf__btn {
  justify-self: center;
  border: 0;
  border-radius: 999px;
  padding: clamp(7px, 1.2vh, 8px) clamp(14px, 2vw, 18px);
  background: #fff;
  color: #111827;
  font-weight: 700;
  font-size: clamp(12px, 1.6vw, 14px);
}
.pf__layer {
  position: absolute;
  inset: 0;
  perspective: 900px;
}
.pf__item {
  position: absolute;
  will-change: transform;
  transition: transform 0.18s linear;
  transform-style: preserve-3d;
  cursor: pointer;
}
.pf__item::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 6px;
  background: rgba(2, 6, 23, 0.22);
  opacity: 0;
  transition: opacity 160ms ease;
  pointer-events: none;
  z-index: 1;
}
.pf__item::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -10%;
  width: 90%;
  height: 24%;
  transform: translateX(-50%);
  background: radial-gradient(ellipse at center, rgba(2, 6, 23, 0.35), rgba(2, 6, 23, 0) 70%);
  filter: blur(10px);
  opacity: 0.85;
  pointer-events: none;
  z-index: -1;
}
.pf__item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 6px;
  box-shadow:
    0 30px 70px -44px rgba(2, 6, 23, 0.42),
    0 12px 35px -20px rgba(2, 6, 23, 0.28),
    0 1px 0 rgba(255, 255, 255, 0.08) inset;
  border: 1px solid rgba(226, 232, 240, 0.22);
  opacity: 1;
  filter: saturate(1.22) contrast(1.1) brightness(1.04);
  transform: scale(1);
  transform-origin: center;
  transition:
    transform 160ms ease,
    box-shadow 220ms ease,
    filter 220ms ease;
  position: relative;
  z-index: 0;
}

.pf__item:hover::before {
  opacity: 1;
}
.pf__item:hover img {
  transform: scale(1.035);
  filter: saturate(1.15) contrast(1.08) brightness(0.98);
  box-shadow:
    0 38px 90px -48px rgba(2, 6, 23, 0.58),
    0 18px 46px -24px rgba(2, 6, 23, 0.44),
    0 1px 0 rgba(255, 255, 255, 0.1) inset;
}
</style>
