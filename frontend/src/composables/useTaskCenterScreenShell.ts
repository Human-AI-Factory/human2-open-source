import { onBeforeUnmount, onMounted, watch, type ComputedRef, type Ref } from 'vue';
import type { RouteLocationNormalizedLoaded } from 'vue-router';
import { toSingleQuery } from '@/composables/useRouteRestoreContext';

type TaskStatusFilter = '' | 'queued' | 'submitting' | 'polling' | 'running' | 'done' | 'failed' | 'cancelled';
type ProviderErrorCodeFilter =
  | ''
  | 'CAPABILITY_MISMATCH'
  | 'PROVIDER_AUTH_FAILED'
  | 'PROVIDER_RATE_LIMITED'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_UNKNOWN';
type TableColumnKey = 'scope' | 'status' | 'progress' | 'priority' | 'providerTaskId' | 'providerErrorCode' | 'updatedAt';
type TableSortKey = 'status' | 'progress' | 'updatedAt';

type UseTaskCenterScreenShellOptions = {
  route: RouteLocationNormalizedLoaded;
  keyword: Ref<string>;
  providerTaskIdKeyword: Ref<string>;
  status: Ref<TaskStatusFilter>;
  providerErrorCode: Ref<ProviderErrorCodeFilter>;
  createdFromLocal: Ref<string>;
  createdToLocal: Ref<string>;
  sortBy: Ref<'createdAt' | 'updatedAt' | 'priority' | 'status'>;
  order: Ref<'asc' | 'desc'>;
  page: Ref<number>;
  viewMode: Ref<'card' | 'table'>;
  tableColumnVisible: Ref<Record<TableColumnKey, boolean>>;
  tableSortKey: Ref<TableSortKey>;
  tableSortOrder: Ref<'asc' | 'desc'>;
  eventStatusFilter: Ref<string>;
  eventFailedOnly: Ref<boolean>;
  eventKeyword: Ref<string>;
  eventCreatedFromLocal: Ref<string>;
  eventCreatedToLocal: Ref<string>;
  eventsOpen: Ref<boolean>;
  activeTaskId: Ref<string>;
  taskCatalogTypeFilter: Ref<'' | 'video' | 'audio' | 'video_merge'>;
  unifiedAlertWindowMinutes: Ref<number>;
  unifiedIncidentStatusFilter: Ref<'' | 'open' | 'resolved'>;
  unifiedIncidentNotificationDeliveryStatusFilter: Ref<'' | 'sent' | 'failed'>;
  unifiedIncidentNotificationDeliveryMessageKeyword: Ref<string>;
  taskQuotaUsageProjectId: Ref<string>;
  quotaPanelRestoredHint: Ref<string>;
  taskCenterQueryKeys: readonly string[];
  totalPages: ComputedRef<number>;
  syncQueryToUrl: () => Promise<void>;
  refreshUnifiedIncidentsOnly: () => Promise<void>;
  refreshEventExportCount: () => Promise<void>;
  initializeTaskCenterPresets: () => Promise<void>;
  loadStoredEventFilterPresetPreferences: () => void;
  loadQueueAlertConfig: () => Promise<void>;
  loadUnifiedAlertPolicy: () => Promise<void>;
  loadTaskSloConfig: () => Promise<void>;
  loadTaskQuotaConfig: () => Promise<void>;
  loadFailureInjectionConfig: () => Promise<void>;
  loadTasks: () => Promise<void>;
  loadRuntimeOnly: () => Promise<void>;
};

const VIEW_MODE_STORAGE_KEY = 'human2_task_center_view_mode_v1';
const TABLE_COLUMNS_STORAGE_KEY = 'human2_task_center_table_columns_v1';
const TABLE_SORT_STORAGE_KEY = 'human2_task_center_table_sort_v1';
const EVENT_FILTERS_STORAGE_KEY = 'human2_task_center_event_filters_v1';

export const useTaskCenterScreenShell = (options: UseTaskCenterScreenShellOptions) => {
  let querySyncTimer: number | null = null;
  let eventCountDebounceTimer: number | null = null;
  let runtimePollTimer: number | null = null;

  const loadUiPreferences = (): void => {
    try {
      const rawMode = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
      if (rawMode === 'card' || rawMode === 'table') {
        options.viewMode.value = rawMode;
      }
    } catch {
      // ignore storage failures
    }

    try {
      const rawColumns = localStorage.getItem(TABLE_COLUMNS_STORAGE_KEY);
      if (rawColumns) {
        const parsed = JSON.parse(rawColumns) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const src = parsed as Record<string, unknown>;
          const next: Record<TableColumnKey, boolean> = { ...options.tableColumnVisible.value };
          const keys: TableColumnKey[] = ['scope', 'status', 'progress', 'priority', 'providerTaskId', 'providerErrorCode', 'updatedAt'];
          for (const key of keys) {
            if (typeof src[key] === 'boolean') {
              next[key] = src[key] as boolean;
            }
          }
          if (!Object.values(next).some(Boolean)) {
            next.scope = true;
            next.status = true;
          }
          options.tableColumnVisible.value = next;
        }
      }
    } catch {
      // ignore storage failures
    }

    try {
      const rawSort = localStorage.getItem(TABLE_SORT_STORAGE_KEY);
      if (rawSort) {
        const parsed = JSON.parse(rawSort) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const src = parsed as Record<string, unknown>;
          if (src.key === 'status' || src.key === 'progress' || src.key === 'updatedAt') {
            options.tableSortKey.value = src.key;
          }
          if (src.order === 'asc' || src.order === 'desc') {
            options.tableSortOrder.value = src.order;
          }
        }
      }
    } catch {
      // ignore storage failures
    }

    try {
      const rawEventFilters = localStorage.getItem(EVENT_FILTERS_STORAGE_KEY);
      if (rawEventFilters) {
        const parsed = JSON.parse(rawEventFilters) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const src = parsed as Record<string, unknown>;
          if (typeof src.status === 'string') options.eventStatusFilter.value = src.status;
          if (typeof src.failedOnly === 'boolean') options.eventFailedOnly.value = src.failedOnly;
          if (typeof src.keyword === 'string') options.eventKeyword.value = src.keyword;
          if (typeof src.createdFrom === 'string') options.eventCreatedFromLocal.value = src.createdFrom;
          if (typeof src.createdTo === 'string') options.eventCreatedToLocal.value = src.createdTo;
          if (options.eventFailedOnly.value) {
            options.eventStatusFilter.value = 'failed';
          }
        }
      }
    } catch {
      // ignore storage failures
    }

    options.loadStoredEventFilterPresetPreferences();
  };

  onMounted(async () => {
    loadUiPreferences();
    await options.initializeTaskCenterPresets();
    const query = toSingleQuery(options.route.query);
    const q = query.q || '';
    const providerTaskId = query.providerTaskId || '';
    const s = query.status || '';
    const code = query.providerErrorCode || '';
    const createdFrom = query.createdFrom || '';
    const createdTo = query.createdTo || '';
    const sortByQuery = query.sortBy || '';
    const orderQuery = query.order || '';
    const queryPageRaw = query.page ? Number(query.page) : 1;
    const queryTaskCatalogType = query.taskCatalogType ? query.taskCatalogType.trim() : '';
    const queryUnifiedIncidentStatus = query.unifiedIncidentStatus ? query.unifiedIncidentStatus.trim() : '';
    const queryUnifiedIncidentNotificationDeliveryStatus = query.unifiedIncidentNotificationDeliveryStatus
      ? query.unifiedIncidentNotificationDeliveryStatus.trim()
      : '';
    const queryUnifiedIncidentNotificationDeliveryMessage = query.unifiedIncidentNotificationDeliveryMessage
      ? query.unifiedIncidentNotificationDeliveryMessage.trim()
      : '';
    const queryUnifiedAlertWindowRaw = query.unifiedAlertWindowMinutes ? Number(query.unifiedAlertWindowMinutes) : 60;
    const queryQuotaProjectId = query.taskQuotaProjectId ? query.taskQuotaProjectId.trim() : '';

    if (q) options.keyword.value = q;
    if (providerTaskId) options.providerTaskIdKeyword.value = providerTaskId;
    if (['queued', 'submitting', 'polling', 'running', 'done', 'failed', 'cancelled'].includes(s)) {
      options.status.value = s as TaskStatusFilter;
    }
    if (
      ['', 'CAPABILITY_MISMATCH', 'PROVIDER_AUTH_FAILED', 'PROVIDER_RATE_LIMITED', 'PROVIDER_TIMEOUT', 'PROVIDER_UNKNOWN'].includes(
        code
      )
    ) {
      options.providerErrorCode.value = code as ProviderErrorCodeFilter;
    }
    if (createdFrom) options.createdFromLocal.value = createdFrom;
    if (createdTo) options.createdToLocal.value = createdTo;
    if (['createdAt', 'updatedAt', 'priority', 'status'].includes(sortByQuery)) {
      options.sortBy.value = sortByQuery as 'createdAt' | 'updatedAt' | 'priority' | 'status';
    }
    if (orderQuery === 'asc' || orderQuery === 'desc') {
      options.order.value = orderQuery;
    }
    if (Number.isFinite(queryPageRaw) && queryPageRaw >= 1) {
      options.page.value = Math.floor(queryPageRaw);
    }
    if (queryTaskCatalogType === 'video' || queryTaskCatalogType === 'audio' || queryTaskCatalogType === 'video_merge') {
      options.taskCatalogTypeFilter.value = queryTaskCatalogType;
    }
    if (queryUnifiedIncidentStatus === 'open' || queryUnifiedIncidentStatus === 'resolved') {
      options.unifiedIncidentStatusFilter.value = queryUnifiedIncidentStatus;
    }
    if (queryUnifiedIncidentNotificationDeliveryStatus === 'sent' || queryUnifiedIncidentNotificationDeliveryStatus === 'failed') {
      options.unifiedIncidentNotificationDeliveryStatusFilter.value = queryUnifiedIncidentNotificationDeliveryStatus;
    }
    if (queryUnifiedIncidentNotificationDeliveryMessage) {
      options.unifiedIncidentNotificationDeliveryMessageKeyword.value = queryUnifiedIncidentNotificationDeliveryMessage;
    }
    if (Number.isFinite(queryUnifiedAlertWindowRaw)) {
      options.unifiedAlertWindowMinutes.value = Math.max(5, Math.min(24 * 60, Math.floor(queryUnifiedAlertWindowRaw)));
    }
    if (queryQuotaProjectId) {
      options.taskQuotaUsageProjectId.value = queryQuotaProjectId;
      options.quotaPanelRestoredHint.value = queryQuotaProjectId;
    } else {
      options.quotaPanelRestoredHint.value = '';
    }

    await options.loadQueueAlertConfig();
    await options.loadUnifiedAlertPolicy();
    await options.loadTaskSloConfig();
    await options.loadTaskQuotaConfig();
    await options.loadFailureInjectionConfig();
    await options.loadTasks();

    if (options.route.hash === '#task-slo-quota') {
      window.setTimeout(() => {
        const target = document.getElementById('task-slo-quota');
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    }

    runtimePollTimer = window.setInterval(() => {
      void options.loadRuntimeOnly();
    }, 5000);
  });

  watch(
    [
      options.keyword,
      options.providerTaskIdKeyword,
      options.status,
      options.providerErrorCode,
      options.createdFromLocal,
      options.createdToLocal,
      options.sortBy,
      options.order,
      options.page,
      options.taskCatalogTypeFilter,
      options.unifiedAlertWindowMinutes,
      options.unifiedIncidentStatusFilter,
      options.unifiedIncidentNotificationDeliveryStatusFilter,
      options.unifiedIncidentNotificationDeliveryMessageKeyword
    ],
    () => {
      if (querySyncTimer !== null) {
        window.clearTimeout(querySyncTimer);
      }
      querySyncTimer = window.setTimeout(() => {
        void options.syncQueryToUrl();
        querySyncTimer = null;
      }, 250);
    },
    { deep: false }
  );

  watch(options.unifiedIncidentStatusFilter, () => {
    void options.refreshUnifiedIncidentsOnly();
  });

  watch(options.viewMode, (value) => {
    try {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, value);
    } catch {
      // ignore storage failures
    }
  });

  watch(
    options.tableColumnVisible,
    (value) => {
      const keys: TableColumnKey[] = ['scope', 'status', 'progress', 'priority', 'providerTaskId', 'providerErrorCode', 'updatedAt'];
      const allHidden = keys.every((key) => value[key] === false);
      if (allHidden) {
        options.tableColumnVisible.value.scope = true;
        options.tableColumnVisible.value.status = true;
        return;
      }
      try {
        localStorage.setItem(TABLE_COLUMNS_STORAGE_KEY, JSON.stringify(value));
      } catch {
        // ignore storage failures
      }
    },
    { deep: true }
  );

  watch([options.tableSortKey, options.tableSortOrder], ([key, order]) => {
    try {
      localStorage.setItem(TABLE_SORT_STORAGE_KEY, JSON.stringify({ key, order }));
    } catch {
      // ignore storage failures
    }
  });

  watch(
    [options.eventStatusFilter, options.eventFailedOnly, options.eventKeyword, options.eventCreatedFromLocal, options.eventCreatedToLocal],
    ([statusValue, failedOnly, keywordValue, createdFrom, createdTo]) => {
      try {
        localStorage.setItem(
          EVENT_FILTERS_STORAGE_KEY,
          JSON.stringify({
            status: statusValue,
            failedOnly,
            keyword: keywordValue,
            createdFrom,
            createdTo
          })
        );
      } catch {
        // ignore storage failures
      }
    }
  );

  watch([options.eventStatusFilter], ([nextStatus]) => {
    options.eventFailedOnly.value = nextStatus === 'failed';
  });

  watch(
    [options.eventsOpen, options.activeTaskId, options.eventStatusFilter, options.eventKeyword, options.eventCreatedFromLocal, options.eventCreatedToLocal],
    () => {
      if (!options.eventsOpen.value || !options.activeTaskId.value) {
        return;
      }
      if (eventCountDebounceTimer !== null) {
        window.clearTimeout(eventCountDebounceTimer);
      }
      eventCountDebounceTimer = window.setTimeout(() => {
        void options.refreshEventExportCount();
        eventCountDebounceTimer = null;
      }, 300);
    }
  );

  onBeforeUnmount(() => {
    if (querySyncTimer !== null) {
      window.clearTimeout(querySyncTimer);
      querySyncTimer = null;
    }
    if (eventCountDebounceTimer !== null) {
      window.clearTimeout(eventCountDebounceTimer);
      eventCountDebounceTimer = null;
    }
    if (runtimePollTimer !== null) {
      window.clearInterval(runtimePollTimer);
      runtimePollTimer = null;
    }
  });
};
