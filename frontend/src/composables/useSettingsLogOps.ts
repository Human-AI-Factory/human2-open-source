import { computed, watch, type Ref } from 'vue';
import type { RouteLocationNormalizedLoaded, Router } from 'vue-router';
import type { AutoRepairLogEntry, ProviderLogEntry } from '@/types/models';
import { buildRouteRestoreTip, replaceQueryIfChanged, toSingleQuery } from '@/composables/useRouteRestoreContext';

type UseSettingsLogOpsOptions = {
  route: RouteLocationNormalizedLoaded;
  router: Router;
  scopedDramaId: Ref<string>;
  error: Ref<string>;
  providerLogs: Ref<ProviderLogEntry[]>;
  providerLogLimit: Ref<number>;
  providerLogOutcome: Ref<'success' | 'failed' | ''>;
  providerLogTaskType: Ref<'text' | 'image' | 'video' | 'audio' | ''>;
  providerLogProvider: Ref<string>;
  providerLogKeyword: Ref<string>;
  autoRepairLogs: Ref<AutoRepairLogEntry[]>;
  autoRepairLogLimit: Ref<number>;
  autoRepairLogAction: Ref<'' | 'retry' | 'recreate_conservative' | 'manual'>;
  autoRepairLogOutcome: Ref<'success' | 'failed' | ''>;
  autoRepairLogProjectId: Ref<string>;
  autoRepairLogTaskId: Ref<string>;
  autoRepairLogTaskIds: Ref<string>;
  autoRepairLogErrorCode: Ref<string>;
  autoRepairLogKeyword: Ref<string>;
  markRouteRestored: (text: string, targetId?: string) => void;
};

const managedQueryKeys = [
  'providerLimit',
  'providerOutcome',
  'providerTaskType',
  'providerProvider',
  'providerKeyword',
  'autoRepairOutcome',
  'autoRepairAction',
  'autoRepairProjectId',
  'autoRepairTaskId',
  'autoRepairTaskIds',
  'autoRepairErrorCode',
  'autoRepairKeyword',
  'autoRepairLimit'
] as const;

const downloadJson = (payload: unknown, filename: string): void => {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export const useSettingsLogOps = (options: UseSettingsLogOpsOptions) => {
  const filteredProviderLogs = computed(() => options.providerLogs.value);

  const buildProviderLogQuery = (): {
    limit: number;
    provider?: string;
    taskType?: 'text' | 'image' | 'video' | 'audio';
    success?: boolean;
    keyword?: string;
  } => {
    const provider = options.providerLogProvider.value.trim();
    const keyword = options.providerLogKeyword.value.trim();
    return {
      limit: options.providerLogLimit.value,
      provider: provider || undefined,
      taskType: options.providerLogTaskType.value || undefined,
      success: options.providerLogOutcome.value === '' ? undefined : options.providerLogOutcome.value === 'success',
      keyword: keyword || undefined
    };
  };

  const buildAutoRepairLogQuery = (): {
    limit: number;
    action?: 'retry' | 'recreate_conservative' | 'manual';
    projectId?: string;
    taskId?: string;
    taskIds?: string;
    errorCode?: string;
    success?: boolean;
    keyword?: string;
  } => {
    const projectId = options.autoRepairLogProjectId.value.trim();
    const taskId = options.autoRepairLogTaskId.value.trim();
    const taskIds = options.autoRepairLogTaskIds.value.trim();
    const errorCode = options.autoRepairLogErrorCode.value.trim();
    const keyword = options.autoRepairLogKeyword.value.trim();
    return {
      limit: options.autoRepairLogLimit.value,
      action: options.autoRepairLogAction.value || undefined,
      projectId: projectId || undefined,
      taskId: taskId || undefined,
      taskIds: taskIds || undefined,
      errorCode: errorCode || undefined,
      success: options.autoRepairLogOutcome.value === '' ? undefined : options.autoRepairLogOutcome.value === 'success',
      keyword: keyword || undefined
    };
  };

  const exportProviderLogsAsJson = (): void => {
    downloadJson(
      {
        exportedAt: new Date().toISOString(),
        query: buildProviderLogQuery(),
        total: filteredProviderLogs.value.length,
        items: filteredProviderLogs.value
      },
      `provider-logs-${Date.now()}.json`
    );
  };

  const exportAutoRepairLogsAsJson = (): void => {
    downloadJson(
      {
        exportedAt: new Date().toISOString(),
        query: buildAutoRepairLogQuery(),
        total: options.autoRepairLogs.value.length,
        items: options.autoRepairLogs.value
      },
      `auto-repair-logs-${Date.now()}.json`
    );
  };

  const copyProviderLogContext = async (item: ProviderLogEntry): Promise<void> => {
    const text = [
      `id: ${item.id}`,
      `timestamp: ${item.timestamp}`,
      `provider: ${item.provider}`,
      `taskType: ${item.taskType}`,
      `success: ${item.success}`,
      `endpoint: ${item.endpoint}`,
      `durationMs: ${item.durationMs}`,
      `statusCode: ${item.statusCode ?? ''}`,
      `message: ${item.message ?? ''}`
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      options.error.value = '';
    } catch {
      options.error.value = '复制失败，请检查浏览器剪贴板权限';
    }
  };

  const copyAutoRepairLogContext = async (item: AutoRepairLogEntry): Promise<void> => {
    const text = [
      `id: ${item.id}`,
      `timestamp: ${item.timestamp}`,
      `projectId: ${item.projectId}`,
      `storyboardId: ${item.storyboardId}`,
      `taskId: ${item.taskId}`,
      `resultTaskId: ${item.resultTaskId ?? ''}`,
      `errorCode: ${item.errorCode}`,
      `action: ${item.action}`,
      `success: ${item.success}`,
      `detail: ${item.detail ?? ''}`
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      options.error.value = '';
    } catch {
      options.error.value = '复制失败，请检查浏览器剪贴板权限';
    }
  };

  const goTaskCenterForTask = async (taskId: string, errorCode?: string): Promise<void> => {
    await options.router.push({
      path: options.scopedDramaId.value ? `/dramas/${options.scopedDramaId.value}/tasks` : '/tasks',
      query: {
        q: taskId,
        ...(errorCode ? { providerErrorCode: errorCode } : {}),
        page: '1'
      }
    });
  };

  const copyTaskCenterTroubleshootLink = async (taskId: string, errorCode?: string): Promise<void> => {
    try {
      const resolved = options.router.resolve({
        path: options.scopedDramaId.value ? `/dramas/${options.scopedDramaId.value}/tasks` : '/tasks',
        query: {
          q: taskId,
          ...(errorCode ? { providerErrorCode: errorCode } : {}),
          page: '1'
        }
      });
      const url = new URL(resolved.href, window.location.origin).toString();
      await navigator.clipboard.writeText(url);
      options.error.value = '';
    } catch {
      options.error.value = '复制任务中心排障链接失败，请检查浏览器剪贴板权限';
    }
  };

  const copyAutoRepairTroubleshootLink = async (item: AutoRepairLogEntry): Promise<void> => {
    try {
      const resolved = options.router.resolve({
        path: '/settings',
        hash: '#auto-repair-logs',
        query: {
          autoRepairProjectId: item.projectId,
          autoRepairTaskId: item.taskId,
          ...(item.errorCode ? { autoRepairErrorCode: item.errorCode } : {}),
          autoRepairOutcome: item.success ? 'success' : 'failed',
          autoRepairLimit: '200'
        }
      });
      const url = new URL(resolved.href, window.location.origin).toString();
      await navigator.clipboard.writeText(url);
      options.error.value = '';
    } catch {
      options.error.value = '复制修复日志链接失败，请检查浏览器剪贴板权限';
    }
  };

  const applyAutoRepairFiltersFromRoute = (): void => {
    const query = toSingleQuery(options.route.query);
    const outcome = query.autoRepairOutcome || '';
    const action = query.autoRepairAction || '';
    const projectId = query.autoRepairProjectId || '';
    const taskId = query.autoRepairTaskId || '';
    const taskIds = query.autoRepairTaskIds || '';
    const errorCode = query.autoRepairErrorCode || '';
    const keyword = query.autoRepairKeyword || '';
    const limitRaw = query.autoRepairLimit ? Number(query.autoRepairLimit) : NaN;

    if (outcome === 'success' || outcome === 'failed' || outcome === '') {
      options.autoRepairLogOutcome.value = outcome;
    }
    if (action === 'retry' || action === 'recreate_conservative' || action === 'manual' || action === '') {
      options.autoRepairLogAction.value = action;
    }
    if (projectId.trim()) options.autoRepairLogProjectId.value = projectId.trim();
    if (taskId.trim()) options.autoRepairLogTaskId.value = taskId.trim();
    if (taskIds.trim()) options.autoRepairLogTaskIds.value = taskIds.trim();
    if (errorCode.trim()) options.autoRepairLogErrorCode.value = errorCode.trim();
    if (keyword.trim()) options.autoRepairLogKeyword.value = keyword.trim();
    if (Number.isFinite(limitRaw) && limitRaw >= 1 && limitRaw <= 200) {
      options.autoRepairLogLimit.value = Math.floor(limitRaw);
    }
    if (outcome || action || projectId || taskId || taskIds || errorCode || keyword || Number.isFinite(limitRaw)) {
      options.markRouteRestored(buildRouteRestoreTip('logs_filter'), 'auto-repair-logs');
    }
  };

  const applyProviderFiltersFromRoute = (): void => {
    const query = toSingleQuery(options.route.query);
    const limitRaw = query.providerLimit ? Number(query.providerLimit) : NaN;
    const outcome = query.providerOutcome || '';
    const taskType = query.providerTaskType || '';
    const provider = query.providerProvider || '';
    const keyword = query.providerKeyword || '';

    if (Number.isFinite(limitRaw) && limitRaw >= 1 && limitRaw <= 200) {
      options.providerLogLimit.value = Math.floor(limitRaw);
    }
    if (outcome === '' || outcome === 'success' || outcome === 'failed') {
      options.providerLogOutcome.value = outcome;
    }
    if (taskType === '' || taskType === 'text' || taskType === 'image' || taskType === 'video' || taskType === 'audio') {
      options.providerLogTaskType.value = taskType;
    }
    if (provider.trim()) options.providerLogProvider.value = provider.trim();
    if (keyword.trim()) options.providerLogKeyword.value = keyword.trim();
    if (outcome || taskType || provider || keyword || Number.isFinite(limitRaw)) {
      options.markRouteRestored(buildRouteRestoreTip('logs_filter'));
    }
  };

  const applyRouteLogFilters = (): void => {
    applyProviderFiltersFromRoute();
    applyAutoRepairFiltersFromRoute();
  };

  const syncLogFilterQuery = async (): Promise<void> => {
    const nextQuery = toSingleQuery(options.route.query);
    const payload: Record<string, string | undefined> = {
      providerLimit: String(options.providerLogLimit.value),
      providerOutcome: options.providerLogOutcome.value || undefined,
      providerTaskType: options.providerLogTaskType.value || undefined,
      providerProvider: options.providerLogProvider.value.trim() || undefined,
      providerKeyword: options.providerLogKeyword.value.trim() || undefined,
      autoRepairOutcome: options.autoRepairLogOutcome.value || undefined,
      autoRepairAction: options.autoRepairLogAction.value || undefined,
      autoRepairProjectId: options.autoRepairLogProjectId.value.trim() || undefined,
      autoRepairTaskId: options.autoRepairLogTaskId.value.trim() || undefined,
      autoRepairTaskIds: options.autoRepairLogTaskIds.value.trim() || undefined,
      autoRepairErrorCode: options.autoRepairLogErrorCode.value.trim() || undefined,
      autoRepairKeyword: options.autoRepairLogKeyword.value.trim() || undefined,
      autoRepairLimit: String(options.autoRepairLogLimit.value)
    };
    for (const key of managedQueryKeys) {
      const value = payload[key];
      if (value) {
        nextQuery[key] = value;
      } else {
        delete nextQuery[key];
      }
    }
    await replaceQueryIfChanged({ route: options.route, router: options.router, nextQuery, hash: options.route.hash });
  };

  watch(
    [
      options.providerLogLimit,
      options.providerLogOutcome,
      options.providerLogTaskType,
      options.providerLogProvider,
      options.providerLogKeyword,
      options.autoRepairLogLimit,
      options.autoRepairLogOutcome,
      options.autoRepairLogAction,
      options.autoRepairLogProjectId,
      options.autoRepairLogTaskId,
      options.autoRepairLogTaskIds,
      options.autoRepairLogErrorCode,
      options.autoRepairLogKeyword
    ],
    () => {
      void syncLogFilterQuery();
    }
  );

  return {
    applyRouteLogFilters,
    buildAutoRepairLogQuery,
    buildProviderLogQuery,
    copyAutoRepairLogContext,
    copyAutoRepairTroubleshootLink,
    copyProviderLogContext,
    copyTaskCenterTroubleshootLink,
    exportAutoRepairLogsAsJson,
    exportProviderLogsAsJson,
    filteredProviderLogs,
    goTaskCenterForTask
  };
};
