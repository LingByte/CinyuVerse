<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { Message, Modal } from '@arco-design/web-vue'
import { BrainCircuit, Sparkles, Eye, Music, Type, Palette, MessageSquare, Drama, Layers } from 'lucide-vue-next'
import {
  createStyleProfile,
  createStyleSample,
  deleteStyleProfile,
  deleteStyleSample,
  learnStyleProfile,
  listStyleProfiles,
  listStyleSamples,
} from '@/api/styleLearning'
import { WorkspaceBreadcrumb } from '@/components/layout'
import type { StyleProfile, StyleSample, StyleLearnedSpec, StyleAnalysis, StyleStats } from '@/types/styleLearning'

const profiles = ref<StyleProfile[]>([])
const selectedProfileId = ref<number | null>(null)
const samples = ref<StyleSample[]>([])
const loading = ref(false)
const sampleLoading = ref(false)
const learning = ref(false)
const learnedSpec = ref<StyleLearnedSpec | null>(null)

const profileForm = reactive({
  name: '',
  status: 'draft' as 'draft' | 'active' | 'archived',
  description: '',
  constraints: '',
})

const sampleForm = reactive({
  title: '',
  source: 'manual' as 'manual' | 'upload' | 'chapter',
  content: '',
})

const selectedProfile = computed(() => profiles.value.find((p) => p.id === selectedProfileId.value) || null)

const analysis = computed<StyleAnalysis | null>(() => learnedSpec.value?.analysis ?? null)
const stats = computed<StyleStats | null>(() => learnedSpec.value?.stats ?? null)

const analysisDimensions = computed(() => {
  if (!analysis.value) return []
  const a = analysis.value
  return [
    { label: '叙事视角', value: a.narrativeVoice, icon: Eye },
    { label: '行文节奏', value: a.proseRhythm, icon: Music },
    { label: '词汇风格', value: a.vocabularyLevel, icon: Type },
    { label: '修辞倾向', value: a.rhetoricTendency, icon: Palette },
    { label: '对话风格', value: a.dialogueStyle, icon: MessageSquare },
    { label: '情感基调', value: a.emotionalPalette, icon: Drama },
    { label: '结构习惯', value: a.structuralHabits, icon: Layers },
  ]
})

function parseLearnedSpec(raw?: string): StyleLearnedSpec | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as StyleLearnedSpec
  } catch {
    return null
  }
}

async function loadProfiles() {
  loading.value = true
  try {
    const res = await listStyleProfiles({ page: 1, size: 100 })
    profiles.value = res.items
    if (selectedProfileId.value && !profiles.value.some((p) => p.id === selectedProfileId.value)) {
      selectedProfileId.value = null
    }
    if (!selectedProfileId.value && profiles.value.length) {
      selectedProfileId.value = profiles.value[0]!.id
    }
  } catch (e) {
    Message.error(String((e as Error)?.message || e))
  } finally {
    loading.value = false
  }
}

async function loadSamples() {
  if (!selectedProfileId.value) {
    samples.value = []
    learnedSpec.value = null
    return
  }
  sampleLoading.value = true
  try {
    const [sampleRes, profile] = await Promise.all([
      listStyleSamples(selectedProfileId.value, { page: 1, size: 200 }),
      Promise.resolve(selectedProfile.value),
    ])
    samples.value = sampleRes.items
    learnedSpec.value = parseLearnedSpec(profile?.learnedSpec)
  } catch (e) {
    Message.error(String((e as Error)?.message || e))
  } finally {
    sampleLoading.value = false
  }
}

async function createProfile() {
  if (!profileForm.name.trim()) {
    Message.warning('档案名称必填')
    return
  }
  try {
    const created = await createStyleProfile({
      name: profileForm.name.trim(),
      status: profileForm.status,
      description: profileForm.description.trim(),
      constraints: profileForm.constraints.trim(),
    })
    selectedProfileId.value = created.id
    profileForm.name = ''
    profileForm.description = ''
    profileForm.constraints = ''
    await loadProfiles()
    await loadSamples()
    Message.success('已创建风格档案')
  } catch (e) {
    Message.error(String((e as Error)?.message || e))
  }
}

function confirmDeleteProfile(p: StyleProfile) {
  Modal.confirm({
    title: '删除风格档案',
    content: `确认删除「${p.name}」？`,
    okText: '删除',
    async onOk() {
      await deleteStyleProfile(p.id)
      Message.success('已删除')
      await loadProfiles()
      await loadSamples()
    },
  })
}

async function addSample() {
  if (!selectedProfileId.value) {
    Message.warning('请先选择风格档案')
    return
  }
  if (!sampleForm.content.trim()) {
    Message.warning('样本文本必填')
    return
  }
  try {
    await createStyleSample(selectedProfileId.value, {
      title: sampleForm.title.trim(),
      source: sampleForm.source,
      content: sampleForm.content.trim(),
    })
    sampleForm.title = ''
    sampleForm.content = ''
    await loadSamples()
    Message.success('样本已添加')
  } catch (e) {
    Message.error(String((e as Error)?.message || e))
  }
}

function confirmDeleteSample(s: StyleSample) {
  Modal.confirm({
    title: '删除样本',
    content: `确认删除样本「${s.title || s.id}」？`,
    okText: '删除',
    async onOk() {
      await deleteStyleSample(s.id)
      await loadSamples()
      Message.success('已删除样本')
    },
  })
}

async function runLearn() {
  if (!selectedProfileId.value) {
    Message.warning('请先选择风格档案')
    return
  }
  learning.value = true
  try {
    const res = await learnStyleProfile(selectedProfileId.value)
    learnedSpec.value = (res.spec as StyleLearnedSpec) ?? null
    await loadProfiles()
    Message.success('风格学习完成')
  } catch (e) {
    Message.error(String((e as Error)?.message || e))
  } finally {
    learning.value = false
  }
}

onMounted(async () => {
  await loadProfiles()
  await loadSamples()
})
</script>

<template>
  <div class="style-learning">
    <WorkspaceBreadcrumb :trail="[{ label: '小说管理', to: { name: 'home' } }, { label: '风格学习' }]" />
    <a-card :bordered="false" class="style-learning__head">
      <h2 class="style-learning__title">
        <BrainCircuit :size="20" :stroke-width="1.75" />
        风格学习模块
      </h2>
      <p class="style-learning__desc">添加作品样本，通过 LLM 深度分析写作风格，生成可注入创作的风格指令。</p>
    </a-card>
    <a-row :gutter="16">
      <!-- 左栏：档案列表 -->
      <a-col :span="6" :xs="24" :md="6">
        <a-card title="风格档案" :bordered="false" class="style-learning__card">
          <a-spin :loading="loading">
            <a-list :data="profiles">
              <template #item="{ item }">
                <a-list-item
                  class="style-learning__profile-item"
                  :class="{ 'style-learning__profile-item--active': item.id === selectedProfileId }"
                  @click="
                    () => {
                      selectedProfileId = item.id
                      loadSamples()
                    }
                  "
                >
                  <a-list-item-meta :title="item.name">
                    <template #description>
                      <a-tag :color="item.status === 'active' ? 'green' : item.status === 'archived' ? 'gray' : 'blue'" size="small">{{ item.status }}</a-tag>
                      <span v-if="item.learnedAt" class="style-learning__learned-badge">已学习</span>
                    </template>
                  </a-list-item-meta>
                  <template #actions>
                    <a-button type="text" status="danger" size="mini" @click.stop="confirmDeleteProfile(item)">删</a-button>
                  </template>
                </a-list-item>
              </template>
            </a-list>
          </a-spin>
          <a-divider />
          <a-form :model="profileForm" layout="vertical">
            <a-form-item label="档案名" required><a-input v-model="profileForm.name" placeholder="如：古龙风格" /></a-form-item>
            <a-form-item label="说明"><a-textarea v-model="profileForm.description" :auto-size="{ minRows: 2, maxRows: 4 }" placeholder="描述目标风格" /></a-form-item>
            <a-form-item label="约束（可选）">
              <a-textarea v-model="profileForm.constraints" :auto-size="{ minRows: 2, maxRows: 4 }" placeholder="如：禁止使用网络用语" />
            </a-form-item>
            <a-button type="primary" long @click="createProfile">新建档案</a-button>
          </a-form>
        </a-card>
      </a-col>

      <!-- 中栏：样本管理 -->
      <a-col :span="9" :xs="24" :md="9">
        <a-card :bordered="false" class="style-learning__card">
          <template #title>
            <span>{{ selectedProfile?.name || '请选择档案' }}</span>
            <a-tag v-if="selectedProfile?.status" :color="selectedProfile.status === 'active' ? 'green' : 'blue'" size="small" style="margin-left: 8px">{{ selectedProfile.status }}</a-tag>
          </template>
          <template #extra>
            <a-button type="primary" :loading="learning" :disabled="!selectedProfileId || samples.length === 0" @click="runLearn">
              <template #icon><Sparkles :size="16" /></template>
              深度学习
            </a-button>
          </template>
          <a-form :model="sampleForm" layout="vertical">
            <a-form-item label="样本标题">
              <a-input v-model="sampleForm.title" placeholder="如：第三章初稿" />
            </a-form-item>
            <a-form-item label="来源">
              <a-select v-model="sampleForm.source">
                <a-option value="manual">手动</a-option>
                <a-option value="upload">上传</a-option>
                <a-option value="chapter">章节</a-option>
              </a-select>
            </a-form-item>
            <a-form-item label="样本文本" required>
              <a-textarea v-model="sampleForm.content" :auto-size="{ minRows: 4, maxRows: 10 }" placeholder="粘贴目标作品的文本段落..." />
            </a-form-item>
            <a-button type="outline" :disabled="!selectedProfileId" @click="addSample">添加样本</a-button>
          </a-form>
          <a-divider />
          <a-spin :loading="sampleLoading">
            <div v-if="samples.length === 0" class="style-learning__sample-empty">暂无样本</div>
            <div v-else class="style-learning__sample-list">
              <div v-for="s in samples" :key="s.id" class="style-learning__sample-item">
                <div class="style-learning__sample-head">
                  <span class="style-learning__sample-title">{{ s.title || '未命名样本' }}</span>
                  <a-tag size="small">{{ s.source }}</a-tag>
                  <span class="style-learning__sample-words">{{ s.wordCount }}字</span>
                  <a-button type="text" status="danger" size="mini" @click="confirmDeleteSample(s)">删除</a-button>
                </div>
                <div class="style-learning__sample-preview">{{ s.content.slice(0, 120) }}{{ s.content.length > 120 ? '...' : '' }}</div>
              </div>
            </div>
          </a-spin>
        </a-card>
      </a-col>

      <!-- 右栏：学习结果 -->
      <a-col :span="9" :xs="24" :md="9">
        <a-card :bordered="false" class="style-learning__card style-learning__result-card">
          <template #title>
            <span>风格分析结果</span>
            <a-tag v-if="analysis" color="green" size="small" style="margin-left: 8px">已分析</a-tag>
          </template>

          <div v-if="!analysis" class="style-learning__empty">
            <p v-if="!selectedProfileId">请先选择左侧风格档案</p>
            <p v-else-if="samples.length === 0">请添加至少一篇样本文本</p>
            <p v-else>点击「深度学习」开始分析写作风格</p>
          </div>

          <template v-else>
            <!-- 风格维度 -->
            <div class="style-learning__dimensions">
              <div v-for="dim in analysisDimensions" :key="dim.label" class="style-learning__dim-item">
                <span class="style-learning__dim-icon"><component :is="dim.icon" :size="14" :stroke-width="1.75" /></span>
                <span class="style-learning__dim-label">{{ dim.label }}</span>
                <span class="style-learning__dim-value">{{ dim.value }}</span>
              </div>
            </div>

            <a-divider />

            <!-- 意象领域 -->
            <div v-if="analysis.imageryDomains?.length" class="style-learning__section">
              <div class="style-learning__section-title">意象领域</div>
              <div class="style-learning__tags">
                <a-tag v-for="d in analysis.imageryDomains" :key="d" color="arcoblue" size="small">{{ d }}</a-tag>
              </div>
            </div>

            <!-- 标志性特征 -->
            <div v-if="analysis.signatureTraits?.length" class="style-learning__section">
              <div class="style-learning__section-title">标志性写法</div>
              <ul class="style-learning__traits">
                <li v-for="t in analysis.signatureTraits" :key="t">{{ t }}</li>
              </ul>
            </div>

            <!-- 风格指令（最重要） -->
            <div v-if="analysis.stylePrompt" class="style-learning__section">
              <div class="style-learning__section-title">生成风格指令</div>
              <div class="style-learning__prompt-box">{{ analysis.stylePrompt }}</div>
            </div>

            <a-divider />

            <!-- 统计指标 -->
            <div v-if="stats" class="style-learning__section">
              <div class="style-learning__section-title">统计指标</div>
              <div class="style-learning__stats-grid">
                <div class="style-learning__stat">
                  <span class="style-learning__stat-label">样本数</span>
                  <span class="style-learning__stat-value">{{ stats.sampleCount }}</span>
                </div>
                <div class="style-learning__stat">
                  <span class="style-learning__stat-label">总字数</span>
                  <span class="style-learning__stat-value">{{ stats.totalChars }}</span>
                </div>
                <div class="style-learning__stat">
                  <span class="style-learning__stat-label">平均句长</span>
                  <span class="style-learning__stat-value">{{ stats.avgSentenceChars }}字</span>
                </div>
                <div class="style-learning__stat">
                  <span class="style-learning__stat-label">对话占比</span>
                  <span class="style-learning__stat-value">{{ (stats.dialogueRatio * 100).toFixed(0) }}%</span>
                </div>
                <div class="style-learning__stat">
                  <span class="style-learning__stat-label">段均长度</span>
                  <span class="style-learning__stat-value">{{ stats.paragraphAvgLen }}字</span>
                </div>
                <div class="style-learning__stat">
                  <span class="style-learning__stat-label">语气</span>
                  <span class="style-learning__stat-value">{{ stats.tone }}</span>
                </div>
              </div>
            </div>

            <a-divider />

            <!-- 风格总结 -->
            <div v-if="analysis.summary" class="style-learning__section">
              <div class="style-learning__section-title">风格总结</div>
              <p class="style-learning__summary">{{ analysis.summary }}</p>
            </div>
          </template>
        </a-card>
      </a-col>
    </a-row>
  </div>
</template>

<style scoped>
.style-learning {
  padding: 12px 24px 24px;
  max-width: 1600px;
  margin: 0 auto;
}
.style-learning__head,
.style-learning__card {
  border-radius: 8px;
  margin-bottom: 12px;
}
.style-learning__title {
  margin: 0 0 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.style-learning__desc {
  margin: 0;
  color: var(--color-text-3);
}
.style-learning__profile-item {
  cursor: pointer;
  border-radius: 8px;
}
.style-learning__profile-item--active {
  background: var(--color-primary-light-1);
}
.style-learning__learned-badge {
  margin-left: 6px;
  font-size: 11px;
  color: var(--color-success-6);
}
.style-learning__result-card {
  min-height: 400px;
}
.style-learning__empty {
  text-align: center;
  color: var(--color-text-3);
  padding: 60px 0;
}
.style-learning__dimensions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 16px;
}
.style-learning__dim-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 6px;
  background: var(--color-fill-1);
}
.style-learning__dim-icon {
  font-size: 14px;
  flex-shrink: 0;
}
.style-learning__dim-label {
  color: var(--color-text-3);
  font-size: 12px;
  flex-shrink: 0;
  min-width: 56px;
}
.style-learning__dim-value {
  color: var(--color-text-1);
  font-size: 13px;
  font-weight: 500;
}
.style-learning__section {
  margin-bottom: 12px;
}
.style-learning__section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-2);
  margin-bottom: 6px;
}
.style-learning__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.style-learning__traits {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  color: var(--color-text-1);
  line-height: 1.8;
}
.style-learning__prompt-box {
  padding: 10px 12px;
  border-radius: 6px;
  background: var(--color-primary-light-1);
  border: 1px solid var(--color-primary-light-3);
  font-size: 13px;
  line-height: 1.6;
  color: var(--color-text-1);
}
.style-learning__stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}
.style-learning__stat {
  display: flex;
  flex-direction: column;
  padding: 6px 8px;
  border-radius: 4px;
  background: var(--color-fill-1);
}
.style-learning__stat-label {
  font-size: 11px;
  color: var(--color-text-3);
}
.style-learning__stat-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-1);
}
.style-learning__summary {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--color-text-2);
}
.style-learning__sample-empty {
  text-align: center;
  color: var(--color-text-3);
  padding: 24px 0;
  font-size: 13px;
}
.style-learning__sample-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.style-learning__sample-item {
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--color-fill-1);
  border: 1px solid var(--color-border-1);
}
.style-learning__sample-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.style-learning__sample-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-1);
}
.style-learning__sample-words {
  font-size: 12px;
  color: var(--color-text-3);
}
.style-learning__sample-preview {
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-text-3);
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 60px;
  overflow: hidden;
}
</style>
