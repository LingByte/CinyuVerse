<script setup lang="ts">
import Button from '@/components/Button.vue'
</script>

<template>
  <main class="landing">
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
          <Button size="lg">Go to Chat</Button>
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
  min-height: 100vh;
  background: #ffffff;
  color: var(--text);
  padding: 28px 18px;
}

.landing__container {
  min-height: calc(100vh - 56px);
  max-width: 980px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 42px;
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
  margin: 18px 0 0;
  max-width: 560px;
  font-size: 14px;
  line-height: 1.7;
  color: color-mix(in oklab, #0b1220 48%, #ffffff);
}

.hero__cta {
  margin-top: 22px;
}

.hero__hint {
  margin-top: 14px;
  font-size: 12px;
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
  gap: 22px;
  opacity: 0.55;
}

.brands__item {
  font-size: 22px;
  font-weight: 750;
  letter-spacing: -0.02em;
  color: color-mix(in oklab, #0b1220 30%, #ffffff);
}
</style>
