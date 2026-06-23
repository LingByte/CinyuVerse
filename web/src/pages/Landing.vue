<script setup lang="ts">
import Button from '@/components/Button.vue'
import ParallaxFloatingPreview from '@/components/fancy/image/ParallaxFloatingPreview.vue'

const emit = defineEmits<{
  (e: 'goChat'): void
  (e: 'enterIde'): void
}>()
</script>

<template>
  <main class="landing">
    <div class="landing__bg">
      <ParallaxFloatingPreview as-background :show-overlay="false" />
    </div>
    <div class="landing__container">
      <section class="hero">
        <h1 class="hero__title">
          你的 <span class="hero__accent">AI 驱动</span> 小说创作
          <br />
          工作台
        </h1>
        <p class="hero__subtitle">
          CinyuVerse 是新一代 AI 小说编辑器，集创作、续写、润色于一体。
        </p>

        <div class="hero__cta">
          <Button variant="soft" shape="square" size="lg" radius="14px" padding="14px 36px" @click="emit('enterIde')">进入编辑器</Button>
        </div>

        <div class="hero__hint">
          已有 <span class="hero__hint-accent">30,000+</span> 创作者信赖
        </div>
      </section>

      <section class="brands" aria-label="支持的模型">
        <div class="brands__item">通义千问</div>
        <div class="brands__item">文心一言</div>
        <div class="brands__item">Gemini</div>
        <div class="brands__item">DeepSeek</div>
        <div class="brands__item">月之暗面</div>
        <div class="brands__item">Meta</div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.landing {
  position: relative;
  min-height: 100vh;
  background: var(--bg-primary);
  color: var(--text-main);
  padding: clamp(18px, 3.2vw, 28px) clamp(14px, 2.2vw, 18px);
  overflow: hidden;
}

.landing__bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  opacity: 1;
}

.landing__container {
  position: relative;
  z-index: 1;
  min-height: calc(100vh - 56px);
  max-width: 980px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: clamp(26px, 4.8vh, 42px);
  text-align: center;
}

.hero {
  max-width: 720px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.hero__title {
  margin: 0;
  font-size: clamp(34px, 4.4vw, 52px);
  line-height: 1.06;
  font-weight: 950;
  letter-spacing: -0.03em;
  color: var(--text-main);
}

.hero__accent {
  background: linear-gradient(90deg, var(--accent), #a78bfa);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.hero__subtitle {
  margin: clamp(12px, 2.2vh, 18px) 0 0;
  max-width: 560px;
  font-size: clamp(13px, 1.35vw, 14px);
  line-height: 1.7;
  color: var(--text-sub);
}

.hero__cta {
  margin-top: clamp(14px, 2.6vh, 22px);
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  justify-content: center;
}

.hero__hint {
  margin-top: clamp(10px, 1.8vh, 14px);
  font-size: clamp(11px, 1.15vw, 12px);
  color: var(--text-muted);
}

.hero__hint-accent {
  color: var(--accent);
  font-weight: 800;
}

.brands {
  width: 100%;
  max-width: 900px;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: clamp(12px, 2.6vw, 22px);
  opacity: 0.55;
}

.brands__item {
  font-size: clamp(16px, 2.2vw, 22px);
  font-weight: 750;
  letter-spacing: -0.02em;
  color: var(--text-muted);
}

@media (max-width: 520px) {
  .landing__container {
    min-height: calc(100vh - 40px);
  }
  .hero__title {
    line-height: 1.08;
    letter-spacing: -0.02em;
  }
  .brands {
    opacity: 0.5;
  }
}
</style>
