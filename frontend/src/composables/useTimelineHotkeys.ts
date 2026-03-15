import { onBeforeUnmount, onMounted, type Ref } from 'vue';

type LayoutPreset = 'custom' | 'focus' | 'review' | 'cinema';

type UseTimelineHotkeysOptions = {
  quickCommandFeedback: Ref<string>;
  workspacePresetId: Ref<LayoutPreset>;
  focusQuickCommandInput: () => void;
  saveTimeline: () => Promise<unknown> | void;
  applyWorkspacePreset: () => void;
  undoTimelineEdit: () => void;
  redoTimelineEdit: () => void;
  toggleHotkeyHelp: () => void;
  toggleStudioImmersiveMode: () => void;
  stepSelectedClip: (delta: -1 | 1) => void;
  toggleTimelinePlayback: () => void;
  stepPlayhead: (direction: -1 | 1) => void;
  removeSelectedClips: () => void;
  duplicateSelectedClips: () => void;
  nudgeSelectedClipDuration: (direction: -1 | 1) => void;
  isTypingElement: (target: EventTarget | null) => boolean;
};

export const useTimelineHotkeys = (options: UseTimelineHotkeysOptions) => {
  const onTimelineHotkeyDown = (event: KeyboardEvent): void => {
    if (options.isTypingElement(event.target)) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        options.focusQuickCommandInput();
      }
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      options.focusQuickCommandInput();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      void options.saveTimeline();
      options.quickCommandFeedback.value = '已执行：保存时间线';
      return;
    }
    if ((event.metaKey || event.ctrlKey) && ['1', '2', '3', '4'].includes(event.key)) {
      event.preventDefault();
      const mapping: Record<string, LayoutPreset> = {
        '1': 'custom',
        '2': 'focus',
        '3': 'review',
        '4': 'cinema'
      };
      const preset = mapping[event.key];
      options.workspacePresetId.value = preset;
      options.applyWorkspacePreset();
      options.quickCommandFeedback.value = `已切换工作区预设：${preset}`;
      return;
    }
    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      options.undoTimelineEdit();
      return;
    }
    if (
      ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'z') ||
      ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y')
    ) {
      event.preventDefault();
      options.redoTimelineEdit();
      return;
    }
    if (event.key === '?') {
      event.preventDefault();
      options.toggleHotkeyHelp();
      return;
    }
    if (event.key.toLowerCase() === 'f') {
      event.preventDefault();
      options.toggleStudioImmersiveMode();
      return;
    }
    if (event.key.toLowerCase() === 'j') {
      event.preventDefault();
      options.stepSelectedClip(-1);
      return;
    }
    if (event.key.toLowerCase() === 'k') {
      event.preventDefault();
      options.stepSelectedClip(1);
      return;
    }
    if (event.key === ' ') {
      event.preventDefault();
      options.toggleTimelinePlayback();
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      options.stepPlayhead(-1);
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      options.stepPlayhead(1);
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      options.removeSelectedClips();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd') {
      event.preventDefault();
      options.duplicateSelectedClips();
      return;
    }
    if (event.key === '[') {
      event.preventDefault();
      options.nudgeSelectedClipDuration(-1);
      return;
    }
    if (event.key === ']') {
      event.preventDefault();
      options.nudgeSelectedClipDuration(1);
    }
  };

  onMounted(() => {
    window.addEventListener('keydown', onTimelineHotkeyDown);
  });

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onTimelineHotkeyDown);
  });
};
