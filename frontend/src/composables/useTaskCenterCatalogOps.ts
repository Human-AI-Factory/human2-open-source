import { computed, ref, type Ref } from 'vue';
import { getTaskCatalog, getTaskCatalogAlerts, getTaskCatalogContractCheck } from '@/api/task-center';
import type { TaskCatalogAlertEvent, TaskCatalogContractCheckResult, TaskCatalogItem } from '@/types/models';
import { toErrorMessage } from '@/utils/errors';

type UseTaskCenterCatalogOpsOptions = {
  error: Ref<string>;
  actionMessage: Ref<string>;
};

const downloadBlobFile = (filename: string, blob: Blob): void => {
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(href);
};

export const useTaskCenterCatalogOps = (options: UseTaskCenterCatalogOpsOptions) => {
  const taskCatalogLoading = ref(false);
  const taskCatalog = ref<TaskCatalogItem[]>([]);
  const taskCatalogContractCheck = ref<TaskCatalogContractCheckResult | null>(null);
  const taskCatalogAlerts = ref<TaskCatalogAlertEvent[]>([]);
  const taskCatalogTypeFilter = ref<'' | 'video' | 'audio' | 'video_merge'>('');

  const filteredTaskCatalog = computed(() => {
    if (!taskCatalogTypeFilter.value) {
      return taskCatalog.value;
    }
    return taskCatalog.value.filter((item) => item.taskType === taskCatalogTypeFilter.value);
  });

  const taskCatalogDiffByType = computed<Record<string, { drift: boolean; reasons: string[] }>>(() => {
    const map: Record<string, { drift: boolean; reasons: string[] }> = {};
    for (const item of taskCatalogContractCheck.value?.items ?? []) {
      map[item.taskType] = {
        drift: item.drift,
        reasons: item.reasons
      };
    }
    return map;
  });

  const taskCatalogDriftCount = computed(() => taskCatalogContractCheck.value?.driftCount ?? 0);

  const refreshTaskCatalog = async (): Promise<void> => {
    taskCatalogLoading.value = true;
    try {
      const [catalog, contract, alerts] = await Promise.all([
        getTaskCatalog(),
        getTaskCatalogContractCheck().catch(() => null),
        getTaskCatalogAlerts({ limit: 20 }).catch(() => [])
      ]);
      taskCatalog.value = catalog;
      taskCatalogContractCheck.value = contract;
      taskCatalogAlerts.value = alerts;
    } catch (err) {
      options.error.value = toErrorMessage(err, '加载任务类型目录失败');
    } finally {
      taskCatalogLoading.value = false;
    }
  };

  const exportTaskCatalog = (format: 'json' | 'csv'): void => {
    const contractItems = taskCatalogContractCheck.value?.items ?? [];
    if (taskCatalog.value.length === 0 && contractItems.length === 0) {
      return;
    }
    if (format === 'json') {
      const enriched =
        contractItems.length > 0
          ? contractItems.map((item) => ({
              taskType: item.taskType,
              actual: item.actual,
              expected: item.expected,
              drift: item.drift,
              driftReasons: item.reasons
            }))
          : taskCatalog.value.map((item) => ({
              taskType: item.taskType,
              actual: item,
              expected: null,
              drift: taskCatalogDiffByType.value[item.taskType]?.drift ?? false,
              driftReasons: taskCatalogDiffByType.value[item.taskType]?.reasons ?? []
            }));
      const filename = `task-catalog-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      downloadBlobFile(filename, new Blob([JSON.stringify(enriched, null, 2)], { type: 'application/json' }));
      options.actionMessage.value = '已导出 Task Catalog JSON';
      return;
    }

    const csvEscape = (raw: string): string => `"${raw.replaceAll('"', '""')}"`;
    const csvItems =
      contractItems.length > 0
        ? contractItems.map((item) => ({
            taskType: item.taskType,
            queueTopic: item.actual?.queueTopic ?? '',
            defaultPriority: item.actual?.defaultPriority ?? '',
            terminalStatuses: item.actual?.terminalStatuses ?? [],
            retryableStatuses: item.actual?.retryableStatuses ?? [],
            drift: item.drift,
            driftReasons: item.reasons
          }))
        : taskCatalog.value.map((item) => ({
            taskType: item.taskType,
            queueTopic: item.queueTopic,
            defaultPriority: item.defaultPriority,
            terminalStatuses: item.terminalStatuses,
            retryableStatuses: item.retryableStatuses,
            drift: taskCatalogDiffByType.value[item.taskType]?.drift ?? false,
            driftReasons: taskCatalogDiffByType.value[item.taskType]?.reasons ?? []
          }));
    const rows = csvItems.map((item) =>
      [
        item.taskType,
        item.queueTopic,
        item.defaultPriority,
        item.terminalStatuses.join('|'),
        item.retryableStatuses.join('|'),
        item.drift ? 'yes' : 'no',
        item.driftReasons.join(' | ')
      ]
        .map(csvEscape)
        .join(',')
    );
    const body = ['"taskType","queueTopic","defaultPriority","terminalStatuses","retryableStatuses","drift","driftReasons"', ...rows].join(
      '\n'
    );
    const filename = `task-catalog-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    downloadBlobFile(filename, new Blob([body], { type: 'text/csv;charset=utf-8' }));
    options.actionMessage.value = '已导出 Task Catalog CSV';
  };

  return {
    exportTaskCatalog,
    filteredTaskCatalog,
    refreshTaskCatalog,
    taskCatalog,
    taskCatalogAlerts,
    taskCatalogContractCheck,
    taskCatalogDiffByType,
    taskCatalogDriftCount,
    taskCatalogLoading,
    taskCatalogTypeFilter
  };
};
