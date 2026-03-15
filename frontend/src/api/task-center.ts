import { request } from '@/api/client';
import { buildQuery, downloadAuthorizedFile } from '@/api/utils';
import type {
  FailureInjectionConfig,
  FailureInjectionReport,
  PageResult,
  QueueRuntimeAlertConfig,
  QueueRuntimeAlertState,
  TaskCatalogAlertEvent,
  TaskCatalogContractCheckResult,
  TaskCatalogItem,
  TaskCenterFilterPreset,
  TaskQuotaConfig,
  TaskQuotaRejectEvent,
  TaskQuotaUsage,
  TaskQuotaUsageEvent,
  TaskSloConfig,
  TaskSloState,
  TaskUnifiedAlertActionLog,
  TaskUnifiedAlertIncident,
  TaskUnifiedAlertIncidentEscalationConfig,
  TaskUnifiedAlertIncidentEscalationLog,
  TaskUnifiedAlertIncidentNotificationConfig,
  TaskUnifiedAlertIncidentNotificationDeliveryLog,
  TaskUnifiedAlertIncidentSlaConfig,
  TaskUnifiedAlertIncidentSlaSummary,
  TaskUnifiedAlertPolicyConfig,
  TaskUnifiedAlertState,
  VideoTask,
  VideoTaskBatchActionResult,
  VideoTaskBatchRepairByPolicyResult,
  VideoTaskDetail,
  VideoTaskEvent,
  VideoTaskListItem,
  VideoTaskMetrics,
  VideoTaskRuntimeHealth,
  VideoTaskRuntimeSnapshot
} from '@/types/models';

export const getGlobalVideoTasks = (input: {
  q?: string;
  providerTaskId?: string;
  providerErrorCode?: string;
  status?: 'queued' | 'submitting' | 'polling' | 'running' | 'done' | 'failed' | 'cancelled';
  createdFrom?: string;
  createdTo?: string;
  sortBy?: 'createdAt' | 'updatedAt' | 'priority' | 'status';
  order?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}): Promise<PageResult<VideoTaskListItem>> => request(`/api/tasks/video?${buildQuery(input)}`);

export const getGlobalVideoTaskMetrics = (): Promise<VideoTaskMetrics> => request('/api/tasks/video/metrics');

export const getTaskCatalog = (): Promise<TaskCatalogItem[]> => request('/api/tasks/catalog');

export const getTaskCatalogContractCheck = (): Promise<TaskCatalogContractCheckResult> => request('/api/tasks/catalog/contract-check');

export const getTaskCatalogAlerts = (input?: { limit?: number }): Promise<TaskCatalogAlertEvent[]> =>
  request(`/api/tasks/catalog/alerts?${buildQuery({ limit: input?.limit })}`);

export const downloadTaskCatalogAlertsExport = (input: {
  format: 'json' | 'csv';
  limit?: number;
}): Promise<{ blob: Blob; filename: string }> =>
  downloadAuthorizedFile(`/tasks/catalog/alerts/export?${buildQuery({ format: input.format, limit: input.limit })}`, {
    defaultFilename: `task-catalog-alerts.${input.format}`
  });

export const getTaskUnifiedAlerts = (input?: { limit?: number; windowMinutes?: number }): Promise<TaskUnifiedAlertState> =>
  request(`/api/tasks/alerts/unified?${buildQuery({ limit: input?.limit, windowMinutes: input?.windowMinutes })}`);

export const downloadTaskUnifiedAlertsExport = (input: {
  format: 'json' | 'csv';
  limit?: number;
  windowMinutes?: number;
}): Promise<{ blob: Blob; filename: string }> =>
  downloadAuthorizedFile(
    `/tasks/alerts/unified/export?${buildQuery({
      format: input.format,
      limit: input.limit,
      windowMinutes: input.windowMinutes
    })}`,
    { defaultFilename: `task-unified-alerts.${input.format}` }
  );

export const getTaskUnifiedAlertPolicy = (): Promise<TaskUnifiedAlertPolicyConfig> => request('/api/tasks/alerts/unified/policy');

export const updateTaskUnifiedAlertPolicy = (payload: {
  redTotalThreshold?: number;
  redQueueThreshold?: number;
  redContractThreshold?: number;
  cooldownMinutes?: number;
}): Promise<TaskUnifiedAlertPolicyConfig> =>
  request('/api/tasks/alerts/unified/policy', {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });

export const getTaskUnifiedAlertActions = (input?: { limit?: number }): Promise<TaskUnifiedAlertActionLog[]> =>
  request(`/api/tasks/alerts/unified/actions?${buildQuery({ limit: input?.limit })}`);

export const downloadTaskUnifiedAlertActionsExport = (input: {
  format: 'json' | 'csv';
  limit?: number;
}): Promise<{ blob: Blob; filename: string }> =>
  downloadAuthorizedFile(`/tasks/alerts/unified/actions/export?${buildQuery({ format: input.format, limit: input.limit })}`, {
    defaultFilename: `task-unified-alert-actions.${input.format}`
  });

export const getTaskUnifiedAlertIncidents = (input?: {
  limit?: number;
  status?: 'open' | 'resolved';
}): Promise<TaskUnifiedAlertIncident[]> =>
  request(`/api/tasks/alerts/unified/incidents?${buildQuery({ limit: input?.limit, status: input?.status })}`);

export const updateTaskUnifiedAlertIncident = (
  incidentId: string,
  payload: { status?: 'open' | 'resolved'; assignee?: string; note?: string }
): Promise<TaskUnifiedAlertIncident> =>
  request(`/api/tasks/alerts/unified/incidents/${incidentId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });

export const downloadTaskUnifiedAlertIncidentsExport = (input: {
  format: 'json' | 'csv';
  limit?: number;
  status?: 'open' | 'resolved';
}): Promise<{ blob: Blob; filename: string }> =>
  downloadAuthorizedFile(
    `/tasks/alerts/unified/incidents/export?${buildQuery({
      format: input.format,
      limit: input.limit,
      status: input.status
    })}`,
    { defaultFilename: `task-unified-alert-incidents.${input.format}` }
  );

export const getTaskUnifiedAlertIncidentSlaConfig = (): Promise<TaskUnifiedAlertIncidentSlaConfig> =>
  request('/api/tasks/alerts/unified/incidents/sla-config');

export const updateTaskUnifiedAlertIncidentSlaConfig = (payload: {
  warnAfterMinutes?: number;
  criticalAfterMinutes?: number;
  escalationAfterMinutes?: number;
}): Promise<TaskUnifiedAlertIncidentSlaConfig> =>
  request('/api/tasks/alerts/unified/incidents/sla-config', {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });

export const getTaskUnifiedAlertIncidentSlaSummary = (input?: { limit?: number }): Promise<TaskUnifiedAlertIncidentSlaSummary> =>
  request(`/api/tasks/alerts/unified/incidents/sla-summary?${buildQuery({ limit: input?.limit })}`);

export const triggerTaskUnifiedAlertIncidentEscalations = (payload?: {
  limit?: number;
  actor?: string;
}): Promise<{ created: number; skipped: number; logs: TaskUnifiedAlertIncidentEscalationLog[] }> =>
  request('/api/tasks/alerts/unified/incidents/escalate', {
    method: 'POST',
    body: JSON.stringify(payload ?? {})
  });

export const getTaskUnifiedAlertIncidentEscalationLogs = (input?: {
  limit?: number;
  incidentId?: string;
}): Promise<TaskUnifiedAlertIncidentEscalationLog[]> =>
  request(`/api/tasks/alerts/unified/incidents/escalations?${buildQuery({ limit: input?.limit, incidentId: input?.incidentId })}`);

export const getTaskUnifiedAlertIncidentEscalationConfig = (): Promise<TaskUnifiedAlertIncidentEscalationConfig> =>
  request('/api/tasks/alerts/unified/incidents/escalate/config');

export const updateTaskUnifiedAlertIncidentEscalationConfig = (payload: {
  autoEnabled?: boolean;
  autoCooldownMinutes?: number;
}): Promise<TaskUnifiedAlertIncidentEscalationConfig> =>
  request('/api/tasks/alerts/unified/incidents/escalate/config', {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });

export const updateTaskUnifiedAlertIncidentEscalationNotification = (
  escalationId: string,
  payload: { notificationStatus: 'pending' | 'sent' | 'failed'; notificationMessage?: string }
): Promise<TaskUnifiedAlertIncidentEscalationLog> =>
  request(`/api/tasks/alerts/unified/incidents/escalations/${escalationId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });

export const getTaskUnifiedAlertIncidentNotificationConfig = (): Promise<TaskUnifiedAlertIncidentNotificationConfig> =>
  request('/api/tasks/alerts/unified/incidents/notification/config');

export const updateTaskUnifiedAlertIncidentNotificationConfig = (payload: {
  enabled?: boolean;
  endpoint?: string;
  authHeader?: string;
  timeoutMs?: number;
  maxRetries?: number;
  retryBaseDelaySeconds?: number;
}): Promise<TaskUnifiedAlertIncidentNotificationConfig> =>
  request('/api/tasks/alerts/unified/incidents/notification/config', {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });

export const processTaskUnifiedAlertIncidentNotification = (payload?: {
  limit?: number;
}): Promise<{ processed: number; sent: number; failed: number; skipped: number }> =>
  request('/api/tasks/alerts/unified/incidents/notification/process', {
    method: 'POST',
    body: JSON.stringify(payload ?? {})
  });

export const getTaskUnifiedAlertIncidentNotificationDeliveryLogs = (input?: {
  limit?: number;
  escalationId?: string;
  incidentId?: string;
  status?: 'sent' | 'failed';
}): Promise<TaskUnifiedAlertIncidentNotificationDeliveryLog[]> =>
  request(
    `/api/tasks/alerts/unified/incidents/notification/delivery-logs?${buildQuery({
      limit: input?.limit,
      escalationId: input?.escalationId,
      incidentId: input?.incidentId,
      status: input?.status
    })}`
  );

export const downloadTaskUnifiedAlertIncidentNotificationDeliveryLogsExport = (input: {
  format: 'json' | 'csv';
  limit?: number;
  escalationId?: string;
  incidentId?: string;
  status?: 'sent' | 'failed';
}): Promise<{ blob: Blob; filename: string }> =>
  downloadAuthorizedFile(
    `/tasks/alerts/unified/incidents/notification/delivery-logs/export?${buildQuery({
      format: input.format,
      limit: input.limit,
      escalationId: input.escalationId,
      incidentId: input.incidentId,
      status: input.status
    })}`,
    { defaultFilename: `task-unified-alert-incident-notification-delivery.${input.format}` }
  );

export const downloadTaskUnifiedAlertIncidentEscalationLogsExport = (input: {
  format: 'json' | 'csv';
  limit?: number;
  incidentId?: string;
}): Promise<{ blob: Blob; filename: string }> =>
  downloadAuthorizedFile(
    `/tasks/alerts/unified/incidents/escalations/export?${buildQuery({
      format: input.format,
      limit: input.limit,
      incidentId: input.incidentId
    })}`,
    { defaultFilename: `task-unified-alert-incident-escalations.${input.format}` }
  );

export const getGlobalVideoTaskRuntime = (): Promise<VideoTaskRuntimeSnapshot> => request('/api/tasks/video/runtime');

export const getGlobalVideoTaskRuntimeHealth = (input?: { limit?: number }): Promise<VideoTaskRuntimeHealth> =>
  request(`/api/tasks/video/runtime/health?${buildQuery({ limit: input?.limit })}`);

export const getTaskSloConfig = (): Promise<TaskSloConfig> => request('/api/tasks/video/slo-config');

export const updateTaskSloConfig = (payload: {
  p95QueueWaitWarnMs?: number;
  p95QueueWaitCriticalMs?: number;
  pumpErrorRateWarn?: number;
  pumpErrorRateCritical?: number;
  windowSamples?: number;
}): Promise<TaskSloConfig> =>
  request('/api/tasks/video/slo-config', {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });

export const getTaskSloState = (): Promise<TaskSloState> => request('/api/tasks/video/slo-state');

export const getTaskQuotaConfig = (): Promise<TaskQuotaConfig> => request('/api/tasks/video/quota-config');

export const updateTaskQuotaConfig = (payload: {
  dailyVideoTaskDefault?: number;
  dailyVideoTaskOverrides?: Record<string, number>;
  dailyVideoTaskTierLimits?: Partial<Record<'standard' | 'pro' | 'enterprise', number>>;
  projectTierOverrides?: Record<string, 'standard' | 'pro' | 'enterprise'>;
}): Promise<TaskQuotaConfig> =>
  request('/api/tasks/video/quota-config', {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });

export const getTaskQuotaUsage = (projectId: string): Promise<TaskQuotaUsage> =>
  request(`/api/tasks/video/quota-usage?${buildQuery({ projectId })}`);

export const getTaskQuotaRejectEvents = (input?: { limit?: number; projectId?: string }): Promise<TaskQuotaRejectEvent[]> =>
  request(`/api/tasks/video/quota-rejects?${buildQuery({ limit: input?.limit, projectId: input?.projectId })}`);

export const downloadTaskQuotaRejectEventsExport = (input: {
  format: 'json' | 'csv';
  limit?: number;
  projectId?: string;
}): Promise<{ blob: Blob; filename: string }> =>
  downloadAuthorizedFile(
    `/tasks/video/quota-rejects/export?${buildQuery({
      format: input.format,
      limit: input.limit,
      projectId: input.projectId
    })}`,
    { defaultFilename: `task-quota-reject-events.${input.format}` }
  );

export const getTaskQuotaUsageEvents = (input?: { limit?: number; projectId?: string }): Promise<TaskQuotaUsageEvent[]> =>
  request(`/api/tasks/video/quota-usage-events?${buildQuery({ limit: input?.limit, projectId: input?.projectId })}`);

export const downloadTaskQuotaUsageEventsExport = (input: {
  format: 'json' | 'csv';
  limit?: number;
  projectId?: string;
}): Promise<{ blob: Blob; filename: string }> =>
  downloadAuthorizedFile(
    `/tasks/video/quota-usage-events/export?${buildQuery({
      format: input.format,
      limit: input.limit,
      projectId: input.projectId
    })}`,
    { defaultFilename: `task-quota-usage-events.${input.format}` }
  );

export const getQueueRuntimeAlertConfig = (): Promise<QueueRuntimeAlertConfig> => request('/api/tasks/video/runtime-alert-config');

export const getQueueRuntimeAlerts = (input?: { limit?: number }): Promise<QueueRuntimeAlertState> =>
  request(`/api/tasks/video/runtime-alerts?${buildQuery({ limit: input?.limit })}`);

export const acknowledgeQueueRuntimeAlerts = (payload?: {
  eventId?: string;
  actor?: string;
  silenceMinutes?: number;
}): Promise<QueueRuntimeAlertState> =>
  request('/api/tasks/video/runtime-alerts/ack', {
    method: 'POST',
    body: JSON.stringify(payload ?? {})
  });

export const getFailureInjectionReport = (input?: { limit?: number }): Promise<FailureInjectionReport> =>
  request(`/api/tasks/video/failure-injection/report?${buildQuery({ limit: input?.limit })}`);

export const getFailureInjectionConfig = (): Promise<FailureInjectionConfig> => request('/api/tasks/video/failure-injection/config');

export const updateFailureInjectionConfig = (payload: {
  enabled?: boolean;
  ratio?: number;
  taskTypes?: Array<'video' | 'audio' | 'video_merge'>;
  errorCodes?: Array<'CAPABILITY_MISMATCH' | 'PROVIDER_AUTH_FAILED' | 'PROVIDER_RATE_LIMITED' | 'PROVIDER_TIMEOUT' | 'PROVIDER_UNKNOWN'>;
}): Promise<FailureInjectionConfig> =>
  request('/api/tasks/video/failure-injection/config', {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });

export const resetFailureInjectionEvents = (): Promise<{ cleared: number }> =>
  request('/api/tasks/video/failure-injection/reset', {
    method: 'POST'
  });

export const downloadFailureInjectionEventsExport = (input: {
  format: 'json' | 'csv';
  limit?: number;
  taskType?: 'video' | 'audio' | 'video_merge';
  errorCode?: 'CAPABILITY_MISMATCH' | 'PROVIDER_AUTH_FAILED' | 'PROVIDER_RATE_LIMITED' | 'PROVIDER_TIMEOUT' | 'PROVIDER_UNKNOWN';
}): Promise<{ blob: Blob; filename: string }> =>
  downloadAuthorizedFile(
    `/tasks/video/failure-injection/export?${buildQuery({
      format: input.format,
      limit: input.limit,
      taskType: input.taskType,
      errorCode: input.errorCode
    })}`,
    { defaultFilename: `failure-injection-events.${input.format}` }
  );

export const downloadQueueRuntimeAlertsExport = (input: {
  format: 'json' | 'csv';
  limit?: number;
}): Promise<{ blob: Blob; filename: string }> =>
  downloadAuthorizedFile(`/tasks/video/runtime-alerts/export?${buildQuery({ format: input.format, limit: input.limit })}`, {
    defaultFilename: `queue-runtime-alerts.${input.format}`
  });

export const updateQueueRuntimeAlertConfig = (payload: {
  warnQueuedThreshold?: number;
  criticalQueuedThreshold?: number;
}): Promise<QueueRuntimeAlertConfig> =>
  request('/api/tasks/video/runtime-alert-config', {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });

export const retryGlobalVideoTask = (taskId: string): Promise<VideoTask> =>
  request(`/api/tasks/video/${taskId}/retry`, {
    method: 'POST'
  });

export const cancelGlobalVideoTask = (taskId: string): Promise<VideoTask> =>
  request(`/api/tasks/video/${taskId}/cancel`, {
    method: 'POST'
  });

export const retryGlobalVideoTasksBatch = (taskIds: string[]): Promise<VideoTaskBatchActionResult> =>
  request('/api/tasks/video/batch/retry', {
    method: 'POST',
    body: JSON.stringify({ taskIds })
  });

export const repairGlobalVideoTasksByPolicyBatch = (taskIds: string[]): Promise<VideoTaskBatchRepairByPolicyResult> =>
  request('/api/tasks/video/batch/repair-by-policy', {
    method: 'POST',
    body: JSON.stringify({ taskIds })
  });

export const repairGlobalVideoTasksByPolicyQuery = (payload: {
  q?: string;
  providerTaskId?: string;
  providerErrorCode?: string;
  status?: 'queued' | 'submitting' | 'polling' | 'running' | 'done' | 'failed' | 'cancelled';
  createdFrom?: string;
  createdTo?: string;
  sortBy?: 'createdAt' | 'updatedAt' | 'priority' | 'status';
  order?: 'asc' | 'desc';
  maxCount?: number;
}): Promise<VideoTaskBatchRepairByPolicyResult> =>
  request('/api/tasks/video/batch/repair-by-policy/query', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const cancelGlobalVideoTasksBatch = (taskIds: string[]): Promise<VideoTaskBatchActionResult> =>
  request('/api/tasks/video/batch/cancel', {
    method: 'POST',
    body: JSON.stringify({ taskIds })
  });

export const getGlobalVideoTaskEvents = (taskId: string, limit = 50): Promise<VideoTaskEvent[]> =>
  request(`/api/tasks/video/${taskId}/events?${buildQuery({ limit })}`);

export const getGlobalVideoTaskDetail = (taskId: string, limit = 50): Promise<VideoTaskDetail> =>
  request(`/api/tasks/video/${taskId}/detail?${buildQuery({ limit })}`);

export const downloadGlobalVideoTaskEventsExport = (
  taskId: string,
  input: {
    format: 'json' | 'csv';
    status?: 'queued' | 'submitting' | 'polling' | 'running' | 'done' | 'failed' | 'cancelled';
    q?: string;
    createdFrom?: string;
    createdTo?: string;
    limit?: number;
  }
): Promise<{ blob: Blob; filename: string }> =>
  downloadAuthorizedFile(
    `/tasks/video/${encodeURIComponent(taskId)}/events/export?${buildQuery({
      format: input.format,
      status: input.status,
      q: input.q?.trim() || undefined,
      createdFrom: input.createdFrom,
      createdTo: input.createdTo,
      limit: input.limit ?? 5000
    })}`,
    { defaultFilename: `video-task-events-${taskId}.${input.format}` }
  );

export const getGlobalVideoTaskEventsExportCount = (
  taskId: string,
  input: {
    status?: 'queued' | 'submitting' | 'polling' | 'running' | 'done' | 'failed' | 'cancelled';
    q?: string;
    createdFrom?: string;
    createdTo?: string;
  }
): Promise<{ count: number }> =>
  request(
    `/api/tasks/video/${encodeURIComponent(taskId)}/events/export/count?${buildQuery({
      status: input.status,
      q: input.q?.trim() || undefined,
      createdFrom: input.createdFrom,
      createdTo: input.createdTo
    })}`
  );

export const getTaskCenterFilterPresetsPaged = (input: {
  q?: string;
  page?: number;
  pageSize?: number;
}): Promise<PageResult<TaskCenterFilterPreset>> => request(`/api/settings/task-center/presets?${buildQuery(input)}`);

export const getTaskCenterFilterPresets = async (): Promise<TaskCenterFilterPreset[]> => {
  const page = await getTaskCenterFilterPresetsPaged({ page: 1, pageSize: 100 });
  return page.items;
};

export const saveTaskCenterFilterPreset = (
  name: string,
  payload: Omit<TaskCenterFilterPreset, 'name' | 'isDefault' | 'updatedAt' | 'lastUsedAt'>
): Promise<TaskCenterFilterPreset[]> =>
  request(`/api/settings/task-center/presets/${encodeURIComponent(name)}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });

export const setDefaultTaskCenterFilterPreset = (name: string): Promise<TaskCenterFilterPreset[]> =>
  request(`/api/settings/task-center/presets/${encodeURIComponent(name)}/default`, {
    method: 'POST'
  });

export const markTaskCenterFilterPresetUsed = (name: string): Promise<TaskCenterFilterPreset[]> =>
  request(`/api/settings/task-center/presets/${encodeURIComponent(name)}/use`, {
    method: 'POST'
  });

export const deleteTaskCenterFilterPreset = (name: string): Promise<TaskCenterFilterPreset[]> =>
  request(`/api/settings/task-center/presets/${encodeURIComponent(name)}`, {
    method: 'DELETE'
  });
