export type AutoRepairAction = 'retry' | 'recreate_conservative' | 'manual';

export type AutoRepairLogEntry = {
  id: number;
  timestamp: string;
  projectId: string;
  taskId: string;
  storyboardId: string;
  errorCode: string;
  action: AutoRepairAction;
  success: boolean;
  detail?: string;
  resultTaskId?: string;
};

type AutoRepairLogQuery = {
  limit?: number;
  action?: AutoRepairAction;
  errorCode?: string;
  projectId?: string;
  taskId?: string;
  taskIds?: string[];
  success?: boolean;
  keyword?: string;
};

const MAX_AUTO_REPAIR_LOGS = 500;
const logs: AutoRepairLogEntry[] = [];
let seq = 1;

export const appendAutoRepairLog = (entry: Omit<AutoRepairLogEntry, 'id' | 'timestamp'>): void => {
  logs.unshift({
    id: seq++,
    timestamp: new Date().toISOString(),
    ...entry
  });
  if (logs.length > MAX_AUTO_REPAIR_LOGS) {
    logs.length = MAX_AUTO_REPAIR_LOGS;
  }
};

export const listAutoRepairLogs = (query: number | AutoRepairLogQuery = 100): AutoRepairLogEntry[] => {
  const normalized: AutoRepairLogQuery = typeof query === 'number' ? { limit: query } : query;
  const size = Math.max(1, Math.min(normalized.limit ?? 100, MAX_AUTO_REPAIR_LOGS));
  const errorCode = normalized.errorCode?.trim().toUpperCase();
  const projectId = normalized.projectId?.trim();
  const taskId = normalized.taskId?.trim();
  const taskIds = (normalized.taskIds ?? []).map((item) => item.trim()).filter((item) => item.length > 0);
  const taskIdSet = taskIds.length > 0 ? new Set(taskIds) : null;
  const keyword = normalized.keyword?.trim().toLowerCase();
  return logs
    .filter((item) => {
      if (normalized.action && item.action !== normalized.action) {
        return false;
      }
      if (errorCode && item.errorCode.toUpperCase() !== errorCode) {
        return false;
      }
      if (projectId && item.projectId !== projectId) {
        return false;
      }
      if (taskId && item.taskId !== taskId && item.resultTaskId !== taskId) {
        return false;
      }
      if (taskIdSet && !taskIdSet.has(item.taskId) && !taskIdSet.has(item.resultTaskId ?? '')) {
        return false;
      }
      if (typeof normalized.success === 'boolean' && item.success !== normalized.success) {
        return false;
      }
      if (keyword) {
        const haystack = `${item.errorCode} ${item.projectId} ${item.taskId} ${item.resultTaskId ?? ''} ${item.detail ?? ''}`.toLowerCase();
        if (!haystack.includes(keyword)) {
          return false;
        }
      }
      return true;
    })
    .slice(0, size);
};

export const clearAutoRepairLogs = (): number => {
  const removed = logs.length;
  logs.length = 0;
  return removed;
};

export const getAutoRepairLogStats = (): {
  count: number;
  max: number;
  success: number;
  failed: number;
  byErrorCode: Array<{ errorCode: string; count: number; failed: number }>;
  byAction: Array<{ action: AutoRepairAction; count: number; failed: number }>;
} => {
  const byErrorCode = new Map<string, { errorCode: string; count: number; failed: number }>();
  const byAction = new Map<AutoRepairAction, { action: AutoRepairAction; count: number; failed: number }>();
  let success = 0;
  let failed = 0;
  for (const item of logs) {
    if (item.success) {
      success += 1;
    } else {
      failed += 1;
    }
    const errorCodeStat = byErrorCode.get(item.errorCode) ?? { errorCode: item.errorCode, count: 0, failed: 0 };
    errorCodeStat.count += 1;
    if (!item.success) {
      errorCodeStat.failed += 1;
    }
    byErrorCode.set(item.errorCode, errorCodeStat);

    const actionStat = byAction.get(item.action) ?? { action: item.action, count: 0, failed: 0 };
    actionStat.count += 1;
    if (!item.success) {
      actionStat.failed += 1;
    }
    byAction.set(item.action, actionStat);
  }

  return {
    count: logs.length,
    max: MAX_AUTO_REPAIR_LOGS,
    success,
    failed,
    byErrorCode: [...byErrorCode.values()].sort((a, b) => b.count - a.count || b.failed - a.failed),
    byAction: [...byAction.values()].sort((a, b) => b.count - a.count || b.failed - a.failed)
  };
};
