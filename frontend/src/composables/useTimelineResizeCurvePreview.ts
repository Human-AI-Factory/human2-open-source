import { computed, ref, type Ref } from 'vue';
import type { ResizeCurvePreview } from '@/composables/useTimelineLanePointerOps';

export type ResizeCurveSnapshot = {
  clipIndex: number;
  edge: 'start' | 'end';
  fromDurationSec: number;
  toDurationSec: number;
  curve: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';
  durationDeltaSec: number;
  startSlopeDelta: number;
  endSlopeDelta: number;
  oldPath: string;
  newPath: string;
};

type UseTimelineResizeCurvePreviewOptions = {
  resizeCurvePreview: Ref<ResizeCurvePreview | null>;
  minClipDurationSec: number;
  maxSnapshots?: number;
};

export const useTimelineResizeCurvePreview = (options: UseTimelineResizeCurvePreviewOptions) => {
  const resizeCurveSnapshots = ref<ResizeCurveSnapshot[]>([]);

  const getResizeCurveControl = (curve: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut', y1: number, y2: number) =>
    ({
      linear: { c1x: 96, c1y: y1, c2x: 204, c2y: y2 },
      easeIn: { c1x: 96, c1y: y1 + 20, c2x: 204, c2y: y2 - 6 },
      easeOut: { c1x: 96, c1y: y1 - 6, c2x: 204, c2y: y2 + 20 },
      easeInOut: { c1x: 96, c1y: y1 + 14, c2x: 204, c2y: y2 + 14 }
    }[curve]);

  const buildResizeCurvePath = (
    fromDurationSec: number,
    toDurationSec: number,
    curve: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut'
  ): string => {
    const from = Math.max(options.minClipDurationSec, fromDurationSec);
    const to = Math.max(options.minClipDurationSec, toDurationSec);
    const max = Math.max(from, to);
    if (max <= 0) {
      return '';
    }
    const x1 = 8;
    const y1 = 90 - (from / max) * 80;
    const x2 = 292;
    const y2 = 90 - (to / max) * 80;
    const control = getResizeCurveControl(curve, y1, y2);
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} C ${control.c1x.toFixed(2)} ${control.c1y.toFixed(2)}, ${control.c2x.toFixed(2)} ${control.c2y.toFixed(2)}, ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  };

  const computeResizeCurveSlopeMeta = (
    fromDurationSec: number,
    toDurationSec: number,
    curve: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut'
  ) => {
    const from = Math.max(options.minClipDurationSec, fromDurationSec);
    const to = Math.max(options.minClipDurationSec, toDurationSec);
    const max = Math.max(from, to);
    const x1 = 8;
    const y1 = 90 - (from / max) * 80;
    const x2 = 292;
    const y2 = 90 - (to / max) * 80;
    const control = getResizeCurveControl(curve, y1, y2);
    const startSlope = (control.c1y - y1) / Math.max(1e-6, control.c1x - x1);
    const endSlope = (y2 - control.c2y) / Math.max(1e-6, x2 - control.c2x);
    return { startSlope, endSlope };
  };

  const buildResizeCurveSnapshot = (preview: ResizeCurvePreview): ResizeCurveSnapshot => {
    const oldMeta = computeResizeCurveSlopeMeta(preview.fromDurationSec, preview.fromDurationSec, preview.curve);
    const newMeta = computeResizeCurveSlopeMeta(preview.fromDurationSec, preview.toDurationSec, preview.curve);
    return {
      clipIndex: preview.clipIndex,
      edge: preview.edge,
      fromDurationSec: preview.fromDurationSec,
      toDurationSec: preview.toDurationSec,
      curve: preview.curve,
      durationDeltaSec: preview.toDurationSec - preview.fromDurationSec,
      startSlopeDelta: newMeta.startSlope - oldMeta.startSlope,
      endSlopeDelta: newMeta.endSlope - oldMeta.endSlope,
      oldPath: buildResizeCurvePath(preview.fromDurationSec, preview.fromDurationSec, preview.curve),
      newPath: buildResizeCurvePath(preview.fromDurationSec, preview.toDurationSec, preview.curve)
    };
  };

  const appendResizeCurveSnapshot = (preview: ResizeCurvePreview): void => {
    resizeCurveSnapshots.value = [buildResizeCurveSnapshot(preview), ...resizeCurveSnapshots.value].slice(0, options.maxSnapshots ?? 5);
  };

  const clearResizeCurveSnapshots = (): void => {
    resizeCurveSnapshots.value = [];
  };

  const resizeCurveOldPath = computed(() => {
    const preview = options.resizeCurvePreview.value;
    if (!preview || !preview.active) {
      return '';
    }
    return buildResizeCurvePath(preview.fromDurationSec, preview.fromDurationSec, preview.curve);
  });

  const resizeCurveNewPath = computed(() => {
    const preview = options.resizeCurvePreview.value;
    if (!preview || !preview.active) {
      return '';
    }
    return buildResizeCurvePath(preview.fromDurationSec, preview.toDurationSec, preview.curve);
  });

  const resizeCurveDurationDeltaSec = computed(() => {
    const preview = options.resizeCurvePreview.value;
    if (!preview || !preview.active) {
      return 0;
    }
    return preview.toDurationSec - preview.fromDurationSec;
  });

  const resizeCurveStartSlopeDelta = computed(() => {
    const preview = options.resizeCurvePreview.value;
    if (!preview || !preview.active) {
      return 0;
    }
    const oldMeta = computeResizeCurveSlopeMeta(preview.fromDurationSec, preview.fromDurationSec, preview.curve);
    const newMeta = computeResizeCurveSlopeMeta(preview.fromDurationSec, preview.toDurationSec, preview.curve);
    return newMeta.startSlope - oldMeta.startSlope;
  });

  const resizeCurveEndSlopeDelta = computed(() => {
    const preview = options.resizeCurvePreview.value;
    if (!preview || !preview.active) {
      return 0;
    }
    const oldMeta = computeResizeCurveSlopeMeta(preview.fromDurationSec, preview.fromDurationSec, preview.curve);
    const newMeta = computeResizeCurveSlopeMeta(preview.fromDurationSec, preview.toDurationSec, preview.curve);
    return newMeta.endSlope - oldMeta.endSlope;
  });

  return {
    appendResizeCurveSnapshot,
    clearResizeCurveSnapshots,
    resizeCurveDurationDeltaSec,
    resizeCurveEndSlopeDelta,
    resizeCurveNewPath,
    resizeCurveOldPath,
    resizeCurveSnapshots,
    resizeCurveStartSlopeDelta
  };
};
