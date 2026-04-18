<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Message } from '@arco-design/web-vue'
import { inspirationLastSessionKey } from '@/composables/inspirationStorage'
import { createChatSession, listChatSessions } from '@/api/ai/sessions'

const router = useRouter()

onMounted(async () => {
  try {
    const { sessions } = await listChatSessions({ page: 1, size: 50 })
    const last = localStorage.getItem(inspirationLastSessionKey)
    if (last) {
      const nid = Number(last)
      if (Number.isFinite(nid) && sessions.some((s) => s.id === nid)) {
        await router.replace({ name: 'inspiration-session', params: { sessionId: last } })
        return
      }
    }
    if (sessions.length > 0) {
      const sid = String(sessions[0]!.id)
      localStorage.setItem(inspirationLastSessionKey, sid)
      await router.replace({ name: 'inspiration-session', params: { sessionId: sid } })
      return
    }
    const s = await createChatSession({ title: '新对话' })
    const sid = String(s.id)
    localStorage.setItem(inspirationLastSessionKey, sid)
    await router.replace({ name: 'inspiration-session', params: { sessionId: sid } })
  } catch (e) {
    console.error(e)
    Message.error(`进入灵感中心失败：${String((e as Error)?.message || e)}`)
    await router.replace({ name: 'home' })
  }
})
</script>

<template>
  <div class="insp-gate">
    <a-spin dot />
    <span class="insp-gate__t">正在进入会话…</span>
  </div>
</template>

<style scoped>
.insp-gate {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 200px;
  color: var(--color-text-3);
  font-size: 13px;
}
</style>
