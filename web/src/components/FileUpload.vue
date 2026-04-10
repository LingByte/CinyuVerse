<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'

interface Props {
  accept?: string
  multiple?: boolean
  maxSize?: number
  maxFiles?: number
  label?: string
  error?: string
  disabled?: boolean
}

interface FileWithPreview extends File {
  id: string
  preview?: string
}

const props = withDefaults(defineProps<Props>(), {
  accept: '*/*',
  multiple: false,
  maxSize: 10,
  maxFiles: 5,
  label: '',
  error: '',
  disabled: false,
})

const emit = defineEmits<{ change: [files: FileWithPreview[]] }>()

const files = ref<FileWithPreview[]>([])
const dragActive = ref(false)
const localError = ref('')
const fileInputRef = ref<HTMLInputElement | null>(null)

const openFileDialog = () => {
  if (!props.disabled) fileInputRef.value?.click()
}

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / k ** i).toFixed(2)} ${units[i]}`
}

const validateFile = (file: File) => {
  if (file.size > props.maxSize * 1024 * 1024) {
    throw new Error(`文件大小不能超过 ${props.maxSize}MB`)
  }
}

const getFileKind = (file: File) => {
  if (file.type.startsWith('image/')) return '图片'
  if (file.type.startsWith('text/')) return '文本'
  return '文件'
}

const releasePreview = (file: FileWithPreview) => {
  if (file.preview) URL.revokeObjectURL(file.preview)
}

const applyFiles = (incoming: FileList | null) => {
  if (!incoming || props.disabled) return
  localError.value = ''

  const next = Array.from(incoming)
  const valid: FileWithPreview[] = []

  try {
    next.forEach((file) => {
      validateFile(file)
      if (files.value.length + valid.length >= props.maxFiles) {
        throw new Error(`最多只能上传 ${props.maxFiles} 个文件`)
      }
      const withPreview = Object.assign(file, {
        id: crypto.randomUUID(),
      }) as FileWithPreview
      if (file.type.startsWith('image/')) {
        withPreview.preview = URL.createObjectURL(file)
      }
      valid.push(withPreview)
    })
  } catch (err) {
    localError.value = err instanceof Error ? err.message : '文件校验失败'
    return
  }

  if (!props.multiple) {
    files.value.forEach(releasePreview)
    files.value = valid
  } else {
    files.value = [...files.value, ...valid]
  }

  emit('change', files.value)
}

const removeFile = (id: string) => {
  const target = files.value.find((item) => item.id === id)
  if (target) releasePreview(target)
  files.value = files.value.filter((item) => item.id !== id)
  emit('change', files.value)
}

const onDrag = (event: DragEvent) => {
  event.preventDefault()
  event.stopPropagation()
  if (event.type === 'dragenter' || event.type === 'dragover') dragActive.value = true
  if (event.type === 'dragleave') dragActive.value = false
}

const onDrop = (event: DragEvent) => {
  event.preventDefault()
  event.stopPropagation()
  dragActive.value = false
  applyFiles(event.dataTransfer?.files ?? null)
}

onBeforeUnmount(() => {
  files.value.forEach(releasePreview)
})
</script>

<template>
  <div class="grid gap-3">
    <label v-if="label" class="text-xs font-bold text-[var(--text-muted)]">{{ label }}</label>

    <div
      class="rounded-2xl border-2 border-dashed bg-[color-mix(in_oklab,var(--surface)_93%,transparent)] p-4 text-center transition-all duration-200"
      :class="[
        dragActive ? 'border-[var(--theme)] bg-[color-mix(in_oklab,var(--theme-soft)_55%,var(--surface))]' : 'border-[var(--border)]',
        disabled ? 'cursor-not-allowed opacity-55' : '',
        error || localError ? 'border-rose-600' : '',
      ]"
      @dragenter="onDrag"
      @dragleave="onDrag"
      @dragover="onDrag"
      @drop="onDrop"
    >
      <input
        ref="fileInputRef"
        type="file"
        class="hidden"
        :accept="accept"
        :multiple="multiple"
        :disabled="disabled"
        @change="applyFiles(($event.target as HTMLInputElement).files)"
      />
      <div class="text-[0.95rem] font-bold">点击上传</div>
      <div class="mt-1 text-xs text-[var(--text-muted)]">或拖拽文件到此处（最大 {{ maxSize }}MB，最多 {{ maxFiles }} 个）</div>
      <button
        type="button"
        class="mt-3 inline-flex min-h-10 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--theme-soft)] px-4 py-2 text-sm font-semibold text-[var(--theme-strong)] transition-all duration-200 hover:-translate-y-0.5"
        :disabled="disabled"
        @click="openFileDialog"
      >
        选择文件
      </button>
    </div>

    <div v-if="files.length" class="grid gap-2">
      <div
        v-for="file in files"
        :key="file.id"
        class="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[color-mix(in_oklab,var(--surface)_93%,transparent)] px-3 py-2"
      >
        <div class="flex items-center gap-2.5">
          <img v-if="file.preview" :src="file.preview" alt="preview" class="size-7 rounded-md object-cover" />
          <div
            v-else
            class="inline-flex size-7 items-center justify-center rounded-md border border-[var(--border)] text-[11px] font-bold text-[var(--text-muted)]"
          >
            {{ getFileKind(file) }}
          </div>
          <div>
            <div class="text-sm font-semibold">{{ file.name }}</div>
            <div class="text-xs text-[var(--text-muted)]">{{ formatFileSize(file.size) }}</div>
          </div>
        </div>
        <button type="button" class="bg-transparent text-xs text-rose-500" @click="removeFile(file.id)">删除</button>
      </div>
    </div>

    <div v-if="error || localError" class="text-xs text-rose-600">{{ error || localError }}</div>
  </div>
</template>
