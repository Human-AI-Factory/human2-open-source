import test from 'node:test';
import assert from 'node:assert/strict';
import { computed, ref } from 'vue';
import { useTimelineWorkspaceStorage } from '../src/composables/useTimelineWorkspaceStorage';

const createLocalStorageStub = () => {
  const store = new Map<string, string>();
  return {
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    }
  };
};

test('useTimelineWorkspaceStorage should persist ui prefs, drafts and quick slots', () => {
  const originalLocalStorage = globalThis.localStorage;
  const originalWindow = globalThis.window;

  const localStorageStub = createLocalStorageStub();
  globalThis.localStorage = localStorageStub as Storage;
  globalThis.window = {
    prompt() {
      return '审片槽位';
    },
    setInterval() {
      return 1 as unknown as number;
    },
    clearInterval() {}
  } as Window & typeof globalThis;

  const projectId = ref('project-1');
  const routeProjectId = ref('project-1');
  const selectedEpisodeId = ref('episode-1');
  const timelineTitle = ref('初版时间线');
  const clips = ref([{ id: 'clip-1', storyboardId: 'sb-1', durationSec: 5 }] as any);
  const audioTrack = ref({ id: 'audio-main', name: 'Audio Main', type: 'audio', order: 1, clips: [] } as any);
  const textTrack = ref({ id: 'text-main', name: 'Text Overlay', type: 'text', order: 2, clips: [] } as any);
  const selectedClipIndex = ref(0);
  const selectedClipIndices = ref([0]);
  const studioImmersiveMode = ref(false);
  const studioDenseMode = ref(false);
  const studioDockCollapsed = ref(false);
  const dockWidthPx = ref(260);
  const clipPanelWidthPx = ref(380);
  const dockLayoutMode = ref<'left' | 'right' | 'float'>('left');
  const clipPanelLayoutMode = ref<'left' | 'right' | 'float'>('right');
  const dockFloatPosition = ref({ x: 12, y: 90 });
  const clipPanelFloatPosition = ref({ x: 240, y: 120 });
  const dockPinned = ref(false);
  const clipPanelPinned = ref(false);
  const dockLocked = ref(false);
  const clipPanelLocked = ref(false);
  const activeDockPanel = ref<'shots' | 'media' | 'actions'>('shots');
  const activePanelTab = ref<'shot' | 'transition' | 'effects' | 'audio'>('shot');
  const timelineZoomPercent = ref(140);
  const workspacePresetId = ref<'custom' | 'focus' | 'review' | 'cinema'>('focus');
  const savedMacros = ref([{ id: 'macro-1', name: '批处理', commands: ['save', 'merge'] }]);
  const selectedMacroId = ref('macro-1');
  const quickCommandFeedback = ref('');
  const workspaceScopeToken = computed(() => 'project:project-1');
  const workspaceDraftStorageKey = computed(() => 'timeline-draft-project-1');
  const workspaceUiPrefsStorageKey = computed(() => 'timeline-ui-project-1');
  const workspaceQuickSlotsStorageKey = computed(() => 'timeline-slots-project-1');
  const history: Array<{ action: string; detail?: string }> = [];

  const storage = useTimelineWorkspaceStorage({
    workspaceScopeToken,
    workspaceDraftStorageKey,
    workspaceUiPrefsStorageKey,
    workspaceQuickSlotsStorageKey,
    projectId,
    routeProjectId,
    selectedEpisodeId,
    timelineTitle,
    clips,
    audioTrack,
    textTrack,
    selectedClipIndex,
    selectedClipIndices,
    studioImmersiveMode,
    studioDenseMode,
    studioDockCollapsed,
    dockWidthPx,
    clipPanelWidthPx,
    dockLayoutMode,
    clipPanelLayoutMode,
    dockFloatPosition,
    clipPanelFloatPosition,
    dockPinned,
    clipPanelPinned,
    dockLocked,
    clipPanelLocked,
    activeDockPanel,
    activePanelTab,
    timelineZoomPercent,
    workspacePresetId,
    savedMacros,
    selectedMacroId,
    quickCommandFeedback,
    cloneClip: (clip) => JSON.parse(JSON.stringify(clip)),
    cloneTrack: (track) => JSON.parse(JSON.stringify(track)),
    normalizeClips: (input) => input.map((item) => ({ ...item })),
    normalizeClipIndices: (input) => [...new Set(input)].sort((a, b) => a - b),
    ensureSelectedClipIndex: () => {
      if (selectedClipIndex.value >= clips.value.length) {
        selectedClipIndex.value = Math.max(0, clips.value.length - 1);
      }
    },
    syncVideoClipTimeline: () => {},
    pushCommandHistory: (action, detail) => {
      history.push({ action, detail });
    },
    clampNumber: (value, min, max) => Math.max(min, Math.min(max, value)),
    minDockWidthPx: 220,
    maxDockWidthPx: 420,
    minClipPanelWidthPx: 320,
    maxClipPanelWidthPx: 520
  });

  try {
    storage.persistUiPrefs();
    const uiPrefsPayload = JSON.parse(localStorageStub.getItem(workspaceUiPrefsStorageKey.value) || '{}');
    assert.equal(uiPrefsPayload.timelineZoomPercent, 140);
    assert.equal(uiPrefsPayload.workspacePresetId, 'focus');

    studioDenseMode.value = true;
    timelineZoomPercent.value = 70;
    storage.restoreUiPrefs();
    assert.equal(studioDenseMode.value, false);
    assert.equal(timelineZoomPercent.value, 140);

    storage.saveWorkspaceDraftToLocal('manual');
    assert.equal(quickCommandFeedback.value, '本地草稿已保存');
    assert.equal(history.at(-1)?.action, 'save-local-draft');

    clips.value = [];
    timelineTitle.value = '';
    selectedClipIndices.value = [];
    storage.restoreWorkspaceDraftFromLocal();
    assert.equal(quickCommandFeedback.value, '已恢复本地草稿');
    assert.equal(clips.value.length, 1);
    assert.equal(timelineTitle.value, '初版时间线');
    assert.deepEqual(selectedClipIndices.value, [0]);

    storage.saveWorkspaceQuickSlot();
    assert.equal(storage.workspaceQuickSlots.value.length, 1);
    assert.equal(storage.workspaceQuickSlots.value[0].name, '审片槽位');
    assert.equal(storage.selectedWorkspaceQuickSlotId.value, storage.workspaceQuickSlots.value[0].id);

    storage.workspaceQuickSlots.value = [];
    storage.loadWorkspaceQuickSlots();
    assert.equal(storage.workspaceQuickSlots.value.length, 1);
    assert.equal(storage.workspaceQuickSlots.value[0].draft.timelineTitle, '初版时间线');
  } finally {
    globalThis.localStorage = originalLocalStorage;
    globalThis.window = originalWindow;
  }
});
