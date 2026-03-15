import { ref, type Ref } from 'vue';
import type { Storyboard, TimelineClip, TimelineTrack } from '@/types/models';

type UseTimelineAuxTrackOpsOptions = {
  storyboards: Ref<Storyboard[]>;
  audioTrack: Ref<TimelineTrack>;
  textTrack: Ref<TimelineTrack>;
  normalizeTimelineDurations: (input: TimelineClip[]) => TimelineClip[];
};

export const useTimelineAuxTrackOps = (options: UseTimelineAuxTrackOpsOptions) => {
  const auxDragSource = ref<{ trackType: 'audio' | 'text'; index: number } | null>(null);

  const getAuxTrackClips = (trackType: 'audio' | 'text'): TimelineClip[] =>
    trackType === 'audio' ? options.audioTrack.value.clips : options.textTrack.value.clips;

  const setAuxTrackClips = (trackType: 'audio' | 'text', next: TimelineClip[]): void => {
    if (trackType === 'audio') {
      options.audioTrack.value = { ...options.audioTrack.value, clips: options.normalizeTimelineDurations(next) };
      return;
    }
    options.textTrack.value = { ...options.textTrack.value, clips: options.normalizeTimelineDurations(next) };
  };

  const moveAuxClip = (trackType: 'audio' | 'text', idx: number, delta: number): void => {
    const list = getAuxTrackClips(trackType);
    const target = idx + delta;
    if (target < 0 || target >= list.length) {
      return;
    }
    const next = [...list];
    const [item] = next.splice(idx, 1);
    next.splice(target, 0, item);
    setAuxTrackClips(trackType, next);
  };

  const onAuxClipDragStart = (trackType: 'audio' | 'text', idx: number, event: DragEvent): void => {
    auxDragSource.value = { trackType, index: idx };
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', `${trackType}:${idx}`);
    }
  };

  const onAuxClipDragOver = (_trackType: 'audio' | 'text', _idx: number, event: DragEvent): void => {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  };

  const onAuxClipDrop = (trackType: 'audio' | 'text', idx: number, event: DragEvent): void => {
    event.preventDefault();
    const source = auxDragSource.value;
    if (!source) {
      auxDragSource.value = null;
      return;
    }
    const sourceList = getAuxTrackClips(source.trackType);
    if (source.index < 0 || source.index >= sourceList.length) {
      auxDragSource.value = null;
      return;
    }
    const [moved] = sourceList.splice(source.index, 1);
    setAuxTrackClips(source.trackType, [...sourceList]);
    if (!moved) {
      auxDragSource.value = null;
      return;
    }
    const targetList = getAuxTrackClips(trackType);
    const adjustedIndex = source.trackType === trackType && source.index < idx ? idx - 1 : idx;
    const safeTarget = Math.max(0, Math.min(adjustedIndex, targetList.length));
    targetList.splice(safeTarget, 0, moved);
    setAuxTrackClips(trackType, [...targetList]);
    auxDragSource.value = null;
  };

  const onAuxClipDropToEnd = (trackType: 'audio' | 'text', event: DragEvent): void => {
    event.preventDefault();
    const source = auxDragSource.value;
    if (!source) {
      return;
    }
    const sourceList = getAuxTrackClips(source.trackType);
    if (source.index < 0 || source.index >= sourceList.length) {
      auxDragSource.value = null;
      return;
    }
    const [moved] = sourceList.splice(source.index, 1);
    setAuxTrackClips(source.trackType, [...sourceList]);
    if (!moved) {
      auxDragSource.value = null;
      return;
    }
    const targetList = getAuxTrackClips(trackType);
    targetList.push(moved);
    setAuxTrackClips(trackType, [...targetList]);
    auxDragSource.value = null;
  };

  const onAuxClipDragEnd = (): void => {
    auxDragSource.value = null;
  };

  const addAudioClip = (): void => {
    const firstStoryboard = options.storyboards.value[0];
    if (!firstStoryboard) {
      return;
    }
    options.audioTrack.value.clips.push({
      id: `audio-${Date.now()}`,
      storyboardId: firstStoryboard.id,
      durationSec: 5,
      sourceUrl: ''
    });
  };

  const removeAudioClip = (idx: number): void => {
    options.audioTrack.value.clips.splice(idx, 1);
  };

  const addTextClip = (): void => {
    const firstStoryboard = options.storyboards.value[0];
    if (!firstStoryboard) {
      return;
    }
    options.textTrack.value.clips.push({
      id: `text-${Date.now()}`,
      storyboardId: firstStoryboard.id,
      durationSec: 5,
      sourceUrl: '字幕文本'
    });
  };

  const removeTextClip = (idx: number): void => {
    options.textTrack.value.clips.splice(idx, 1);
  };

  return {
    addAudioClip,
    addTextClip,
    auxDragSource,
    moveAuxClip,
    onAuxClipDragEnd,
    onAuxClipDragOver,
    onAuxClipDragStart,
    onAuxClipDrop,
    onAuxClipDropToEnd,
    removeAudioClip,
    removeTextClip
  };
};
