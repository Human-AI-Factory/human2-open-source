import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';
import type { TimelineClip } from '@/types/models';

type CurveType = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';
type ClipEffectType = NonNullable<TimelineClip['effects']>[number]['type'];
type EditableTimelineClip = TimelineClip & {
  transition: NonNullable<TimelineClip['transition']>;
  keyframe: NonNullable<TimelineClip['keyframe']>;
};
type KeyframePreset = {
  id: string;
  label: string;
  keyframe: NonNullable<TimelineClip['keyframe']>;
};
type TransitionCurvePreset = {
  id: string;
  label: string;
  easing: CurveType;
  durationSec: number;
};

type UseTimelineClipMotionEditorOptions = {
  selectedClip: ComputedRef<EditableTimelineClip | null>;
  selectedClipIndex: Ref<number>;
  selectedKeyframePresetId: Ref<string>;
  selectedTransitionCurveId: Ref<string>;
  keyframePresets: KeyframePreset[];
  transitionCurvePresets: TransitionCurvePreset[];
  checkpointTimelineEdit: (action: string, detail?: string) => void;
  clampNumber: (value: number, min: number, max: number) => number;
  isEffectEnabled: (type: ClipEffectType) => boolean;
  getNumericEffectConfig: (type: ClipEffectType, key: string, fallback: number) => number;
  setNumericEffectConfig: (
    type: ClipEffectType,
    key: string,
    rawValue: number,
    min: number,
    max: number,
    precision?: number
  ) => void;
};

export const useTimelineClipMotionEditor = (options: UseTimelineClipMotionEditorOptions) => {
  const keyframeCanvasRef = ref<HTMLDivElement | null>(null);
  const cropCanvasRef = ref<HTMLDivElement | null>(null);
  const cropAspectLock = ref<'free' | '16:9' | '9:16' | '1:1'>('free');
  const cropDragState = ref<{
    mode: 'move' | 'resize';
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    startOffsetX: number;
    startOffsetY: number;
  } | null>(null);
  const keyframePointDragState = ref<{
    point: 'start' | 'end' | 'cp1' | 'cp2' | 'progress';
  } | null>(null);
  const keyframePreviewProgress = ref(0);
  const keyframePreviewPlaying = ref(false);
  const bezierControl1 = ref({ x: 30, y: 30 });
  const bezierControl2 = ref({ x: 70, y: 70 });
  const curveStrengthPercent = ref(60);
  let keyframePreviewTimer: number | null = null;

  const normalizePercentValue = (value: number): number => {
    if (!Number.isFinite(value)) {
      return 0;
    }
    return Math.max(-100, Math.min(100, Number(value.toFixed(1))));
  };

  const percentToCanvasRatio = (value: number): number => (normalizePercentValue(value) + 100) / 200;

  const keyframeStartPosition = computed(() => ({
    x: options.selectedClip.value?.keyframe.startX ?? 0,
    y: options.selectedClip.value?.keyframe.startY ?? 0
  }));

  const keyframeEndPosition = computed(() => ({
    x: options.selectedClip.value?.keyframe.endX ?? 0,
    y: options.selectedClip.value?.keyframe.endY ?? 0
  }));

  const keyframeStartCanvas = computed(() => ({
    x: percentToCanvasRatio(keyframeStartPosition.value.x) * 100,
    y: percentToCanvasRatio(keyframeStartPosition.value.y) * 100
  }));

  const keyframeEndCanvas = computed(() => ({
    x: percentToCanvasRatio(keyframeEndPosition.value.x) * 100,
    y: percentToCanvasRatio(keyframeEndPosition.value.y) * 100
  }));

  const selectedTransitionCurve = computed<CurveType>(() => {
    const direct = options.selectedClip.value?.transition?.easing;
    if (direct === 'linear' || direct === 'easeIn' || direct === 'easeOut' || direct === 'easeInOut') {
      return direct;
    }
    const preset = options.transitionCurvePresets.find((item) => item.id === options.selectedTransitionCurveId.value);
    return preset?.easing ?? 'linear';
  });

  const keyframeCurveLabel = computed(() => {
    const curve = selectedTransitionCurve.value;
    if (curve === 'easeIn') return 'easeIn';
    if (curve === 'easeOut') return 'easeOut';
    if (curve === 'easeInOut') return 'easeInOut';
    return 'linear';
  });

  const cubicBezierValue = (t: number, p0: number, p1: number, p2: number, p3: number): number => {
    const clamped = Math.max(0, Math.min(1, t));
    const mt = 1 - clamped;
    return mt ** 3 * p0 + 3 * mt ** 2 * clamped * p1 + 3 * mt * clamped ** 2 * p2 + clamped ** 3 * p3;
  };

  const buildCurvePoint = (progress: number): { x: number; y: number } => {
    const t = Math.max(0, Math.min(1, progress));
    return {
      x: Number(
        cubicBezierValue(
          t,
          keyframeStartCanvas.value.x,
          bezierControl1.value.x,
          bezierControl2.value.x,
          keyframeEndCanvas.value.x
        ).toFixed(3)
      ),
      y: Number(
        cubicBezierValue(
          t,
          keyframeStartCanvas.value.y,
          bezierControl1.value.y,
          bezierControl2.value.y,
          keyframeEndCanvas.value.y
        ).toFixed(3)
      )
    };
  };

  const keyframeCurvePathD = computed(() =>
    [
      `M ${keyframeStartCanvas.value.x} ${keyframeStartCanvas.value.y}`,
      `C ${bezierControl1.value.x} ${bezierControl1.value.y}, ${bezierControl2.value.x} ${bezierControl2.value.y}, ${keyframeEndCanvas.value.x} ${keyframeEndCanvas.value.y}`
    ].join(' ')
  );

  const keyframeProgressCanvas = computed(() => {
    const p = Math.max(0, Math.min(1, keyframePreviewProgress.value));
    return buildCurvePoint(p);
  });

  const keyframeSamplePoints = computed(() =>
    Array.from({ length: 11 }, (_, idx) => {
      const t = idx / 10;
      const point = buildCurvePoint(t);
      return {
        t: Number(t.toFixed(2)),
        x: point.x,
        y: point.y
      };
    })
  );

  const resetSelectedClipTransition = (): void => {
    const item = options.selectedClip.value;
    if (!item) {
      return;
    }
    options.checkpointTimelineEdit('reset-transition', `片段 #${options.selectedClipIndex.value + 1}`);
    item.transition = {
      type: 'fade',
      durationSec: 0.6,
      easing: 'easeInOut',
      direction: 'left'
    };
  };

  const resetSelectedClipKeyframe = (): void => {
    const item = options.selectedClip.value;
    if (!item) {
      return;
    }
    options.checkpointTimelineEdit('reset-keyframe', `片段 #${options.selectedClipIndex.value + 1}`);
    item.keyframe = { startScale: 1, endScale: 1, startX: 0, startY: 0, endX: 0, endY: 0, rotationDeg: 0 };
  };

  const applySelectedKeyframePreset = (): void => {
    const item = options.selectedClip.value;
    if (!item) {
      return;
    }
    const preset = options.keyframePresets.find((entry) => entry.id === options.selectedKeyframePresetId.value);
    if (!preset) {
      return;
    }
    options.checkpointTimelineEdit('apply-keyframe-preset', preset.label);
    item.keyframe = { ...preset.keyframe };
  };

  const buildBezierByStrength = (
    curve: CurveType,
    strengthPercent: number
  ): { c1: { x: number; y: number }; c2: { x: number; y: number } } => {
    const s = options.clampNumber(strengthPercent, 0, 100) / 100;
    if (curve === 'easeIn') {
      return {
        c1: { x: Number((30 - 20 * s).toFixed(2)), y: Number((32 - 24 * s).toFixed(2)) },
        c2: { x: Number((72 + 20 * s).toFixed(2)), y: Number((66 + 28 * s).toFixed(2)) }
      };
    }
    if (curve === 'easeOut') {
      return {
        c1: { x: Number((18 - 12 * s).toFixed(2)), y: Number((18 - 12 * s).toFixed(2)) },
        c2: { x: Number((74 + 20 * s).toFixed(2)), y: Number((72 + 22 * s).toFixed(2)) }
      };
    }
    if (curve === 'easeInOut') {
      return {
        c1: { x: Number((30 - 14 * s).toFixed(2)), y: Number((30 - 22 * s).toFixed(2)) },
        c2: { x: Number((70 + 14 * s).toFixed(2)), y: Number((70 + 22 * s).toFixed(2)) }
      };
    }
    return {
      c1: { x: Number((30 - 8 * s).toFixed(2)), y: Number((30 - 8 * s).toFixed(2)) },
      c2: { x: Number((70 + 8 * s).toFixed(2)), y: Number((70 + 8 * s).toFixed(2)) }
    };
  };

  const toBezierControlDefaults = (curve: CurveType): { c1: { x: number; y: number }; c2: { x: number; y: number } } =>
    buildBezierByStrength(curve, curveStrengthPercent.value);

  const applyCurveStrengthToBezier = (): void => {
    const controls = buildBezierByStrength(selectedTransitionCurve.value, curveStrengthPercent.value);
    bezierControl1.value = controls.c1;
    bezierControl2.value = controls.c2;
  };

  const resetBezierControlsByPreset = (): void => {
    const controls = toBezierControlDefaults(selectedTransitionCurve.value);
    bezierControl1.value = controls.c1;
    bezierControl2.value = controls.c2;
  };

  const applySelectedTransitionCurvePreset = (): void => {
    const item = options.selectedClip.value;
    if (!item) {
      return;
    }
    const preset = options.transitionCurvePresets.find((entry) => entry.id === options.selectedTransitionCurveId.value);
    if (!preset) {
      return;
    }
    options.checkpointTimelineEdit('apply-transition-curve', preset.label);
    item.transition = {
      type: item.transition?.type || 'fade',
      durationSec: preset.durationSec,
      easing: preset.easing,
      direction: item.transition?.direction || 'left'
    };
    const controls = toBezierControlDefaults(preset.easing);
    bezierControl1.value = controls.c1;
    bezierControl2.value = controls.c2;
  };

  const resolveCropAspectRatio = (): number | null => {
    if (cropAspectLock.value === '16:9') {
      return 16 / 9;
    }
    if (cropAspectLock.value === '9:16') {
      return 9 / 16;
    }
    if (cropAspectLock.value === '1:1') {
      return 1;
    }
    return null;
  };

  const normalizeCropSizeWithAspect = (rawWidth: number, rawHeight: number): { width: number; height: number } => {
    let width = options.clampNumber(rawWidth, 10, 100);
    let height = options.clampNumber(rawHeight, 10, 100);
    const ratio = resolveCropAspectRatio();
    if (!ratio) {
      return { width, height };
    }
    if (width / Math.max(1e-6, height) > ratio) {
      width = height * ratio;
    } else {
      height = width / ratio;
    }
    if (width > 100) {
      width = 100;
      height = width / ratio;
    }
    if (height > 100) {
      height = 100;
      width = height * ratio;
    }
    if (width < 10) {
      width = 10;
      height = width / ratio;
    }
    if (height < 10) {
      height = 10;
      width = height * ratio;
    }
    width = options.clampNumber(width, 10, 100);
    height = options.clampNumber(height, 10, 100);
    return {
      width: Number(width.toFixed(3)),
      height: Number(height.toFixed(3))
    };
  };

  const resetCropToFullFrame = (): void => {
    options.setNumericEffectConfig('crop', 'width', 100, 10, 100, 1);
    options.setNumericEffectConfig('crop', 'height', 100, 10, 100, 1);
    options.setNumericEffectConfig('crop', 'offsetX', 0, -100, 100, 1);
    options.setNumericEffectConfig('crop', 'offsetY', 0, -100, 100, 1);
  };

  const cropBoxStyle = computed(() => {
    const width = options.clampNumber(options.getNumericEffectConfig('crop', 'width', 100), 10, 100);
    const height = options.clampNumber(options.getNumericEffectConfig('crop', 'height', 100), 10, 100);
    const offsetX = options.clampNumber(options.getNumericEffectConfig('crop', 'offsetX', 0), -100, 100);
    const offsetY = options.clampNumber(options.getNumericEffectConfig('crop', 'offsetY', 0), -100, 100);
    const availableX = 100 - width;
    const availableY = 100 - height;
    const left = availableX / 2 + (availableX / 2) * (offsetX / 100);
    const top = availableY / 2 + (availableY / 2) * (offsetY / 100);
    return {
      width: `${width}%`,
      height: `${height}%`,
      left: `${left}%`,
      top: `${top}%`
    };
  });

  const startCropDrag = (mode: 'move' | 'resize', event: PointerEvent): void => {
    if (!options.isEffectEnabled('crop')) {
      return;
    }
    cropDragState.value = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: options.clampNumber(options.getNumericEffectConfig('crop', 'width', 100), 10, 100),
      startHeight: options.clampNumber(options.getNumericEffectConfig('crop', 'height', 100), 10, 100),
      startOffsetX: options.clampNumber(options.getNumericEffectConfig('crop', 'offsetX', 0), -100, 100),
      startOffsetY: options.clampNumber(options.getNumericEffectConfig('crop', 'offsetY', 0), -100, 100)
    };
  };

  const applyCropDrag = (clientX: number, clientY: number): void => {
    const drag = cropDragState.value;
    const canvas = cropCanvasRef.value;
    if (!drag || !canvas) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const dxPx = clientX - drag.startX;
    const dyPx = clientY - drag.startY;
    if (drag.mode === 'move') {
      const availableX = Math.max(0, rect.width * (1 - drag.startWidth / 100));
      const availableY = Math.max(0, rect.height * (1 - drag.startHeight / 100));
      const offsetXDelta = availableX > 1 ? (dxPx / (availableX / 2)) * 100 : 0;
      const offsetYDelta = availableY > 1 ? (dyPx / (availableY / 2)) * 100 : 0;
      options.setNumericEffectConfig('crop', 'offsetX', drag.startOffsetX + offsetXDelta, -100, 100, 1);
      options.setNumericEffectConfig('crop', 'offsetY', drag.startOffsetY + offsetYDelta, -100, 100, 1);
      return;
    }
    const widthDelta = rect.width > 1 ? (dxPx / rect.width) * 100 : 0;
    const heightDelta = rect.height > 1 ? (dyPx / rect.height) * 100 : 0;
    let nextWidth = drag.startWidth + widthDelta;
    let nextHeight = drag.startHeight + heightDelta;
    const ratio = resolveCropAspectRatio();
    if (ratio) {
      if (Math.abs(widthDelta) >= Math.abs(heightDelta)) {
        nextHeight = nextWidth / ratio;
      } else {
        nextWidth = nextHeight * ratio;
      }
    }
    const normalized = normalizeCropSizeWithAspect(nextWidth, nextHeight);
    options.setNumericEffectConfig('crop', 'width', normalized.width, 10, 100, 1);
    options.setNumericEffectConfig('crop', 'height', normalized.height, 10, 100, 1);
  };

  const keyframePointStyle = (point: 'start' | 'end' | 'cp1' | 'cp2' | 'progress'): { left: string; top: string } => {
    const source =
      point === 'start'
        ? keyframeStartPosition.value
        : point === 'end'
        ? keyframeEndPosition.value
        : point === 'progress'
        ? { x: keyframeProgressCanvas.value.x * 2 - 100, y: keyframeProgressCanvas.value.y * 2 - 100 }
        : point === 'cp1'
        ? { x: bezierControl1.value.x * 2 - 100, y: bezierControl1.value.y * 2 - 100 }
        : { x: bezierControl2.value.x * 2 - 100, y: bezierControl2.value.y * 2 - 100 };
    const left = percentToCanvasRatio(source.x) * 100;
    const top = percentToCanvasRatio(source.y) * 100;
    return {
      left: `${left.toFixed(3)}%`,
      top: `${top.toFixed(3)}%`
    };
  };

  const stopKeyframePreview = (): void => {
    keyframePreviewPlaying.value = false;
    if (keyframePreviewTimer !== null) {
      window.clearInterval(keyframePreviewTimer);
      keyframePreviewTimer = null;
    }
  };

  const applyCanvasPositionToKeyframe = (clientX: number, clientY: number): void => {
    const clip = options.selectedClip.value;
    const drag = keyframePointDragState.value;
    const canvas = keyframeCanvasRef.value;
    if (!drag || !canvas) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }
    const ratioX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const ratioY = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    const mappedX = normalizePercentValue(ratioX * 200 - 100);
    const mappedY = normalizePercentValue(ratioY * 200 - 100);
    if (drag.point === 'progress') {
      stopKeyframePreview();
      keyframePreviewProgress.value = Number(ratioX.toFixed(3));
    } else if (!clip) {
      return;
    } else if (drag.point === 'start') {
      clip.keyframe.startX = mappedX;
      clip.keyframe.startY = mappedY;
    } else if (drag.point === 'end') {
      clip.keyframe.endX = mappedX;
      clip.keyframe.endY = mappedY;
    } else if (drag.point === 'cp1') {
      bezierControl1.value = {
        x: Number((ratioX * 100).toFixed(3)),
        y: Number((ratioY * 100).toFixed(3))
      };
    } else {
      bezierControl2.value = {
        x: Number((ratioX * 100).toFixed(3)),
        y: Number((ratioY * 100).toFixed(3))
      };
    }
  };

  const startKeyframePointDrag = (point: 'start' | 'end' | 'cp1' | 'cp2' | 'progress', event: PointerEvent): void => {
    if (!options.selectedClip.value && point !== 'progress') {
      return;
    }
    keyframePointDragState.value = { point };
    applyCanvasPositionToKeyframe(event.clientX, event.clientY);
  };

  const onKeyframeCanvasPointerDown = (event: PointerEvent): void => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('.keyframe-point')) {
      return;
    }
    keyframePointDragState.value = { point: 'progress' };
    applyCanvasPositionToKeyframe(event.clientX, event.clientY);
  };

  const toggleKeyframePreviewPlay = (): void => {
    if (keyframePreviewPlaying.value) {
      stopKeyframePreview();
      return;
    }
    if (keyframePreviewProgress.value >= 0.999) {
      keyframePreviewProgress.value = 0;
    }
    keyframePreviewPlaying.value = true;
    keyframePreviewTimer = window.setInterval(() => {
      if (!keyframePreviewPlaying.value) {
        return;
      }
      const next = keyframePreviewProgress.value + 0.015;
      if (next >= 1) {
        keyframePreviewProgress.value = 1;
        stopKeyframePreview();
        return;
      }
      keyframePreviewProgress.value = Number(next.toFixed(3));
    }, 16);
  };

  watch(curveStrengthPercent, () => {
    applyCurveStrengthToBezier();
  });

  return {
    applyCanvasPositionToKeyframe,
    applyCropDrag,
    applySelectedKeyframePreset,
    applySelectedTransitionCurvePreset,
    bezierControl1,
    bezierControl2,
    cropAspectLock,
    cropBoxStyle,
    cropCanvasRef,
    cropDragState,
    curveStrengthPercent,
    keyframeCanvasRef,
    keyframeCurveLabel,
    keyframeCurvePathD,
    keyframeEndCanvas,
    keyframeEndPosition,
    keyframePointDragState,
    keyframePointStyle,
    keyframePreviewPlaying,
    keyframePreviewProgress,
    keyframeProgressCanvas,
    keyframeSamplePoints,
    keyframeStartCanvas,
    keyframeStartPosition,
    onKeyframeCanvasPointerDown,
    resetBezierControlsByPreset,
    resetCropToFullFrame,
    resetSelectedClipKeyframe,
    resetSelectedClipTransition,
    startCropDrag,
    startKeyframePointDrag,
    stopKeyframePreview,
    toggleKeyframePreviewPlay
  };
};
