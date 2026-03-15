import { onBeforeUnmount, onMounted, type Ref } from 'vue';

type UseTimelineDesktopBridgeOptions<TDraft> = {
  quickCommandFeedback: Ref<string>;
  focusQuickCommandInput: () => void;
  saveTimeline: () => Promise<unknown> | void;
  createMergeByTimeline: () => Promise<unknown> | void;
  toggleTimelinePlayback: () => void;
  applyWorkspaceDraft: (draft: TDraft) => void;
  isWorkspaceDraft: (input: unknown) => input is TDraft;
};

export const useTimelineDesktopBridge = <TDraft>(options: UseTimelineDesktopBridgeOptions<TDraft>) => {
  let detachDesktopMenuCommand: (() => void) | null = null;
  let detachDesktopWorkspaceFileOpened: (() => void) | null = null;

  const handleDesktopMenuCommand = (payload: { command?: string }): void => {
    const command = payload?.command || '';
    if (!command) {
      return;
    }
    if (command === 'focus-command') {
      options.focusQuickCommandInput();
      options.quickCommandFeedback.value = '桌面菜单：已聚焦命令条';
      return;
    }
    if (command === 'save-timeline') {
      void options.saveTimeline();
      options.quickCommandFeedback.value = '桌面菜单：已触发保存时间线';
      return;
    }
    if (command === 'merge-timeline') {
      void options.createMergeByTimeline();
      options.quickCommandFeedback.value = '桌面菜单：已触发合成任务';
      return;
    }
    if (command === 'toggle-playback') {
      options.toggleTimelinePlayback();
    }
  };

  const importWorkspaceFileFromPath = async (filePath: string): Promise<void> => {
    const bridge = window.human2Desktop;
    if (!bridge || !filePath) {
      return;
    }
    const content = await bridge.readWorkspaceFile({ filePath });
    if (!content) {
      options.quickCommandFeedback.value = '打开工作区文件失败：无返回内容';
      return;
    }
    if ('error' in content) {
      options.quickCommandFeedback.value = `打开工作区文件失败：${content.error}`;
      return;
    }
    const parsed = content.parsed as {
      workspaceDraft?: unknown;
      draft?: unknown;
    };
    const draft = parsed?.workspaceDraft || parsed?.draft || parsed;
    if (!options.isWorkspaceDraft(draft)) {
      options.quickCommandFeedback.value = '工作区文件格式不支持（需要包含 draft/workspaceDraft）';
      return;
    }
    options.applyWorkspaceDraft(draft);
    options.quickCommandFeedback.value = `已从文件恢复工作区：${filePath}`;
  };

  onMounted(() => {
    if (!window.human2Desktop) {
      return;
    }
    detachDesktopMenuCommand = window.human2Desktop.onMenuCommand((payload) => {
      handleDesktopMenuCommand(payload || {});
    });
    detachDesktopWorkspaceFileOpened = window.human2Desktop.onWorkspaceFileOpened((payload) => {
      if (payload?.filePath) {
        void importWorkspaceFileFromPath(payload.filePath);
      }
    });
  });

  onBeforeUnmount(() => {
    if (detachDesktopMenuCommand) {
      detachDesktopMenuCommand();
      detachDesktopMenuCommand = null;
    }
    if (detachDesktopWorkspaceFileOpened) {
      detachDesktopWorkspaceFileOpened();
      detachDesktopWorkspaceFileOpened = null;
    }
  });
};
