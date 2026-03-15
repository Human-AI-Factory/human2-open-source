import { ref, type ComputedRef, type Ref } from 'vue';
import type { Router } from 'vue-router';
import {
  cancelGlobalVideoTask,
  cancelGlobalVideoTasksBatch,
  repairGlobalVideoTasksByPolicyBatch,
  repairGlobalVideoTasksByPolicyQuery,
  retryGlobalVideoTask,
  retryGlobalVideoTasksBatch
} from '@/api/task-center';
import type {
  TaskQuotaUsageEvent,
  VideoTaskBatchRepairByPolicyResult,
  VideoTaskListItem
} from '@/types/models';
import { toErrorMessage } from '@/utils/errors';

type UseTaskCenterTaskActionsOptions = {
  router: Router;
  scopedDramaId: ComputedRef<string>;
  tasks: Ref<VideoTaskListItem[]>;
  filteredTasks: ComputedRef<VideoTaskListItem[]>;
  keyword: Ref<string>;
  status: Ref<string>;
  providerErrorCode: Ref<string>;
  providerTaskIdKeyword: Ref<string>;
  createdFromLocal: Ref<string>;
  createdToLocal: Ref<string>;
  sortBy: Ref<'createdAt' | 'updatedAt' | 'priority' | 'status'>;
  order: Ref<'asc' | 'desc'>;
  error: Ref<string>;
  actionMessage: Ref<string>;
  loadTasks: () => Promise<void>;
};

const toIso = (value: string): string | undefined => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

export const useTaskCenterTaskActions = (options: UseTaskCenterTaskActionsOptions) => {
  const lastRepairLogShortcut = ref<{
    title: string;
    query: Record<string, string>;
  } | null>(null);

  const setLastRepairLogShortcut = (result: VideoTaskBatchRepairByPolicyResult, sourceLabel: string): void => {
    const taskIds = [
      ...result.retried.map((item) => item.id),
      ...result.recreated.map((item) => item.id),
      ...result.manualIds
    ];
    const dedup = [...new Set(taskIds)].slice(0, 20);
    if (dedup.length === 0) {
      lastRepairLogShortcut.value = null;
      return;
    }
    lastRepairLogShortcut.value = {
      title: `${sourceLabel}修复日志`,
      query: {
        autoRepairTaskIds: dedup.join(','),
        autoRepairOutcome: 'failed',
        autoRepairLimit: '200'
      }
    };
  };

  const buildAutoRepairLogsQuery = (input?: {
    taskId?: string;
    projectId?: string;
    errorCode?: string;
    keyword?: string;
  }): Record<string, string> => ({
    ...(options.scopedDramaId.value ? { dramaId: options.scopedDramaId.value } : {}),
    ...(input?.taskId ? { autoRepairTaskId: input.taskId } : {}),
    ...(input?.projectId ? { autoRepairProjectId: input.projectId } : {}),
    autoRepairOutcome: 'failed',
    ...(input?.errorCode ? { autoRepairErrorCode: input.errorCode } : {}),
    ...(input?.keyword ? { autoRepairKeyword: input.keyword } : {}),
    autoRepairLimit: '200'
  });

  const writeClipboard = async (text: string, successMessage: string, failureMessage: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      options.actionMessage.value = successMessage;
      options.error.value = '';
    } catch {
      options.error.value = failureMessage;
    }
  };

  const retry = async (taskId: string): Promise<void> => {
    try {
      await retryGlobalVideoTask(taskId);
      await options.loadTasks();
      options.actionMessage.value = '单任务重试成功';
    } catch (err) {
      options.error.value = toErrorMessage(err, '重试失败');
    }
  };

  const cancel = async (taskId: string): Promise<void> => {
    try {
      await cancelGlobalVideoTask(taskId);
      await options.loadTasks();
      options.actionMessage.value = '单任务取消成功';
    } catch (err) {
      options.error.value = toErrorMessage(err, '取消失败');
    }
  };

  const cancelActiveOnPage = async (): Promise<void> => {
    const ids = options.tasks.value
      .filter((item) => item.status === 'queued' || item.status === 'submitting' || item.status === 'polling' || item.status === 'running')
      .map((item) => item.id);
    if (ids.length === 0) {
      options.actionMessage.value = '本页没有可取消任务';
      return;
    }
    try {
      const result = await cancelGlobalVideoTasksBatch(ids);
      await options.loadTasks();
      options.actionMessage.value = `批量取消完成：更新 ${result.updated.length}，未变化 ${result.unchangedIds.length}，不存在 ${result.notFoundIds.length}`;
    } catch (err) {
      options.error.value = toErrorMessage(err, '批量取消失败');
    }
  };

  const cancelActiveOnFilteredPage = async (): Promise<void> => {
    const ids = options.filteredTasks.value
      .filter((item) => item.status === 'queued' || item.status === 'submitting' || item.status === 'polling' || item.status === 'running')
      .map((item) => item.id);
    if (ids.length === 0) {
      options.actionMessage.value = '筛选结果中没有可取消任务';
      return;
    }
    try {
      const result = await cancelGlobalVideoTasksBatch(ids);
      await options.loadTasks();
      options.actionMessage.value = `筛选批量取消完成：更新 ${result.updated.length}，未变化 ${result.unchangedIds.length}，不存在 ${result.notFoundIds.length}`;
    } catch (err) {
      options.error.value = toErrorMessage(err, '筛选批量取消失败');
    }
  };

  const retryFailedOnPage = async (): Promise<void> => {
    const ids = options.tasks.value.filter((item) => item.status === 'failed' || item.status === 'cancelled').map((item) => item.id);
    if (ids.length === 0) {
      options.actionMessage.value = '本页没有可重试任务（failed/cancelled）';
      return;
    }
    try {
      const result = await retryGlobalVideoTasksBatch(ids);
      await options.loadTasks();
      options.actionMessage.value = `批量重试完成：更新 ${result.updated.length}，未变化 ${result.unchangedIds.length}，不存在 ${result.notFoundIds.length}`;
    } catch (err) {
      options.error.value = toErrorMessage(err, '批量重试失败');
    }
  };

  const retryFailedOnFilteredPage = async (): Promise<void> => {
    const ids = options.filteredTasks.value.filter((item) => item.status === 'failed' || item.status === 'cancelled').map((item) => item.id);
    if (ids.length === 0) {
      options.actionMessage.value = '筛选结果中没有可重试任务（failed/cancelled）';
      return;
    }
    try {
      const result = await retryGlobalVideoTasksBatch(ids);
      await options.loadTasks();
      options.actionMessage.value = `筛选批量重试完成：更新 ${result.updated.length}，未变化 ${result.unchangedIds.length}，不存在 ${result.notFoundIds.length}`;
    } catch (err) {
      options.error.value = toErrorMessage(err, '筛选批量重试失败');
    }
  };

  const repairFailedOnFilteredPageByPolicy = async (): Promise<void> => {
    const ids = options.filteredTasks.value.filter((item) => item.status === 'failed' || item.status === 'cancelled').map((item) => item.id);
    if (ids.length === 0) {
      options.actionMessage.value = '筛选结果中没有可按策略修复的任务（failed/cancelled）';
      return;
    }
    try {
      const result = await repairGlobalVideoTasksByPolicyBatch(ids);
      await options.loadTasks();
      setLastRepairLogShortcut(result, '筛选批量');
      options.actionMessage.value = `按策略修复完成：重试 ${result.retried.length}，保守重建 ${result.recreated.length}，需人工 ${result.manualIds.length}，未变化 ${result.unchangedIds.length}，不存在 ${result.notFoundIds.length}`;
    } catch (err) {
      options.error.value = toErrorMessage(err, '按策略修复失败');
    }
  };

  const repairByPolicyWithServerQuery = async (): Promise<void> => {
    if (!options.status.value && !options.providerErrorCode.value) {
      const confirmed = window.confirm('当前未限制状态/错误码，将按筛选条件最多扫描 300 条任务。是否继续？');
      if (!confirmed) {
        return;
      }
    }
    try {
      const result = await repairGlobalVideoTasksByPolicyQuery({
        q: options.keyword.value.trim() || undefined,
        providerTaskId: options.providerTaskIdKeyword.value.trim() || undefined,
        providerErrorCode: options.providerErrorCode.value || undefined,
        status: (options.status.value || undefined) as
          | 'queued'
          | 'submitting'
          | 'polling'
          | 'running'
          | 'done'
          | 'failed'
          | 'cancelled'
          | undefined,
        createdFrom: toIso(options.createdFromLocal.value),
        createdTo: toIso(options.createdToLocal.value),
        sortBy: options.sortBy.value,
        order: options.order.value,
        maxCount: 300
      });
      await options.loadTasks();
      setLastRepairLogShortcut(result, '服务端筛选');
      options.actionMessage.value = `服务端按筛选策略修复完成：命中 ${result.matchedCount ?? 0}，重试 ${result.retried.length}，保守重建 ${result.recreated.length}，需人工 ${result.manualIds.length}，未变化 ${result.unchangedIds.length}，不存在 ${result.notFoundIds.length}`;
    } catch (err) {
      options.error.value = toErrorMessage(err, '按筛选全量策略修复失败');
    }
  };

  const openLastRepairLogShortcut = async (): Promise<void> => {
    if (!lastRepairLogShortcut.value) {
      return;
    }
    await options.router.push({
      path: '/settings',
      hash: '#auto-repair-logs',
      query: lastRepairLogShortcut.value.query
    });
  };

  const copyLastRepairLogShortcut = async (): Promise<void> => {
    if (!lastRepairLogShortcut.value) {
      return;
    }
    const resolved = options.router.resolve({
      path: '/settings',
      hash: '#auto-repair-logs',
      query: lastRepairLogShortcut.value.query
    });
    const url = new URL(resolved.href, window.location.origin).toString();
    await writeClipboard(url, `已复制${lastRepairLogShortcut.value.title}链接`, '复制修复日志链接失败，请检查浏览器剪贴板权限');
  };

  const openAutoRepairLogsInSettings = async (): Promise<void> => {
    await options.router.push({
      path: '/settings',
      hash: '#auto-repair-logs',
      query: buildAutoRepairLogsQuery({
        errorCode: options.providerErrorCode.value || undefined,
        keyword: options.keyword.value.trim() || undefined
      })
    });
  };

  const openAutoRepairLogsForTask = async (task: VideoTaskListItem): Promise<void> => {
    await options.router.push({
      path: '/settings',
      hash: '#auto-repair-logs',
      query: buildAutoRepairLogsQuery({
        taskId: task.id,
        projectId: task.projectId,
        errorCode: task.providerErrorCode || undefined
      })
    });
  };

  const copyAutoRepairLogLinkForTask = async (task: VideoTaskListItem): Promise<void> => {
    const resolved = options.router.resolve({
      path: '/settings',
      hash: '#auto-repair-logs',
      query: buildAutoRepairLogsQuery({
        taskId: task.id,
        projectId: task.projectId,
        errorCode: task.providerErrorCode || undefined
      })
    });
    const url = new URL(resolved.href, window.location.origin).toString();
    await writeClipboard(url, '已复制修复日志链接', '复制修复日志链接失败，请检查浏览器剪贴板权限');
  };

  const goTimelineByQuotaUsageEvent = async (item: TaskQuotaUsageEvent): Promise<void> => {
    const targetProjectId = item.projectId?.trim();
    if (!targetProjectId) {
      return;
    }
    const path = options.scopedDramaId.value ? `/dramas/${options.scopedDramaId.value}/timeline` : `/projects/${targetProjectId}/timeline`;
    await options.router.push({
      path,
      query: {
        ...(options.scopedDramaId.value ? { dramaId: options.scopedDramaId.value } : {}),
        storyboardId: item.storyboardId
      }
    });
  };

  const copyReconcileIds = async (task: VideoTaskListItem): Promise<void> => {
    await writeClipboard(
      `taskId=${task.id}\nproviderTaskId=${task.providerTaskId ?? ''}`,
      '已复制对单ID',
      '复制失败，请检查浏览器剪贴板权限'
    );
  };

  const copyTaskId = async (taskId: string): Promise<void> => {
    await writeClipboard(taskId, `已复制任务ID：${taskId}`, '复制任务ID失败，请检查浏览器剪贴板权限');
  };

  return {
    lastRepairLogShortcut,
    retry,
    cancel,
    cancelActiveOnPage,
    cancelActiveOnFilteredPage,
    retryFailedOnPage,
    retryFailedOnFilteredPage,
    repairFailedOnFilteredPageByPolicy,
    repairByPolicyWithServerQuery,
    openLastRepairLogShortcut,
    copyLastRepairLogShortcut,
    openAutoRepairLogsInSettings,
    openAutoRepairLogsForTask,
    copyAutoRepairLogLinkForTask,
    goTimelineByQuotaUsageEvent,
    copyReconcileIds,
    copyTaskId
  };
};
