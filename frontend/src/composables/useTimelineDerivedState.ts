import { computed, type ComputedRef, type Ref } from 'vue';
import type { TimelineClip, TimelineTrack } from '@/types/models';

type UseTimelineDerivedStateOptions = {
  storyboardTitleMap: ComputedRef<Map<string, string>>;
  clips: Ref<TimelineClip[]>;
  audioTracks: Ref<TimelineTrack[]>;
  textTrack: Ref<TimelineTrack>;
  selectedClipIndex: Ref<number>;
  timelinePlayheadSec: Ref<number>;
};

export const useTimelineDerivedState = (options: UseTimelineDerivedStateOptions) => {
  const transitionNameMap: Record<string, string> = {
    cut: 'fade',
    fade: 'fade',
    dissolve: 'fade',
    wipeleft: 'wipeleft',
    wiperight: 'wiperight',
    slideleft: 'slideleft',
    slideright: 'slideright',
    circleopen: 'circleopen',
    circleclose: 'circleclose'
  };

  const transitionPreview = computed(() => {
    if (options.clips.value.length < 2) {
      return [];
    }
    const preview: Array<{
      fromTitle: string;
      toTitle: string;
      transitionType: string;
      durationSec: number;
      offsetSec: number;
      filter: string;
    }> = [];
    let accumulated = Number(options.clips.value[0].durationSec ?? 0);
    for (let i = 0; i < options.clips.value.length - 1; i += 1) {
      const current = options.clips.value[i];
      const next = options.clips.value[i + 1];
      const type = current.transition?.type ?? 'cut';
      const mapped = transitionNameMap[type] ?? 'fade';
      const durationRaw = Number(current.transition?.durationSec ?? (type === 'cut' ? 0.05 : 0.6));
      const durationSec = Math.max(0.05, Math.min(5, Number.isFinite(durationRaw) ? durationRaw : 0.6));
      const offsetSec = Math.max(0, accumulated - durationSec);
      preview.push({
        fromTitle: options.storyboardTitleMap.value.get(current.storyboardId) || current.storyboardId,
        toTitle: options.storyboardTitleMap.value.get(next.storyboardId) || next.storyboardId,
        transitionType: type,
        durationSec,
        offsetSec: Number(offsetSec.toFixed(3)),
        filter: `xfade=transition=${mapped}:duration=${durationSec.toFixed(3)}:offset=${offsetSec.toFixed(3)}`
      });
      accumulated += Number(next.durationSec ?? 0);
    }
    return preview;
  });

  const timelineTracksPreview = computed(() => {
    const buildLane = (trackId: string, title: string, inputClips: TimelineClip[]) => {
      let cursorSec = 0;
      const items = inputClips.map((clip, idx) => {
        const durationSecRaw = Number(clip.durationSec ?? 5);
        const baseDurationSec = Number.isFinite(durationSecRaw) ? Math.max(0.1, durationSecRaw) : 5;
        const speed = Number.isFinite(Number(clip.speed)) ? Math.max(0.1, Math.min(8, Number(clip.speed))) : 1;
        const durationSec = baseDurationSec / speed;
        const explicitStartSec =
          typeof clip.startMs === 'number' && Number.isFinite(clip.startMs) ? Math.max(0, clip.startMs / 1000) : undefined;
        const explicitEndSec =
          typeof clip.endMs === 'number' && Number.isFinite(clip.endMs) ? Math.max(0, clip.endMs / 1000) : undefined;
        const startSec = typeof explicitStartSec === 'number' ? explicitStartSec : cursorSec;
        const endSec =
          typeof explicitEndSec === 'number' && explicitEndSec > startSec ? explicitEndSec : startSec + durationSec;
        cursorSec = endSec;
        return {
          key: `${trackId}-${clip.id || clip.storyboardId}-${idx}`,
          clipIndex: idx,
          label: options.storyboardTitleMap.value.get(clip.storyboardId) || clip.storyboardId || `${idx + 1}`,
          startSec,
          endSec
        };
      });
      return { trackId, title, durationSec: cursorSec, items };
    };

    return [
      buildLane('video-main', '视频轨', options.clips.value),
      ...options.audioTracks.value.map((track, index) =>
        buildLane(track.id || `audio-main-${index}`, track.name || `音频轨 ${index + 1}`, track.clips)
      ),
      buildLane(options.textTrack.value.id || 'text-main', options.textTrack.value.name || '文本轨', options.textTrack.value.clips)
    ].filter((lane) => lane.items.length > 0);
  });

  const timelineTotalDurationSec = computed(() => Math.max(0, ...timelineTracksPreview.value.map((lane) => lane.durationSec)));

  const timelineTicks = computed(() => {
    const total = timelineTotalDurationSec.value;
    if (total <= 0) {
      return [];
    }
    const step = total <= 10 ? 1 : total <= 30 ? 2 : total <= 60 ? 5 : 10;
    const ticks: number[] = [];
    for (let value = 0; value <= total; value += step) {
      ticks.push(Number(value.toFixed(2)));
    }
    if (ticks[ticks.length - 1] !== Number(total.toFixed(2))) {
      ticks.push(Number(total.toFixed(2)));
    }
    return ticks;
  });

  const timelineTracksPreviewWithPct = computed(() => {
    const total = timelineTotalDurationSec.value;
    if (total <= 0) {
      return [];
    }
    return timelineTracksPreview.value.map((lane) => ({
      ...lane,
      items: lane.items.map((item) => ({
        ...item,
        leftPct: Number(((item.startSec / total) * 100).toFixed(4)),
        widthPct: Number((Math.max(0.5, ((item.endSec - item.startSec) / total) * 100)).toFixed(4))
      }))
    }));
  });

  const timelinePlayheadPct = computed(() => {
    if (timelineTotalDurationSec.value <= 0) {
      return 0;
    }
    return Number(
      ((Math.max(0, Math.min(timelineTotalDurationSec.value, options.timelinePlayheadSec.value)) / timelineTotalDurationSec.value) * 100).toFixed(4)
    );
  });

  const buildClipSpans = (inputClips: TimelineClip[]): Array<{ startSec: number; endSec: number }> => {
    let cursor = 0;
    return inputClips.map((clip) => {
      const raw = Number(clip.durationSec ?? 5);
      const baseDurationSec = Number.isFinite(raw) ? Math.max(0.1, raw) : 5;
      const speed = Number.isFinite(Number(clip.speed)) ? Math.max(0.1, Math.min(8, Number(clip.speed))) : 1;
      const durationSec = baseDurationSec / speed;
      const explicitStartSec =
        typeof clip.startMs === 'number' && Number.isFinite(clip.startMs) ? Math.max(0, clip.startMs / 1000) : undefined;
      const explicitEndSec =
        typeof clip.endMs === 'number' && Number.isFinite(clip.endMs) ? Math.max(0, clip.endMs / 1000) : undefined;
      const startSec = typeof explicitStartSec === 'number' ? explicitStartSec : cursor;
      const endSec = typeof explicitEndSec === 'number' && explicitEndSec > startSec ? explicitEndSec : startSec + durationSec;
      cursor = endSec;
      return { startSec, endSec };
    });
  };

  const videoClipSpans = computed(() => buildClipSpans(options.clips.value));
  const audioClipSpans = computed(() => buildClipSpans(options.audioTracks.value[0]?.clips ?? []));
  const textClipSpans = computed(() => buildClipSpans(options.textTrack.value.clips));
  const selectedClipSpan = computed(() => videoClipSpans.value[options.selectedClipIndex.value]);

  const formatClipSpan = (span: { startSec: number; endSec: number } | undefined): string => {
    if (!span) {
      return '-';
    }
    return `${span.startSec.toFixed(2)}s -> ${span.endSec.toFixed(2)}s`;
  };

  return {
    audioClipSpans,
    formatClipSpan,
    selectedClipSpan,
    textClipSpans,
    timelinePlayheadPct,
    timelineTicks,
    timelineTotalDurationSec,
    timelineTracksPreview,
    timelineTracksPreviewWithPct,
    transitionPreview,
    videoClipSpans
  };
};
