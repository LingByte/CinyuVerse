<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { MessageSquare, Plus, Trash2, MessagesSquare } from 'lucide-vue-next'
import { Message, Modal } from '@arco-design/web-vue'
import { useRoute, useRouter } from 'vue-router'
import { listNovels } from '@/api/novels'
import type { Novel } from '@/types/novel'
import { useInspirationStore } from '@/stores/inspiration'

const route = useRoute()
const router = useRouter()
const store = useInspirationStore()

const novels = ref<Novel[]>([])
const pickNovelId = ref<number | undefined>(undefined)
const novelOptions = computed(() =>
  novels.value.map((n) => ({ label: n.title || `小说 #${n.id}`, value: n.id })),
)

const activeId = computed(() => {
  if (route.name !== 'inspiration-session') {
    return ''
  }
  const raw = route.params.sessionId
  const id = Array.isArray(raw) ? raw[0] : raw
  return typeof id === 'string' && id ? id : ''
})

onMounted(() => {
  void store.refreshSessions()
  void listNovels({ page: 1, size: 100 })
    .then((res) => {
      novels.value = res.novels
    })
    .catch(() => {
      /* ignore */
    })
})

function isActive(id: string) {
  return activeId.value === id
}

function openThread(id: string) {
  void router.push({ name: 'inspiration-session', params: { sessionId: id } })
}

async function onNewChat() {
  try {
    const nid = pickNovelId.value
    const title =
      nid && novels.value.find((n) => n.id === nid)
        ? `灵感 · ${novels.value.find((n) => n.id === nid)!.title}`
        : '新对话'
    const s = await store.createBackendSession(title, nid)
    await router.push({ name: 'inspiration-session', params: { sessionId: String(s.id) } })
  } catch (e) {
    Message.error(String((e as Error)?.message || e))
  }
}

function onDelete(id: string, title: string, ev: MouseEvent) {
  ev.stopPropagation()
  Modal.confirm({
    title: '删除会话',
    content: `确定删除「${title}」？不可恢复。`,
    okText: '删除',
    async onOk() {
      await store.removeBackendSession(id)
      if (activeId.value === id) {
        await router.replace({ name: 'inspiration-root' })
      }
    },
  })
}
</script>

<template>
  <aside class="insp-sidebar">
    <div class="insp-sidebar__brand">
      <MessageSquare :size="18" :stroke-width="1.75" class="insp-sidebar__icon" />
      <span>会话</span>
    </div>
    <div class="insp-sidebar__new-wrap">
      <a-select
        v-model="pickNovelId"
        allow-clear
        placeholder="可选：绑定小说再开聊"
        :options="novelOptions"
        class="insp-sidebar__novel-pick"
      />
      <a-button type="primary" class="insp-sidebar__new" :loading="store.listLoading" @click="onNewChat">
        <template #icon>
          <Plus :size="16" :stroke-width="1.75" />
        </template>
        新对话
      </a-button>
    </div>
    <div class="insp-sidebar__list">
      <a-spin v-if="store.listLoading && !store.sortedThreads.length" class="insp-sidebar__spin" />
      <div
        v-for="t in store.sortedThreads"
        :key="t.id"
        class="insp-sidebar__row"
        :class="{ 'is-active': isActive(t.id) }"
        @click="openThread(t.id)"
      >
        <MessagesSquare :size="15" :stroke-width="1.75" class="insp-sidebar__row-icon" />
        <span class="insp-sidebar__item" :title="t.title">
          {{ t.title }}
          <a-tag v-if="t.novelId" size="small" class="insp-sidebar__novel-tag">书</a-tag>
        </span>
        <a-button
          type="text"
          size="mini"
          class="insp-sidebar__del"
          @click="onDelete(t.id, t.title, $event)"
        >
          <template #icon>
            <Trash2 :size="14" :stroke-width="1.75" />
          </template>
        </a-button>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.insp-sidebar {
  width: 260px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--color-border-2);
  background: var(--color-bg-2);
  height: 100%;
  min-height: 0;
  min-width: 0;
  box-sizing: border-box;
}
.insp-sidebar__brand {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 14px 12px;
  font-weight: 600;
  font-size: 14px;
  color: var(--color-text-1);
}
.insp-sidebar__icon {
  color: rgb(var(--primary-6));
  flex-shrink: 0;
}
.insp-sidebar__row-icon {
  flex-shrink: 0;
  color: var(--color-text-3);
}
.insp-sidebar__row.is-active .insp-sidebar__row-icon {
  color: rgb(var(--primary-6));
}
.insp-sidebar__new-wrap {
  flex-shrink: 0;
  width: 100%;
  padding: 0 12px 12px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.insp-sidebar__novel-pick {
  width: 100%;
}
.insp-sidebar__new {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}
.insp-sidebar__new :deep(.arco-btn) {
  width: 100%;
  max-width: 100%;
  justify-content: center;
}
.insp-sidebar__list {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0 8px 12px;
  min-height: 0;
}
.insp-sidebar__spin {
  display: flex;
  justify-content: center;
  padding: 24px 0;
}
.insp-sidebar__row {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 4px;
  padding: 4px 4px 4px 8px;
  border-radius: 8px;
  cursor: pointer;
}
.insp-sidebar__row:hover {
  background: var(--color-fill-2);
}
.insp-sidebar__row.is-active {
  background: var(--color-primary-light-1);
}
.insp-sidebar__item {
  flex: 1;
  min-width: 0;
  padding: 6px 0;
  font-size: 13px;
  color: var(--color-text-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.insp-sidebar__row.is-active .insp-sidebar__item {
  color: rgb(var(--primary-6));
  font-weight: 500;
}
.insp-sidebar__del {
  flex-shrink: 0;
  color: var(--color-text-3);
}
.insp-sidebar__del:hover {
  color: rgb(var(--danger-6));
}
</style>
