import type { Ref } from 'vue';

type CommandHistoryEntry = {
  id: string;
  command?: string;
};

type UseTimelineQuickCommandsOptions = {
  quickCommand: Ref<string>;
  quickCommandFeedback: Ref<string>;
  commandHistory: Ref<CommandHistoryEntry[]>;
  timelinePlaying: Ref<boolean>;
  saveTimeline: () => Promise<unknown> | void;
  createMergeByTimeline: () => Promise<unknown> | void;
  toggleTimelinePlayback: () => void;
  duplicateSelectedClips: () => void;
  removeSelectedClips: () => void;
  focusSelectedClipPlayhead: () => void;
  stepSelectedClip: (delta: -1 | 1) => void;
  resetSelectedClipKeyframe: () => void;
  resetSelectedClipTransition: () => void;
  undoTimelineEdit: () => void;
  redoTimelineEdit: () => void;
  pushCommandHistory: (action: string, detail?: string, command?: string) => void;
};

export const useTimelineQuickCommands = (options: UseTimelineQuickCommandsOptions) => {
  const executeQuickCommand = (input: string, config?: { fromReplay?: boolean }): boolean => {
    const command = input.trim().toLowerCase();
    if (!command) {
      return false;
    }
    if (command === 'play') {
      if (!options.timelinePlaying.value) {
        options.toggleTimelinePlayback();
      }
      options.quickCommandFeedback.value = '已执行：播放';
      return true;
    }
    if (command === 'pause') {
      if (options.timelinePlaying.value) {
        options.toggleTimelinePlayback();
      }
      options.quickCommandFeedback.value = '已执行：暂停';
      return true;
    }
    if (command === 'save') {
      void options.saveTimeline();
      options.quickCommandFeedback.value = '已执行：保存时间线';
      return true;
    }
    if (command === 'merge') {
      void options.createMergeByTimeline();
      options.quickCommandFeedback.value = '已执行：按时间线发起合成';
      return true;
    }
    if (command === 'duplicate') {
      options.duplicateSelectedClips();
      options.quickCommandFeedback.value = '已执行：复制选中片段';
      return true;
    }
    if (command === 'delete') {
      options.removeSelectedClips();
      options.quickCommandFeedback.value = '已执行：删除选中片段';
      return true;
    }
    if (command === 'focus') {
      options.focusSelectedClipPlayhead();
      options.quickCommandFeedback.value = '已执行：播放头定位到当前片段';
      return true;
    }
    if (command === 'next') {
      options.stepSelectedClip(1);
      options.quickCommandFeedback.value = '已执行：选中下一个片段';
      return true;
    }
    if (command === 'prev') {
      options.stepSelectedClip(-1);
      options.quickCommandFeedback.value = '已执行：选中上一个片段';
      return true;
    }
    if (command === 'reset-keyframe') {
      options.resetSelectedClipKeyframe();
      options.quickCommandFeedback.value = '已执行：重置关键帧';
      return true;
    }
    if (command === 'reset-transition') {
      options.resetSelectedClipTransition();
      options.quickCommandFeedback.value = '已执行：重置转场';
      return true;
    }
    if (command === 'undo') {
      options.undoTimelineEdit();
      options.quickCommandFeedback.value = '已执行：撤销';
      return true;
    }
    if (command === 'redo') {
      options.redoTimelineEdit();
      options.quickCommandFeedback.value = '已执行：重做';
      return true;
    }
    if (!config?.fromReplay) {
      options.quickCommandFeedback.value = `未知命令：${command}`;
    }
    return false;
  };

  const runQuickCommand = (): void => {
    const input = options.quickCommand.value.trim();
    if (!input) {
      options.quickCommandFeedback.value = '请输入命令';
      return;
    }
    const commands = input
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean);
    if (commands.length === 0) {
      options.quickCommandFeedback.value = '请输入命令';
      return;
    }
    let successCount = 0;
    for (const command of commands) {
      if (executeQuickCommand(command)) {
        successCount += 1;
      }
    }
    if (successCount > 0) {
      options.pushCommandHistory('quick-command', commands.join(';'), commands.join(';'));
    } else {
      options.quickCommandFeedback.value = `未知命令：${input}`;
    }
  };

  const replayHistoryCommand = (historyId: string): void => {
    const item = options.commandHistory.value.find((entry) => entry.id === historyId);
    if (!item?.command) {
      return;
    }
    const commands = item.command
      .split(';')
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean);
    for (const command of commands) {
      executeQuickCommand(command, { fromReplay: true });
    }
    options.quickCommandFeedback.value = `已重放命令：${item.command}`;
  };

  return {
    executeQuickCommand,
    replayHistoryCommand,
    runQuickCommand
  };
};
