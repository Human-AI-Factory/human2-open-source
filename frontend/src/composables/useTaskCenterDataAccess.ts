import type { Ref } from 'vue';
import {
  getFailureInjectionReport,
  getGlobalVideoTaskMetrics,
  getGlobalVideoTaskRuntimeHealth,
  getGlobalVideoTasks,
  getQueueRuntimeAlerts
} from '@/api/task-center';
import type {
  FailureInjectionReport,
  QueueRuntimeAlertState,
  VideoTaskListItem,
  VideoTaskMetrics,
  VideoTaskRuntimeHealth,
  VideoTaskRuntimeSnapshot,
  VideoTaskRuntimeTrendPoint
} from '@/types/models';
import { toErrorMessage } from '@/utils/errors';

type TaskStatusFilter = '' | 'queued' | 'submitting' | 'polling' | 'running' | 'done' | 'failed' | 'cancelled';
type ProviderErrorCodeFilter =
  | ''
  | 'CAPABILITY_MISMATCH'
  | 'PROVIDER_AUTH_FAILED'
  | 'PROVIDER_RATE_LIMITED'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_UNKNOWN';

type TaskQuotaDiffEntryLike = {
  projectId: string;
  before: {
    dailyLimit: number;
    limitSource: string;
    tier?: string | null;
  };
  after: {
    dailyLimit: number;
    limitSource: string;
    tier?: string | null;
  };
};

type UseTaskCenterDataAccessOptions = {
  pageSize: number;
  tasks: Ref<VideoTaskListItem[]>;
  total: Ref<number>;
  metrics: Ref<VideoTaskMetrics>;
  runtime: Ref<VideoTaskRuntimeSnapshot>;
  runtimeTrend: Ref<VideoTaskRuntimeTrendPoint[]>;
  queueAlertState: Ref<QueueRuntimeAlertState>;
  failureInjectionReport: Ref<FailureInjectionReport>;
  keyword: Ref<string>;
  providerTaskIdKeyword: Ref<string>;
  providerErrorCode: Ref<ProviderErrorCodeFilter>;
  createdFromLocal: Ref<string>;
  createdToLocal: Ref<string>;
  sortBy: Ref<'createdAt' | 'updatedAt' | 'priority' | 'status'>;
  order: Ref<'asc' | 'desc'>;
  status: Ref<TaskStatusFilter>;
  page: Ref<number>;
  taskQuotaUsageProjectId: Ref<string>;
  taskQuotaDiffEntries: Ref<TaskQuotaDiffEntryLike[]>;
  error: Ref<string>;
  actionMessage: Ref<string>;
  refreshTaskCatalog: () => Promise<void>;
  refreshUnifiedAlertsOnly: () => Promise<void>;
  loadTaskSloState: () => Promise<void>;
  refreshTaskQuotaUsage: () => Promise<void>;
  loadTaskQuotaUsageEvents: () => Promise<void>;
  loadTaskQuotaRejectEvents: () => Promise<void>;
};

const toIso = (value: string): string | undefined => {
  if (!value.trim()) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
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

export const useTaskCenterDataAccess = (options: UseTaskCenterDataAccessOptions) => {
  const loadTasks = async (): Promise<void> => {
    try {
      const [data, metricData, runtimeHealth, alertState, fiReport] = await Promise.all([
        getGlobalVideoTasks({
          q: options.keyword.value.trim() || undefined,
          providerTaskId: options.providerTaskIdKeyword.value.trim() || undefined,
          providerErrorCode: options.providerErrorCode.value || undefined,
          createdFrom: toIso(options.createdFromLocal.value),
          createdTo: toIso(options.createdToLocal.value),
          sortBy: options.sortBy.value,
          order: options.order.value,
          status: (options.status.value || undefined) as
            | 'queued'
            | 'submitting'
            | 'polling'
            | 'running'
            | 'done'
            | 'failed'
            | 'cancelled'
            | undefined,
          page: options.page.value,
          pageSize: options.pageSize
        }),
        getGlobalVideoTaskMetrics(),
        getGlobalVideoTaskRuntimeHealth({ limit: 30 }),
        getQueueRuntimeAlerts({ limit: 10 }),
        getFailureInjectionReport({ limit: 20 }),
        options.refreshTaskCatalog(),
        options.refreshUnifiedAlertsOnly()
      ]);
      options.tasks.value = data.items;
      options.total.value = data.total;
      options.metrics.value = metricData;
      options.runtime.value = runtimeHealth.snapshot;
      options.runtimeTrend.value = runtimeHealth.trend;
      options.queueAlertState.value = alertState;
      options.failureInjectionReport.value = fiReport;
      if (!options.taskQuotaUsageProjectId.value.trim() && data.items.length > 0) {
        options.taskQuotaUsageProjectId.value = data.items[0].projectId;
      }
      void Promise.allSettled([
        options.loadTaskSloState(),
        options.refreshTaskQuotaUsage(),
        options.loadTaskQuotaUsageEvents(),
        options.loadTaskQuotaRejectEvents()
      ]);
      options.error.value = '';
    } catch (err) {
      options.error.value = toErrorMessage(err, '加载任务失败');
    }
  };

  const loadRuntimeOnly = async (): Promise<void> => {
    try {
      const [health, alertState, fiReport] = await Promise.all([
        getGlobalVideoTaskRuntimeHealth({ limit: 30 }),
        getQueueRuntimeAlerts({ limit: 10 }),
        getFailureInjectionReport({ limit: 20 }),
        options.refreshUnifiedAlertsOnly()
      ]);
      options.runtime.value = (health as VideoTaskRuntimeHealth).snapshot;
      options.runtimeTrend.value = (health as VideoTaskRuntimeHealth).trend;
      options.queueAlertState.value = alertState;
      options.failureInjectionReport.value = fiReport;
      void options.loadTaskSloState();
    } catch {
      // keep silent on polling failures
    }
  };

  const formatPercent = (value: number): string => `${(value * 100).toFixed(1)}%`;

  const formatMs = (value: number): string => {
    if (value < 1000) {
      return `${value}ms`;
    }
    return `${(value / 1000).toFixed(2)}s`;
  };

  const exportTaskQuotaDiffCsv = (): void => {
    if (options.taskQuotaDiffEntries.value.length === 0) {
      return;
    }
    const csvEscape = (raw: string): string => `"${raw.replaceAll('"', '""')}"`;
    const rows = options.taskQuotaDiffEntries.value.map((item) =>
      [
        item.projectId,
        String(item.before.dailyLimit),
        item.before.limitSource,
        item.before.tier ?? '',
        String(item.after.dailyLimit),
        item.after.limitSource,
        item.after.tier ?? ''
      ]
        .map(csvEscape)
        .join(',')
    );
    const body = [
      '"projectId","beforeDailyLimit","beforeSource","beforeTier","afterDailyLimit","afterSource","afterTier"',
      ...rows
    ].join('\n');
    const filename = `task-quota-diff-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    downloadBlobFile(filename, new Blob([body], { type: 'text/csv;charset=utf-8' }));
    options.actionMessage.value = '已导出配额变更 CSV';
  };

  return {
    loadTasks,
    loadRuntimeOnly,
    formatPercent,
    formatMs,
    exportTaskQuotaDiffCsv
  };
};
