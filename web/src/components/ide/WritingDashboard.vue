<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useWritingStatsStore } from '@/stores/writingStatsStore'
import type { WordStats } from '@/api/ide'

const props = defineProps<{
  visible: boolean
  workspaceId: string | null
  stats: WordStats | null
}>()

const emit = defineEmits<{ close: [] }>()

const writingStats = useWritingStatsStore()
const targetInput = ref(writingStats.targetWords)

watch(() => props.visible, (v) => {
  if (v && props.workspaceId) {
    writingStats.load(props.workspaceId)
    targetInput.value = writingStats.targetWords
  }
})

const todayWords = computed(() => {
  const today = new Date().toISOString().slice(0, 10)
  return writingStats.dailyStats.find((d) => d.date === today)?.words ?? 0
})

function applyTarget() {
  writingStats.setTarget(targetInput.value)
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="dashboard-overlay" @click.self="emit('close')">
      <div class="dashboard">
        <div class="dash-header">
          <h3>写作数据看板</h3>
          <button class="close-btn" @click="emit('close')">×</button>
        </div>

        <div v-if="stats" class="dash-grid">
          <div class="stat-card">
            <div class="stat-val">{{ stats.total_words.toLocaleString() }}</div>
            <div class="stat-label">总字数</div>
          </div>
          <div class="stat-card">
            <div class="stat-val">{{ stats.body_words.toLocaleString() }}</div>
            <div class="stat-label">有效正文</div>
          </div>
          <div class="stat-card">
            <div class="stat-val">{{ todayWords.toLocaleString() }}</div>
            <div class="stat-label">今日新增</div>
          </div>
          <div class="stat-card">
            <div class="stat-val">{{ stats.target_progress.toFixed(1) }}%</div>
            <div class="stat-label">目标进度</div>
          </div>
        </div>

        <div class="target-row">
          <label>目标字数</label>
          <input v-model.number="targetInput" type="number" class="target-input" />
          <button class="apply-btn" @click="applyTarget">应用</button>
        </div>

        <div v-if="stats" class="progress-bar">
          <div class="progress-fill" :style="{ width: stats.target_progress + '%' }" />
        </div>

        <div v-if="stats?.volume_stats?.length" class="vol-list">
          <div v-for="v in stats.volume_stats" :key="v.volume_id" class="vol-row">
            <span>{{ v.title }}</span>
            <span>{{ v.total_words.toLocaleString() }} 字 · {{ v.chapters.length }} 章</span>
          </div>
        </div>

        <div v-if="writingStats.dailyStats.length" class="chart-section">
          <div class="chart-title">近 {{ writingStats.dailyStats.length }} 日创作</div>
          <div class="mini-chart">
            <div
              v-for="d in writingStats.dailyStats.slice(-14)"
              :key="d.date"
              class="bar-wrap"
              :title="d.date + ': ' + d.words + '字'"
            >
              <div
                class="bar"
                :style="{ height: Math.min(100, d.words / 50) + '%' }"
              />
              <span class="bar-label">{{ d.date.slice(5) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.dashboard-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.45);
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dashboard {
  width: min(520px, 92vw);
  max-height: 80vh;
  overflow-y: auto;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 20px;
  color: var(--text-main);
}

.dash-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.dash-header h3 { margin: 0; font-size: 16px; }
.close-btn {
  border: none;
  background: none;
  font-size: 20px;
  cursor: pointer;
  color: var(--text-sub);
}

.dash-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin-bottom: 16px;
}

.stat-card {
  background: var(--bg-secondary);
  border-radius: 8px;
  padding: 12px;
  text-align: center;
}
.stat-val { font-size: 22px; font-weight: 700; color: var(--accent); }
.stat-label { font-size: 11px; color: var(--text-sub); margin-top: 4px; }

.target-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 12px;
}
.target-input {
  flex: 1;
  padding: 5px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-input);
  color: var(--text-main);
}
.apply-btn {
  padding: 5px 12px;
  border: none;
  border-radius: 4px;
  background: var(--accent);
  color: #fff;
  cursor: pointer;
  font-size: 12px;
}

.progress-bar {
  height: 6px;
  background: var(--bg-secondary);
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 16px;
}
.progress-fill {
  height: 100%;
  background: var(--accent);
  transition: width 0.3s;
}

.vol-list { margin-bottom: 16px; }
.vol-row {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  font-size: 12px;
  border-bottom: 1px solid var(--border);
  color: var(--text-secondary);
}

.chart-title { font-size: 12px; color: var(--text-sub); margin-bottom: 8px; }
.mini-chart {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  height: 80px;
}
.bar-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
  justify-content: flex-end;
}
.bar {
  width: 100%;
  min-height: 2px;
  background: var(--accent);
  border-radius: 2px 2px 0 0;
  opacity: 0.8;
}
.bar-label {
  font-size: 8px;
  color: var(--text-muted);
  margin-top: 2px;
}
</style>
