<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Message, Modal } from '@arco-design/web-vue'
import { IconPlus, IconRobot, IconEdit } from '@arco-design/web-vue/es/icon'
import { WorkspaceBreadcrumb } from '@/components/layout'
import { getNovel } from '@/api/novels'
import {
  createCharacter,
  deleteCharacter,
  generateCharacterByAI,
  listCharacters,
  updateCharacter,
} from '@/api/characters'
import type { Character, GenerateCharacterBody } from '@/types/character'
import type { Novel } from '@/types/novel'

const route = useRoute()
const router = useRouter()
const novelId = computed(() => Number(route.params.id))

const novel = ref<Novel | null>(null)
const loading = ref(false)

const charLoading = ref(false)
const characters = ref<Character[]>([])

const charVisible = ref(false)
const charMode = ref<'create' | 'edit'>('create')
const charEditId = ref<number | null>(null)
const charSaving = ref(false)

const charForm = reactive({
  name: '',
  roleType: '',
  gender: '',
  age: '',
  personality: '',
  background: '',
  goal: '',
  relationship: '',
  appearance: '',
  abilities: '',
  notes: '',
})

const aiMessage = ref('请生成该小说的核心角色设定，包含姓名、类型、性格、背景、目标和能力。')
const aiFeedback = ref('')
const aiModel = ref('')
const aiMaxTokens = ref<number | undefined>(undefined)
const aiLoading = ref(false)
const aiLockedFields = ref<string[]>([])

const AI_LOCK_FIELDS = [
  { label: '姓名', value: 'name' },
  { label: '角色类型', value: 'roleType' },
  { label: '性别', value: 'gender' },
  { label: '年龄', value: 'age' },
  { label: '性格', value: 'personality' },
  { label: '背景', value: 'background' },
  { label: '目标', value: 'goal' },
  { label: '关系', value: 'relationship' },
  { label: '外貌', value: 'appearance' },
  { label: '能力', value: 'abilities' },
  { label: '备注', value: 'notes' },
]

function resetCharForm() {
  charForm.name = ''
  charForm.roleType = ''
  charForm.gender = ''
  charForm.age = ''
  charForm.personality = ''
  charForm.background = ''
  charForm.goal = ''
  charForm.relationship = ''
  charForm.appearance = ''
  charForm.abilities = ''
  charForm.notes = ''
}

function applyCharacter(c: Character) {
  charForm.name = c.name || ''
  charForm.roleType = c.roleType || ''
  charForm.gender = c.gender || ''
  charForm.age = c.age || ''
  charForm.personality = c.personality || ''
  charForm.background = c.background || ''
  charForm.goal = c.goal || ''
  charForm.relationship = c.relationship || ''
  charForm.appearance = c.appearance || ''
  charForm.abilities = c.abilities || ''
  charForm.notes = c.notes || ''
}

function formToCharacterBody() {
  return {
    novelId: novelId.value,
    name: charForm.name.trim(),
    roleType: charForm.roleType.trim() || undefined,
    gender: charForm.gender.trim() || undefined,
    age: charForm.age.trim() || undefined,
    personality: charForm.personality.trim() || undefined,
    background: charForm.background.trim() || undefined,
    goal: charForm.goal.trim() || undefined,
    relationship: charForm.relationship.trim() || undefined,
    appearance: charForm.appearance.trim() || undefined,
    abilities: charForm.abilities.trim() || undefined,
    notes: charForm.notes.trim() || undefined,
  }
}

async function loadNovel() {
  loading.value = true
  try {
    novel.value = await getNovel(novelId.value)
  } catch (e) {
    Message.error(String((e as Error)?.message || e))
  } finally {
    loading.value = false
  }
}

async function loadCharacters() {
  charLoading.value = true
  try {
    const res = await listCharacters({ novelId: novelId.value, page: 1, size: 100 })
    characters.value = res.characters
  } catch (e) {
    Message.error(String((e as Error)?.message || e))
  } finally {
    charLoading.value = false
  }
}

onMounted(async () => {
  if (!Number.isFinite(novelId.value) || novelId.value <= 0) {
    Message.error('无效的小说 ID')
    return
  }
  await Promise.all([loadNovel(), loadCharacters()])
})

function openCreateCharacter() {
  charMode.value = 'create'
  charEditId.value = null
  resetCharForm()
  aiFeedback.value = ''
  aiLockedFields.value = []
  aiModel.value = ''
  aiMaxTokens.value = undefined
  charVisible.value = true
}

function openEditCharacter(row: Character) {
  charMode.value = 'edit'
  charEditId.value = row.id
  applyCharacter(row)
  charVisible.value = true
}

async function saveCharacter() {
  if (!charForm.name.trim()) {
    Message.warning('角色姓名必填')
    return
  }
  charSaving.value = true
  try {
    if (charMode.value === 'create') {
      await createCharacter(formToCharacterBody())
      Message.success('人物已创建')
    } else if (charEditId.value != null) {
      await updateCharacter(charEditId.value, formToCharacterBody())
      Message.success('人物已保存')
    }
    charVisible.value = false
    await loadCharacters()
  } catch (e) {
    Message.error(String((e as Error)?.message || e))
  } finally {
    charSaving.value = false
  }
}

function onDeleteCharacter(row: Character) {
  Modal.confirm({
    title: '删除人物',
    content: `确定删除「${row.name}」？`,
    okText: '删除',
    async onOk() {
      await deleteCharacter(row.id)
      Message.success('已删除')
      await loadCharacters()
    },
  })
}

function currentCharacterDraft(): Character {
  return {
    id: 0,
    novelId: novelId.value,
    name: charForm.name,
    roleType: charForm.roleType,
    gender: charForm.gender,
    age: charForm.age,
    personality: charForm.personality,
    background: charForm.background,
    goal: charForm.goal,
    relationship: charForm.relationship,
    appearance: charForm.appearance,
    abilities: charForm.abilities,
    notes: charForm.notes,
    createdAt: '',
    updatedAt: '',
  }
}

async function runCharacterAIRewrite() {
  const msg = aiMessage.value.trim()
  if (!msg) {
    Message.warning('请填写 AI 需求')
    return
  }
  aiLoading.value = true
  try {
    const novelContext = novel.value
      ? [
          `小说标题：${novel.value.title || ''}`,
          `小说类型：${novel.value.genre || ''}`,
          `受众：${novel.value.audience || ''}`,
          `主题：${novel.value.theme || ''}`,
          `简介：${novel.value.description || ''}`,
          `世界观：${novel.value.worldSetting || ''}`,
          `标签：${novel.value.tags || ''}`,
          `风格指南：${novel.value.styleGuide || ''}`,
        ].join('\n')
      : ''
    const mergedMessage = novelContext ? `请基于以下小说设定生成人物设定。\n\n${novelContext}\n\n用户要求：${msg}` : msg

    const body: GenerateCharacterBody = {
      message: mergedMessage,
      model: aiModel.value.trim() || undefined,
      maxTokens: aiMaxTokens.value,
      feedback: aiFeedback.value.trim() || undefined,
      lockedFields: aiLockedFields.value,
      baseDraft: currentCharacterDraft(),
    }
    const { draft } = await generateCharacterByAI(body)
    applyCharacter(draft)
    Message.success('AI 草稿已写入，可继续反馈重写')
  } catch (e) {
    Message.error(String((e as Error)?.message || e))
  } finally {
    aiLoading.value = false
  }
}
</script>

<template>
  <div class="novel-detail" v-if="novel">
    <WorkspaceBreadcrumb
      :trail="[
        { label: '小说管理', to: { name: 'home' } },
        { label: novel.title || '卷管理', to: { name: 'novel-detail', params: { id: String(novelId) } } },
        { label: '角色管理' },
      ]"
    />

    <a-card :bordered="false" class="novel-detail__head">
      <template #extra>
        <a-space>
          <a-button @click="router.push({ name: 'novel-detail', params: { id: String(novelId) } })">返回卷管理</a-button>
          <a-button @click="router.push({ name: 'novel-storylines', params: { id: String(novelId) } })">
            故事线管理
          </a-button>
        </a-space>
      </template>
      <h2 class="novel-detail__title">{{ novel.title || '未命名小说' }}</h2>
      <a-space wrap>
        <a-tag>{{ novel.status || 'draft' }}</a-tag>
        <a-tag color="arcoblue">{{ novel.genre || '未设置类型' }}</a-tag>
        <a-tag color="purple">{{ novel.audience || '未设置受众' }}</a-tag>
      </a-space>
      <a-typography-paragraph class="novel-detail__desc">
        {{ novel.description || '暂无简介' }}
      </a-typography-paragraph>
    </a-card>

    <a-card title="人物设定" :bordered="false" class="novel-detail__characters">
      <template #extra>
        <a-button type="primary" @click="openCreateCharacter">
          <template #icon>
            <IconPlus />
          </template>
          新建人物
        </a-button>
      </template>

      <a-spin :loading="charLoading" style="width: 100%">
        <div class="novel-detail__char-grid">
          <a-card v-for="c in characters" :key="c.id" class="novel-detail__char-item" size="small">
            <div class="novel-detail__char-hd">
              <strong>{{ c.name }}</strong>
              <a-tag size="small">{{ c.roleType || '未分类' }}</a-tag>
            </div>
            <a-typography-paragraph :ellipsis="{ rows: 2 }" class="novel-detail__char-line">
              {{ c.personality || c.background || '暂无设定描述' }}
            </a-typography-paragraph>
            <div class="novel-detail__char-ops">
              <a-button type="text" size="small" @click="openEditCharacter(c)">
                <template #icon>
                  <IconEdit />
                </template>
                编辑
              </a-button>
              <a-button type="text" status="danger" size="small" @click="onDeleteCharacter(c)">删除</a-button>
            </div>
          </a-card>
          <a-empty v-if="!characters.length" description="暂无人物" class="novel-detail__char-empty" />
        </div>
      </a-spin>
    </a-card>

    <a-drawer
      v-model:visible="charVisible"
      :title="charMode === 'create' ? '新建人物' : `编辑人物 #${charEditId}`"
      :width="680"
      unmount-on-close
    >
      <template #footer>
        <a-space>
          <a-button @click="charVisible = false">取消</a-button>
          <a-button type="primary" :loading="charSaving" @click="saveCharacter">
            {{ charMode === 'create' ? '创建' : '保存' }}
          </a-button>
        </a-space>
      </template>

      <a-form :model="charForm" layout="vertical">
        <a-card :bordered="false" class="novel-detail__ai-card">
          <template #title>
            <span>
              <IconRobot /> AI 人物草稿
            </span>
          </template>
          <a-form-item label="需求说明" required>
            <a-textarea v-model="aiMessage" :auto-size="{ minRows: 3, maxRows: 8 }" />
          </a-form-item>
          <a-form-item label="反馈（用于重写）">
            <a-textarea v-model="aiFeedback" :auto-size="{ minRows: 2, maxRows: 6 }" />
          </a-form-item>
          <a-form-item label="锁定字段">
            <a-checkbox-group v-model="aiLockedFields" :options="AI_LOCK_FIELDS" />
          </a-form-item>
          <a-row :gutter="12">
            <a-col :span="12">
              <a-form-item label="模型（可选）">
                <a-input v-model="aiModel" allow-clear />
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="maxTokens">
                <a-input-number v-model="aiMaxTokens" :min="128" :max="4000" placeholder="默认" />
              </a-form-item>
            </a-col>
          </a-row>
          <a-button type="primary" :loading="aiLoading" @click="runCharacterAIRewrite">生成 / 重写人物</a-button>
        </a-card>

        <a-row :gutter="12">
          <a-col :span="12">
            <a-form-item label="姓名" required>
              <a-input v-model="charForm.name" allow-clear />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="角色类型">
              <a-input v-model="charForm.roleType" allow-clear />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="12">
          <a-col :span="12">
            <a-form-item label="性别">
              <a-input v-model="charForm.gender" allow-clear />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="年龄">
              <a-input v-model="charForm.age" allow-clear />
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="性格">
          <a-textarea v-model="charForm.personality" :auto-size="{ minRows: 2, maxRows: 6 }" />
        </a-form-item>
        <a-form-item label="背景">
          <a-textarea v-model="charForm.background" :auto-size="{ minRows: 2, maxRows: 6 }" />
        </a-form-item>
        <a-form-item label="目标">
          <a-textarea v-model="charForm.goal" :auto-size="{ minRows: 2, maxRows: 6 }" />
        </a-form-item>
        <a-form-item label="关系">
          <a-textarea v-model="charForm.relationship" :auto-size="{ minRows: 2, maxRows: 6 }" />
        </a-form-item>
        <a-form-item label="外貌">
          <a-textarea v-model="charForm.appearance" :auto-size="{ minRows: 2, maxRows: 6 }" />
        </a-form-item>
        <a-form-item label="能力">
          <a-textarea v-model="charForm.abilities" :auto-size="{ minRows: 2, maxRows: 6 }" />
        </a-form-item>
        <a-form-item label="备注">
          <a-textarea v-model="charForm.notes" :auto-size="{ minRows: 2, maxRows: 6 }" />
        </a-form-item>
      </a-form>
    </a-drawer>
  </div>
  <a-spin v-else :loading="loading" class="novel-detail__loading" />
</template>

<style scoped>
.novel-detail {
  padding: 12px 24px 24px;
  max-width: 1280px;
  margin: 0 auto;
}
.novel-detail__head,
.novel-detail__characters {
  border-radius: 8px;
  margin-bottom: 12px;
}
.novel-detail__title {
  margin: 0 0 8px;
}
.novel-detail__desc {
  margin-top: 10px;
}
.novel-detail__char-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}
.novel-detail__char-item {
  border-radius: 8px;
}
.novel-detail__char-hd {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.novel-detail__char-line {
  margin-bottom: 8px;
  min-height: 44px;
}
.novel-detail__char-ops {
  display: flex;
  justify-content: flex-end;
}
.novel-detail__char-empty {
  grid-column: 1 / -1;
}
.novel-detail__ai-card {
  margin-bottom: 12px;
  background: var(--color-fill-1);
}
.novel-detail__loading {
  margin-top: 80px;
  width: 100%;
  display: flex;
  justify-content: center;
}
</style>
