import { defineAsyncComponent, defineComponent, h } from 'vue';
import type { FileViewerRenderer, FileViewerRenderParams } from './types';

const MonacoEditor = defineAsyncComponent(() => import('@/components/editor/MonacoEditor.vue'));
const VideoViewer = defineAsyncComponent(() => import('./VideoViewer.vue'));
const MarkdownViewer = defineAsyncComponent(() => import('./MarkdownViewer.vue'));
const PdfEditorViewer = defineAsyncComponent(() => import('./PdfEditorViewer.vue'));
const ImageEditorViewer = defineAsyncComponent(() => import('./ImageEditorViewer.vue'));
import {
  isImagePath,
  isVideoPath,
  isAudioPath,
  isMarkdownPath,
  isPdfPath,
  imageMime,
  audioMime,
  pdfMime,
  videoMime,
} from './viewerPaths';

function ext(path: string) {
  const idx = path.lastIndexOf('.');
  return idx >= 0 ? path.slice(idx + 1).toLowerCase() : '';
}

const AudioViewer = defineComponent({
  name: 'AudioViewer',
  props: {
    tab: { type: Object, required: true },
  },
  setup(props) {
    return () =>
      h('div', { class: 'flex items-center justify-center h-full p-4' }, [
        h('audio', { controls: true, class: 'max-w-full' }, [
          h('source', { src: (props.tab as any).path, type: `audio/${ext((props.tab as any).path)}` }),
          'Your browser does not support the audio element.',
        ]),
      ]);
  },
});

const BinaryViewer = defineComponent({
  name: 'BinaryViewer',
  props: {
    tab: { type: Object, required: true },
  },
  setup(props) {
    const tab = props.tab as { title: string };
    return () =>
      h('div', { class: 'flex items-center justify-center h-full' }, [
        h('div', { class: 'text-center' }, [
          h('div', { class: 'text-6xl mb-4' }, '📁'),
          h('div', { class: 'text-lg font-medium mb-2' }, tab.title),
          h('div', { class: 'text-sm text-gray-500' }, 'Binary file - cannot preview'),
        ]),
      ]);
  },
});

const imageRenderer: FileViewerRenderer = {
  id: 'image',
  label: 'Image',
  match: isImagePath,
  component: ImageEditorViewer,
  props: ({ tab, onChange, assetUrl }: FileViewerRenderParams) => ({
    assetUrl,
    value: tab.value,
    onChange,
    readOnly: tab.readOnly,
  }),
};

const audioRenderer: FileViewerRenderer = {
  id: 'audio',
  label: 'Audio',
  match: (path: string) => ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'].includes(ext(path)),
  component: AudioViewer,
  props: ({ tab }: FileViewerRenderParams) => ({ tab }),
};

const markdownRenderer: FileViewerRenderer = {
  id: 'markdown',
  label: 'Markdown',
  match: (path: string) => {
    const e = ext(path);
    return ['md', 'markdown'].includes(e);
  },
  component: MarkdownViewer,
  props: ({ tab, onChange }: FileViewerRenderParams) => ({
    value: tab.value,
    onChange,
    readOnly: tab.readOnly,
  }),
};

export const pdfRenderer: FileViewerRenderer = {
  id: 'pdf',
  label: 'PDF',
  match: (path: string) => ext(path) === 'pdf',
  component: PdfEditorViewer,
  props: ({ tab, onChange, assetUrl }: FileViewerRenderParams) => ({
    assetUrl,
    value: tab.value,
    onChange,
    readOnly: tab.readOnly,
  }),
};

export const videoRenderer: FileViewerRenderer = {
  id: 'video',
  label: 'Video',
  match: (path: string) => ['mp4', 'webm', 'ogg', 'mov', 'avi'].includes(ext(path)),
  component: VideoViewer,
  props: ({ tab }: FileViewerRenderParams) => ({ assetUrl: tab.path }),
};

export const textRenderer: FileViewerRenderer = {
  id: 'text',
  label: 'Text',
  match: () => true,
  component: MonacoEditor,
  props: ({ tab, onChange }: FileViewerRenderParams) => ({
    value: tab.value,
    'onUpdate:value': onChange,
    language: tab.language,
    path: tab.path,
    height: '100%',
    readOnly: tab.readOnly,
  }),
};

export const binaryRenderer: FileViewerRenderer = {
  id: 'binary',
  label: 'Binary',
  match: () => true,
  component: BinaryViewer,
  props: ({ tab }: FileViewerRenderParams) => ({ tab }),
};

export const defaultRenderers: FileViewerRenderer[] = [
  markdownRenderer,
  imageRenderer,
  audioRenderer,
  pdfRenderer,
  videoRenderer,
  textRenderer,
  binaryRenderer,
];
