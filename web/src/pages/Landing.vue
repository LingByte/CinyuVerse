<script setup lang="ts">
import Button from '@/components/Button.vue'
import ParallaxFloatingPreview from '@/components/fancy/image/ParallaxFloatingPreview.vue'

const emit = defineEmits<{
  (e: 'goChat'): void
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
          Your <span class="hero__accent">AI-Powered</span> study assistant with
          <br />
          Superpowers
        </h1>
        <p class="hero__subtitle">
          CinyuVerse is your study assistant for notes, summaries, and learning workflows.
        </p>

        <div class="hero__cta">
          <Button variant="soft" shape="square" size="lg" radius="14px" @click="emit('goChat')">Go to Chat</Button>
        </div>

        <div class="hero__hint">
          Trusted by <span class="hero__hint-accent">30,000+</span> learners.
        </div>
      </section>

      <section class="brands" aria-label="Supported models">
        <div class="brands__item">OpenAI</div>
        <div class="brands__item">Claude</div>
        <div class="brands__item">Gemini</div>
        <div class="brands__item">DeepSeek</div>
        <div class="brands__item">Grok</div>
        <div class="brands__item">Meta</div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.landing {
  position: relative;
  min-height: 100vh;
  background: #ffffff;
  color: var(--text);
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
  color: #0b1220;
}

.hero__accent {
  background: linear-gradient(90deg, #8b5cf6, #a78bfa);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.hero__subtitle {
  margin: clamp(12px, 2.2vh, 18px) 0 0;
  max-width: 560px;
  font-size: clamp(13px, 1.35vw, 14px);
  line-height: 1.7;
  color: color-mix(in oklab, #0b1220 48%, #ffffff);
}

.hero__cta {
  margin-top: clamp(14px, 2.6vh, 22px);
}

.hero__hint {
  margin-top: clamp(10px, 1.8vh, 14px);
  font-size: clamp(11px, 1.15vw, 12px);
  color: color-mix(in oklab, #0b1220 38%, #ffffff);
}

.hero__hint-accent {
  color: #8b5cf6;
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
  color: color-mix(in oklab, #0b1220 30%, #ffffff);
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
