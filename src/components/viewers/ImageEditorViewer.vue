<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import {
  ZoomIn,
  ZoomOut,
  RotateCw,
  RotateCcw,
  Download,
  FlipHorizontal,
  FlipVertical,
  Palette,
  Info,
  X,
} from 'lucide-vue-next';

const props = defineProps<{
  assetUrl?: string;
  value: string;
  onChange: (next: string) => void;
  readOnly: boolean;
}>();

interface ImageInfo {
  width: number;
  height: number;
  size: string;
  type: string;
  name: string;
}

interface ImageFilters {
  brightness: number;
  contrast: number;
  saturation: number;
  blur: number;
  grayscale: number;
  sepia: number;
}

const scale = ref(1);
const rotation = ref(0);
const flipH = ref(false);
const flipV = ref(false);
const showInfo = ref(false);
const showFilters = ref(false);
const imageInfo = ref<ImageInfo | null>(null);
const filters = ref<ImageFilters>({
  brightness: 100,
  contrast: 100,
  saturation: 100,
  blur: 0,
  grayscale: 0,
  sepia: 0,
});

const canvasRef = ref<HTMLCanvasElement | null>(null);
const imageRef = ref<HTMLImageElement | null>(null);
const originalImage = ref<HTMLImageElement | null>(null);

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function getImageType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'JPEG';
    case 'png':
      return 'PNG';
    case 'gif':
      return 'GIF';
    case 'webp':
      return 'WebP';
    case 'svg':
      return 'SVG';
    case 'bmp':
      return 'BMP';
    default:
      return 'Unknown';
  }
}

function applyFilters() {
  if (!canvasRef.value || !imageRef.value || !originalImage.value) return;

  const canvas = canvasRef.value;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = originalImage.value.naturalWidth;
  canvas.height = originalImage.value.naturalHeight;

  ctx.filter = `
    brightness(${filters.value.brightness}%)
    contrast(${filters.value.contrast}%)
    saturate(${filters.value.saturation}%)
    blur(${filters.value.blur}px)
    grayscale(${filters.value.grayscale}%)
    sepia(${filters.value.sepia}%)
  `;

  ctx.drawImage(originalImage.value, 0, 0);
}

function loadImage() {
  if (!props.assetUrl) return;
  const img = new Image();
  img.onload = () => {
    originalImage.value = img;
    imageInfo.value = {
      width: img.naturalWidth,
      height: img.naturalHeight,
      size: formatFileSize(props.value.length),
      type: getImageType(props.assetUrl || ''),
      name: props.assetUrl?.split('/').pop() || 'unknown',
    };
    applyFilters();
  };
  img.src = props.assetUrl;
}

onMounted(loadImage);
watch(() => props.assetUrl, loadImage);

watch(filters, applyFilters, { deep: true });

function resetFilters() {
  filters.value = {
    brightness: 100,
    contrast: 100,
    saturation: 100,
    blur: 0,
    grayscale: 0,
    sepia: 0,
  };
}

function zoomIn() {
  scale.value = Math.min(scale.value + 0.25, 5);
}
function zoomOut() {
  scale.value = Math.max(scale.value - 0.25, 0.25);
}
function resetZoom() {
  scale.value = 1;
}
function rotateLeft() {
  rotation.value -= 90;
}
function rotateRight() {
  rotation.value += 90;
}
function toggleFlipHorizontal() {
  flipH.value = !flipH.value;
}
function toggleFlipVertical() {
  flipV.value = !flipV.value;
}

function downloadImage() {
  if (!canvasRef.value) return;
  canvasRef.value.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `edited_${imageInfo.value?.name || 'image.png'}`;
    a.click();
    URL.revokeObjectURL(url);
  });
}

function getTransformStyle() {
  const transforms = [];
  transforms.push(`scale(${scale.value})`);
  transforms.push(`rotate(${rotation.value}deg)`);
  if (flipH.value) transforms.push('scaleX(-1)');
  if (flipV.value) transforms.push('scaleY(-1)');
  return transforms.join(' ');
}

function getFilterStyle() {
  return `
    brightness(${filters.value.brightness}%)
    contrast(${filters.value.contrast}%)
    saturate(${filters.value.saturation}%)
    blur(${filters.value.blur}px)
    grayscale(${filters.value.grayscale}%)
    sepia(${filters.value.sepia}%)
  `;
}

function closeSidebar() {
  showInfo.value = false;
  showFilters.value = false;
}
</script>

<template>
  <div class="h-full flex flex-col bg-primary">
    <div class="flex items-center justify-between px-4 py-2 bg-secondary border-b border-border">
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded"
          title="缩小"
          @click="zoomOut"
        >
          <ZoomOut class="w-4 h-4" />
        </button>
        <span class="text-muted-foreground text-sm min-w-[60px] text-center">
          {{ Math.round(scale * 100) }}%
        </span>
        <button
          type="button"
          class="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded"
          title="放大"
          @click="zoomIn"
        >
          <ZoomIn class="w-4 h-4" />
        </button>
        <button
          type="button"
          class="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded"
          title="重置缩放"
          @click="resetZoom"
        >
          <X class="w-4 h-4" />
        </button>

        <div class="w-px h-6 bg-border mx-2" />

        <button
          type="button"
          class="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded"
          title="左旋转"
          @click="rotateLeft"
        >
          <RotateCcw class="w-4 h-4" />
        </button>
        <button
          type="button"
          class="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded"
          title="右旋转"
          @click="rotateRight"
        >
          <RotateCw class="w-4 h-4" />
        </button>

        <div class="w-px h-6 bg-border mx-2" />

        <button
          type="button"
          class="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded"
          title="水平翻转"
          @click="toggleFlipHorizontal"
        >
          <FlipHorizontal class="w-4 h-4" />
        </button>
        <button
          type="button"
          class="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded"
          title="垂直翻转"
          @click="toggleFlipVertical"
        >
          <FlipVertical class="w-4 h-4" />
        </button>
      </div>

      <div class="flex items-center gap-2">
        <button
          type="button"
          :class="`p-2 rounded ${showFilters ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent'}`"
          title="滤镜"
          @click="showFilters = !showFilters"
        >
          <Palette class="w-4 h-4" />
        </button>
        <button
          type="button"
          :class="`p-2 rounded ${showInfo ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent'}`"
          title="信息"
          @click="showInfo = !showInfo"
        >
          <Info class="w-4 h-4" />
        </button>
        <button
          type="button"
          class="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded"
          title="下载"
          @click="downloadImage"
        >
          <Download class="w-4 h-4" />
        </button>
      </div>
    </div>

    <div class="flex-1 flex relative">
      <div
        :class="`flex-1 flex items-center justify-center overflow-hidden relative transition-all duration-300 ${showInfo || showFilters ? 'mr-80' : ''}`"
      >
        <img
          v-if="assetUrl"
          ref="imageRef"
          :src="assetUrl"
          alt="Preview"
          class="max-w-full max-h-full object-contain transition-transform duration-200"
          :style="{ transform: getTransformStyle(), filter: getFilterStyle() }"
          draggable="false"
        />
        <canvas ref="canvasRef" class="hidden" />
      </div>

      <div
        v-if="showInfo || showFilters"
        class="absolute right-0 top-0 bottom-0 w-80 bg-secondary border-l border-border overflow-y-auto shadow-2xl z-50"
      >
        <div class="p-4 border-b border-border">
          <div class="flex items-center justify-between">
            <h3 class="text-foreground font-medium">
              {{ showInfo ? '图片信息' : '图片滤镜' }}
            </h3>
            <button
              type="button"
              class="p-1 text-muted-foreground hover:text-foreground hover:bg-accent rounded"
              @click="closeSidebar"
            >
              <X class="w-4 h-4" />
            </button>
          </div>
        </div>

        <div v-if="showInfo" class="p-4">
          <div v-if="imageInfo" class="space-y-3 text-sm">
            <div class="flex justify-between">
              <span class="text-muted-foreground">文件名:</span>
              <span class="text-foreground truncate ml-2">{{ imageInfo.name }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted-foreground">尺寸:</span>
              <span class="text-foreground">{{ imageInfo.width }} × {{ imageInfo.height }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted-foreground">大小:</span>
              <span class="text-foreground">{{ imageInfo.size }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted-foreground">类型:</span>
              <span class="text-foreground">{{ imageInfo.type }}</span>
            </div>
          </div>
        </div>

        <div v-if="showFilters" class="p-4">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-foreground font-medium flex items-center gap-2">
              <Palette class="w-4 h-4" />
              图片滤镜
            </h3>
            <button
              type="button"
              class="text-xs text-muted-foreground hover:text-foreground"
              @click="resetFilters"
            >
              重置
            </button>
          </div>

          <div class="space-y-4">
            <div>
              <label class="text-muted-foreground text-sm flex justify-between mb-1">
                <span>亮度</span>
                <span>{{ filters.brightness }}%</span>
              </label>
              <input
                v-model.number="filters.brightness"
                type="range"
                min="0"
                max="200"
                class="w-full"
              />
            </div>
            <div>
              <label class="text-muted-foreground text-sm flex justify-between mb-1">
                <span>对比度</span>
                <span>{{ filters.contrast }}%</span>
              </label>
              <input
                v-model.number="filters.contrast"
                type="range"
                min="0"
                max="200"
                class="w-full"
              />
            </div>
            <div>
              <label class="text-muted-foreground text-sm flex justify-between mb-1">
                <span>饱和度</span>
                <span>{{ filters.saturation }}%</span>
              </label>
              <input
                v-model.number="filters.saturation"
                type="range"
                min="0"
                max="200"
                class="w-full"
              />
            </div>
            <div>
              <label class="text-muted-foreground text-sm flex justify-between mb-1">
                <span>模糊</span>
                <span>{{ filters.blur }}px</span>
              </label>
              <input v-model.number="filters.blur" type="range" min="0" max="20" class="w-full" />
            </div>
            <div>
              <label class="text-muted-foreground text-sm flex justify-between mb-1">
                <span>灰度</span>
                <span>{{ filters.grayscale }}%</span>
              </label>
              <input
                v-model.number="filters.grayscale"
                type="range"
                min="0"
                max="100"
                class="w-full"
              />
            </div>
            <div>
              <label class="text-muted-foreground text-sm flex justify-between mb-1">
                <span>褐色</span>
                <span>{{ filters.sepia }}%</span>
              </label>
              <input v-model.number="filters.sepia" type="range" min="0" max="100" class="w-full" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
