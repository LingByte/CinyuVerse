<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue';
import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker?url';
import { safeParseState, type PdfEditState } from './pdfAnnotations';

GlobalWorkerOptions.workerSrc = workerSrc;

type Tool = 'pan' | 'highlight' | 'pen' | 'text';

const props = defineProps<{
  assetUrl?: string;
  value: string;
  onChange: (next: string) => void;
  readOnly: boolean;
}>();

const state = computed(() => safeParseState(props.value));
const tool = ref<Tool>('pan');
const doc = ref<PDFDocumentProxy | null>(null);
const pageNum = ref(1);
const scale = ref(1.25);

const canvasRef = ref<HTMLCanvasElement | null>(null);
const overlayRef = ref<HTMLCanvasElement | null>(null);

const draftRef = ref<{
  pen?: { points: Array<{ x: number; y: number }>; color: string; width: number };
  highlight?: { x0: number; y0: number; x1: number; y1: number; color: string; opacity: number };
}>({});

const dragRef = ref<{
  active: boolean;
  startX: number;
  startY: number;
  points: Array<{ x: number; y: number }>;
}>({ active: false, startX: 0, startY: 0, points: [] });

let loadCanceled = false;

watch(
  () => props.assetUrl,
  async (assetUrl) => {
    loadCanceled = false;
    doc.value = null;
    if (!assetUrl) return;

    const task = getDocument(assetUrl);
    const pdf = await task.promise;
    if (loadCanceled) return;
    doc.value = pdf;
    pageNum.value = 1;
  },
  { immediate: true },
);

onUnmounted(() => {
  loadCanceled = true;
});

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

async function renderPage() {
  if (!doc.value) return;
  const page = await doc.value.getPage(pageNum.value);
  const viewport = page.getViewport({ scale: scale.value });

  const canvas = canvasRef.value;
  const overlay = overlayRef.value;
  if (!canvas || !overlay) return;

  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  overlay.width = canvas.width;
  overlay.height = canvas.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  await page.render({ canvasContext: ctx, viewport }).promise;

  const octx = overlay.getContext('2d');
  if (!octx) return;
  octx.clearRect(0, 0, overlay.width, overlay.height);

  for (const a of state.value.annotations) {
    if (a.page !== pageNum.value) continue;
    if (a.type === 'highlight') {
      octx.save();
      octx.globalAlpha = clamp01(a.opacity);
      octx.fillStyle = a.color;
      octx.fillRect(a.x * overlay.width, a.y * overlay.height, a.w * overlay.width, a.h * overlay.height);
      octx.restore();
    }
    if (a.type === 'pen') {
      octx.save();
      octx.strokeStyle = a.color;
      octx.lineWidth = a.width;
      octx.lineJoin = 'round';
      octx.lineCap = 'round';
      octx.beginPath();
      a.points.forEach((pt, idx) => {
        const x = pt.x * overlay.width;
        const y = pt.y * overlay.height;
        if (idx === 0) octx.moveTo(x, y);
        else octx.lineTo(x, y);
      });
      octx.stroke();
      octx.restore();
    }
    if (a.type === 'text') {
      octx.save();
      octx.fillStyle = a.color;
      octx.font = `${a.size}px sans-serif`;
      octx.fillText(a.text, a.x * overlay.width, a.y * overlay.height);
      octx.restore();
    }
  }

  const draft = draftRef.value;
  if (draft.highlight) {
    const { x0, y0, x1, y1, color, opacity } = draft.highlight;
    const nx = Math.min(x0, x1) * overlay.width;
    const ny = Math.min(y0, y1) * overlay.height;
    const w = Math.abs(x1 - x0) * overlay.width;
    const h = Math.abs(y1 - y0) * overlay.height;
    octx.save();
    octx.globalAlpha = clamp01(opacity);
    octx.fillStyle = color;
    octx.fillRect(nx, ny, w, h);
    octx.restore();
  }

  if (draft.pen) {
    octx.save();
    octx.strokeStyle = draft.pen.color;
    octx.lineWidth = draft.pen.width;
    octx.lineJoin = 'round';
    octx.lineCap = 'round';
    octx.beginPath();
    draft.pen.points.forEach((pt, idx) => {
      const x = pt.x * overlay.width;
      const y = pt.y * overlay.height;
      if (idx === 0) octx.moveTo(x, y);
      else octx.lineTo(x, y);
    });
    octx.stroke();
    octx.restore();
  }
}

watch([doc, pageNum, scale, () => state.value.annotations], () => {
  void renderPage();
});

function onPointerDown(e: PointerEvent) {
  if (props.readOnly) return;
  if (!overlayRef.value) return;
  if (tool.value === 'pan') return;

  const rect = overlayRef.value.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  const y = (e.clientY - rect.top) / rect.height;

  dragRef.value.active = true;
  dragRef.value.startX = x;
  dragRef.value.startY = y;
  dragRef.value.points = [{ x, y }];

  if (tool.value === 'pen') {
    draftRef.value.pen = { points: [{ x, y }], color: '#2563eb', width: 2 };
  }
  if (tool.value === 'highlight') {
    draftRef.value.highlight = { x0: x, y0: y, x1: x, y1: y, color: '#fde047', opacity: 0.45 };
  }

  (e.target as Element).setPointerCapture(e.pointerId);
}

function onPointerMove(e: PointerEvent) {
  if (props.readOnly) return;
  if (!overlayRef.value) return;
  if (!dragRef.value.active) return;

  const rect = overlayRef.value.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  const y = (e.clientY - rect.top) / rect.height;

  if (tool.value === 'pen') {
    dragRef.value.points.push({ x, y });
    if (draftRef.value.pen) {
      draftRef.value.pen.points = [...dragRef.value.points];
    }
    void Promise.resolve().then(() => {
      const overlay = overlayRef.value;
      if (!overlay) return;
      const octx = overlay.getContext('2d');
      if (!octx) return;
      octx.clearRect(0, 0, overlay.width, overlay.height);
      const draft = draftRef.value;
      if (draft.pen) {
        octx.save();
        octx.strokeStyle = draft.pen.color;
        octx.lineWidth = draft.pen.width;
        octx.lineJoin = 'round';
        octx.lineCap = 'round';
        octx.beginPath();
        draft.pen.points.forEach((pt, idx) => {
          const px = pt.x * overlay.width;
          const py = pt.y * overlay.height;
          if (idx === 0) octx.moveTo(px, py);
          else octx.lineTo(px, py);
        });
        octx.stroke();
        octx.restore();
      }
    });
  }

  if (tool.value === 'highlight' && draftRef.value.highlight) {
    draftRef.value.highlight.x1 = x;
    draftRef.value.highlight.y1 = y;
  }
}

function onPointerUp(e: PointerEvent) {
  if (props.readOnly) return;
  if (!overlayRef.value) return;
  if (!dragRef.value.active) return;

  const rect = overlayRef.value.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  const y = (e.clientY - rect.top) / rect.height;

  const sx = dragRef.value.startX;
  const sy = dragRef.value.startY;

  dragRef.value.active = false;

  if (tool.value === 'highlight') {
    const nx = Math.min(sx, x);
    const ny = Math.min(sy, y);
    const w = Math.abs(x - sx);
    const h = Math.abs(y - sy);
    const next: PdfEditState = {
      version: 1,
      annotations: [
        ...state.value.annotations,
        { type: 'highlight', page: pageNum.value, x: nx, y: ny, w, h, color: '#fde047', opacity: 0.45 },
      ],
    };
    draftRef.value.highlight = undefined;
    props.onChange(JSON.stringify(next));
  }

  if (tool.value === 'pen') {
    const pts = dragRef.value.points;
    if (pts.length >= 2) {
      const next: PdfEditState = {
        version: 1,
        annotations: [
          ...state.value.annotations,
          { type: 'pen', page: pageNum.value, points: pts, color: '#2563eb', width: 2 },
        ],
      };
      props.onChange(JSON.stringify(next));
    }
    draftRef.value.pen = undefined;
  }

  if (tool.value === 'text') {
    const text = window.prompt('Text');
    if (!text) return;
    const next: PdfEditState = {
      version: 1,
      annotations: [
        ...state.value.annotations,
        { type: 'text', page: pageNum.value, x, y, text, size: 14, color: '#111827' },
      ],
    };
    props.onChange(JSON.stringify(next));
  }

  (e.target as Element).releasePointerCapture(e.pointerId);
}

function prevPage() {
  pageNum.value = Math.max(1, pageNum.value - 1);
}

function nextPage() {
  if (doc.value) pageNum.value = Math.min(doc.value.numPages, pageNum.value + 1);
}

function zoomOut() {
  scale.value = Math.max(0.5, Math.min(3, scale.value - 0.25));
}

function zoomIn() {
  scale.value = Math.max(0.5, Math.min(3, scale.value + 0.25));
}
</script>

<template>
  <div class="h-full flex flex-col bg-white">
    <div class="h-10 flex items-center justify-between px-3 border-b border-gray-200">
      <div class="text-sm font-medium text-gray-800">PDF</div>
      <div class="flex items-center gap-2">
        <select
          v-model="tool"
          class="text-xs border border-gray-200 rounded px-2 py-1"
          :disabled="readOnly"
        >
          <option value="pan">Pan</option>
          <option value="highlight">Highlight</option>
          <option value="pen">Pen</option>
          <option value="text">Text</option>
        </select>

        <button type="button" class="px-2 py-1 text-xs rounded hover:bg-gray-100" @click="zoomOut">
          -
        </button>
        <div class="text-xs text-gray-600">{{ Math.round(scale * 100) }}%</div>
        <button type="button" class="px-2 py-1 text-xs rounded hover:bg-gray-100" @click="zoomIn">
          +
        </button>

        <button
          type="button"
          class="px-2 py-1 text-xs rounded hover:bg-gray-100"
          :disabled="!doc || pageNum <= 1"
          @click="prevPage"
        >
          Prev
        </button>
        <div class="text-xs text-gray-600">{{ doc ? `${pageNum}/${doc.numPages}` : '—' }}</div>
        <button
          type="button"
          class="px-2 py-1 text-xs rounded hover:bg-gray-100"
          :disabled="!doc || (doc ? pageNum >= doc.numPages : true)"
          @click="nextPage"
        >
          Next
        </button>
      </div>
    </div>

    <div class="flex-1 min-h-0 overflow-auto p-3 bg-gray-50">
      <div class="relative inline-block">
        <canvas ref="canvasRef" class="block bg-white shadow" />
        <canvas
          ref="overlayRef"
          class="absolute inset-0"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
        />
      </div>
    </div>
  </div>
</template>
