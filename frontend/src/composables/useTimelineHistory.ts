import type { Ref } from 'vue';
import type { TimelineClip, TimelineTrack } from '@/types/models';

export type TimelineStudioSnapshot = {
  clips: TimelineClip[];
  audioTrack: TimelineTrack;
  textTrack: TimelineTrack;
  selectedClipIndex: number;
  selectedClipIndices: number[];
  timelineTitle: string;
};

export type TimelineCommandHistoryItem = {
  id: string;
  action: string;
  detail?: string;
  time: string;
  command?: string;
};

type UseTimelineHistoryOptions = {
  clips: Ref<TimelineClip[]>;
  audioTrack: Ref<TimelineTrack>;
  textTrack: Ref<TimelineTrack>;
  selectedClipIndex: Ref<number>;
  selectedClipIndices: Ref<number[]>;
  timelineTitle: Ref<string>;
  undoStack: Ref<TimelineStudioSnapshot[]>;
  redoStack: Ref<TimelineStudioSnapshot[]>;
  commandHistory: Ref<TimelineCommandHistoryItem[]>;
  normalizeClipIndices: (input: number[]) => number[];
  ensureSelectedClipIndex: () => void;
  syncVideoClipTimeline: () => void;
};

export const useTimelineHistory = (options: UseTimelineHistoryOptions) => {
  const cloneClip = (item: TimelineClip): TimelineClip => ({
    ...item,
    transition: item.transition ? { ...item.transition } : undefined,
    keyframe: item.keyframe ? { ...item.keyframe } : undefined,
    effects: item.effects ? item.effects.map((effect) => ({ ...effect, config: effect.config ? { ...effect.config } : undefined })) : undefined
  });

  const cloneTrack = (track: TimelineTrack): TimelineTrack => ({
    ...track,
    clips: track.clips.map((clip) => cloneClip(clip))
  });

  const createStudioSnapshot = (): TimelineStudioSnapshot => ({
    clips: options.clips.value.map((clip) => cloneClip(clip)),
    audioTrack: cloneTrack(options.audioTrack.value),
    textTrack: cloneTrack(options.textTrack.value),
    selectedClipIndex: options.selectedClipIndex.value,
    selectedClipIndices: [...options.selectedClipIndices.value],
    timelineTitle: options.timelineTitle.value
  });

  const pushCommandHistory = (action: string, detail?: string, command?: string): void => {
    options.commandHistory.value = [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        action,
        detail,
        time: new Date().toLocaleTimeString(),
        command
      },
      ...options.commandHistory.value
    ].slice(0, 25);
  };

  const checkpointTimelineEdit = (action: string, detail?: string): void => {
    options.undoStack.value = [createStudioSnapshot(), ...options.undoStack.value].slice(0, 40);
    options.redoStack.value = [];
    pushCommandHistory(action, detail);
  };

  const applyStudioSnapshot = (snapshot: TimelineStudioSnapshot): void => {
    options.clips.value = snapshot.clips.map((clip) => cloneClip(clip));
    options.audioTrack.value = cloneTrack(snapshot.audioTrack);
    options.textTrack.value = cloneTrack(snapshot.textTrack);
    options.timelineTitle.value = snapshot.timelineTitle;
    options.selectedClipIndex.value = snapshot.selectedClipIndex;
    options.selectedClipIndices.value = options.normalizeClipIndices(snapshot.selectedClipIndices);
    options.ensureSelectedClipIndex();
    options.syncVideoClipTimeline();
  };

  const undoTimelineEdit = (): void => {
    const [last, ...rest] = options.undoStack.value;
    if (!last) {
      return;
    }
    options.redoStack.value = [createStudioSnapshot(), ...options.redoStack.value].slice(0, 40);
    options.undoStack.value = rest;
    applyStudioSnapshot(last);
    pushCommandHistory('undo', '撤销上一步编辑');
  };

  const redoTimelineEdit = (): void => {
    const [last, ...rest] = options.redoStack.value;
    if (!last) {
      return;
    }
    options.undoStack.value = [createStudioSnapshot(), ...options.undoStack.value].slice(0, 40);
    options.redoStack.value = rest;
    applyStudioSnapshot(last);
    pushCommandHistory('redo', '重做上一步编辑');
  };

  return {
    cloneClip,
    cloneTrack,
    createStudioSnapshot,
    pushCommandHistory,
    checkpointTimelineEdit,
    applyStudioSnapshot,
    undoTimelineEdit,
    redoTimelineEdit
  };
};
