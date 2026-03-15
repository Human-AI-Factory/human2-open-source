import { onBeforeUnmount, onMounted, ref, watch, type ComputedRef, type Ref } from 'vue';

type LayoutPreset = 'custom' | 'focus' | 'review' | 'cinema';

type UseTimelineSyncOptions = {
  workspaceScopeToken: ComputedRef<string>;
  selectedClipIndex: Ref<number>;
  timelinePlayheadSec: Ref<number>;
  timelineZoomPercent: Ref<number>;
  timelineTotalDurationSec: ComputedRef<number>;
  workspacePresetId: Ref<LayoutPreset>;
  clipCount: ComputedRef<number>;
  selectClip: (idx: number) => void;
  applyWorkspacePreset: () => void;
  clampNumber: (value: number, min: number, max: number) => number;
};

export const useTimelineSync = (options: UseTimelineSyncOptions) => {
  const timelineSyncEnabled = ref(true);
  const timelineSyncClientId = `timeline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let timelineSyncChannel: BroadcastChannel | null = null;
  let timelineSyncMuted = false;

  const broadcastTimelineSync = (type: string, payload: Record<string, unknown>): void => {
    if (!timelineSyncEnabled.value || !timelineSyncChannel) {
      return;
    }
    timelineSyncChannel.postMessage({
      clientId: timelineSyncClientId,
      scope: options.workspaceScopeToken.value,
      type,
      payload,
      sentAt: new Date().toISOString()
    });
  };

  const attachTimelineSyncChannel = (): void => {
    if (typeof BroadcastChannel === 'undefined') {
      return;
    }
    if (timelineSyncChannel) {
      timelineSyncChannel.close();
    }
    timelineSyncChannel = new BroadcastChannel('human2-timeline-sync-v1');
    timelineSyncChannel.onmessage = (event: MessageEvent) => {
      const message = event.data as {
        clientId?: string;
        scope?: string;
        type?: string;
        payload?: Record<string, unknown>;
      };
      if (!message || message.clientId === timelineSyncClientId || message.scope !== options.workspaceScopeToken.value) {
        return;
      }
      if (!timelineSyncEnabled.value) {
        return;
      }
      timelineSyncMuted = true;
      try {
        if (message.type === 'playhead' && typeof message.payload?.sec === 'number') {
          options.timelinePlayheadSec.value = options.clampNumber(message.payload.sec, 0, options.timelineTotalDurationSec.value || 0);
        }
        if (message.type === 'selection' && typeof message.payload?.index === 'number') {
          const safeIndex = Math.max(0, Math.min(options.clipCount.value - 1, message.payload.index));
          options.selectClip(safeIndex);
        }
        if (message.type === 'zoom' && typeof message.payload?.percent === 'number') {
          options.timelineZoomPercent.value = options.clampNumber(message.payload.percent, 60, 300);
        }
        if (message.type === 'preset' && typeof message.payload?.preset === 'string') {
          const preset = message.payload.preset;
          if (preset === 'custom' || preset === 'focus' || preset === 'review' || preset === 'cinema') {
            options.workspacePresetId.value = preset;
            options.applyWorkspacePreset();
          }
        }
      } finally {
        timelineSyncMuted = false;
      }
    };
  };

  const disposeTimelineSync = (): void => {
    if (timelineSyncChannel) {
      timelineSyncChannel.close();
      timelineSyncChannel = null;
    }
  };

  onMounted(() => {
    attachTimelineSyncChannel();
  });

  onBeforeUnmount(() => {
    disposeTimelineSync();
  });

  watch(options.workspaceScopeToken, () => {
    attachTimelineSyncChannel();
  });

  watch(options.selectedClipIndex, (value) => {
    if (timelineSyncMuted) {
      return;
    }
    broadcastTimelineSync('selection', { index: value });
  });

  watch(options.timelinePlayheadSec, (value) => {
    if (timelineSyncMuted) {
      return;
    }
    broadcastTimelineSync('playhead', { sec: value });
  });

  watch(options.timelineZoomPercent, (value) => {
    if (timelineSyncMuted) {
      return;
    }
    broadcastTimelineSync('zoom', { percent: value });
  });

  watch(options.workspacePresetId, (value) => {
    if (timelineSyncMuted) {
      return;
    }
    broadcastTimelineSync('preset', { preset: value });
  });

  return {
    timelineSyncEnabled
  };
};
