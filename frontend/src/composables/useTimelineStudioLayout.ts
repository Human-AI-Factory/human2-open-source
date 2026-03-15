import { computed, ref, type ComputedRef, type Ref } from 'vue';
import type { Storyboard } from '@/types/models';

type LayoutPreset = 'custom' | 'focus' | 'review' | 'cinema';
type DockLayoutMode = 'left' | 'right' | 'float';
type PanelTab = 'shot' | 'transition' | 'effects' | 'audio';
type DockPanel = 'shots' | 'media' | 'actions';

type TimelineStudioLayoutOptions = {
  storyboards: Ref<Storyboard[]>;
  latestDoneVideoTaskByStoryboardId: Ref<Record<string, { taskId: string; resultUrl: string }>>;
  storyboardTitleMap: ComputedRef<Map<string, string>>;
  keyframePresets: ReadonlyArray<{ id: string; label: string }>;
  transitionCurvePresets: ReadonlyArray<{ id: string; label: string }>;
  clampNumber: (value: number, min: number, max: number) => number;
  minDockWidthPx: number;
  maxDockWidthPx: number;
  minClipPanelWidthPx: number;
  maxClipPanelWidthPx: number;
};

export const useTimelineStudioLayout = (options: TimelineStudioLayoutOptions) => {
  const studioImmersiveMode = ref(false);
  const studioDenseMode = ref(false);
  const workspacePresetId = ref<LayoutPreset>('custom');
  const dockLayoutMode = ref<DockLayoutMode>('left');
  const clipPanelLayoutMode = ref<DockLayoutMode>('right');
  const dockFloatPosition = ref({ x: 20, y: 220 });
  const clipPanelFloatPosition = ref({ x: 980, y: 220 });
  const dockPinned = ref(false);
  const clipPanelPinned = ref(false);
  const dockLocked = ref(false);
  const clipPanelLocked = ref(false);
  const dockZIndex = ref(40);
  const clipPanelZIndex = ref(41);
  const dockSnapAnimating = ref(false);
  const clipPanelSnapAnimating = ref(false);
  const activePanelTab = ref<PanelTab>('shot');
  const studioDockCollapsed = ref(false);
  const activeDockPanel = ref<DockPanel>('shots');
  const dockSearch = ref('');
  const dockWidthPx = ref(260);
  const clipPanelWidthPx = ref(380);

  const normalizedDockWidthPx = computed(() =>
    options.clampNumber(dockWidthPx.value, options.minDockWidthPx, options.maxDockWidthPx)
  );
  const normalizedClipPanelWidthPx = computed(() =>
    options.clampNumber(clipPanelWidthPx.value, options.minClipPanelWidthPx, options.maxClipPanelWidthPx)
  );

  const timelineEditorLayoutStyle = computed(() => {
    const centerFr = studioImmersiveMode.value ? 1.5 : studioDenseMode.value ? 1.35 : 1.2;
    const panelWidth =
      clipPanelLayoutMode.value === 'float' ? `${studioDenseMode.value ? 0.95 : 1}fr` : `${normalizedClipPanelWidthPx.value}px`;
    if (dockLayoutMode.value === 'float') {
      if (clipPanelLayoutMode.value === 'left') {
        return { gridTemplateColumns: `${panelWidth} ${centerFr}fr` };
      }
      return { gridTemplateColumns: `${centerFr}fr ${panelWidth}` };
    }
    const dockWidth = studioDockCollapsed.value ? 72 : normalizedDockWidthPx.value;
    if (dockLayoutMode.value === 'right') {
      if (clipPanelLayoutMode.value === 'left') {
        return { gridTemplateColumns: `${panelWidth} ${centerFr}fr ${dockWidth}px` };
      }
      return { gridTemplateColumns: `${centerFr}fr ${panelWidth} ${dockWidth}px` };
    }
    if (clipPanelLayoutMode.value === 'left') {
      return { gridTemplateColumns: `${dockWidth}px ${panelWidth} ${centerFr}fr` };
    }
    return { gridTemplateColumns: `${dockWidth}px ${centerFr}fr ${panelWidth}` };
  });

  const dockClassList = computed(() => ({
    collapsed: studioDockCollapsed.value,
    floating: dockLayoutMode.value === 'float',
    right: dockLayoutMode.value === 'right',
    pinned: dockPinned.value,
    locked: dockLocked.value,
    'snap-animating': dockSnapAnimating.value
  }));

  const clipPanelClassList = computed(() => ({
    floating: clipPanelLayoutMode.value === 'float',
    left: clipPanelLayoutMode.value === 'left',
    pinned: clipPanelPinned.value,
    locked: clipPanelLocked.value,
    'snap-animating': clipPanelSnapAnimating.value
  }));

  const dockFloatingStyle = computed(() => {
    if (dockLayoutMode.value === 'float') {
      return {
        left: `${Math.max(0, dockFloatPosition.value.x)}px`,
        top: `${Math.max(72, dockFloatPosition.value.y)}px`,
        width: `${studioDockCollapsed.value ? 72 : normalizedDockWidthPx.value}px`,
        zIndex: String(dockPinned.value ? 90 : dockZIndex.value)
      };
    }
    return {
      order: dockLayoutMode.value === 'right' ? 3 : 1,
      width: `${studioDockCollapsed.value ? 72 : normalizedDockWidthPx.value}px`
    };
  });

  const timelineListStyle = computed(() => {
    if (dockLayoutMode.value === 'right') {
      return { order: clipPanelLayoutMode.value === 'left' ? 2 : 1 };
    }
    if (dockLayoutMode.value === 'left') {
      return { order: clipPanelLayoutMode.value === 'left' ? 3 : 2 };
    }
    return { order: clipPanelLayoutMode.value === 'left' ? 2 : 1 };
  });

  const clipPanelFloatingStyle = computed(() => {
    if (clipPanelLayoutMode.value === 'float') {
      return {
        left: `${Math.max(0, clipPanelFloatPosition.value.x)}px`,
        top: `${Math.max(72, clipPanelFloatPosition.value.y)}px`,
        width: `${normalizedClipPanelWidthPx.value}px`,
        zIndex: String(clipPanelPinned.value ? 90 : clipPanelZIndex.value)
      };
    }
    if (dockLayoutMode.value === 'right') {
      return {
        width: `${normalizedClipPanelWidthPx.value}px`,
        order: clipPanelLayoutMode.value === 'left' ? 1 : 2
      };
    }
    if (dockLayoutMode.value === 'left') {
      return {
        width: `${normalizedClipPanelWidthPx.value}px`,
        order: clipPanelLayoutMode.value === 'left' ? 2 : 3
      };
    }
    return {
      width: `${normalizedClipPanelWidthPx.value}px`,
      order: clipPanelLayoutMode.value === 'left' ? 1 : 2
    };
  });

  const dockKeyword = computed(() => dockSearch.value.trim().toLowerCase());
  const filteredStoryboardDockItems = computed(() => {
    if (!dockKeyword.value) {
      return options.storyboards.value;
    }
    return options.storyboards.value.filter(
      (item) => item.title.toLowerCase().includes(dockKeyword.value) || item.id.toLowerCase().includes(dockKeyword.value)
    );
  });

  const mediaDockItems = computed(() =>
    Object.entries(options.latestDoneVideoTaskByStoryboardId.value).map(([storyboardId, task]) => ({
      storyboardId,
      taskId: task.taskId,
      title: options.storyboardTitleMap.value.get(storyboardId) || storyboardId
    }))
  );

  const filteredMediaDockItems = computed(() => {
    if (!dockKeyword.value) {
      return mediaDockItems.value;
    }
    return mediaDockItems.value.filter(
      (item) =>
        item.title.toLowerCase().includes(dockKeyword.value) ||
        item.storyboardId.toLowerCase().includes(dockKeyword.value) ||
        item.taskId.toLowerCase().includes(dockKeyword.value)
    );
  });

  const filteredKeyframeDockPresets = computed(() => {
    if (!dockKeyword.value) {
      return options.keyframePresets;
    }
    return options.keyframePresets.filter(
      (item) => item.label.toLowerCase().includes(dockKeyword.value) || item.id.toLowerCase().includes(dockKeyword.value)
    );
  });

  const filteredTransitionDockPresets = computed(() => {
    if (!dockKeyword.value) {
      return options.transitionCurvePresets;
    }
    return options.transitionCurvePresets.filter(
      (item) => item.label.toLowerCase().includes(dockKeyword.value) || item.id.toLowerCase().includes(dockKeyword.value)
    );
  });

  return {
    activeDockPanel,
    activePanelTab,
    clipPanelClassList,
    clipPanelFloatingStyle,
    clipPanelLayoutMode,
    clipPanelLocked,
    clipPanelPinned,
    clipPanelSnapAnimating,
    clipPanelWidthPx,
    clipPanelZIndex,
    dockClassList,
    dockFloatingStyle,
    dockKeyword,
    dockLayoutMode,
    dockLocked,
    dockPinned,
    dockSearch,
    dockSnapAnimating,
    dockWidthPx,
    dockZIndex,
    filteredKeyframeDockPresets,
    filteredMediaDockItems,
    filteredStoryboardDockItems,
    filteredTransitionDockPresets,
    mediaDockItems,
    normalizedClipPanelWidthPx,
    normalizedDockWidthPx,
    studioDenseMode,
    studioDockCollapsed,
    studioImmersiveMode,
    timelineEditorLayoutStyle,
    timelineListStyle,
    workspacePresetId,
    dockFloatPosition,
    clipPanelFloatPosition
  };
};
