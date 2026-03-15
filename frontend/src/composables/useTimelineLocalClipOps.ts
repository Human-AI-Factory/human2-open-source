import type { ComputedRef, Ref } from 'vue';
import type { TimelineClip } from '@/types/models';

type EditableTimelineClip = TimelineClip & {
  transition: NonNullable<TimelineClip['transition']>;
  keyframe: NonNullable<TimelineClip['keyframe']>;
};

type UseTimelineLocalClipOpsOptions = {
  clips: Ref<TimelineClip[]>;
  selectedClip: ComputedRef<EditableTimelineClip | null>;
  selectedClipIndex: Ref<number>;
  selectedClipIndices: Ref<number[]>;
  videoClipSpans: ComputedRef<Array<{ startSec: number; endSec: number }>>;
  timelinePlayheadSec: Ref<number>;
  checkpointTimelineEdit: (action: string, detail?: string) => void;
  syncVideoClipTimeline: () => void;
  ensureSelectedClipIndex: () => void;
  normalizeClipIndices: (input: number[]) => number[];
  normalizePlayhead: (value: number) => number;
  normalizeDuration: (value: number) => number;
  clampNumber: (value: number, min: number, max: number) => number;
};

export const useTimelineLocalClipOps = (options: UseTimelineLocalClipOpsOptions) => {
  const moveClip = (idx: number, delta: number): void => {
    const target = idx + delta;
    if (target < 0 || target >= options.clips.value.length) {
      return;
    }
    options.checkpointTimelineEdit('move-clip', `片段 #${idx + 1} -> #${target + 1}`);
    const next = [...options.clips.value];
    const [item] = next.splice(idx, 1);
    next.splice(target, 0, item);
    options.clips.value = next;
    options.syncVideoClipTimeline();
    if (options.selectedClipIndex.value === idx) {
      options.selectedClipIndex.value = target;
    }
  };

  const removeClip = (idx: number): void => {
    options.checkpointTimelineEdit('remove-clip', `删除片段 #${idx + 1}`);
    options.clips.value.splice(idx, 1);
    options.syncVideoClipTimeline();
    options.ensureSelectedClipIndex();
  };

  const removeSelectedClips = (): void => {
    const indices = options.normalizeClipIndices(options.selectedClipIndices.value);
    if (indices.length === 0) {
      return;
    }
    options.checkpointTimelineEdit('remove-selected-clips', `删除 ${indices.length} 个片段`);
    const next = [...options.clips.value];
    for (const idx of [...indices].sort((a, b) => b - a)) {
      next.splice(idx, 1);
    }
    options.clips.value = next;
    options.syncVideoClipTimeline();
    options.selectedClipIndices.value = [];
    options.ensureSelectedClipIndex();
  };

  const duplicateSelectedClips = (): void => {
    const indices = options.normalizeClipIndices(options.selectedClipIndices.value);
    if (indices.length === 0) {
      return;
    }
    options.checkpointTimelineEdit('duplicate-selected-clips', `复制 ${indices.length} 个片段`);
    const next = [...options.clips.value];
    let inserted = 0;
    for (const idx of indices) {
      const source = options.clips.value[idx];
      if (!source) {
        continue;
      }
      const cloned: TimelineClip = {
        ...source,
        id: source.id ? `${source.id}-dup-${Date.now()}-${idx}` : undefined,
        transition: source.transition ? { ...source.transition } : undefined,
        keyframe: source.keyframe ? { ...source.keyframe } : undefined,
        effects: source.effects ? source.effects.map((item) => ({ ...item, config: item.config ? { ...item.config } : undefined })) : undefined
      };
      next.splice(idx + 1 + inserted, 0, cloned);
      inserted += 1;
    }
    options.clips.value = next;
    options.syncVideoClipTimeline();
  };

  const focusSelectedClipPlayhead = (): void => {
    const span = options.videoClipSpans.value[options.selectedClipIndex.value];
    if (!span) {
      return;
    }
    const midpoint = (span.startSec + span.endSec) / 2;
    options.timelinePlayheadSec.value = Number(options.normalizePlayhead(midpoint).toFixed(3));
  };

  const selectClip = (idx: number): void => {
    options.selectedClipIndex.value = idx;
    options.selectedClipIndices.value = [idx];
    options.ensureSelectedClipIndex();
    focusSelectedClipPlayhead();
  };

  const selectClipFromTimelineBar = (idx: number): void => {
    selectClip(idx);
  };

  const nudgeSelectedClipDuration = (direction: -1 | 1): void => {
    const clip = options.selectedClip.value;
    if (!clip) {
      return;
    }
    options.checkpointTimelineEdit('nudge-duration', direction > 0 ? '延长选中片段' : '缩短选中片段');
    const step = 0.1;
    clip.durationSec = options.normalizeDuration(Number(clip.durationSec ?? 5) + direction * step);
    options.syncVideoClipTimeline();
  };

  const stepSelectedClip = (delta: -1 | 1): void => {
    if (options.clips.value.length <= 0) {
      return;
    }
    const base = options.selectedClipIndex.value >= 0 ? options.selectedClipIndex.value : 0;
    const next = options.clampNumber(base + delta, 0, options.clips.value.length - 1);
    selectClip(next);
  };

  return {
    duplicateSelectedClips,
    focusSelectedClipPlayhead,
    moveClip,
    nudgeSelectedClipDuration,
    removeClip,
    removeSelectedClips,
    selectClip,
    selectClipFromTimelineBar,
    stepSelectedClip
  };
};
