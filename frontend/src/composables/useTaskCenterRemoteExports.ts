import type { Ref } from 'vue';
import {
  downloadFailureInjectionEventsExport,
  downloadGlobalVideoTaskEventsExport,
  downloadQueueRuntimeAlertsExport,
  downloadTaskCatalogAlertsExport,
  downloadTaskQuotaRejectEventsExport,
  downloadTaskQuotaUsageEventsExport,
  downloadTaskUnifiedAlertActionsExport,
  downloadTaskUnifiedAlertIncidentEscalationLogsExport,
  downloadTaskUnifiedAlertIncidentNotificationDeliveryLogsExport,
  downloadTaskUnifiedAlertIncidentsExport,
  downloadTaskUnifiedAlertsExport,
  getGlobalVideoTaskEventsExportCount
} from '@/api/task-center';
import { toErrorMessage } from '@/utils/errors';

type VideoTaskEventStatus = 'queued' | 'submitting' | 'polling' | 'running' | 'done' | 'failed' | 'cancelled';
type DeliveryLogStatus = 'sent' | 'failed';
type IncidentStatus = 'open' | 'resolved';
type FailureInjectionTaskType = 'video' | 'audio' | 'video_merge';
type FailureInjectionErrorCode =
  | 'CAPABILITY_MISMATCH'
  | 'PROVIDER_AUTH_FAILED'
  | 'PROVIDER_RATE_LIMITED'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_UNKNOWN';

type TaskCenterRemoteExportOptions = {
  error: Ref<string>;
  actionMessage: Ref<string>;
  taskQuotaLoading: Ref<boolean>;
  taskCatalogLoading: Ref<boolean>;
  taskUnifiedAlertPolicyLoading: Ref<boolean>;
  queueAlertActionLoading: Ref<boolean>;
  failureInjectionLoading: Ref<boolean>;
  unifiedIncidentEscalationLoading: Ref<boolean>;
  unifiedIncidentActionLoading: Ref<boolean>;
  taskQuotaUsageProjectId: Ref<string>;
  unifiedAlertWindowMinutes: Ref<number>;
  unifiedIncidentStatusFilter: Ref<string>;
  unifiedIncidentNotificationDeliveryStatusFilter: Ref<string>;
  fiTaskTypeFilter: Ref<string>;
  fiErrorCodeFilter: Ref<string>;
  activeTaskId: Ref<string>;
  eventStatusFilter: Ref<string>;
  eventKeyword: Ref<string>;
  eventCreatedFromLocal: Ref<string>;
  eventCreatedToLocal: Ref<string>;
  eventExportCount: Ref<number>;
  eventExportCountLoading: Ref<boolean>;
};

const toIso = (value: string): string | undefined => {
  if (!value.trim()) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
};

const toVideoTaskEventStatus = (value: string): VideoTaskEventStatus | undefined =>
  value
    ? (value as VideoTaskEventStatus)
    : undefined;

const toDeliveryLogStatus = (value: string): DeliveryLogStatus | undefined =>
  value
    ? (value as DeliveryLogStatus)
    : undefined;

const toIncidentStatus = (value: string): IncidentStatus | undefined =>
  value
    ? (value as IncidentStatus)
    : undefined;

const toFailureInjectionTaskType = (value: string): FailureInjectionTaskType | undefined =>
  value
    ? (value as FailureInjectionTaskType)
    : undefined;

const toFailureInjectionErrorCode = (value: string): FailureInjectionErrorCode | undefined =>
  value
    ? (value as FailureInjectionErrorCode)
    : undefined;

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

export const useTaskCenterRemoteExports = (options: TaskCenterRemoteExportOptions) => {
  const exportTaskQuotaUsageEvents = async (format: 'json' | 'csv'): Promise<void> => {
    options.taskQuotaLoading.value = true;
    try {
      const { blob, filename } = await downloadTaskQuotaUsageEventsExport({
        format,
        limit: 500,
        projectId: options.taskQuotaUsageProjectId.value.trim() || undefined
      });
      downloadBlobFile(filename, blob);
      options.actionMessage.value = `已导出配额消耗账本 ${format.toUpperCase()}`;
    } catch (err) {
      options.error.value = toErrorMessage(err, `导出配额消耗账本 ${format.toUpperCase()} 失败`);
    } finally {
      options.taskQuotaLoading.value = false;
    }
  };

  const exportTaskQuotaRejectEvents = async (format: 'json' | 'csv'): Promise<void> => {
    options.taskQuotaLoading.value = true;
    try {
      const { blob, filename } = await downloadTaskQuotaRejectEventsExport({
        format,
        limit: 200,
        projectId: options.taskQuotaUsageProjectId.value.trim() || undefined
      });
      downloadBlobFile(filename, blob);
      options.actionMessage.value = `已导出配额拒绝事件 ${format.toUpperCase()}`;
    } catch (err) {
      options.error.value = toErrorMessage(err, `导出配额拒绝事件 ${format.toUpperCase()} 失败`);
    } finally {
      options.taskQuotaLoading.value = false;
    }
  };

  const exportUnifiedIncidentEscalations = async (format: 'json' | 'csv'): Promise<void> => {
    options.unifiedIncidentEscalationLoading.value = true;
    try {
      const { blob, filename } = await downloadTaskUnifiedAlertIncidentEscalationLogsExport({
        format,
        limit: 1000
      });
      downloadBlobFile(filename, blob);
      options.actionMessage.value = `已导出 Incident 升级日志 ${format.toUpperCase()}`;
      options.error.value = '';
    } catch (err) {
      options.error.value = toErrorMessage(err, `导出 Incident 升级日志 ${format.toUpperCase()} 失败`);
    } finally {
      options.unifiedIncidentEscalationLoading.value = false;
    }
  };

  const exportUnifiedIncidentNotificationDeliveryLogs = async (format: 'json' | 'csv'): Promise<void> => {
    options.unifiedIncidentEscalationLoading.value = true;
    try {
      const { blob, filename } = await downloadTaskUnifiedAlertIncidentNotificationDeliveryLogsExport({
        format,
        limit: 1000,
        status: toDeliveryLogStatus(options.unifiedIncidentNotificationDeliveryStatusFilter.value)
      });
      downloadBlobFile(filename, blob);
      options.actionMessage.value = `已导出通知投递日志 ${format.toUpperCase()}`;
      options.error.value = '';
    } catch (err) {
      options.error.value = toErrorMessage(err, `导出通知投递日志 ${format.toUpperCase()} 失败`);
    } finally {
      options.unifiedIncidentEscalationLoading.value = false;
    }
  };

  const exportUnifiedAlertIncidents = async (format: 'json' | 'csv'): Promise<void> => {
    options.unifiedIncidentActionLoading.value = true;
    try {
      const { blob, filename } = await downloadTaskUnifiedAlertIncidentsExport({
        format,
        limit: 1000,
        status: toIncidentStatus(options.unifiedIncidentStatusFilter.value)
      });
      downloadBlobFile(filename, blob);
      options.actionMessage.value = `已导出 Incident ${format.toUpperCase()}`;
      options.error.value = '';
    } catch (err) {
      options.error.value = toErrorMessage(err, `导出 Incident ${format.toUpperCase()} 失败`);
    } finally {
      options.unifiedIncidentActionLoading.value = false;
    }
  };

  const exportTaskCatalogAlerts = async (format: 'json' | 'csv'): Promise<void> => {
    options.taskCatalogLoading.value = true;
    try {
      const { blob, filename } = await downloadTaskCatalogAlertsExport({ format, limit: 200 });
      downloadBlobFile(filename, blob);
      options.actionMessage.value = `已导出 Task Catalog 告警 ${format.toUpperCase()}`;
    } catch (err) {
      options.error.value = toErrorMessage(err, `导出 Task Catalog 告警 ${format.toUpperCase()} 失败`);
    } finally {
      options.taskCatalogLoading.value = false;
    }
  };

  const exportUnifiedAlerts = async (format: 'json' | 'csv'): Promise<void> => {
    options.queueAlertActionLoading.value = true;
    try {
      const { blob, filename } = await downloadTaskUnifiedAlertsExport({
        format,
        limit: 500,
        windowMinutes: options.unifiedAlertWindowMinutes.value
      });
      downloadBlobFile(filename, blob);
      options.actionMessage.value = `已导出统一告警 ${format.toUpperCase()}`;
    } catch (err) {
      options.error.value = toErrorMessage(err, `导出统一告警 ${format.toUpperCase()} 失败`);
    } finally {
      options.queueAlertActionLoading.value = false;
    }
  };

  const exportUnifiedAlertActions = async (format: 'json' | 'csv'): Promise<void> => {
    options.taskUnifiedAlertPolicyLoading.value = true;
    try {
      const { blob, filename } = await downloadTaskUnifiedAlertActionsExport({
        format,
        limit: 1000
      });
      downloadBlobFile(filename, blob);
      options.actionMessage.value = `已导出统一告警动作日志 ${format.toUpperCase()}`;
    } catch (err) {
      options.error.value = toErrorMessage(err, `导出统一告警动作日志 ${format.toUpperCase()} 失败`);
    } finally {
      options.taskUnifiedAlertPolicyLoading.value = false;
    }
  };

  const exportQueueAlertsJson = async (): Promise<void> => {
    options.queueAlertActionLoading.value = true;
    try {
      const { blob, filename } = await downloadQueueRuntimeAlertsExport({ format: 'json', limit: 200 });
      downloadBlobFile(filename, blob);
      options.actionMessage.value = '已导出队列告警 JSON';
    } catch (err) {
      options.error.value = toErrorMessage(err, '导出队列告警 JSON 失败');
    } finally {
      options.queueAlertActionLoading.value = false;
    }
  };

  const exportQueueAlertsCsv = async (): Promise<void> => {
    options.queueAlertActionLoading.value = true;
    try {
      const { blob, filename } = await downloadQueueRuntimeAlertsExport({ format: 'csv', limit: 200 });
      downloadBlobFile(filename, blob);
      options.actionMessage.value = '已导出队列告警 CSV';
    } catch (err) {
      options.error.value = toErrorMessage(err, '导出队列告警 CSV 失败');
    } finally {
      options.queueAlertActionLoading.value = false;
    }
  };

  const exportFailureInjectionEvents = async (format: 'json' | 'csv'): Promise<void> => {
    options.failureInjectionLoading.value = true;
    try {
      const { blob, filename } = await downloadFailureInjectionEventsExport({
        format,
        limit: 200,
        taskType: toFailureInjectionTaskType(options.fiTaskTypeFilter.value),
        errorCode: toFailureInjectionErrorCode(options.fiErrorCodeFilter.value)
      });
      downloadBlobFile(filename, blob);
      options.actionMessage.value = `已导出失败注入事件 ${format.toUpperCase()}`;
    } catch (err) {
      options.error.value = toErrorMessage(err, `导出失败注入事件 ${format.toUpperCase()} 失败`);
    } finally {
      options.failureInjectionLoading.value = false;
    }
  };

  const exportFilteredEventsJson = async (): Promise<void> => {
    if (!options.activeTaskId.value) {
      options.error.value = '当前无可导出的任务';
      return;
    }
    try {
      const { blob, filename } = await downloadGlobalVideoTaskEventsExport(options.activeTaskId.value, {
        format: 'json',
        status: toVideoTaskEventStatus(options.eventStatusFilter.value),
        q: options.eventKeyword.value,
        createdFrom: toIso(options.eventCreatedFromLocal.value),
        createdTo: toIso(options.eventCreatedToLocal.value),
        limit: 10000
      });
      downloadBlobFile(filename, blob);
      options.actionMessage.value = '已导出日志 JSON';
    } catch (err) {
      options.error.value = toErrorMessage(err, '导出日志 JSON 失败');
    }
  };

  const exportFilteredEventsCsv = async (): Promise<void> => {
    if (!options.activeTaskId.value) {
      options.error.value = '当前无可导出的任务';
      return;
    }
    try {
      const { blob, filename } = await downloadGlobalVideoTaskEventsExport(options.activeTaskId.value, {
        format: 'csv',
        status: toVideoTaskEventStatus(options.eventStatusFilter.value),
        q: options.eventKeyword.value,
        createdFrom: toIso(options.eventCreatedFromLocal.value),
        createdTo: toIso(options.eventCreatedToLocal.value),
        limit: 10000
      });
      downloadBlobFile(filename, blob);
      options.actionMessage.value = '已导出日志 CSV';
    } catch (err) {
      options.error.value = toErrorMessage(err, '导出日志 CSV 失败');
    }
  };

  const refreshEventExportCount = async (): Promise<void> => {
    if (!options.activeTaskId.value) {
      options.eventExportCount.value = 0;
      return;
    }
    options.eventExportCountLoading.value = true;
    try {
      const result = await getGlobalVideoTaskEventsExportCount(options.activeTaskId.value, {
        status: toVideoTaskEventStatus(options.eventStatusFilter.value),
        q: options.eventKeyword.value,
        createdFrom: toIso(options.eventCreatedFromLocal.value),
        createdTo: toIso(options.eventCreatedToLocal.value)
      });
      options.eventExportCount.value = result.count;
    } catch {
      options.eventExportCount.value = 0;
    } finally {
      options.eventExportCountLoading.value = false;
    }
  };

  return {
    exportFailureInjectionEvents,
    exportFilteredEventsCsv,
    exportFilteredEventsJson,
    exportQueueAlertsCsv,
    exportQueueAlertsJson,
    exportTaskCatalogAlerts,
    exportTaskQuotaRejectEvents,
    exportTaskQuotaUsageEvents,
    exportUnifiedAlertActions,
    exportUnifiedAlertIncidents,
    exportUnifiedAlerts,
    exportUnifiedIncidentEscalations,
    exportUnifiedIncidentNotificationDeliveryLogs,
    refreshEventExportCount
  };
};
