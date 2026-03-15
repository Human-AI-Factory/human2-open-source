import { onBeforeUnmount, watch, type Ref } from 'vue';

type UseTimelinePlaybackControlsOptions = {
  studioDenseMode: Ref<boolean>;
  studioImmersiveMode: Ref<boolean>;
  showHotkeyHelp: Ref<boolean>;
  quickCommandInputRef: Ref<HTMLInputElement | null>;
  timelineZoomPercent: Ref<number>;
  timelinePlayheadSec: Ref<number>;
  timelinePlaying: Ref<boolean>;
  timelineLoopEnabled: Ref<boolean>;
  timelineTotalDurationSec: Ref<number>;
  clampNumber: (value: number, min: number, max: number) => number;
  normalizePlayhead: (value: number) => number;
};

export const useTimelinePlaybackControls = (options: UseTimelinePlaybackControlsOptions) => {
  let timelinePlayTimer: number | null = null;

  const onTimelineCanvasWheel = (event: WheelEvent): void => {
    if (!(event.ctrlKey || event.metaKey)) {
      return;
    }
    event.preventDefault();
    const delta = event.deltaY < 0 ? 10 : -10;
    options.timelineZoomPercent.value = options.clampNumber(options.timelineZoomPercent.value + delta, 60, 300);
  };

  const toggleStudioDenseMode = (): void => {
    options.studioDenseMode.value = !options.studioDenseMode.value;
  };

  const toggleStudioImmersiveMode = (): void => {
    options.studioImmersiveMode.value = !options.studioImmersiveMode.value;
  };

  const toggleHotkeyHelp = (): void => {
    options.showHotkeyHelp.value = !options.showHotkeyHelp.value;
  };

  const focusQuickCommandInput = (): void => {
    options.quickCommandInputRef.value?.focus();
    options.quickCommandInputRef.value?.select();
  };

  const onTimelineRulerPointerDown = (event: PointerEvent): void => {
    const ruler = event.currentTarget as HTMLElement | null;
    if (!ruler || options.timelineTotalDurationSec.value <= 0) {
      return;
    }
    const rect = ruler.getBoundingClientRect();
    const ratio = options.clampNumber((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
    options.timelinePlayheadSec.value = Number((options.timelineTotalDurationSec.value * ratio).toFixed(3));
  };

  const stepPlayhead = (direction: -1 | 1): void => {
    const fps = 30;
    const step = 1 / fps;
    options.timelinePlayheadSec.value = Number(
      options.normalizePlayhead(options.timelinePlayheadSec.value + direction * step).toFixed(3)
    );
  };

  const stopTimelinePlayback = (): void => {
    options.timelinePlaying.value = false;
    if (timelinePlayTimer !== null) {
      window.clearInterval(timelinePlayTimer);
      timelinePlayTimer = null;
    }
  };

  const startTimelinePlayback = (): void => {
    if (options.timelinePlaying.value || options.timelineTotalDurationSec.value <= 0) {
      return;
    }
    options.timelinePlaying.value = true;
    const fps = 30;
    const step = 1 / fps;
    timelinePlayTimer = window.setInterval(() => {
      if (!options.timelinePlaying.value) {
        return;
      }
      const next = options.timelinePlayheadSec.value + step;
      if (next >= options.timelineTotalDurationSec.value) {
        if (options.timelineLoopEnabled.value) {
          options.timelinePlayheadSec.value = 0;
          return;
        }
        options.timelinePlayheadSec.value = Number(options.timelineTotalDurationSec.value.toFixed(3));
        stopTimelinePlayback();
        return;
      }
      options.timelinePlayheadSec.value = Number(options.normalizePlayhead(next).toFixed(3));
    }, Math.round(1000 / fps));
  };

  const toggleTimelinePlayback = (): void => {
    if (options.timelinePlaying.value) {
      stopTimelinePlayback();
      return;
    }
    startTimelinePlayback();
  };

  const seekTimelineStart = (): void => {
    options.timelinePlayheadSec.value = 0;
  };

  watch(options.timelineTotalDurationSec, (value) => {
    if (value <= 0) {
      stopTimelinePlayback();
      options.timelinePlayheadSec.value = 0;
      return;
    }
    if (options.timelinePlayheadSec.value > value) {
      options.timelinePlayheadSec.value = Number(value.toFixed(3));
    }
  });

  onBeforeUnmount(() => {
    stopTimelinePlayback();
  });

  return {
    onTimelineCanvasWheel,
    toggleStudioDenseMode,
    toggleStudioImmersiveMode,
    toggleHotkeyHelp,
    focusQuickCommandInput,
    onTimelineRulerPointerDown,
    stepPlayhead,
    stopTimelinePlayback,
    startTimelinePlayback,
    toggleTimelinePlayback,
    seekTimelineStart
  };
};
