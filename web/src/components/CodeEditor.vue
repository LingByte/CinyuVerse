<script setup lang="ts">
import { javascript } from '@codemirror/lang-javascript'
import { markdown } from '@codemirror/lang-markdown'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView, lineNumbers } from '@codemirror/view'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

interface Props {
  modelValue: string
  language?: 'javascript' | 'typescript' | 'markdown'
  readOnly?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  language: 'typescript',
  readOnly: false,
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const containerRef = ref<HTMLDivElement | null>(null)
let view: EditorView | null = null
const languageConf = new Compartment()

const pickLangExtension = (lang: Props['language']) => {
  if (lang === 'markdown') return markdown()
  return javascript({ typescript: lang === 'typescript' })
}

onMounted(() => {
  if (!containerRef.value) return
  const state = EditorState.create({
    doc: props.modelValue,
    extensions: [
      lineNumbers(),
      EditorView.lineWrapping,
      languageConf.of(pickLangExtension(props.language)),
      EditorView.editable.of(!props.readOnly),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) emit('update:modelValue', update.state.doc.toString())
      }),
    ],
  })

  view = new EditorView({
    state,
    parent: containerRef.value,
  })
})

watch(
  () => props.modelValue,
  (value) => {
    if (!view) return
    const current = view.state.doc.toString()
    if (current === value) return
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
    })
  },
)

watch(
  () => props.language,
  (lang) => {
    if (!view) return
    view.dispatch({
      effects: languageConf.reconfigure(pickLangExtension(lang)),
    })
  },
)

onBeforeUnmount(() => {
  view?.destroy()
})
</script>

<template>
  <div
    class="rounded-2xl border border-[color-mix(in_oklab,var(--border)_80%,transparent)] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--surface)_98%,white),color-mix(in_oklab,var(--surface)_94%,var(--surface-strong)))] p-2.5 shadow-[0_20px_44px_-34px_var(--ring)]"
    :class="{ 'opacity-90': readOnly }"
  >
    <div ref="containerRef" class="cmp-code-editor__inner rounded-xl border border-[color-mix(in_oklab,var(--border)_72%,transparent)]" />
  </div>
</template>
