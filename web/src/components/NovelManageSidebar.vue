<script setup lang="ts">
interface SidebarFeature {
  id: string
  label: string
  active?: boolean
  disabled?: boolean
}

const props = withDefaults(
  defineProps<{
    brand?: string
    title?: string
    hint?: string
    features?: SidebarFeature[]
  }>(),
  {
    brand: 'QinyuSpiritBook',
    title: '写作工具',
    hint: '点击中间模板卡片，右侧自动填充配置。',
    features: () => [{ id: 'ai-create', label: '小说管理', active: true, disabled: true }],
  },
)

const emit = defineEmits<{
  (e: 'toggle'): void
  (e: 'back'): void
  (e: 'feature-click', id: string): void
}>()

const onFeatureClick = (id: string, disabled?: boolean) => {
  if (disabled) return
  emit('feature-click', id)
}
</script>

<template>
  <aside class="tpl__left" aria-label="筛选">
    <div class="tpl__side-brand" :aria-label="props.brand">
      <span class="tpl__side-brand-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" class="tpl__side-brand-icon" aria-hidden="true">
          <path
            d="M6 4.5A2.5 2.5 0 0 1 8.5 2H18a2 2 0 0 1 2 2v15.5a1.5 1.5 0 0 1-2.3 1.26L14.5 19l-3.2 1.76A1.5 1.5 0 0 1 9 19.5V4.5A1.5 1.5 0 0 0 7.5 3H6v1.5z"
            fill="currentColor"
          />
        </svg>
      </span>
      <span class="tpl__side-brand-text">{{ props.brand }}</span>
      <button type="button" class="tpl__side-collapse" aria-label="收起侧边栏" @click="emit('toggle')">‹</button>
    </div>

    <div class="tpl__side-features" aria-label="写作功能">
      <div class="tpl__side-features-head">
        <div class="tpl__side-features-title">{{ props.title }}</div>
      </div>

      <button
        v-for="item in props.features"
        :key="item.id"
        type="button"
        class="tpl__side-feature"
        :class="{ 'is-active': item.active }"
        :disabled="item.disabled"
        @click="onFeatureClick(item.id, item.disabled)"
      >
        <span class="tpl__side-feature-text">{{ item.label }}</span>
      </button>
    </div>

    <div class="tpl__hint">{{ props.hint }}</div>

    <div class="tpl__side-footer">
      <button type="button" class="tpl__side-nav" @click="emit('back')">
        <span class="tpl__side-nav-dot" aria-hidden="true" />
        <span class="tpl__side-nav-label">返回对话</span>
      </button>
    </div>
  </aside>
</template>

<style scoped>
.tpl__left {
  border-right: 1px solid rgba(226, 232, 240, 0.9);
  padding: 14px 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(248, 250, 252, 0.94));
  position: fixed;
  left: 0;
  top: 0;
  height: 100vh;
  width: 240px;
  z-index: 240;
  overflow: auto;
  box-shadow: 0 28px 70px rgba(15, 23, 42, 0.18);
  backdrop-filter: blur(5px);
}

.tpl__side-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 10px;
  border-radius: 14px;
  border: 1px solid rgba(226, 232, 240, 0.85);
  background: rgba(255, 255, 255, 0.92);
}

.tpl__side-collapse {
  margin-left: auto;
  width: 30px;
  height: 30px;
  border-radius: 10px;
  border: 1px solid rgba(226, 232, 240, 0.9);
  background: rgba(255, 255, 255, 0.92);
  cursor: pointer;
  color: color-mix(in oklab, #0b1220 58%, #ffffff);
}

.tpl__side-collapse:hover {
  border-color: rgba(124, 58, 237, 0.35);
  background: rgba(237, 233, 254, 0.25);
}

.tpl__side-brand-mark {
  width: 34px;
  height: 34px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(237, 233, 254, 0.95);
  border: 1px solid rgba(124, 58, 237, 0.22);
  color: #6d28d9;
}

.tpl__side-brand-icon {
  width: 18px;
  height: 18px;
}

.tpl__side-brand-text {
  font-size: 13px;
  font-weight: 850;
  color: color-mix(in oklab, #0b1220 75%, #ffffff);
}

.tpl__side-nav {
  width: 100%;
  border: 1px solid rgba(226, 232, 240, 0.9);
  background: rgba(255, 255, 255, 0.92);
  border-radius: 14px;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  color: color-mix(in oklab, #0b1220 64%, #ffffff);
  text-align: left;
  transition: border-color 160ms ease, background 160ms ease;
}

.tpl__side-nav:hover {
  border-color: rgba(124, 58, 237, 0.35);
  background: rgba(237, 233, 254, 0.25);
}

.tpl__side-nav-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: rgba(124, 58, 237, 0.75);
  box-shadow: 0 10px 22px -16px rgba(124, 58, 237, 0.65);
}

.tpl__side-nav-label {
  font-size: 13px;
  font-weight: 750;
}

.tpl__side-footer {
  margin-top: auto;
  padding-top: 10px;
}

.tpl__side-features {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 6px;
}

.tpl__side-features-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  padding: 0 4px;
}

.tpl__side-features-title {
  font-size: 12px;
  font-weight: 850;
  color: color-mix(in oklab, #0b1220 48%, #ffffff);
}

.tpl__side-feature {
  width: 100%;
  border: 1px solid rgba(226, 232, 240, 0.9);
  background: rgba(255, 255, 255, 0.92);
  border-radius: 14px;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  color: color-mix(in oklab, #0b1220 64%, #ffffff);
  text-align: left;
  transition: border-color 160ms ease, background 160ms ease, box-shadow 160ms ease;
}

.tpl__side-feature.is-active {
  border-color: rgba(124, 58, 237, 0.45);
  background: rgba(237, 233, 254, 0.35);
  box-shadow: 0 16px 30px -24px rgba(124, 58, 237, 0.6);
}

.tpl__side-feature:disabled {
  opacity: 1;
  cursor: default;
}

.tpl__side-feature-text {
  font-size: 13px;
  font-weight: 750;
}

.tpl__hint {
  margin-top: auto;
  font-size: 12px;
  line-height: 1.4;
  color: color-mix(in oklab, #0b1220 52%, #ffffff);
  padding: 8px 8px 4px;
}
</style>
