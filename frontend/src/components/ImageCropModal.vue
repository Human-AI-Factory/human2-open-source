<template>
  <div v-if="visible" class="crop-mask" @click.self="$emit('close')">
    <section class="crop-card">
      <header class="crop-header">
        <h3>{{ title || '裁剪图片' }}</h3>
        <button @click="$emit('close')">关闭</button>
      </header>

      <div class="crop-body" v-if="previewUrl">
        <div class="crop-preview-wrap">
          <div class="crop-preview">
            <img ref="imageRef" :src="previewUrl" alt="crop-source" @load="handleImageLoad" />
            <div
              class="crop-rect"
              :style="{
                left: `${cropXPct}%`,
                top: `${cropYPct}%`,
                width: `${cropWPct}%`,
                height: `${cropHPct}%`
              }"></div>
          </div>
          <p class="muted">原图：{{ imageWidth }} x {{ imageHeight }}</p>
          <p class="muted">裁剪：x={{ cropX }} y={{ cropY }} w={{ cropW }} h={{ cropH }}</p>
        </div>
        <div class="crop-controls">
          <label>
            预设比例
            <select v-model="aspectPreset" @change="applyAspectPreset">
              <option value="free">自由</option>
              <option value="1:1">1:1</option>
              <option value="4:3">4:3</option>
              <option value="16:9">16:9</option>
              <option value="9:16">9:16</option>
            </select>
          </label>
          <label>
            X
            <input v-model.number="cropX" type="number" min="0" :max="maxCropX" @input="clampRect" />
          </label>
          <label>
            Y
            <input v-model.number="cropY" type="number" min="0" :max="maxCropY" @input="clampRect" />
          </label>
          <label>
            宽
            <input v-model.number="cropW" type="number" min="1" :max="imageWidth" @input="handleSizeInput('w')" />
          </label>
          <label>
            高
            <input v-model.number="cropH" type="number" min="1" :max="imageHeight" @input="handleSizeInput('h')" />
          </label>
          <div class="actions">
            <button @click="resetRect">重置</button>
            <button class="primary" :disabled="submitting || !canConfirm" @click="confirmCrop">
              {{ submitting ? '处理中...' : '确认裁剪并继续上传' }}
            </button>
          </div>
        </div>
      </div>
      <p v-else class="muted">正在加载图片...</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';

const props = defineProps<{
  visible: boolean;
  file: File | null;
  title?: string;
  submitting?: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'confirm', file: File): void;
}>();

const imageRef = ref<HTMLImageElement | null>(null);
const previewUrl = ref('');
const imageWidth = ref(0);
const imageHeight = ref(0);
const cropX = ref(0);
const cropY = ref(0);
const cropW = ref(0);
const cropH = ref(0);
const aspectPreset = ref<'free' | '1:1' | '4:3' | '16:9' | '9:16'>('free');

const maxCropX = computed(() => Math.max(0, imageWidth.value - cropW.value));
const maxCropY = computed(() => Math.max(0, imageHeight.value - cropH.value));
const cropXPct = computed(() => (imageWidth.value > 0 ? (cropX.value / imageWidth.value) * 100 : 0));
const cropYPct = computed(() => (imageHeight.value > 0 ? (cropY.value / imageHeight.value) * 100 : 0));
const cropWPct = computed(() => (imageWidth.value > 0 ? (cropW.value / imageWidth.value) * 100 : 100));
const cropHPct = computed(() => (imageHeight.value > 0 ? (cropH.value / imageHeight.value) * 100 : 100));
const canConfirm = computed(() => imageWidth.value > 0 && imageHeight.value > 0 && cropW.value > 0 && cropH.value > 0);

const parseRatio = (preset: string): number | null => {
  if (preset === 'free') {
    return null;
  }
  const [w, h] = preset.split(':').map((item) => Number(item));
  if (!w || !h) {
    return null;
  }
  return w / h;
};

const resetRect = (): void => {
  cropX.value = 0;
  cropY.value = 0;
  cropW.value = imageWidth.value;
  cropH.value = imageHeight.value;
};

const clampRect = (): void => {
  cropW.value = Math.max(1, Math.min(imageWidth.value, Math.round(cropW.value)));
  cropH.value = Math.max(1, Math.min(imageHeight.value, Math.round(cropH.value)));
  cropX.value = Math.max(0, Math.min(maxCropX.value, Math.round(cropX.value)));
  cropY.value = Math.max(0, Math.min(maxCropY.value, Math.round(cropY.value)));
};

const applyAspectPreset = (): void => {
  const ratio = parseRatio(aspectPreset.value);
  if (!ratio) {
    clampRect();
    return;
  }
  let nextW = cropW.value;
  let nextH = Math.round(nextW / ratio);
  if (nextH > imageHeight.value) {
    nextH = imageHeight.value;
    nextW = Math.round(nextH * ratio);
  }
  if (nextW > imageWidth.value) {
    nextW = imageWidth.value;
    nextH = Math.round(nextW / ratio);
  }
  cropW.value = Math.max(1, nextW);
  cropH.value = Math.max(1, nextH);
  clampRect();
};

const handleSizeInput = (source: 'w' | 'h'): void => {
  const ratio = parseRatio(aspectPreset.value);
  if (ratio) {
    if (source === 'w') {
      cropH.value = Math.max(1, Math.round(cropW.value / ratio));
    } else {
      cropW.value = Math.max(1, Math.round(cropH.value * ratio));
    }
  }
  clampRect();
};

const handleImageLoad = (): void => {
  const image = imageRef.value;
  if (!image) {
    return;
  }
  imageWidth.value = image.naturalWidth || image.width;
  imageHeight.value = image.naturalHeight || image.height;
  aspectPreset.value = 'free';
  resetRect();
};

const deriveOutputName = (file: File): string => {
  const idx = file.name.lastIndexOf('.');
  if (idx <= 0) {
    return `${file.name || 'image'}-cropped.png`;
  }
  return `${file.name.slice(0, idx)}-cropped.png`;
};

const confirmCrop = (): void => {
  if (!props.file || !imageRef.value || !canConfirm.value) {
    return;
  }
  const canvas = document.createElement('canvas');
  canvas.width = cropW.value;
  canvas.height = cropH.value;
  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }
  context.drawImage(imageRef.value, cropX.value, cropY.value, cropW.value, cropH.value, 0, 0, cropW.value, cropH.value);
  canvas.toBlob((blob) => {
    if (!blob) {
      return;
    }
    const outputFile = new File([blob], deriveOutputName(props.file as File), { type: 'image/png' });
    emit('confirm', outputFile);
  }, 'image/png');
};

watch(
  () => props.file,
  (nextFile, prevFile) => {
    if (prevFile && previewUrl.value.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl.value);
    }
    if (!nextFile) {
      previewUrl.value = '';
      imageWidth.value = 0;
      imageHeight.value = 0;
      return;
    }
    previewUrl.value = URL.createObjectURL(nextFile);
  },
  { immediate: true }
);
</script>

<style scoped>
.crop-mask {
  position: fixed;
  inset: 0;
  background: var(--surface-backdrop-strong);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  z-index: 2000;
}

.crop-card {
  width: min(1000px, 96vw);
  max-height: 90vh;
  overflow: auto;
  background: var(--surface-panel-strong);
  border-radius: var(--radius-lg);
  padding: 14px;
  border: 1px solid var(--line);
  box-shadow: var(--shadow-overlay);
}

.crop-header {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
  margin-bottom: 10px;
}

.crop-body {
  display: grid;
  grid-template-columns: 1.25fr 1fr;
  gap: 12px;
}

.crop-preview-wrap {
  min-width: 0;
}

.crop-preview {
  position: relative;
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: 1px solid var(--line);
  background: var(--surface-spotlight);
}

.crop-preview img {
  display: block;
  width: 100%;
  height: auto;
}

.crop-rect {
  position: absolute;
  border: 2px solid var(--warning);
  box-shadow: 0 0 0 9999px var(--surface-backdrop);
  pointer-events: none;
}

.crop-controls {
  display: grid;
  gap: 10px;
  align-content: start;
}

.crop-controls label {
  display: grid;
  gap: 6px;
  color: var(--ink-1);
  font-size: 13px;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.muted {
  font-size: 12px;
}

@media (max-width: 920px) {
  .crop-body {
    grid-template-columns: 1fr;
  }
}
</style>
