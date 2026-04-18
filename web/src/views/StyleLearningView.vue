<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { Message, Modal } from '@arco-design/web-vue'
import { BrainCircuit } from 'lucide-vue-next'
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
import type { StyleProfile, StyleSample } from '@/types/styleLearning'

const profiles = ref<StyleProfile[]>([])
const selectedProfileId = ref<number | null>(null)
const samples = ref<StyleSample[]>([])
const loading = ref(false)
const sampleLoading = ref(false)
const learning = ref(false)
const learnSummary = ref('')
const learnedSpec = ref('')

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
    learnSummary.value = ''
    learnedSpec.value = ''
    return
  }
  sampleLoading.value = true
  try {
    const [sampleRes, profile] = await Promise.all([
      listStyleSamples(selectedProfileId.value, { page: 1, size: 200 }),
      Promise.resolve(selectedProfile.value),
    ])
    samples.value = sampleRes.items
    learnSummary.value = profile?.learnedSummary || ''
    learnedSpec.value = profile?.learnedSpec || ''
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
    learnSummary.value = String(res.summary || '')
    learnedSpec.value = JSON.stringify(res.spec || {}, null, 2)
    await loadProfiles()
    Message.success('学习完成')
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
        风格学习模块（独立）
      </h2>
      <p class="style-learning__desc">先沉淀风格档案与样本，不接入故事线/章节生成流程。</p>
    </a-card>
    <a-row :gutter="16">
      <a-col :span="7" :xs="24" :md="7">
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
                  <a-list-item-meta :title="item.name" :description="item.status" />
                  <template #actions>
                    <a-button type="text" status="danger" size="mini" @click.stop="confirmDeleteProfile(item)">删</a-button>
                  </template>
                </a-list-item>
              </template>
            </a-list>
          </a-spin>
          <a-divider />
          <a-form :model="profileForm" layout="vertical">
            <a-form-item label="档案名" required><a-input v-model="profileForm.name" /></a-form-item>
            <a-form-item label="状态">
              <a-select v-model="profileForm.status">
                <a-option value="draft">draft</a-option>
                <a-option value="active">active</a-option>
                <a-option value="archived">archived</a-option>
              </a-select>
            </a-form-item>
            <a-form-item label="说明"><a-textarea v-model="profileForm.description" :auto-size="{ minRows: 2, maxRows: 5 }" /></a-form-item>
            <a-form-item label="约束 JSON（可选）">
              <a-textarea v-model="profileForm.constraints" :auto-size="{ minRows: 2, maxRows: 6 }" />
            </a-form-item>
            <a-button type="primary" long @click="createProfile">新建档案</a-button>
          </a-form>
        </a-card>
      </a-col>
      <a-col :span="17" :xs="24" :md="17">
        <a-card :bordered="false" class="style-learning__card">
          <template #title>{{ selectedProfile?.name || '请选择左侧档案' }}</template>
          <template #extra>
            <a-button type="primary" :loading="learning" :disabled="!selectedProfileId" @click="runLearn">一键学习</a-button>
          </template>
          <a-row :gutter="12">
            <a-col :span="12">
              <a-form :model="sampleForm" layout="vertical">
                <a-form-item label="样本标题"><a-input v-model="sampleForm.title" placeholder="例如：第三章初稿" /></a-form-item>
                <a-form-item label="来源">
                  <a-select v-model="sampleForm.source">
                    <a-option value="manual">manual</a-option>
                    <a-option value="upload">upload</a-option>
                    <a-option value="chapter">chapter</a-option>
                  </a-select>
                </a-form-item>
                <a-form-item label="样本文本" required>
                  <a-textarea v-model="sampleForm.content" :auto-size="{ minRows: 8, maxRows: 16 }" />
                </a-form-item>
                <a-button type="outline" :disabled="!selectedProfileId" @click="addSample">添加样本</a-button>
              </a-form>
            </a-col>
            <a-col :span="12">
              <a-spin :loading="sampleLoading">
                <a-table :data="samples" :pagination="false" row-key="id" size="small">
                  <a-table-column title="标题" data-index="title" />
                  <a-table-column title="来源" data-index="source" :width="90" />
                  <a-table-column title="字数" data-index="wordCount" :width="90" />
                  <a-table-column title="操作" :width="80">
                    <template #cell="{ record }">
                      <a-button type="text" status="danger" size="mini" @click="confirmDeleteSample(record)">删</a-button>
                    </template>
                  </a-table-column>
                </a-table>
              </a-spin>
            </a-col>
          </a-row>
          <a-divider />
          <div class="style-learning__result-title">学习摘要</div>
          <a-textarea :model-value="learnSummary" readonly :auto-size="{ minRows: 2, maxRows: 5 }" />
        </a-card>
      </a-col>
    </a-row>
  </div>
</template>

<style scoped>
.style-learning {
  padding: 12px 24px 24px;
  max-width: 1400px;
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
.style-learning__result-title {
  margin: 8px 0 6px;
  color: var(--color-text-2);
  font-size: 13px;
}
.style-learning__pre {
  margin: 0;
  max-height: 300px;
  overflow: auto;
  font-size: 12px;
  padding: 10px;
  border-radius: 8px;
  background: var(--color-fill-2);
  border: 1px solid var(--color-border-2);
}
</style>
