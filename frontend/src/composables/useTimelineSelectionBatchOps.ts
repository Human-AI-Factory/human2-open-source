import { ref, type ComputedRef, type Ref } from 'vue';
import type { TimelineClip } from '@/types/models';

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
  easing: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';
  durationSec: number;
};

type UseTimelineSelectionBatchOpsOptions = {
  clips: Ref<TimelineClip[]>;
  selectedClip: ComputedRef<EditableTimelineClip | null>;
  selectedClipIndex: Ref<number>;
  selectedClipIndices: Ref<number[]>;
  selectionRangeStartSec: Ref<number>;
  selectionRangeEndSec: Ref<number>;
  durationScaleFactor: Ref<number>;
  videoClipSpans: ComputedRef<Array<{ startSec: number; endSec: number }>>;
  keyframePresets: KeyframePreset[];
  transitionCurvePresets: TransitionCurvePreset[];
  selectedKeyframePresetId: Ref<string>;
  selectedTransitionCurveId: Ref<string>;
  normalizeClipIndices: (input: number[]) => number[];
  syncVideoClipTimeline: () => void;
  normalizeDuration: (value: number) => number;
};

export const useTimelineSelectionBatchOps = (options: UseTimelineSelectionBatchOpsOptions) => {
  const batchTransitionDurationSec = ref(0.6);

  const getPresetTargetIndices = (): number[] => {
    if (options.selectedClipIndices.value.length > 0) {
      return options.normalizeClipIndices(options.selectedClipIndices.value);
    }
    if (options.selectedClip.value) {
      return [options.selectedClipIndex.value];
    }
    return [];
  };

  const selectClipsByRange = (): void => {
    const start = Math.max(0, Math.min(options.selectionRangeStartSec.value, options.selectionRangeEndSec.value));
    const end = Math.max(options.selectionRangeStartSec.value, options.selectionRangeEndSec.value);
    if (end <= start) {
      options.selectedClipIndices.value = [];
      return;
    }
    const indices = options.videoClipSpans.value
      .map((span, idx) => ({ span, idx }))
      .filter((entry) => entry.span.endSec > start && entry.span.startSec < end)
      .map((entry) => entry.idx);
    options.selectedClipIndices.value = options.normalizeClipIndices(indices);
    if (options.selectedClipIndices.value.length > 0) {
      options.selectedClipIndex.value = options.selectedClipIndices.value[0];
    }
  };

  const clearClipRangeSelection = (): void => {
    options.selectedClipIndices.value = [];
  };

  const applyKeyframePresetToSelection = (): void => {
    const preset = options.keyframePresets.find((entry) => entry.id === options.selectedKeyframePresetId.value);
    if (!preset) {
      return;
    }
    const indices = getPresetTargetIndices();
    for (const idx of indices) {
      const clip = options.clips.value[idx];
      if (!clip) {
        continue;
      }
      clip.keyframe = { ...preset.keyframe };
    }
  };

  const applyTransitionPresetToSelection = (): void => {
    const preset = options.transitionCurvePresets.find((entry) => entry.id === options.selectedTransitionCurveId.value);
    if (!preset) {
      return;
    }
    const indices = getPresetTargetIndices();
    for (const idx of indices) {
      const clip = options.clips.value[idx];
      if (!clip) {
        continue;
      }
      clip.transition = {
        type: clip.transition?.type || 'fade',
        durationSec: preset.durationSec,
        easing: preset.easing,
        direction: clip.transition?.direction || 'left'
      };
    }
  };

  const scaleSelectedClipDurations = (): void => {
    const indices = getPresetTargetIndices();
    if (indices.length === 0) {
      return;
    }
    const factor = Number.isFinite(options.durationScaleFactor.value) ? Math.max(0.1, Math.min(3, options.durationScaleFactor.value)) : 1;
    for (const idx of indices) {
      const clip = options.clips.value[idx];
      if (!clip) {
        continue;
      }
      clip.durationSec = options.normalizeDuration(Number(clip.durationSec ?? 5) * factor);
    }
    options.syncVideoClipTimeline();
  };

  const quickScaleSelectedClipDurations = (factor: number): void => {
    options.durationScaleFactor.value = factor;
    scaleSelectedClipDurations();
  };

  const applyBatchTransitionDuration = (): void => {
    const indices = getPresetTargetIndices();
    if (indices.length === 0) {
      return;
    }
    const nextDuration = Number.isFinite(batchTransitionDurationSec.value)
      ? Math.max(0, Math.min(5, Number(batchTransitionDurationSec.value)))
      : 0.6;
    for (const idx of indices) {
      const clip = options.clips.value[idx];
      if (!clip) {
        continue;
      }
      clip.transition = {
        type: clip.transition?.type || 'fade',
        durationSec: nextDuration,
        easing: clip.transition?.easing || 'easeInOut',
        direction: clip.transition?.direction || 'left'
      };
    }
  };

  const copyCurrentClipParamsToSelection = (): void => {
    const source = options.selectedClip.value;
    if (!source) {
      return;
    }
    const indices = getPresetTargetIndices();
    if (indices.length === 0) {
      return;
    }
    for (const idx of indices) {
      if (idx === options.selectedClipIndex.value) {
        continue;
      }
      const clip = options.clips.value[idx];
      if (!clip) {
        continue;
      }
      clip.speed = source.speed;
      clip.volume = source.volume;
      clip.muted = source.muted;
      clip.fadeInMs = source.fadeInMs;
      clip.fadeOutMs = source.fadeOutMs;
      clip.trimStartMs = source.trimStartMs;
      clip.trimEndMs = source.trimEndMs;
      clip.transition = source.transition
        ? {
            type: source.transition.type,
            durationSec: source.transition.durationSec,
            easing: source.transition.easing,
            direction: source.transition.direction
          }
        : undefined;
      clip.keyframe = source.keyframe
        ? {
            startScale: source.keyframe.startScale,
            endScale: source.keyframe.endScale,
            startX: source.keyframe.startX,
            startY: source.keyframe.startY,
            endX: source.keyframe.endX,
            endY: source.keyframe.endY,
            rotationDeg: source.keyframe.rotationDeg
          }
        : undefined;
      clip.effects = source.effects
        ? source.effects.map((effect) => ({
            type: effect.type,
            enabled: effect.enabled,
            config:
              effect.config && typeof effect.config === 'object'
                ? { ...(effect.config as Record<string, unknown>) }
                : {}
          }))
        : undefined;
    }
  };

  const resetSelectedClipKeyframes = (): void => {
    const indices = getPresetTargetIndices();
    if (indices.length === 0) {
      return;
    }
    for (const idx of indices) {
      const clip = options.clips.value[idx];
      if (!clip) {
        continue;
      }
      clip.keyframe = { startScale: 1, endScale: 1, startX: 0, startY: 0, endX: 0, endY: 0, rotationDeg: 0 };
    }
  };

  return {
    applyBatchTransitionDuration,
    applyKeyframePresetToSelection,
    applyTransitionPresetToSelection,
    batchTransitionDurationSec,
    clearClipRangeSelection,
    copyCurrentClipParamsToSelection,
    quickScaleSelectedClipDurations,
    resetSelectedClipKeyframes,
    scaleSelectedClipDurations,
    selectClipsByRange
  };
};
