import { onBeforeUnmount, onMounted, watch, type ComputedRef, type Ref } from 'vue';

type WatchSourceLike = Ref<unknown> | ComputedRef<unknown> | (() => unknown);

type UseTimelineScreenShellOptions = {
  handleVideoResizeMove: (event: PointerEvent) => void;
  handleGlobalPointerUp: (event: PointerEvent) => void;
  restoreUiPrefs: () => void;
  loadGlobalMacros: () => void;
  loadWorkspaceQuickSlots: () => void;
  loadPersonalLayoutTemplates: () => void;
  loadTeamLayoutTemplates: () => Promise<void>;
  refreshLocalDraftMeta: () => void;
  startWorkspaceAutoSave: () => void;
  stopWorkspaceAutoSave: () => void;
  loadAll: () => Promise<void>;
  stopKeyframePreview: () => void;
  transientObjectUrls: Ref<string[]>;
  disposeFloatingPanels: () => void;
  persistUiPrefs: () => void;
  autoSaveEnabled: Ref<boolean>;
  saveWorkspaceDraftToLocal: (mode: 'manual' | 'auto') => void;
  workspaceDraftStorageKey: ComputedRef<string>;
  workspaceScopeToken: ComputedRef<string>;
  persistUiPreferenceSources: WatchSourceLike[];
};

export const useTimelineScreenShell = (options: UseTimelineScreenShellOptions) => {
  onMounted(() => {
    window.addEventListener('pointermove', options.handleVideoResizeMove);
    window.addEventListener('pointerup', options.handleGlobalPointerUp);
    options.restoreUiPrefs();
    options.loadGlobalMacros();
    options.loadWorkspaceQuickSlots();
    options.loadPersonalLayoutTemplates();
    void options.loadTeamLayoutTemplates();
    options.refreshLocalDraftMeta();
    options.startWorkspaceAutoSave();
    void options.loadAll();
  });

  onBeforeUnmount(() => {
    options.stopKeyframePreview();
    options.stopWorkspaceAutoSave();
    for (const url of options.transientObjectUrls.value) {
      URL.revokeObjectURL(url);
    }
    options.transientObjectUrls.value = [];
    options.disposeFloatingPanels();
    window.removeEventListener('pointermove', options.handleVideoResizeMove);
    window.removeEventListener('pointerup', options.handleGlobalPointerUp);
  });

  watch(options.persistUiPreferenceSources, () => {
    options.persistUiPrefs();
  });

  watch(options.autoSaveEnabled, (enabled) => {
    if (!enabled) {
      return;
    }
    options.saveWorkspaceDraftToLocal('auto');
  });

  watch(options.workspaceDraftStorageKey, () => {
    options.refreshLocalDraftMeta();
  });

  watch(options.workspaceScopeToken, () => {
    options.restoreUiPrefs();
    options.loadWorkspaceQuickSlots();
    options.loadPersonalLayoutTemplates();
    void options.loadTeamLayoutTemplates();
  });
};
