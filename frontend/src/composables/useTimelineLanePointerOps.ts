import { ref, type ComputedRef, type Ref } from 'vue';
import type { TimelineClip } from '@/types/models';

export type ResizeCurvePreview = {
  active: boolean;
  clipIndex: number;
  edge: 'start' | 'end';
  fromDurationSec: number;
  toDurationSec: number;
  curve: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';
};

type UseTimelineLanePointerOpsOptions = {
  clips: Ref<TimelineClip[]>;
  selectedClipIndex: Ref<number>;
  selectedClipIndices: Ref<number[]>;
  videoClipSpans: ComputedRef<Array<{ startSec: number; endSec: number }>>;
  timelineTotalDurationSec: ComputedRef<number>;
  timelinePlayheadSec: Ref<number>;
  timelineListRef: Ref<HTMLDivElement | null>;
  keyframePointDragState: Ref<{ point: 'start' | 'end' | 'cp1' | 'cp2' | 'progress' } | null>;
  cropDragState: Ref<{
    mode: 'move' | 'resize';
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    startOffsetX: number;
    startOffsetY: number;
  } | null>;
  handleFloatingPointerMove: (event: PointerEvent) => boolean;
  handleFloatingPointerUp: (containerRect: DOMRect | null) => void;
  applyCanvasPositionToKeyframe: (clientX: number, clientY: number) => void;
  applyCropDrag: (clientX: number, clientY: number) => void;
  syncVideoClipTimeline: () => void;
  normalizeDuration: (value: number) => number;
  normalizeClipIndices: (input: number[]) => number[];
  clampNumber: (value: number, min: number, max: number) => number;
  minClipDurationSec: number;
  appendResizeCurveSnapshot: (preview: ResizeCurvePreview) => void;
};

export const useTimelineLanePointerOps = (options: UseTimelineLanePointerOpsOptions) => {
  const selectionBox = ref({
    active: false,
    laneLeftPx: 0,
    laneWidthPx: 0,
    startPx: 0,
    currentPx: 0,
    leftPx: 0,
    widthPx: 0
  });

  const resizeState = ref<{
    clipIndex: number;
    edge: 'start' | 'end';
    startX: number;
    laneDurationSec: number;
    laneWidthPx: number;
    baseCurrentDuration: number;
    basePrevDuration: number;
  } | null>(null);

  const resizeCurvePreview = ref<ResizeCurvePreview | null>(null);

  const startVideoResize = (clipIndex: number, edge: 'start' | 'end', laneDurationSec: number, event: PointerEvent): void => {
    const current = options.clips.value[clipIndex];
    if (!current) {
      return;
    }
    const baseCurrentDuration = Math.max(options.minClipDurationSec, Number(current.durationSec ?? 5));
    const prev = options.clips.value[clipIndex - 1];
    const basePrevDuration = Math.max(options.minClipDurationSec, Number(prev?.durationSec ?? 5));
    const target = event.currentTarget as HTMLElement | null;
    const laneBars = target?.closest('.lane-bars') as HTMLDivElement | null;
    resizeState.value = {
      clipIndex,
      edge,
      startX: event.clientX,
      laneDurationSec: Math.max(0.1, laneDurationSec),
      laneWidthPx: Math.max(1, laneBars?.clientWidth ?? 1),
      baseCurrentDuration,
      basePrevDuration
    };
    const transitionCurve = current.transition?.easing || 'linear';
    resizeCurvePreview.value = {
      active: true,
      clipIndex,
      edge,
      fromDurationSec: baseCurrentDuration,
      toDurationSec: baseCurrentDuration,
      curve: transitionCurve === 'easeIn' || transitionCurve === 'easeOut' || transitionCurve === 'easeInOut' ? transitionCurve : 'linear'
    };
  };

  const onVideoLanePointerDown = (event: PointerEvent): void => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('.lane-bar') || target?.closest('.resize-handle')) {
      return;
    }
    const lane = event.currentTarget as HTMLElement | null;
    if (!lane) {
      return;
    }
    if (event.altKey && options.timelineTotalDurationSec.value > 0) {
      const rect = lane.getBoundingClientRect();
      const ratio = options.clampNumber((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
      options.timelinePlayheadSec.value = Number((options.timelineTotalDurationSec.value * ratio).toFixed(3));
      return;
    }
    const rect = lane.getBoundingClientRect();
    const offsetX = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
    selectionBox.value = {
      active: true,
      laneLeftPx: rect.left,
      laneWidthPx: Math.max(1, rect.width),
      startPx: offsetX,
      currentPx: offsetX,
      leftPx: offsetX,
      widthPx: 0
    };
  };

  const stopVideoResize = (): void => {
    const preview = resizeCurvePreview.value;
    if (preview && preview.active) {
      options.appendResizeCurveSnapshot(preview);
    }
    resizeState.value = null;
    if (preview) {
      resizeCurvePreview.value = {
        ...preview,
        active: false
      };
    }
  };

  const stopSelectionBox = (): void => {
    if (!selectionBox.value.active) {
      return;
    }
    const box = selectionBox.value;
    const ratioStart = box.leftPx / Math.max(1, box.laneWidthPx);
    const ratioEnd = (box.leftPx + box.widthPx) / Math.max(1, box.laneWidthPx);
    const secStart = Math.max(0, Math.min(ratioStart, ratioEnd) * options.timelineTotalDurationSec.value);
    const secEnd = Math.max(secStart, Math.max(ratioStart, ratioEnd) * options.timelineTotalDurationSec.value);
    const indices = options.videoClipSpans.value
      .map((span, idx) => ({ span, idx }))
      .filter((entry) => entry.span.endSec > secStart && entry.span.startSec < secEnd)
      .map((entry) => entry.idx);
    options.selectedClipIndices.value = options.normalizeClipIndices(indices);
    if (options.selectedClipIndices.value.length > 0) {
      options.selectedClipIndex.value = options.selectedClipIndices.value[0];
    }
    selectionBox.value = {
      active: false,
      laneLeftPx: 0,
      laneWidthPx: 0,
      startPx: 0,
      currentPx: 0,
      leftPx: 0,
      widthPx: 0
    };
  };

  const handleVideoResizeMove = (event: PointerEvent): void => {
    if (options.handleFloatingPointerMove(event)) {
      return;
    }
    if (options.keyframePointDragState.value) {
      options.applyCanvasPositionToKeyframe(event.clientX, event.clientY);
      return;
    }
    if (options.cropDragState.value) {
      options.applyCropDrag(event.clientX, event.clientY);
      return;
    }
    if (selectionBox.value.active) {
      const box = selectionBox.value;
      const offsetX = Math.max(0, Math.min(box.laneWidthPx, event.clientX - box.laneLeftPx));
      const leftPx = Math.min(box.startPx, offsetX);
      const widthPx = Math.abs(offsetX - box.startPx);
      selectionBox.value = {
        ...box,
        currentPx: offsetX,
        leftPx,
        widthPx
      };
      return;
    }
    const state = resizeState.value;
    if (!state) {
      return;
    }
    const deltaSec = ((event.clientX - state.startX) / state.laneWidthPx) * state.laneDurationSec;
    if (state.edge === 'end') {
      const clip = options.clips.value[state.clipIndex];
      if (!clip) {
        return;
      }
      const nextDuration = options.normalizeDuration(state.baseCurrentDuration + deltaSec);
      clip.durationSec = nextDuration;
      resizeCurvePreview.value = {
        active: true,
        clipIndex: state.clipIndex,
        edge: state.edge,
        fromDurationSec: state.baseCurrentDuration,
        toDurationSec: nextDuration,
        curve:
          clip.transition?.easing === 'easeIn' || clip.transition?.easing === 'easeOut' || clip.transition?.easing === 'easeInOut'
            ? clip.transition.easing
            : 'linear'
      };
      options.syncVideoClipTimeline();
      return;
    }
    if (state.clipIndex <= 0) {
      return;
    }
    const prev = options.clips.value[state.clipIndex - 1];
    const current = options.clips.value[state.clipIndex];
    if (!prev || !current) {
      return;
    }
    const minDelta = -(state.basePrevDuration - options.minClipDurationSec);
    const maxDelta = state.baseCurrentDuration - options.minClipDurationSec;
    const applied = Math.max(minDelta, Math.min(maxDelta, deltaSec));
    prev.durationSec = options.normalizeDuration(state.basePrevDuration + applied);
    const nextDuration = options.normalizeDuration(state.baseCurrentDuration - applied);
    current.durationSec = nextDuration;
    resizeCurvePreview.value = {
      active: true,
      clipIndex: state.clipIndex,
      edge: state.edge,
      fromDurationSec: state.baseCurrentDuration,
      toDurationSec: nextDuration,
      curve:
        current.transition?.easing === 'easeIn' || current.transition?.easing === 'easeOut' || current.transition?.easing === 'easeInOut'
          ? current.transition.easing
          : 'linear'
    };
    options.syncVideoClipTimeline();
  };

  const handleGlobalPointerUp = (): void => {
    options.keyframePointDragState.value = null;
    options.cropDragState.value = null;
    options.handleFloatingPointerUp(options.timelineListRef.value?.getBoundingClientRect() ?? null);
    stopVideoResize();
    stopSelectionBox();
  };

  return {
    handleGlobalPointerUp,
    handleVideoResizeMove,
    onVideoLanePointerDown,
    resizeCurvePreview,
    selectionBox,
    startVideoResize,
    stopSelectionBox,
    stopVideoResize
  };
};
