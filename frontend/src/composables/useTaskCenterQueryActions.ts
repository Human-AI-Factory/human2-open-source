import { computed, type ComputedRef, type Ref } from 'vue';
import type { RouteLocationNormalizedLoaded, Router } from 'vue-router';
import { replaceQueryIfChanged, toSingleQuery } from '@/composables/useRouteRestoreContext';

export type TaskCenterFilterChipKey =
  | 'q'
  | 'providerTaskId'
  | 'status'
  | 'providerErrorCode'
  | 'createdFrom'
  | 'createdTo'
  | 'sortBy'
  | 'order';

type UseTaskCenterQueryActionsOptions = {
  route: RouteLocationNormalizedLoaded;
  router: Router;
  taskCenterQueryKeys: readonly string[];
  scopedDramaId: ComputedRef<string>;
  hasDramaPathScope: ComputedRef<boolean>;
  keyword: Ref<string>;
  providerTaskIdKeyword: Ref<string>;
  status: Ref<string>;
  providerErrorCode: Ref<string>;
  createdFromLocal: Ref<string>;
  createdToLocal: Ref<string>;
  sortBy: Ref<'createdAt' | 'updatedAt' | 'priority' | 'status'>;
  order: Ref<'asc' | 'desc'>;
  page: Ref<number>;
  totalPages: ComputedRef<number>;
  taskCatalogTypeFilter: Ref<'' | 'video' | 'audio' | 'video_merge'>;
  unifiedAlertWindowMinutes: Ref<number>;
  unifiedIncidentStatusFilter: Ref<'' | 'open' | 'resolved'>;
  unifiedIncidentNotificationDeliveryStatusFilter: Ref<'' | 'sent' | 'failed'>;
  unifiedIncidentNotificationDeliveryMessageKeyword: Ref<string>;
  actionMessage: Ref<string>;
  error: Ref<string>;
  loadTasks: () => Promise<void>;
};

export const useTaskCenterQueryActions = (options: UseTaskCenterQueryActionsOptions) => {
  const activeFilterChips = computed(() => {
    const chips: Array<{ key: TaskCenterFilterChipKey; label: string }> = [];
    if (options.keyword.value.trim()) chips.push({ key: 'q', label: `关键词: ${options.keyword.value.trim()}` });
    if (options.providerTaskIdKeyword.value.trim()) {
      chips.push({ key: 'providerTaskId', label: `厂商任务ID: ${options.providerTaskIdKeyword.value.trim()}` });
    }
    if (options.status.value) chips.push({ key: 'status', label: `状态: ${options.status.value}` });
    if (options.providerErrorCode.value) chips.push({ key: 'providerErrorCode', label: `错误码: ${options.providerErrorCode.value}` });
    if (options.createdFromLocal.value) chips.push({ key: 'createdFrom', label: `起始: ${options.createdFromLocal.value}` });
    if (options.createdToLocal.value) chips.push({ key: 'createdTo', label: `截止: ${options.createdToLocal.value}` });
    if (options.sortBy.value !== 'createdAt') chips.push({ key: 'sortBy', label: `排序: ${options.sortBy.value}` });
    if (options.order.value !== 'desc') chips.push({ key: 'order', label: `顺序: ${options.order.value}` });
    return chips;
  });

  const syncQueryToUrl = async (): Promise<void> => {
    const nextQuery = toSingleQuery(options.route.query);
    for (const key of Object.keys(nextQuery)) {
      if (!options.taskCenterQueryKeys.includes(key)) {
        delete nextQuery[key];
      }
    }
    const payload: Record<string, string | undefined> = {
      ...(!options.hasDramaPathScope.value && options.scopedDramaId.value ? { dramaId: options.scopedDramaId.value } : {}),
      q: options.keyword.value.trim() || undefined,
      providerTaskId: options.providerTaskIdKeyword.value.trim() || undefined,
      status: options.status.value || undefined,
      providerErrorCode: options.providerErrorCode.value || undefined,
      createdFrom: options.createdFromLocal.value || undefined,
      createdTo: options.createdToLocal.value || undefined,
      sortBy: options.sortBy.value !== 'createdAt' ? options.sortBy.value : undefined,
      order: options.order.value !== 'desc' ? options.order.value : undefined,
      page: options.page.value > 1 ? String(options.page.value) : undefined,
      taskCatalogType: options.taskCatalogTypeFilter.value || undefined,
      unifiedAlertWindowMinutes:
        options.unifiedAlertWindowMinutes.value !== 60 ? String(options.unifiedAlertWindowMinutes.value) : undefined,
      unifiedIncidentStatus: options.unifiedIncidentStatusFilter.value || undefined,
      unifiedIncidentNotificationDeliveryStatus: options.unifiedIncidentNotificationDeliveryStatusFilter.value || undefined,
      unifiedIncidentNotificationDeliveryMessage:
        options.unifiedIncidentNotificationDeliveryMessageKeyword.value.trim() || undefined
    };
    for (const [key, value] of Object.entries(payload)) {
      if (value) {
        nextQuery[key] = value;
      } else {
        delete nextQuery[key];
      }
    }
    await replaceQueryIfChanged({ route: options.route, router: options.router, nextQuery, hash: options.route.hash });
  };

  const copyCurrentQueryLink = async (): Promise<void> => {
    try {
      await syncQueryToUrl();
      const resolved = options.router.resolve({
        path: options.route.path,
        query: toSingleQuery(options.route.query),
        hash: options.route.hash
      });
      const url = new URL(resolved.href, window.location.origin).toString();
      await navigator.clipboard.writeText(url);
      options.actionMessage.value = '已复制当前查询链接';
      options.error.value = '';
    } catch {
      options.error.value = '复制查询链接失败，请检查浏览器剪贴板权限';
    }
  };

  const removeFilterChip = async (key: TaskCenterFilterChipKey): Promise<void> => {
    if (key === 'q') options.keyword.value = '';
    if (key === 'providerTaskId') options.providerTaskIdKeyword.value = '';
    if (key === 'status') options.status.value = '';
    if (key === 'providerErrorCode') options.providerErrorCode.value = '';
    if (key === 'createdFrom') options.createdFromLocal.value = '';
    if (key === 'createdTo') options.createdToLocal.value = '';
    if (key === 'sortBy') options.sortBy.value = 'createdAt';
    if (key === 'order') options.order.value = 'desc';
    options.page.value = 1;
    await options.loadTasks();
  };

  const search = async (): Promise<void> => {
    options.page.value = 1;
    options.actionMessage.value = '';
    await options.loadTasks();
  };

  const clearFilters = async (): Promise<void> => {
    options.keyword.value = '';
    options.providerTaskIdKeyword.value = '';
    options.status.value = '';
    options.providerErrorCode.value = '';
    options.createdFromLocal.value = '';
    options.createdToLocal.value = '';
    options.sortBy.value = 'createdAt';
    options.order.value = 'desc';
    options.taskCatalogTypeFilter.value = '';
    options.page.value = 1;
    options.actionMessage.value = '';
    await options.loadTasks();
  };

  const focusFailedTasks = async (): Promise<void> => {
    options.status.value = 'failed';
    options.page.value = 1;
    await options.loadTasks();
    options.actionMessage.value = '已聚焦失败任务';
  };

  const applyMetricStatusFilter = async (target: '' | 'running' | 'done' | 'failed'): Promise<void> => {
    options.status.value = target;
    options.page.value = 1;
    await options.loadTasks();
  };

  const prevPage = async (): Promise<void> => {
    if (options.page.value <= 1) return;
    options.page.value -= 1;
    await syncQueryToUrl();
    await options.loadTasks();
  };

  const nextPage = async (): Promise<void> => {
    if (options.page.value >= options.totalPages.value) return;
    options.page.value += 1;
    await syncQueryToUrl();
    await options.loadTasks();
  };

  const goHome = async (): Promise<void> => {
    if (options.scopedDramaId.value) {
      await options.router.push(`/dramas/${options.scopedDramaId.value}`);
      return;
    }
    await options.router.push('/dramas');
  };

  return {
    activeFilterChips,
    syncQueryToUrl,
    copyCurrentQueryLink,
    removeFilterChip,
    search,
    clearFilters,
    focusFailedTasks,
    applyMetricStatusFilter,
    prevPage,
    nextPage,
    goHome
  };
};
