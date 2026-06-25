<script setup lang="ts">
import { onMounted } from 'vue'
import { Puzzle } from 'lucide-vue-next'
import PanelShell from '@/components/layouts/PanelShell.vue'
import { useExtensionMarketplace } from '@/features/extensions/composables/useExtensionMarketplace'

const {
  query,
  results,
  installed,
  searching,
  busy,
  error,
  listTab,
  installFromVsix,
  installFromMarketplace,
  refreshInstalled,
} = useExtensionMarketplace()

onMounted(refreshInstalled)
</script>

<template>
  <PanelShell title="扩展" subtitle="Marketplace">
    <template #actions>
      <button type="button" class="ext-btn" :disabled="busy" @click="installFromVsix">
        从 VSIX 安装…
      </button>
    </template>

    <template #toolbar>
      <div class="ext-toolbar">
        <input v-model="query" type="search" class="ext-input" placeholder="搜索扩展…" />
        <div class="ext-tabs">
          <button
            type="button"
            class="ext-tab"
            :class="{ active: listTab === 'marketplace' }"
            @click="listTab = 'marketplace'"
          >
            市场
          </button>
          <button
            type="button"
            class="ext-tab"
            :class="{ active: listTab === 'installed' }"
            @click="listTab = 'installed'"
          >
            已安装 ({{ installed.length }})
          </button>
        </div>
        <div v-if="searching" class="ext-meta">搜索中…</div>
      </div>
    </template>

    <template v-if="error" #alert>
      <div class="ext-error">{{ error }}</div>
    </template>

    <div v-if="listTab === 'marketplace'" class="ext-list">
      <div v-if="!query.trim()" class="ext-empty">输入关键词搜索 Open VSX 扩展市场</div>
      <button
        v-for="r in results"
        :key="`${r.namespace}.${r.name}`"
        type="button"
        class="ext-item"
        :disabled="busy"
        @click="installFromMarketplace(r)"
      >
        <Puzzle :size="16" class="ext-icon" />
        <div class="ext-info">
          <div class="ext-name">{{ r.displayName ?? r.name }}</div>
          <div class="ext-pub">{{ r.namespace }} · v{{ r.version }}</div>
          <div v-if="r.description" class="ext-desc">{{ r.description }}</div>
        </div>
      </button>
    </div>

    <div v-else class="ext-list">
      <div v-if="installed.length === 0" class="ext-empty">暂无已安装扩展</div>
      <div v-for="e in installed" :key="e.id" class="ext-item static">
        <Puzzle :size="16" class="ext-icon" />
        <div class="ext-info">
          <div class="ext-name">{{ e.displayName }}</div>
          <div class="ext-pub">{{ e.publisher }} · v{{ e.version }}</div>
        </div>
      </div>
    </div>
  </PanelShell>
</template>

<style scoped>
.ext-btn {
  padding: 2px 8px;
  font-size: 10px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-input);
  color: var(--text-sub);
  cursor: pointer;
}
.ext-btn:hover:not(:disabled) { border-color: var(--accent); }
.ext-btn:disabled { opacity: 0.5; }
.ext-toolbar {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
}
.ext-input {
  width: 100%;
  padding: 6px 8px;
  font-size: 11px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-input);
  color: var(--text-main);
  margin-bottom: 6px;
}
.ext-tabs {
  display: flex;
  gap: 4px;
}
.ext-tab {
  flex: 1;
  padding: 4px;
  font-size: 10px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}
.ext-tab.active {
  background: var(--bg-hover);
  color: var(--text-main);
  border-color: var(--accent);
}
.ext-meta {
  margin-top: 4px;
  font-size: 10px;
  color: var(--text-muted);
}
.ext-error {
  padding: 6px 12px;
  font-size: 11px;
  color: var(--danger);
}
.ext-list {
  padding: 4px 0;
}
.ext-empty {
  padding: 16px 12px;
  font-size: 11px;
  color: var(--text-muted);
  text-align: center;
}
.ext-item {
  display: flex;
  gap: 10px;
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
  color: inherit;
}
.ext-item:hover:not(:disabled) { background: var(--bg-hover); }
.ext-item.static { cursor: default; }
.ext-icon {
  flex-shrink: 0;
  color: var(--accent);
  margin-top: 2px;
}
.ext-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-main);
}
.ext-pub {
  font-size: 10px;
  color: var(--text-muted);
}
.ext-desc {
  font-size: 10px;
  color: var(--text-sub);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
</style>
