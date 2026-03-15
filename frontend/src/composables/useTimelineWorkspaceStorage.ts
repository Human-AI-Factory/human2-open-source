import { ref, type ComputedRef, type Ref } from 'vue';
import type { TimelineClip, TimelineTrack } from '@/types/models';

type SavedMacroCommand = { id: string; name: string; commands: string[] };

type TimelineUiPrefsShape = {
  studioImmersiveMode: boolean;
  studioDenseMode: boolean;
  studioDockCollapsed: boolean;
  dockWidthPx: number;
  clipPanelWidthPx: number;
  dockLayoutMode: 'left' | 'right' | 'float';
  clipPanelLayoutMode: 'left' | 'right' | 'float';
  dockFloatX: number;
  dockFloatY: number;
  clipPanelFloatX: number;
  clipPanelFloatY: number;
  dockPinned: boolean;
  clipPanelPinned: boolean;
  dockLocked: boolean;
  clipPanelLocked: boolean;
  activeDockPanel: 'shots' | 'media' | 'actions';
  activePanelTab: 'shot' | 'transition' | 'effects' | 'audio';
  timelineZoomPercent: number;
  workspacePresetId: 'custom' | 'focus' | 'review' | 'cinema';
};

type TimelineWorkspaceDraftShape = {
  version: number;
  savedAt: string;
  scope: string;
  selectedEpisodeId: string;
  timelineTitle: string;
  clips: TimelineClip[];
  audioTrack: TimelineTrack;
  textTrack: TimelineTrack;
  selectedClipIndex: number;
  selectedClipIndices: number[];
  uiPrefs: TimelineUiPrefsShape;
  savedMacros: Array<{ name: string; commands: string[] }>;
};

type WorkspaceQuickSlotShape = {
  id: string;
  name: string;
  savedAt: string;
  draft: TimelineWorkspaceDraftShape;
};

type UseTimelineWorkspaceStorageOptions = {
  workspaceScopeToken: ComputedRef<string>;
  workspaceDraftStorageKey: ComputedRef<string>;
  workspaceUiPrefsStorageKey: ComputedRef<string>;
  workspaceQuickSlotsStorageKey: ComputedRef<string>;
  projectId: Ref<string>;
  routeProjectId: Ref<string>;
  selectedEpisodeId: Ref<string>;
  timelineTitle: Ref<string>;
  clips: Ref<TimelineClip[]>;
  audioTrack: Ref<TimelineTrack>;
  textTrack: Ref<TimelineTrack>;
  selectedClipIndex: Ref<number>;
  selectedClipIndices: Ref<number[]>;
  studioImmersiveMode: Ref<boolean>;
  studioDenseMode: Ref<boolean>;
  studioDockCollapsed: Ref<boolean>;
  dockWidthPx: Ref<number>;
  clipPanelWidthPx: Ref<number>;
  dockLayoutMode: Ref<'left' | 'right' | 'float'>;
  clipPanelLayoutMode: Ref<'left' | 'right' | 'float'>;
  dockFloatPosition: Ref<{ x: number; y: number }>;
  clipPanelFloatPosition: Ref<{ x: number; y: number }>;
  dockPinned: Ref<boolean>;
  clipPanelPinned: Ref<boolean>;
  dockLocked: Ref<boolean>;
  clipPanelLocked: Ref<boolean>;
  activeDockPanel: Ref<'shots' | 'media' | 'actions'>;
  activePanelTab: Ref<'shot' | 'transition' | 'effects' | 'audio'>;
  timelineZoomPercent: Ref<number>;
  workspacePresetId: Ref<'custom' | 'focus' | 'review' | 'cinema'>;
  savedMacros: Ref<SavedMacroCommand[]>;
  selectedMacroId: Ref<string>;
  quickCommandFeedback: Ref<string>;
  cloneClip: (clip: TimelineClip) => TimelineClip;
  cloneTrack: (track: TimelineTrack) => TimelineTrack;
  normalizeClips: (input: TimelineClip[]) => TimelineClip[];
  normalizeClipIndices: (input: number[]) => number[];
  ensureSelectedClipIndex: () => void;
  syncVideoClipTimeline: () => void;
  pushCommandHistory: (action: string, detail?: string, command?: string) => void;
  clampNumber: (value: number, min: number, max: number) => number;
  minDockWidthPx: number;
  maxDockWidthPx: number;
  minClipPanelWidthPx: number;
  maxClipPanelWidthPx: number;
};

export const useTimelineWorkspaceStorage = (options: UseTimelineWorkspaceStorageOptions) => {
  const autoSaveEnabled = ref(true);
  const lastAutoSaveAt = ref('');
  const localDraftMeta = ref<{ savedAt: string; size: number } | null>(null);
  const workspaceImportInputRef = ref<HTMLInputElement | null>(null);
  const workspaceQuickSlots = ref<WorkspaceQuickSlotShape[]>([]);
  const selectedWorkspaceQuickSlotId = ref('');
  let workspaceAutoSaveTimer: number | null = null;

  const buildCurrentUiPrefs = (): TimelineUiPrefsShape => ({
    studioImmersiveMode: options.studioImmersiveMode.value,
    studioDenseMode: options.studioDenseMode.value,
    studioDockCollapsed: options.studioDockCollapsed.value,
    dockWidthPx: options.clampNumber(options.dockWidthPx.value, options.minDockWidthPx, options.maxDockWidthPx),
    clipPanelWidthPx: options.clampNumber(
      options.clipPanelWidthPx.value,
      options.minClipPanelWidthPx,
      options.maxClipPanelWidthPx
    ),
    dockLayoutMode: options.dockLayoutMode.value,
    clipPanelLayoutMode: options.clipPanelLayoutMode.value,
    dockFloatX: options.dockFloatPosition.value.x,
    dockFloatY: options.dockFloatPosition.value.y,
    clipPanelFloatX: options.clipPanelFloatPosition.value.x,
    clipPanelFloatY: options.clipPanelFloatPosition.value.y,
    dockPinned: options.dockPinned.value,
    clipPanelPinned: options.clipPanelPinned.value,
    dockLocked: options.dockLocked.value,
    clipPanelLocked: options.clipPanelLocked.value,
    activeDockPanel: options.activeDockPanel.value,
    activePanelTab: options.activePanelTab.value,
    timelineZoomPercent: options.timelineZoomPercent.value,
    workspacePresetId: options.workspacePresetId.value
  });

  const applyUiPrefs = (prefs: Partial<TimelineUiPrefsShape>): void => {
    if (typeof prefs.studioImmersiveMode === 'boolean') {
      options.studioImmersiveMode.value = prefs.studioImmersiveMode;
    }
    if (typeof prefs.studioDenseMode === 'boolean') {
      options.studioDenseMode.value = prefs.studioDenseMode;
    }
    if (typeof prefs.studioDockCollapsed === 'boolean') {
      options.studioDockCollapsed.value = prefs.studioDockCollapsed;
    }
    if (typeof prefs.dockWidthPx === 'number' && Number.isFinite(prefs.dockWidthPx)) {
      options.dockWidthPx.value = options.clampNumber(prefs.dockWidthPx, options.minDockWidthPx, options.maxDockWidthPx);
    }
    if (typeof prefs.clipPanelWidthPx === 'number' && Number.isFinite(prefs.clipPanelWidthPx)) {
      options.clipPanelWidthPx.value = options.clampNumber(prefs.clipPanelWidthPx, options.minClipPanelWidthPx, options.maxClipPanelWidthPx);
    }
    if (prefs.dockLayoutMode === 'left' || prefs.dockLayoutMode === 'right' || prefs.dockLayoutMode === 'float') {
      options.dockLayoutMode.value = prefs.dockLayoutMode;
    }
    if (prefs.clipPanelLayoutMode === 'left' || prefs.clipPanelLayoutMode === 'right' || prefs.clipPanelLayoutMode === 'float') {
      options.clipPanelLayoutMode.value = prefs.clipPanelLayoutMode;
    }
    if (typeof prefs.dockFloatX === 'number' && Number.isFinite(prefs.dockFloatX)) {
      options.dockFloatPosition.value.x = Math.max(0, prefs.dockFloatX);
    }
    if (typeof prefs.dockFloatY === 'number' && Number.isFinite(prefs.dockFloatY)) {
      options.dockFloatPosition.value.y = Math.max(72, prefs.dockFloatY);
    }
    if (typeof prefs.clipPanelFloatX === 'number' && Number.isFinite(prefs.clipPanelFloatX)) {
      options.clipPanelFloatPosition.value.x = Math.max(0, prefs.clipPanelFloatX);
    }
    if (typeof prefs.clipPanelFloatY === 'number' && Number.isFinite(prefs.clipPanelFloatY)) {
      options.clipPanelFloatPosition.value.y = Math.max(72, prefs.clipPanelFloatY);
    }
    if (typeof prefs.dockPinned === 'boolean') {
      options.dockPinned.value = prefs.dockPinned;
    }
    if (typeof prefs.clipPanelPinned === 'boolean') {
      options.clipPanelPinned.value = prefs.clipPanelPinned;
    }
    if (typeof prefs.dockLocked === 'boolean') {
      options.dockLocked.value = prefs.dockLocked;
    }
    if (typeof prefs.clipPanelLocked === 'boolean') {
      options.clipPanelLocked.value = prefs.clipPanelLocked;
    }
    if (prefs.activeDockPanel === 'shots' || prefs.activeDockPanel === 'media' || prefs.activeDockPanel === 'actions') {
      options.activeDockPanel.value = prefs.activeDockPanel;
    }
    if (prefs.activePanelTab === 'shot' || prefs.activePanelTab === 'transition' || prefs.activePanelTab === 'effects' || prefs.activePanelTab === 'audio') {
      options.activePanelTab.value = prefs.activePanelTab;
    }
    if (typeof prefs.timelineZoomPercent === 'number' && Number.isFinite(prefs.timelineZoomPercent)) {
      options.timelineZoomPercent.value = options.clampNumber(prefs.timelineZoomPercent, 60, 300);
    }
    if (
      prefs.workspacePresetId === 'custom' ||
      prefs.workspacePresetId === 'focus' ||
      prefs.workspacePresetId === 'review' ||
      prefs.workspacePresetId === 'cinema'
    ) {
      options.workspacePresetId.value = prefs.workspacePresetId;
    }
  };

  const persistUiPrefs = (): void => {
    try {
      localStorage.setItem(options.workspaceUiPrefsStorageKey.value, JSON.stringify(buildCurrentUiPrefs()));
    } catch {
      // ignore localStorage quota or availability errors
    }
  };

  const restoreUiPrefs = (): void => {
    try {
      const raw = localStorage.getItem(options.workspaceUiPrefsStorageKey.value);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as Partial<TimelineUiPrefsShape>;
      applyUiPrefs(parsed);
    } catch {
      // ignore parse/storage errors
    }
  };

  const loadWorkspaceQuickSlots = (): void => {
    try {
      const raw = localStorage.getItem(options.workspaceQuickSlotsStorageKey.value);
      if (!raw) {
        workspaceQuickSlots.value = [];
        return;
      }
      const parsed = JSON.parse(raw) as WorkspaceQuickSlotShape[];
      if (!Array.isArray(parsed)) {
        workspaceQuickSlots.value = [];
        return;
      }
      workspaceQuickSlots.value = parsed
        .filter((slot) => slot && typeof slot.id === 'string' && typeof slot.name === 'string' && slot.draft)
        .slice(0, 5);
    } catch {
      workspaceQuickSlots.value = [];
    }
  };

  const persistWorkspaceQuickSlots = (): void => {
    try {
      localStorage.setItem(options.workspaceQuickSlotsStorageKey.value, JSON.stringify(workspaceQuickSlots.value.slice(0, 5)));
    } catch {
      // ignore storage errors
    }
  };

  const applyWorkspaceDraft = (draft: TimelineWorkspaceDraftShape): void => {
    options.clips.value = options.normalizeClips(draft.clips || []);
    options.audioTrack.value = options.cloneTrack(draft.audioTrack || options.audioTrack.value);
    options.textTrack.value = options.cloneTrack(draft.textTrack || options.textTrack.value);
    options.selectedEpisodeId.value = draft.selectedEpisodeId || options.selectedEpisodeId.value;
    options.timelineTitle.value = draft.timelineTitle || options.timelineTitle.value;
    options.selectedClipIndex.value = Number.isFinite(draft.selectedClipIndex) ? draft.selectedClipIndex : 0;
    options.selectedClipIndices.value = options.normalizeClipIndices(draft.selectedClipIndices || []);
    applyUiPrefs(draft.uiPrefs || {});
    if (Array.isArray(draft.savedMacros)) {
      const imported = draft.savedMacros
        .filter((item) => item && typeof item.name === 'string' && Array.isArray(item.commands))
        .map((item) => ({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: item.name,
          commands: item.commands.map((entry) => String(entry).trim().toLowerCase()).filter(Boolean)
        }))
        .filter((item) => item.commands.length > 0);
      if (imported.length > 0) {
        options.savedMacros.value = imported;
        options.selectedMacroId.value = imported[0].id;
      }
    }
    options.ensureSelectedClipIndex();
    options.syncVideoClipTimeline();
  };

  const buildWorkspaceDraft = (): TimelineWorkspaceDraftShape => ({
    version: 1,
    savedAt: new Date().toISOString(),
    scope: options.workspaceScopeToken.value,
    selectedEpisodeId: options.selectedEpisodeId.value,
    timelineTitle: options.timelineTitle.value,
    clips: options.clips.value.map((clip) => options.cloneClip(clip)),
    audioTrack: options.cloneTrack(options.audioTrack.value),
    textTrack: options.cloneTrack(options.textTrack.value),
    selectedClipIndex: options.selectedClipIndex.value,
    selectedClipIndices: [...options.selectedClipIndices.value],
    uiPrefs: buildCurrentUiPrefs(),
    savedMacros: options.savedMacros.value.map((item) => ({ name: item.name, commands: [...item.commands] }))
  });

  const updateLocalDraftMeta = (payload?: string): void => {
    if (!payload) {
      localDraftMeta.value = null;
      return;
    }
    try {
      const parsed = JSON.parse(payload) as TimelineWorkspaceDraftShape;
      localDraftMeta.value = {
        savedAt: parsed.savedAt,
        size: payload.length
      };
    } catch {
      localDraftMeta.value = null;
    }
  };

  const saveWorkspaceDraftToLocal = (mode: 'manual' | 'auto'): void => {
    if (!options.projectId.value && !options.routeProjectId.value) {
      return;
    }
    try {
      const draft = buildWorkspaceDraft();
      const payload = JSON.stringify(draft);
      localStorage.setItem(options.workspaceDraftStorageKey.value, payload);
      updateLocalDraftMeta(payload);
      if (mode === 'auto') {
        lastAutoSaveAt.value = new Date().toLocaleTimeString();
      } else {
        options.quickCommandFeedback.value = '本地草稿已保存';
        options.pushCommandHistory('save-local-draft', draft.savedAt);
      }
    } catch {
      if (mode === 'manual') {
        options.quickCommandFeedback.value = '本地草稿保存失败';
      }
    }
  };

  const restoreWorkspaceDraftFromLocal = (): void => {
    try {
      const raw = localStorage.getItem(options.workspaceDraftStorageKey.value);
      if (!raw) {
        options.quickCommandFeedback.value = '本地草稿不存在';
        return;
      }
      const draft = JSON.parse(raw) as TimelineWorkspaceDraftShape;
      applyWorkspaceDraft(draft);
      options.quickCommandFeedback.value = '已恢复本地草稿';
      options.pushCommandHistory('restore-local-draft', draft.savedAt);
    } catch {
      options.quickCommandFeedback.value = '本地草稿恢复失败';
    }
  };

  const saveWorkspaceQuickSlot = (): void => {
    const name = window.prompt('请输入槽位名称', `slot-${workspaceQuickSlots.value.length + 1}`)?.trim();
    if (!name) {
      return;
    }
    const draft = buildWorkspaceDraft();
    const slot: WorkspaceQuickSlotShape = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      savedAt: draft.savedAt,
      draft
    };
    workspaceQuickSlots.value = [slot, ...workspaceQuickSlots.value].slice(0, 5);
    selectedWorkspaceQuickSlotId.value = slot.id;
    persistWorkspaceQuickSlots();
    options.quickCommandFeedback.value = `已保存工作区槽位：${name}`;
  };

  const restoreWorkspaceQuickSlot = (): void => {
    const slot = workspaceQuickSlots.value.find((item) => item.id === selectedWorkspaceQuickSlotId.value);
    if (!slot) {
      options.quickCommandFeedback.value = '未找到槽位';
      return;
    }
    applyWorkspaceDraft(slot.draft);
    options.quickCommandFeedback.value = `已恢复槽位：${slot.name}`;
    options.pushCommandHistory('restore-workspace-slot', slot.name);
  };

  const deleteWorkspaceQuickSlot = (): void => {
    const slot = workspaceQuickSlots.value.find((item) => item.id === selectedWorkspaceQuickSlotId.value);
    if (!slot) {
      return;
    }
    workspaceQuickSlots.value = workspaceQuickSlots.value.filter((item) => item.id !== slot.id);
    selectedWorkspaceQuickSlotId.value = workspaceQuickSlots.value[0]?.id || '';
    persistWorkspaceQuickSlots();
    options.quickCommandFeedback.value = `已删除槽位：${slot.name}`;
  };

  const clearWorkspaceDraft = (): void => {
    try {
      localStorage.removeItem(options.workspaceDraftStorageKey.value);
      updateLocalDraftMeta(undefined);
      options.quickCommandFeedback.value = '本地草稿已清除';
      options.pushCommandHistory('clear-local-draft');
    } catch {
      options.quickCommandFeedback.value = '本地草稿清除失败';
    }
  };

  const exportWorkspaceDraft = (): void => {
    try {
      const raw = localStorage.getItem(options.workspaceDraftStorageKey.value);
      if (!raw) {
        options.quickCommandFeedback.value = '本地草稿不存在';
        return;
      }
      const blob = new Blob([raw], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `timeline-workspace-draft-${Date.now()}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      options.quickCommandFeedback.value = '已导出本地草稿';
    } catch {
      options.quickCommandFeedback.value = '导出本地草稿失败';
    }
  };

  const triggerWorkspaceImport = (): void => {
    workspaceImportInputRef.value?.click();
  };

  const handleWorkspaceImportFileChange = async (event: Event): Promise<void> => {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) {
      return;
    }
    try {
      const raw = await file.text();
      const draft = JSON.parse(raw) as TimelineWorkspaceDraftShape;
      localStorage.setItem(options.workspaceDraftStorageKey.value, JSON.stringify(draft));
      updateLocalDraftMeta(JSON.stringify(draft));
      restoreWorkspaceDraftFromLocal();
    } catch {
      options.quickCommandFeedback.value = '导入草稿失败：JSON 无效';
    } finally {
      if (input) {
        input.value = '';
      }
    }
  };

  const refreshLocalDraftMeta = (): void => {
    try {
      updateLocalDraftMeta(localStorage.getItem(options.workspaceDraftStorageKey.value) || undefined);
    } catch {
      updateLocalDraftMeta(undefined);
    }
  };

  const startWorkspaceAutoSave = (): void => {
    if (workspaceAutoSaveTimer !== null) {
      window.clearInterval(workspaceAutoSaveTimer);
    }
    workspaceAutoSaveTimer = window.setInterval(() => {
      if (!autoSaveEnabled.value) {
        return;
      }
      saveWorkspaceDraftToLocal('auto');
    }, 12000);
  };

  const stopWorkspaceAutoSave = (): void => {
    if (workspaceAutoSaveTimer !== null) {
      window.clearInterval(workspaceAutoSaveTimer);
      workspaceAutoSaveTimer = null;
    }
  };

  const applyWorkspacePreset = (): void => {
    if (options.workspacePresetId.value === 'focus') {
      options.studioImmersiveMode.value = true;
      options.studioDenseMode.value = true;
      options.studioDockCollapsed.value = true;
      options.dockLayoutMode.value = 'left';
      options.clipPanelLayoutMode.value = 'right';
      options.dockWidthPx.value = 230;
      options.clipPanelWidthPx.value = 360;
      options.dockPinned.value = false;
      options.clipPanelPinned.value = false;
      options.dockLocked.value = false;
      options.clipPanelLocked.value = false;
      options.timelineZoomPercent.value = 180;
      options.activePanelTab.value = 'shot';
      options.activeDockPanel.value = 'shots';
      persistUiPrefs();
      return;
    }
    if (options.workspacePresetId.value === 'review') {
      options.studioImmersiveMode.value = false;
      options.studioDenseMode.value = false;
      options.studioDockCollapsed.value = false;
      options.dockLayoutMode.value = 'right';
      options.clipPanelLayoutMode.value = 'left';
      options.dockWidthPx.value = 280;
      options.clipPanelWidthPx.value = 420;
      options.dockPinned.value = false;
      options.clipPanelPinned.value = false;
      options.dockLocked.value = false;
      options.clipPanelLocked.value = false;
      options.timelineZoomPercent.value = 120;
      options.activePanelTab.value = 'transition';
      options.activeDockPanel.value = 'actions';
      persistUiPrefs();
      return;
    }
    if (options.workspacePresetId.value === 'cinema') {
      options.studioImmersiveMode.value = true;
      options.studioDenseMode.value = false;
      options.studioDockCollapsed.value = false;
      options.dockLayoutMode.value = 'float';
      options.clipPanelLayoutMode.value = 'float';
      options.dockWidthPx.value = 300;
      options.clipPanelWidthPx.value = 420;
      options.dockPinned.value = true;
      options.clipPanelPinned.value = true;
      options.dockLocked.value = false;
      options.clipPanelLocked.value = false;
      options.timelineZoomPercent.value = 220;
      options.activePanelTab.value = 'effects';
      options.activeDockPanel.value = 'media';
      persistUiPrefs();
      return;
    }
    persistUiPrefs();
  };

  return {
    applyUiPrefs,
    applyWorkspaceDraft,
    applyWorkspacePreset,
    autoSaveEnabled,
    buildCurrentUiPrefs,
    clearWorkspaceDraft,
    deleteWorkspaceQuickSlot,
    exportWorkspaceDraft,
    handleWorkspaceImportFileChange,
    lastAutoSaveAt,
    loadWorkspaceQuickSlots,
    localDraftMeta,
    persistUiPrefs,
    refreshLocalDraftMeta,
    restoreUiPrefs,
    restoreWorkspaceDraftFromLocal,
    restoreWorkspaceQuickSlot,
    saveWorkspaceDraftToLocal,
    saveWorkspaceQuickSlot,
    selectedWorkspaceQuickSlotId,
    startWorkspaceAutoSave,
    stopWorkspaceAutoSave,
    triggerWorkspaceImport,
    workspaceImportInputRef,
    workspaceQuickSlots
  };
};
