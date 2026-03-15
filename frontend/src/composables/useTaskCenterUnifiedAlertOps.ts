import { computed, ref, type Ref } from 'vue';
import {
  getTaskUnifiedAlerts,
  getTaskUnifiedAlertActions,
  getTaskUnifiedAlertIncidentEscalationConfig,
  getTaskUnifiedAlertIncidentEscalationLogs,
  getTaskUnifiedAlertIncidentNotificationConfig,
  getTaskUnifiedAlertIncidentNotificationDeliveryLogs,
  getTaskUnifiedAlertIncidents,
  getTaskUnifiedAlertIncidentSlaConfig,
  getTaskUnifiedAlertIncidentSlaSummary,
  getTaskUnifiedAlertPolicy,
  processTaskUnifiedAlertIncidentNotification,
  triggerTaskUnifiedAlertIncidentEscalations,
  updateTaskUnifiedAlertIncident,
  updateTaskUnifiedAlertIncidentEscalationConfig,
  updateTaskUnifiedAlertIncidentEscalationNotification,
  updateTaskUnifiedAlertIncidentNotificationConfig,
  updateTaskUnifiedAlertIncidentSlaConfig,
  updateTaskUnifiedAlertPolicy
} from '@/api/task-center';
import type {
  TaskUnifiedAlertActionLog,
  TaskUnifiedAlertEvent,
  TaskUnifiedAlertIncident,
  TaskUnifiedAlertIncidentEscalationConfig,
  TaskUnifiedAlertIncidentEscalationLog,
  TaskUnifiedAlertIncidentNotificationConfig,
  TaskUnifiedAlertIncidentNotificationDeliveryLog,
  TaskUnifiedAlertIncidentSlaConfig,
  TaskUnifiedAlertIncidentSlaSummary,
  TaskUnifiedAlertPolicyConfig,
  TaskUnifiedAlertState
} from '@/types/models';
import { toErrorMessage } from '@/utils/errors';

type UseTaskCenterUnifiedAlertOpsOptions = {
  error: Ref<string>;
  actionMessage: Ref<string>;
};

const buildUnifiedIncidentDraftMap = (
  incidents: TaskUnifiedAlertIncident[],
  current: Record<string, { assignee: string; note: string }>
): Record<string, { assignee: string; note: string }> => {
  const next: Record<string, { assignee: string; note: string }> = {};
  for (const item of incidents) {
    const prev = current[item.id];
    next[item.id] = {
      assignee: prev?.assignee ?? item.assignee ?? '',
      note: prev?.note ?? item.note ?? ''
    };
  }
  return next;
};

export const useTaskCenterUnifiedAlertOps = (options: UseTaskCenterUnifiedAlertOpsOptions) => {
  const taskUnifiedAlerts = ref<TaskUnifiedAlertState>({
    windowMinutes: 60,
    from: '',
    to: '',
    total: 0,
    byLevel: { green: 0, yellow: 0, red: 0 },
    bySource: { queue: 0, contract: 0 },
    events: []
  });
  const unifiedAlertWindowMinutes = ref(60);
  const taskUnifiedAlertPolicyLoading = ref(false);
  const taskUnifiedAlertPolicy = ref<TaskUnifiedAlertPolicyConfig>({
    redTotalThreshold: 3,
    redQueueThreshold: 2,
    redContractThreshold: 1,
    cooldownMinutes: 15,
    updatedAt: ''
  });
  const taskUnifiedAlertActions = ref<TaskUnifiedAlertActionLog[]>([]);
  const taskUnifiedAlertIncidents = ref<TaskUnifiedAlertIncident[]>([]);
  const unifiedIncidentActionLoading = ref(false);
  const unifiedIncidentDraft = ref<Record<string, { assignee: string; note: string }>>({});
  const unifiedIncidentStatusFilter = ref<'' | 'open' | 'resolved'>('open');
  const unifiedIncidentSlaLoading = ref(false);
  const unifiedIncidentEscalationLoading = ref(false);
  const unifiedIncidentEscalationActor = ref('');
  const taskUnifiedIncidentEscalationLogs = ref<TaskUnifiedAlertIncidentEscalationLog[]>([]);
  const taskUnifiedIncidentEscalationConfig = ref<TaskUnifiedAlertIncidentEscalationConfig>({
    autoEnabled: true,
    autoCooldownMinutes: 10,
    updatedAt: ''
  });
  const taskUnifiedIncidentNotificationConfig = ref<TaskUnifiedAlertIncidentNotificationConfig>({
    enabled: false,
    endpoint: '',
    authHeader: '',
    timeoutMs: 5000,
    maxRetries: 3,
    retryBaseDelaySeconds: 30,
    updatedAt: ''
  });
  const taskUnifiedIncidentNotificationDeliveryLogs = ref<TaskUnifiedAlertIncidentNotificationDeliveryLog[]>([]);
  const unifiedIncidentNotificationDeliveryStatusFilter = ref<'' | 'sent' | 'failed'>('');
  const unifiedIncidentNotificationDeliveryMessageKeyword = ref('');
  const taskUnifiedIncidentSlaConfig = ref<TaskUnifiedAlertIncidentSlaConfig>({
    warnAfterMinutes: 30,
    criticalAfterMinutes: 120,
    escalationAfterMinutes: 240,
    updatedAt: ''
  });
  const taskUnifiedIncidentSlaSummary = ref<TaskUnifiedAlertIncidentSlaSummary>({
    generatedAt: '',
    config: {
      warnAfterMinutes: 30,
      criticalAfterMinutes: 120,
      escalationAfterMinutes: 240,
      updatedAt: ''
    },
    openTotal: 0,
    resolvedTotal: 0,
    warnTotal: 0,
    criticalTotal: 0,
    escalationCandidateTotal: 0,
    byLevelOpen: { green: 0, yellow: 0, red: 0 },
    topAging: []
  });

  const mergedRuntimeAlerts = computed<TaskUnifiedAlertEvent[]>(() => taskUnifiedAlerts.value.events);
  const filteredNotificationDeliveryLogs = computed(() => {
    const keyword = unifiedIncidentNotificationDeliveryMessageKeyword.value.trim().toLowerCase();
    if (!keyword) {
      return taskUnifiedIncidentNotificationDeliveryLogs.value;
    }
    return taskUnifiedIncidentNotificationDeliveryLogs.value.filter((item) => (item.message || '').toLowerCase().includes(keyword));
  });
  const notificationDeliverySummary = computed(() => {
    let sent = 0;
    let failed = 0;
    let pending = 0;
    let totalAttempts = 0;
    let nextRetryTotal = 0;
    for (const item of taskUnifiedIncidentEscalationLogs.value) {
      if (item.notificationStatus === 'sent') sent += 1;
      else if (item.notificationStatus === 'failed') failed += 1;
      else pending += 1;
      totalAttempts += Math.max(0, Number(item.notificationAttempt ?? 0));
      if (item.nextRetryAt) {
        const nextMs = Date.parse(item.nextRetryAt);
        if (Number.isFinite(nextMs) && nextMs > Date.now()) {
          nextRetryTotal += 1;
        }
      }
    }
    return {
      totalEscalations: taskUnifiedIncidentEscalationLogs.value.length,
      sent,
      failed,
      pending,
      totalAttempts,
      nextRetryTotal
    };
  });
  const notificationNextRetryList = computed(() =>
    taskUnifiedIncidentEscalationLogs.value
      .filter((item) => {
        if (!item.nextRetryAt) return false;
        const nextMs = Date.parse(item.nextRetryAt);
        return Number.isFinite(nextMs) && nextMs > Date.now();
      })
      .sort((a, b) => Date.parse(a.nextRetryAt || '') - Date.parse(b.nextRetryAt || ''))
      .slice(0, 5)
  );
  const notificationFailureReasonTop = computed(() => {
    const map = new Map<string, number>();
    for (const item of filteredNotificationDeliveryLogs.value) {
      if (item.status !== 'failed') continue;
      const reason = (item.message || 'unknown').trim().slice(0, 120) || 'unknown';
      map.set(reason, (map.get(reason) || 0) + 1);
    }
    return [...map.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  });

  const refreshUnifiedAlertsOnly = async (): Promise<void> => {
    try {
      const [
        alerts,
        actions,
        incidents,
        incidentSlaConfig,
        incidentSlaSummary,
        incidentEscalationLogs,
        incidentEscalationConfig,
        incidentNotificationConfig,
        incidentNotificationDeliveryLogs
      ] = await Promise.all([
        getTaskUnifiedAlerts({
          limit: 200,
          windowMinutes: unifiedAlertWindowMinutes.value
        }),
        getTaskUnifiedAlertActions({ limit: 30 }),
        getTaskUnifiedAlertIncidents({ limit: 50, status: unifiedIncidentStatusFilter.value || undefined }),
        getTaskUnifiedAlertIncidentSlaConfig().catch(() => null),
        getTaskUnifiedAlertIncidentSlaSummary({ limit: 8 }).catch(() => null),
        getTaskUnifiedAlertIncidentEscalationLogs({ limit: 30 }).catch(() => []),
        getTaskUnifiedAlertIncidentEscalationConfig().catch(() => null),
        getTaskUnifiedAlertIncidentNotificationConfig().catch(() => null),
        getTaskUnifiedAlertIncidentNotificationDeliveryLogs({
          limit: 20,
          status: unifiedIncidentNotificationDeliveryStatusFilter.value || undefined
        }).catch(() => [])
      ]);
      taskUnifiedAlerts.value = alerts;
      taskUnifiedAlertActions.value = actions;
      taskUnifiedAlertIncidents.value = incidents;
      unifiedIncidentDraft.value = buildUnifiedIncidentDraftMap(incidents, unifiedIncidentDraft.value);
      if (incidentSlaConfig) {
        taskUnifiedIncidentSlaConfig.value = incidentSlaConfig;
      }
      if (incidentSlaSummary) {
        taskUnifiedIncidentSlaSummary.value = incidentSlaSummary;
      }
      taskUnifiedIncidentEscalationLogs.value = incidentEscalationLogs;
      if (incidentEscalationConfig) {
        taskUnifiedIncidentEscalationConfig.value = incidentEscalationConfig;
      }
      if (incidentNotificationConfig) {
        taskUnifiedIncidentNotificationConfig.value = incidentNotificationConfig;
      }
      taskUnifiedIncidentNotificationDeliveryLogs.value = incidentNotificationDeliveryLogs;
    } catch {
      // keep silent when endpoint unavailable
    }
  };

  const refreshUnifiedIncidentsOnly = async (): Promise<void> => {
    unifiedIncidentActionLoading.value = true;
    try {
      const incidents = await getTaskUnifiedAlertIncidents({
        limit: 50,
        status: unifiedIncidentStatusFilter.value || undefined
      });
      taskUnifiedAlertIncidents.value = incidents;
      unifiedIncidentDraft.value = buildUnifiedIncidentDraftMap(incidents, unifiedIncidentDraft.value);
      options.error.value = '';
    } catch (err) {
      options.error.value = toErrorMessage(err, '刷新统一告警 Incident 失败');
    } finally {
      unifiedIncidentActionLoading.value = false;
    }
  };

  const refreshUnifiedIncidentSlaOnly = async (): Promise<void> => {
    unifiedIncidentSlaLoading.value = true;
    try {
      const [config, summary] = await Promise.all([
        getTaskUnifiedAlertIncidentSlaConfig(),
        getTaskUnifiedAlertIncidentSlaSummary({ limit: 8 })
      ]);
      taskUnifiedIncidentSlaConfig.value = config;
      taskUnifiedIncidentSlaSummary.value = summary;
      options.error.value = '';
    } catch (err) {
      options.error.value = toErrorMessage(err, '刷新 Incident SLA 状态失败');
    } finally {
      unifiedIncidentSlaLoading.value = false;
    }
  };

  const saveUnifiedIncidentSlaConfig = async (): Promise<void> => {
    unifiedIncidentSlaLoading.value = true;
    try {
      taskUnifiedIncidentSlaConfig.value = await updateTaskUnifiedAlertIncidentSlaConfig({
        warnAfterMinutes: taskUnifiedIncidentSlaConfig.value.warnAfterMinutes,
        criticalAfterMinutes: taskUnifiedIncidentSlaConfig.value.criticalAfterMinutes,
        escalationAfterMinutes: taskUnifiedIncidentSlaConfig.value.escalationAfterMinutes
      });
      taskUnifiedIncidentSlaSummary.value = await getTaskUnifiedAlertIncidentSlaSummary({ limit: 8 });
      options.actionMessage.value = 'Incident SLA 配置已保存';
      options.error.value = '';
    } catch (err) {
      options.error.value = toErrorMessage(err, '保存 Incident SLA 配置失败');
    } finally {
      unifiedIncidentSlaLoading.value = false;
    }
  };

  const refreshUnifiedIncidentEscalationsOnly = async (): Promise<void> => {
    unifiedIncidentEscalationLoading.value = true;
    try {
      const [logs, config, notificationConfig, notificationDeliveryLogs] = await Promise.all([
        getTaskUnifiedAlertIncidentEscalationLogs({ limit: 30 }),
        getTaskUnifiedAlertIncidentEscalationConfig(),
        getTaskUnifiedAlertIncidentNotificationConfig(),
        getTaskUnifiedAlertIncidentNotificationDeliveryLogs({
          limit: 20,
          status: unifiedIncidentNotificationDeliveryStatusFilter.value || undefined
        })
      ]);
      taskUnifiedIncidentEscalationLogs.value = logs;
      taskUnifiedIncidentEscalationConfig.value = config;
      taskUnifiedIncidentNotificationConfig.value = notificationConfig;
      taskUnifiedIncidentNotificationDeliveryLogs.value = notificationDeliveryLogs;
      options.error.value = '';
    } catch (err) {
      options.error.value = toErrorMessage(err, '刷新 Incident 升级日志失败');
    } finally {
      unifiedIncidentEscalationLoading.value = false;
    }
  };

  const saveUnifiedIncidentEscalationConfig = async (): Promise<void> => {
    unifiedIncidentEscalationLoading.value = true;
    try {
      taskUnifiedIncidentEscalationConfig.value = await updateTaskUnifiedAlertIncidentEscalationConfig({
        autoEnabled: taskUnifiedIncidentEscalationConfig.value.autoEnabled,
        autoCooldownMinutes: taskUnifiedIncidentEscalationConfig.value.autoCooldownMinutes
      });
      options.actionMessage.value = 'Incident 自动升级配置已保存';
      options.error.value = '';
    } catch (err) {
      options.error.value = toErrorMessage(err, '保存 Incident 自动升级配置失败');
    } finally {
      unifiedIncidentEscalationLoading.value = false;
    }
  };

  const saveUnifiedIncidentNotificationConfig = async (): Promise<void> => {
    unifiedIncidentEscalationLoading.value = true;
    try {
      taskUnifiedIncidentNotificationConfig.value = await updateTaskUnifiedAlertIncidentNotificationConfig({
        enabled: taskUnifiedIncidentNotificationConfig.value.enabled,
        endpoint: taskUnifiedIncidentNotificationConfig.value.endpoint,
        authHeader: taskUnifiedIncidentNotificationConfig.value.authHeader,
        timeoutMs: taskUnifiedIncidentNotificationConfig.value.timeoutMs,
        maxRetries: taskUnifiedIncidentNotificationConfig.value.maxRetries,
        retryBaseDelaySeconds: taskUnifiedIncidentNotificationConfig.value.retryBaseDelaySeconds
      });
      options.actionMessage.value = 'Incident 通知配置已保存';
      options.error.value = '';
    } catch (err) {
      options.error.value = toErrorMessage(err, '保存 Incident 通知配置失败');
    } finally {
      unifiedIncidentEscalationLoading.value = false;
    }
  };

  const processUnifiedIncidentNotifications = async (): Promise<void> => {
    unifiedIncidentEscalationLoading.value = true;
    try {
      const result = await processTaskUnifiedAlertIncidentNotification({ limit: 20 });
      const [logs, deliveryLogs] = await Promise.all([
        getTaskUnifiedAlertIncidentEscalationLogs({ limit: 30 }),
        getTaskUnifiedAlertIncidentNotificationDeliveryLogs({
          limit: 20,
          status: unifiedIncidentNotificationDeliveryStatusFilter.value || undefined
        })
      ]);
      taskUnifiedIncidentEscalationLogs.value = logs;
      taskUnifiedIncidentNotificationDeliveryLogs.value = deliveryLogs;
      options.actionMessage.value = `通知处理完成：processed ${result.processed}, sent ${result.sent}, failed ${result.failed}, skipped ${result.skipped}`;
      options.error.value = '';
    } catch (err) {
      options.error.value = toErrorMessage(err, '处理 Incident 通知失败');
    } finally {
      unifiedIncidentEscalationLoading.value = false;
    }
  };

  const triggerUnifiedIncidentEscalations = async (): Promise<void> => {
    unifiedIncidentEscalationLoading.value = true;
    try {
      const result = await triggerTaskUnifiedAlertIncidentEscalations({
        limit: 20,
        actor: unifiedIncidentEscalationActor.value.trim() || undefined
      });
      taskUnifiedIncidentEscalationLogs.value = await getTaskUnifiedAlertIncidentEscalationLogs({ limit: 30 });
      await refreshUnifiedIncidentSlaOnly();
      options.actionMessage.value = `Incident 升级完成：created ${result.created} / skipped ${result.skipped}`;
      options.error.value = '';
    } catch (err) {
      options.error.value = toErrorMessage(err, '执行 Incident 升级失败');
    } finally {
      unifiedIncidentEscalationLoading.value = false;
    }
  };

  const updateEscalationNotificationStatus = async (
    item: TaskUnifiedAlertIncidentEscalationLog,
    statusValue: 'pending' | 'sent' | 'failed'
  ): Promise<void> => {
    unifiedIncidentEscalationLoading.value = true;
    try {
      const updated = await updateTaskUnifiedAlertIncidentEscalationNotification(item.id, {
        notificationStatus: statusValue
      });
      const index = taskUnifiedIncidentEscalationLogs.value.findIndex((log) => log.id === item.id);
      if (index >= 0) {
        taskUnifiedIncidentEscalationLogs.value[index] = updated;
      }
      options.actionMessage.value = `升级通知状态已更新为 ${statusValue}`;
      options.error.value = '';
    } catch (err) {
      options.error.value = toErrorMessage(err, '更新升级通知状态失败');
    } finally {
      unifiedIncidentEscalationLoading.value = false;
    }
  };

  const updateUnifiedIncidentStatus = async (
    incident: TaskUnifiedAlertIncident,
    targetStatus: 'open' | 'resolved'
  ): Promise<void> => {
    if (incident.status === targetStatus) {
      return;
    }
    unifiedIncidentActionLoading.value = true;
    try {
      const updated = await updateTaskUnifiedAlertIncident(incident.id, {
        status: targetStatus
      });
      const index = taskUnifiedAlertIncidents.value.findIndex((item) => item.id === incident.id);
      if (index >= 0) {
        taskUnifiedAlertIncidents.value[index] = updated;
      }
      unifiedIncidentDraft.value = buildUnifiedIncidentDraftMap(taskUnifiedAlertIncidents.value, unifiedIncidentDraft.value);
      await refreshUnifiedIncidentSlaOnly();
      options.actionMessage.value = `Incident 已更新为 ${targetStatus}`;
      options.error.value = '';
    } catch (err) {
      options.error.value = toErrorMessage(err, '更新 Incident 状态失败');
    } finally {
      unifiedIncidentActionLoading.value = false;
    }
  };

  const saveUnifiedIncidentMeta = async (incident: TaskUnifiedAlertIncident): Promise<void> => {
    const draft = unifiedIncidentDraft.value[incident.id] ?? { assignee: '', note: '' };
    const assignee = draft.assignee.trim();
    const note = draft.note.trim();
    if ((assignee || '') === (incident.assignee || '') && (note || '') === (incident.note || '')) {
      options.actionMessage.value = 'Incident 无变更';
      return;
    }
    unifiedIncidentActionLoading.value = true;
    try {
      const updated = await updateTaskUnifiedAlertIncident(incident.id, {
        assignee: assignee || undefined,
        note: note || undefined
      });
      const index = taskUnifiedAlertIncidents.value.findIndex((item) => item.id === incident.id);
      if (index >= 0) {
        taskUnifiedAlertIncidents.value[index] = updated;
      }
      unifiedIncidentDraft.value = buildUnifiedIncidentDraftMap(taskUnifiedAlertIncidents.value, unifiedIncidentDraft.value);
      await refreshUnifiedIncidentSlaOnly();
      options.actionMessage.value = 'Incident 指派/备注已保存';
      options.error.value = '';
    } catch (err) {
      options.error.value = toErrorMessage(err, '保存 Incident 指派/备注失败');
    } finally {
      unifiedIncidentActionLoading.value = false;
    }
  };

  const loadUnifiedAlertPolicy = async (): Promise<void> => {
    try {
      taskUnifiedAlertPolicy.value = await getTaskUnifiedAlertPolicy();
    } catch {
      // keep defaults
    }
  };

  const saveUnifiedAlertPolicy = async (): Promise<void> => {
    taskUnifiedAlertPolicyLoading.value = true;
    try {
      taskUnifiedAlertPolicy.value = await updateTaskUnifiedAlertPolicy({
        redTotalThreshold: taskUnifiedAlertPolicy.value.redTotalThreshold,
        redQueueThreshold: taskUnifiedAlertPolicy.value.redQueueThreshold,
        redContractThreshold: taskUnifiedAlertPolicy.value.redContractThreshold,
        cooldownMinutes: taskUnifiedAlertPolicy.value.cooldownMinutes
      });
      options.actionMessage.value = '统一告警策略已保存';
    } catch (err) {
      options.error.value = toErrorMessage(err, '保存统一告警策略失败');
    } finally {
      taskUnifiedAlertPolicyLoading.value = false;
    }
  };

  return {
    filteredNotificationDeliveryLogs,
    loadUnifiedAlertPolicy,
    mergedRuntimeAlerts,
    notificationDeliverySummary,
    notificationFailureReasonTop,
    notificationNextRetryList,
    processUnifiedIncidentNotifications,
    refreshUnifiedAlertsOnly,
    refreshUnifiedIncidentEscalationsOnly,
    refreshUnifiedIncidentsOnly,
    refreshUnifiedIncidentSlaOnly,
    saveUnifiedAlertPolicy,
    saveUnifiedIncidentEscalationConfig,
    saveUnifiedIncidentMeta,
    saveUnifiedIncidentNotificationConfig,
    saveUnifiedIncidentSlaConfig,
    taskUnifiedAlertActions,
    taskUnifiedAlertIncidents,
    taskUnifiedAlertPolicy,
    taskUnifiedAlertPolicyLoading,
    taskUnifiedAlerts,
    taskUnifiedIncidentEscalationConfig,
    taskUnifiedIncidentEscalationLogs,
    taskUnifiedIncidentNotificationConfig,
    taskUnifiedIncidentNotificationDeliveryLogs,
    taskUnifiedIncidentSlaConfig,
    taskUnifiedIncidentSlaSummary,
    triggerUnifiedIncidentEscalations,
    unifiedAlertWindowMinutes,
    unifiedIncidentActionLoading,
    unifiedIncidentDraft,
    unifiedIncidentEscalationActor,
    unifiedIncidentEscalationLoading,
    unifiedIncidentNotificationDeliveryMessageKeyword,
    unifiedIncidentNotificationDeliveryStatusFilter,
    unifiedIncidentSlaLoading,
    unifiedIncidentStatusFilter,
    updateEscalationNotificationStatus,
    updateUnifiedIncidentStatus
  };
};
