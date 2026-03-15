import type { ComputedRef, Ref } from 'vue';
import { getGlobalVideoTaskDetail } from '@/api/task-center';
import type { VideoTaskDetail, VideoTaskEvent } from '@/types/models';
import { toErrorMessage } from '@/utils/errors';

type UseTaskCenterEventPanelOptions = {
  filteredEvents: ComputedRef<VideoTaskEvent[]>;
  eventsOpen: Ref<boolean>;
  eventsLoading: Ref<boolean>;
  events: Ref<VideoTaskEvent[]>;
  eventStatusFilter: Ref<string>;
  eventFailedOnly: Ref<boolean>;
  eventKeyword: Ref<string>;
  eventCreatedFromLocal: Ref<string>;
  eventCreatedToLocal: Ref<string>;
  eventExportCount: Ref<number>;
  activeTaskId: Ref<string>;
  activeDetail: Ref<VideoTaskDetail | null>;
  error: Ref<string>;
  actionMessage: Ref<string>;
  eventFiltersStorageKey: string;
  refreshEventExportCount: () => Promise<void>;
};

export const useTaskCenterEventPanel = (options: UseTaskCenterEventPanelOptions) => {
  const copyFilteredEventsText = async (): Promise<void> => {
    const text = options.filteredEvents.value
      .map((item) => `${item.createdAt} | ${item.status} | ${item.progress}% | ${item.error ?? ''}`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      options.actionMessage.value = '已复制日志文本';
      options.error.value = '';
    } catch {
      options.error.value = '复制日志文本失败，请检查浏览器剪贴板权限';
    }
  };

  const toggleEventFailedOnly = (): void => {
    if (options.eventFailedOnly.value) {
      options.eventStatusFilter.value = 'failed';
      return;
    }
    if (options.eventStatusFilter.value === 'failed') {
      options.eventStatusFilter.value = '';
    }
  };

  const resetEventFilters = (): void => {
    options.eventStatusFilter.value = '';
    options.eventFailedOnly.value = false;
    options.eventKeyword.value = '';
    options.eventCreatedFromLocal.value = '';
    options.eventCreatedToLocal.value = '';
    try {
      localStorage.removeItem(options.eventFiltersStorageKey);
    } catch {
      // ignore storage failures
    }
  };

  const viewEvents = async (taskId: string): Promise<void> => {
    options.eventsOpen.value = true;
    options.eventsLoading.value = true;
    options.activeTaskId.value = taskId;
    options.eventExportCount.value = 0;
    try {
      const detail = await getGlobalVideoTaskDetail(taskId, 60);
      options.activeDetail.value = detail;
      options.events.value = detail.events;
      await options.refreshEventExportCount();
    } catch (err) {
      options.error.value = toErrorMessage(err, '加载任务日志失败');
      options.events.value = [];
      options.activeDetail.value = null;
    } finally {
      options.eventsLoading.value = false;
    }
  };

  const closeEvents = (): void => {
    options.eventsOpen.value = false;
    options.events.value = [];
    options.eventExportCount.value = 0;
    options.activeDetail.value = null;
    options.activeTaskId.value = '';
  };

  return {
    copyFilteredEventsText,
    toggleEventFailedOnly,
    resetEventFilters,
    viewEvents,
    closeEvents
  };
};
