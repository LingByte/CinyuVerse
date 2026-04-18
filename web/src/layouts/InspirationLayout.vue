<script setup lang="ts">
import { IconLeft } from '@arco-design/web-vue/es/icon'
import { useRouter } from 'vue-router'
import InspirationSessionSidebar from '@/components/inspiration/InspirationSessionSidebar.vue'

const router = useRouter()

function backToWorkspace() {
  void router.push({ name: 'home' })
}
</script>

<template>
  <div class="inspiration-layout">
    <header class="inspiration-layout__top">
      <a-button type="text" class="inspiration-layout__back" @click="backToWorkspace">
        <template #icon>
          <IconLeft />
        </template>
        返回工作台
      </a-button>
      <div class="inspiration-layout__title">灵感中心</div>
      <div class="inspiration-layout__top-right">
        <a-tag size="small" color="arcoblue">Beta</a-tag>
      </div>
    </header>
    <div class="inspiration-layout__body">
      <InspirationSessionSidebar />
      <main class="inspiration-layout__main">
        <router-view />
      </main>
    </div>
  </div>
</template>

<style scoped>
.inspiration-layout {
  height: 100%;
  min-height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-fill-1);
}
.inspiration-layout__top {
  flex-shrink: 0;
  height: 52px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 16px;
  border-bottom: 1px solid var(--color-border-2);
  background: var(--color-bg-2);
}
.inspiration-layout__back {
  color: var(--color-text-2);
}
.inspiration-layout__title {
  flex: 1;
  font-weight: 600;
  font-size: 15px;
  color: var(--color-text-1);
}
.inspiration-layout__top-right {
  flex-shrink: 0;
}
.inspiration-layout__body {
  flex: 1 1 0;
  display: flex;
  flex-direction: row;
  align-items: stretch;
  min-height: 0;
}
.inspiration-layout__main {
  flex: 1 1 0;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
</style>
