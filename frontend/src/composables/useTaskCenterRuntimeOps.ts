import { computed, ref, type Ref } from 'vue';
import {
  acknowledgeQueueRuntimeAlerts,
  getFailureInjectionConfig,
  getFailureInjectionReport,
  getQueueRuntimeAlertConfig,
  getTaskQuotaConfig,
  getTaskQuotaRejectEvents,
  getTaskQuotaUsage,
  getTaskQuotaUsageEvents,
  getTaskSloConfig,
  getTaskSloState,
  resetFailureInjectionEvents,
  updateFailureInjectionConfig,
  updateQueueRuntimeAlertConfig,
  updateTaskQuotaConfig,
  updateTaskSloConfig
} from '@/api/task-center';
import type {
  FailureInjectionConfig,
  FailureInjectionReport,
  QueueRuntimeAlertConfig,
  QueueRuntimeAlertEvent,
  QueueRuntimeAlertState,
  TaskQuotaConfig,
  TaskQuotaRejectEvent,
  TaskQuotaUsage,
  TaskQuotaUsageEvent,
  TaskSloConfig,
  TaskSloState,
  TaskUnifiedAlertEvent
} from '@/types/models';
import { toErrorMessage } from '@/utils/errors';

type UseTaskCenterRuntimeOpsOptions = {
  error: Ref<string>;
  actionMessage: Ref<string>;
};

type TaskQuotaPreviewResult = {
  dailyLimit: number;
  limitSource: 'default' | 'tier_limit' | 'project_override';
  tier?: 'standard' | 'pro' | 'enterprise';
};

type TaskQuotaDiffEntry = {
  projectId: string;
  before: TaskQuotaPreviewResult;
  after: TaskQuotaPreviewResult;
};

export const useTaskCenterRuntimeOps = (options: UseTaskCenterRuntimeOpsOptions) => {
  const queueThresholdWarn = ref(12);
  const queueThresholdCritical = ref(30);
  const queueAlertSaving = ref(false);
  const queueAlertActionLoading = ref(false);
  const queueAlertState = ref<QueueRuntimeAlertState>({
    silencedUntil: null,
    events: []
  });

  const taskSloLoading = ref(false);
  const taskSloState = ref<TaskSloState>({
    level: 'green',
    reason: 'slo_healthy',
    p95QueueWaitMs: 0,
    pumpErrorRate: 0,
    sampleSize: 0,
    windowSamples: 30
  });
  const taskSloConfig = ref<TaskSloConfig>({
    p95QueueWaitWarnMs: 60_000,
    p95QueueWaitCriticalMs: 120_000,
    pumpErrorRateWarn: 0.02,
    pumpErrorRateCritical: 0.05,
    windowSamples: 30,
    updatedAt: ''
  });

  const taskQuotaLoading = ref(false);
  const taskQuotaConfig = ref<TaskQuotaConfig>({
    dailyVideoTaskDefault: 200,
    dailyVideoTaskOverrides: {},
    dailyVideoTaskTierLimits: {
      standard: 200,
      pro: 500,
      enterprise: 1500
    },
    projectTierOverrides: {},
    updatedAt: ''
  });
  const taskQuotaPersistedSnapshot = ref<TaskQuotaConfig | null>(null);
  const taskQuotaOverrideRows = ref<Array<{ projectId: string; dailyLimit: number }>>([]);
  const taskQuotaTierLimitsForm = ref<{
    standard: number;
    pro: number;
    enterprise: number;
  }>({
    standard: 200,
    pro: 500,
    enterprise: 1500
  });
  const taskQuotaProjectTierRows = ref<Array<{ projectId: string; tier: 'standard' | 'pro' | 'enterprise' }>>([]);
  const taskQuotaPreviewProjectId = ref('');
  const taskQuotaUsageProjectId = ref('');
  const taskQuotaUsage = ref<TaskQuotaUsage | null>(null);
  const taskQuotaUsageEvents = ref<TaskQuotaUsageEvent[]>([]);
  const taskQuotaRejectEvents = ref<TaskQuotaRejectEvent[]>([]);
  const quotaPanelRestoredHint = ref('');

  const failureInjectionLoading = ref(false);
  const failureInjectionReport = ref<FailureInjectionReport>({
    enabled: false,
    ratio: 0,
    taskTypes: [],
    errorCodes: [],
    generatedAt: '',
    totalEvents: 0,
    events: []
  });
  const failureInjectionConfig = ref<FailureInjectionConfig>({
    enabled: false,
    ratio: 0,
    taskTypes: [],
    errorCodes: ['PROVIDER_TIMEOUT']
  });
  const fiTaskTypeFilter = ref<'' | 'video' | 'audio' | 'video_merge'>('');
  const fiErrorCodeFilter = ref<
    '' | 'CAPABILITY_MISMATCH' | 'PROVIDER_AUTH_FAILED' | 'PROVIDER_RATE_LIMITED' | 'PROVIDER_TIMEOUT' | 'PROVIDER_UNKNOWN'
  >('');

  const taskSloLabel = computed(() => {
    if (taskSloState.value.level === 'red') return 'SLO 拥塞';
    if (taskSloState.value.level === 'yellow') return 'SLO 预警';
    return 'SLO 正常';
  });

  const taskQuotaPreviewResult = computed<TaskQuotaPreviewResult | null>(() => {
    const projectId = taskQuotaPreviewProjectId.value.trim();
    if (!projectId) {
      return null;
    }
    const defaultLimit = Math.max(1, Math.trunc(Number(taskQuotaConfig.value.dailyVideoTaskDefault || 200)));
    const overrideMap = taskQuotaOverrideRows.value.reduce<Record<string, number>>((acc, row) => {
      const id = row.projectId.trim();
      const n = Number(row.dailyLimit);
      if (!id || !Number.isFinite(n) || n < 1) {
        return acc;
      }
      acc[id] = Math.max(1, Math.trunc(n));
      return acc;
    }, {});
    const tierMap = taskQuotaProjectTierRows.value.reduce<Record<string, 'standard' | 'pro' | 'enterprise'>>((acc, row) => {
      const id = row.projectId.trim();
      if (!id) {
        return acc;
      }
      acc[id] = row.tier;
      return acc;
    }, {});
    const tierLimits = {
      standard: Math.max(1, Math.trunc(Number(taskQuotaTierLimitsForm.value.standard || defaultLimit))),
      pro: Math.max(1, Math.trunc(Number(taskQuotaTierLimitsForm.value.pro || defaultLimit))),
      enterprise: Math.max(1, Math.trunc(Number(taskQuotaTierLimitsForm.value.enterprise || defaultLimit)))
    };
    if (typeof overrideMap[projectId] === 'number') {
      return {
        dailyLimit: overrideMap[projectId],
        limitSource: 'project_override',
        tier: tierMap[projectId]
      };
    }
    const tier = tierMap[projectId];
    if (tier) {
      return {
        dailyLimit: tierLimits[tier],
        limitSource: 'tier_limit',
        tier
      };
    }
    return {
      dailyLimit: defaultLimit,
      limitSource: 'default'
    };
  });

  const taskQuotaDiffEntries = computed<TaskQuotaDiffEntry[]>(() => {
    const snapshot = taskQuotaPersistedSnapshot.value;
    if (!snapshot) {
      return [];
    }
    const toResolved = (input: {
      defaultLimit: number;
      overrides: Record<string, number>;
      tierLimits: { standard: number; pro: number; enterprise: number };
      projectTierOverrides: Record<string, 'standard' | 'pro' | 'enterprise'>;
      projectId: string;
    }): TaskQuotaPreviewResult => {
      const direct = input.overrides[input.projectId];
      if (typeof direct === 'number' && Number.isFinite(direct) && direct > 0) {
        return {
          dailyLimit: Math.max(1, Math.trunc(direct)),
          limitSource: 'project_override',
          tier: input.projectTierOverrides[input.projectId]
        };
      }
      const tier = input.projectTierOverrides[input.projectId];
      if (tier) {
        return {
          dailyLimit: input.tierLimits[tier],
          limitSource: 'tier_limit',
          tier
        };
      }
      return { dailyLimit: input.defaultLimit, limitSource: 'default' };
    };
    const normalizeTierLimits = (input: Partial<Record<'standard' | 'pro' | 'enterprise', number>>, fallback: number) => ({
      standard: Math.max(1, Math.trunc(Number(input.standard ?? fallback))),
      pro: Math.max(1, Math.trunc(Number(input.pro ?? fallback))),
      enterprise: Math.max(1, Math.trunc(Number(input.enterprise ?? fallback)))
    });
    const beforeDefault = Math.max(1, Math.trunc(Number(snapshot.dailyVideoTaskDefault || 200)));
    const beforeOverrides = snapshot.dailyVideoTaskOverrides ?? {};
    const beforeTierLimits = normalizeTierLimits(snapshot.dailyVideoTaskTierLimits ?? {}, beforeDefault);
    const beforeTierOverrides = snapshot.projectTierOverrides ?? {};

    const afterDefault = Math.max(1, Math.trunc(Number(taskQuotaConfig.value.dailyVideoTaskDefault || 200)));
    const afterOverrides = taskQuotaOverrideRows.value.reduce<Record<string, number>>((acc, row) => {
      const id = row.projectId.trim();
      const n = Number(row.dailyLimit);
      if (!id || !Number.isFinite(n) || n < 1) {
        return acc;
      }
      acc[id] = Math.max(1, Math.trunc(n));
      return acc;
    }, {});
    const afterTierLimits = normalizeTierLimits(taskQuotaTierLimitsForm.value, afterDefault);
    const afterTierOverrides = taskQuotaProjectTierRows.value.reduce<Record<string, 'standard' | 'pro' | 'enterprise'>>((acc, row) => {
      const id = row.projectId.trim();
      if (!id) {
        return acc;
      }
      acc[id] = row.tier;
      return acc;
    }, {});

    const projectIds = new Set<string>([
      ...Object.keys(beforeOverrides),
      ...Object.keys(beforeTierOverrides),
      ...Object.keys(afterOverrides),
      ...Object.keys(afterTierOverrides),
      taskQuotaPreviewProjectId.value.trim(),
      taskQuotaUsageProjectId.value.trim()
    ].filter((item) => item.length > 0));

    return [...projectIds]
      .map((projectId) => ({
        projectId,
        before: toResolved({
          projectId,
          defaultLimit: beforeDefault,
          overrides: beforeOverrides,
          tierLimits: beforeTierLimits,
          projectTierOverrides: beforeTierOverrides
        }),
        after: toResolved({
          projectId,
          defaultLimit: afterDefault,
          overrides: afterOverrides,
          tierLimits: afterTierLimits,
          projectTierOverrides: afterTierOverrides
        })
      }))
      .filter((item) => {
        return (
          item.before.dailyLimit !== item.after.dailyLimit ||
          item.before.limitSource !== item.after.limitSource ||
          (item.before.tier || '') !== (item.after.tier || '')
        );
      });
  });

  const loadQueueAlertConfig = async (): Promise<void> => {
    try {
      const config = await getQueueRuntimeAlertConfig();
      queueThresholdWarn.value = config.warnQueuedThreshold;
      queueThresholdCritical.value = config.criticalQueuedThreshold;
    } catch {
      // keep defaults if not available
    }
  };

  const loadTaskSloConfig = async (): Promise<void> => {
    try {
      taskSloConfig.value = await getTaskSloConfig();
    } catch {
      // keep defaults when endpoint unavailable
    }
  };

  const loadTaskSloState = async (): Promise<void> => {
    try {
      taskSloState.value = await getTaskSloState();
    } catch {
      // keep defaults when endpoint unavailable
    }
  };

  const saveTaskSloConfigAction = async (): Promise<void> => {
    taskSloLoading.value = true;
    try {
      taskSloConfig.value = await updateTaskSloConfig({
        p95QueueWaitWarnMs: taskSloConfig.value.p95QueueWaitWarnMs,
        p95QueueWaitCriticalMs: taskSloConfig.value.p95QueueWaitCriticalMs,
        pumpErrorRateWarn: taskSloConfig.value.pumpErrorRateWarn,
        pumpErrorRateCritical: taskSloConfig.value.pumpErrorRateCritical,
        windowSamples: taskSloConfig.value.windowSamples
      });
      await loadTaskSloState();
      options.actionMessage.value = 'SLO 阈值已保存';
    } catch (err) {
      options.error.value = toErrorMessage(err, '保存 SLO 阈值失败');
    } finally {
      taskSloLoading.value = false;
    }
  };

  const loadTaskQuotaConfig = async (): Promise<void> => {
    try {
      const config = await getTaskQuotaConfig();
      taskQuotaConfig.value = config;
      taskQuotaPersistedSnapshot.value = config;
      taskQuotaOverrideRows.value = Object.entries(config.dailyVideoTaskOverrides ?? {}).map(([projectId, dailyLimit]) => ({
        projectId,
        dailyLimit: Number(dailyLimit)
      }));
      taskQuotaTierLimitsForm.value = {
        standard: Number(config.dailyVideoTaskTierLimits?.standard ?? config.dailyVideoTaskDefault ?? 200),
        pro: Number(config.dailyVideoTaskTierLimits?.pro ?? 500),
        enterprise: Number(config.dailyVideoTaskTierLimits?.enterprise ?? 1500)
      };
      taskQuotaProjectTierRows.value = Object.entries(config.projectTierOverrides ?? {}).map(([projectId, tier]) => ({
        projectId,
        tier
      }));
    } catch {
      // keep defaults when endpoint unavailable
    }
  };

  const loadTaskQuotaUsageEvents = async (): Promise<void> => {
    try {
      taskQuotaUsageEvents.value = await getTaskQuotaUsageEvents({
        limit: 50,
        projectId: taskQuotaUsageProjectId.value.trim() || undefined
      });
    } catch {
      // keep silent when endpoint unavailable
    }
  };

  const loadTaskQuotaRejectEvents = async (): Promise<void> => {
    try {
      taskQuotaRejectEvents.value = await getTaskQuotaRejectEvents({
        limit: 20,
        projectId: taskQuotaUsageProjectId.value.trim() || undefined
      });
    } catch {
      // keep silent when endpoint unavailable
    }
  };

  const refreshTaskQuotaUsage = async (): Promise<void> => {
    const projectId = taskQuotaUsageProjectId.value.trim();
    if (!projectId) {
      taskQuotaUsage.value = null;
      return;
    }
    taskQuotaLoading.value = true;
    try {
      taskQuotaUsage.value = await getTaskQuotaUsage(projectId);
      await loadTaskQuotaUsageEvents();
      await loadTaskQuotaRejectEvents();
      options.error.value = '';
    } catch (err) {
      options.error.value = toErrorMessage(err, '加载任务配额用量失败');
    } finally {
      taskQuotaLoading.value = false;
    }
  };

  const saveTaskQuotaConfigAction = async (): Promise<void> => {
    taskQuotaLoading.value = true;
    try {
      const parsedOverrides = taskQuotaOverrideRows.value.reduce<Record<string, number>>((acc, row) => {
        const normalizedId = row.projectId.trim();
        if (!normalizedId) {
          return acc;
        }
        const n = Number(row.dailyLimit);
        if (!Number.isFinite(n) || n < 1) {
          return acc;
        }
        acc[normalizedId] = Math.max(1, Math.trunc(n));
        return acc;
      }, {});
      const parseTierLimitNumber = (value: unknown, label: string): number => {
        const n = Number(value);
        if (!Number.isFinite(n) || n < 1) {
          throw new Error(`${label} 必须是正整数`);
        }
        return Math.max(1, Math.trunc(n));
      };
      const parsedTierLimits: Partial<Record<'standard' | 'pro' | 'enterprise', number>> = {
        standard: parseTierLimitNumber(taskQuotaTierLimitsForm.value.standard, 'standard tier limit'),
        pro: parseTierLimitNumber(taskQuotaTierLimitsForm.value.pro, 'pro tier limit'),
        enterprise: parseTierLimitNumber(taskQuotaTierLimitsForm.value.enterprise, 'enterprise tier limit')
      };
      const parsedProjectTierOverrides = taskQuotaProjectTierRows.value.reduce<Record<string, 'standard' | 'pro' | 'enterprise'>>(
        (acc, row) => {
          const normalizedId = row.projectId.trim();
          if (!normalizedId) {
            return acc;
          }
          acc[normalizedId] = row.tier;
          return acc;
        },
        {}
      );
      const config = await updateTaskQuotaConfig({
        dailyVideoTaskDefault: taskQuotaConfig.value.dailyVideoTaskDefault,
        dailyVideoTaskOverrides: parsedOverrides,
        dailyVideoTaskTierLimits: parsedTierLimits,
        projectTierOverrides: parsedProjectTierOverrides
      });
      taskQuotaConfig.value = config;
      taskQuotaPersistedSnapshot.value = config;
      taskQuotaOverrideRows.value = Object.entries(config.dailyVideoTaskOverrides ?? {}).map(([projectId, dailyLimit]) => ({
        projectId,
        dailyLimit: Number(dailyLimit)
      }));
      taskQuotaTierLimitsForm.value = {
        standard: Number(config.dailyVideoTaskTierLimits?.standard ?? config.dailyVideoTaskDefault ?? 200),
        pro: Number(config.dailyVideoTaskTierLimits?.pro ?? 500),
        enterprise: Number(config.dailyVideoTaskTierLimits?.enterprise ?? 1500)
      };
      taskQuotaProjectTierRows.value = Object.entries(config.projectTierOverrides ?? {}).map(([projectId, tier]) => ({
        projectId,
        tier
      }));
      if (taskQuotaUsageProjectId.value.trim()) {
        await refreshTaskQuotaUsage();
      }
      await loadTaskQuotaUsageEvents();
      await loadTaskQuotaRejectEvents();
      options.actionMessage.value = '任务配额已保存';
    } catch (err) {
      options.error.value = toErrorMessage(err, '保存任务配额失败');
    } finally {
      taskQuotaLoading.value = false;
    }
  };

  const addTaskQuotaProjectTierRow = (): void => {
    taskQuotaProjectTierRows.value.push({ projectId: '', tier: 'standard' });
  };

  const removeTaskQuotaProjectTierRow = (idx: number): void => {
    if (idx < 0 || idx >= taskQuotaProjectTierRows.value.length) {
      return;
    }
    taskQuotaProjectTierRows.value.splice(idx, 1);
  };

  const addTaskQuotaOverrideRow = (): void => {
    taskQuotaOverrideRows.value.push({ projectId: '', dailyLimit: taskQuotaConfig.value.dailyVideoTaskDefault });
  };

  const removeTaskQuotaOverrideRow = (idx: number): void => {
    if (idx < 0 || idx >= taskQuotaOverrideRows.value.length) {
      return;
    }
    taskQuotaOverrideRows.value.splice(idx, 1);
  };

  const acknowledgeLatestQueueAlert = async (silenceMinutes = 0): Promise<void> => {
    queueAlertActionLoading.value = true;
    try {
      queueAlertState.value = await acknowledgeQueueRuntimeAlerts({
        silenceMinutes
      });
      options.actionMessage.value = silenceMinutes > 0 ? `已确认并静默 ${silenceMinutes} 分钟` : '已确认最近告警';
    } catch (err) {
      options.error.value = toErrorMessage(err, '确认队列告警失败');
    } finally {
      queueAlertActionLoading.value = false;
    }
  };

  const acknowledgeQueueAlertItem = async (item: QueueRuntimeAlertEvent): Promise<void> => {
    queueAlertActionLoading.value = true;
    try {
      queueAlertState.value = await acknowledgeQueueRuntimeAlerts({
        eventId: item.id
      });
      options.actionMessage.value = `已确认告警 ${item.id}`;
    } catch (err) {
      options.error.value = toErrorMessage(err, '确认告警失败');
    } finally {
      queueAlertActionLoading.value = false;
    }
  };

  const acknowledgeMergedAlert = async (item: TaskUnifiedAlertEvent): Promise<void> => {
    if (item.source !== 'queue') {
      return;
    }
    const queuePart = item.queue;
    if (!queuePart) {
      return;
    }
    await acknowledgeQueueAlertItem({
      id: item.id,
      at: item.at,
      level: item.level,
      reason: item.reason,
      queuedTotal: queuePart.queuedTotal,
      runningTotal: queuePart.runningTotal,
      pumpErrorCount: queuePart.pumpErrorCount,
      warnQueuedThreshold: queuePart.warnQueuedThreshold,
      criticalQueuedThreshold: queuePart.criticalQueuedThreshold,
      acknowledgedAt: item.acknowledgedAt,
      acknowledgedBy: item.acknowledgedBy
    });
  };

  const loadFailureInjectionReport = async (): Promise<void> => {
    try {
      failureInjectionReport.value = await getFailureInjectionReport({ limit: 20 });
    } catch {
      // keep silent if endpoint unavailable in older backend
    }
  };

  const loadFailureInjectionConfig = async (): Promise<void> => {
    try {
      failureInjectionConfig.value = await getFailureInjectionConfig();
    } catch {
      // keep defaults when endpoint unavailable
    }
  };

  const resetFailureInjectionReport = async (): Promise<void> => {
    failureInjectionLoading.value = true;
    try {
      const result = await resetFailureInjectionEvents();
      await loadFailureInjectionReport();
      options.actionMessage.value = `已清空注入事件（${result.cleared}）`;
    } catch (err) {
      options.error.value = toErrorMessage(err, '清空注入事件失败');
    } finally {
      failureInjectionLoading.value = false;
    }
  };

  const saveFailureInjectionConfig = async (): Promise<void> => {
    failureInjectionLoading.value = true;
    try {
      const payload = await updateFailureInjectionConfig({
        enabled: failureInjectionConfig.value.enabled,
        ratio: failureInjectionConfig.value.ratio,
        taskTypes: failureInjectionConfig.value.taskTypes,
        errorCodes: failureInjectionConfig.value.errorCodes
      });
      failureInjectionConfig.value = payload;
      await loadFailureInjectionReport();
      options.actionMessage.value = '失败注入配置已更新';
    } catch (err) {
      options.error.value = toErrorMessage(err, '更新失败注入配置失败');
    } finally {
      failureInjectionLoading.value = false;
    }
  };

  const saveQueueAlertConfig = async (): Promise<void> => {
    queueAlertSaving.value = true;
    try {
      const payload: QueueRuntimeAlertConfig = await updateQueueRuntimeAlertConfig({
        warnQueuedThreshold: queueThresholdWarn.value,
        criticalQueuedThreshold: queueThresholdCritical.value
      });
      queueThresholdWarn.value = payload.warnQueuedThreshold;
      queueThresholdCritical.value = payload.criticalQueuedThreshold;
      options.actionMessage.value = `告警阈值已保存（预警 ${payload.warnQueuedThreshold} / 拥塞 ${payload.criticalQueuedThreshold}）`;
    } catch (err) {
      options.error.value = toErrorMessage(err, '保存队列告警阈值失败');
    } finally {
      queueAlertSaving.value = false;
    }
  };

  return {
    acknowledgeLatestQueueAlert,
    acknowledgeMergedAlert,
    addTaskQuotaOverrideRow,
    addTaskQuotaProjectTierRow,
    failureInjectionConfig,
    failureInjectionLoading,
    failureInjectionReport,
    fiErrorCodeFilter,
    fiTaskTypeFilter,
    loadFailureInjectionConfig,
    loadFailureInjectionReport,
    loadQueueAlertConfig,
    loadTaskQuotaConfig,
    loadTaskQuotaRejectEvents,
    loadTaskQuotaUsageEvents,
    loadTaskSloConfig,
    loadTaskSloState,
    taskQuotaConfig,
    taskQuotaDiffEntries,
    taskQuotaLoading,
    taskQuotaOverrideRows,
    taskQuotaPreviewProjectId,
    taskQuotaPreviewResult,
    taskQuotaProjectTierRows,
    taskQuotaRejectEvents,
    taskQuotaTierLimitsForm,
    taskQuotaUsage,
    taskQuotaUsageEvents,
    taskQuotaUsageProjectId,
    taskSloConfig,
    taskSloLabel,
    taskSloLoading,
    taskSloState,
    queueAlertActionLoading,
    queueAlertSaving,
    queueAlertState,
    queueThresholdCritical,
    queueThresholdWarn,
    quotaPanelRestoredHint,
    refreshTaskQuotaUsage,
    removeTaskQuotaOverrideRow,
    removeTaskQuotaProjectTierRow,
    resetFailureInjectionReport,
    saveFailureInjectionConfig,
    saveQueueAlertConfig,
    saveTaskQuotaConfigAction,
    saveTaskSloConfigAction
  };
};
