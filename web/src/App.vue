<script setup lang="ts">
/**
 * 根组件：保留一层 div，保证 #app 下始终有节点（配合 base.css 高度链）。
 * 路由组件请用默认 <router-view />，勿依赖插槽里的 Component（部分环境下会为 undefined）。
 */
</script>

<template>
  <div class="app-root">
    <router-view />
  </div>
</template>

<style scoped>
.app-root {
  height: 100%;
  min-height: 100%;
  box-sizing: border-box;
}
</style>
