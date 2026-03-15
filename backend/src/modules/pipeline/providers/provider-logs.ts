export type ProviderLogEntry = {
  id: number;
  timestamp: string;
  provider: string;
  taskType: 'text' | 'image' | 'video' | 'audio' | 'embedding' | 'asr';
  endpoint: string;
  success: boolean;
  durationMs: number;
  statusCode?: number;
  message?: string;
};

const MAX_PROVIDER_LOGS = 500;
const logs: ProviderLogEntry[] = [];
let seq = 1;

export type ProviderLogQuery = {
  limit?: number;
  provider?: string;
  taskType?: ProviderLogEntry['taskType'];
  success?: boolean;
  keyword?: string;
};

export const appendProviderLog = (entry: Omit<ProviderLogEntry, 'id' | 'timestamp'>): void => {
  logs.unshift({
    id: seq++,
    timestamp: new Date().toISOString(),
    ...entry
  });
  if (logs.length > MAX_PROVIDER_LOGS) {
    logs.length = MAX_PROVIDER_LOGS;
  }
};

export const listProviderLogs = (query: number | ProviderLogQuery = 100): ProviderLogEntry[] => {
  const normalized: ProviderLogQuery = typeof query === 'number' ? { limit: query } : query;
  const size = Math.max(1, Math.min(normalized.limit ?? 100, 500));
  const provider = normalized.provider?.trim().toLowerCase();
  const keyword = normalized.keyword?.trim().toLowerCase();
  return logs
    .filter((item) => {
      if (provider && item.provider.toLowerCase() !== provider) {
        return false;
      }
      if (normalized.taskType && item.taskType !== normalized.taskType) {
        return false;
      }
      if (typeof normalized.success === 'boolean' && item.success !== normalized.success) {
        return false;
      }
      if (keyword) {
        const haystack = `${item.endpoint} ${item.message ?? ''}`.toLowerCase();
        if (!haystack.includes(keyword)) {
          return false;
        }
      }
      return true;
    })
    .slice(0, size);
};

export const clearProviderLogs = (): number => {
  const removed = logs.length;
  logs.length = 0;
  return removed;
};

export const getProviderLogsStats = (): { count: number; max: number } => ({
  count: logs.length,
  max: MAX_PROVIDER_LOGS
});

export const getProviderLogsBreakdown = (): {
  byProvider: Array<{ provider: string; count: number; failed: number }>;
  byTaskType: Array<{ taskType: ProviderLogEntry['taskType']; count: number; failed: number }>;
} => {
  const providerMap = new Map<string, { provider: string; count: number; failed: number }>();
  const taskTypeMap = new Map<ProviderLogEntry['taskType'], { taskType: ProviderLogEntry['taskType']; count: number; failed: number }>();

  for (const item of logs) {
    const providerStat = providerMap.get(item.provider) ?? { provider: item.provider, count: 0, failed: 0 };
    providerStat.count += 1;
    if (!item.success) {
      providerStat.failed += 1;
    }
    providerMap.set(item.provider, providerStat);

    const taskTypeStat = taskTypeMap.get(item.taskType) ?? { taskType: item.taskType, count: 0, failed: 0 };
    taskTypeStat.count += 1;
    if (!item.success) {
      taskTypeStat.failed += 1;
    }
    taskTypeMap.set(item.taskType, taskTypeStat);
  }

  return {
    byProvider: [...providerMap.values()].sort((a, b) => b.count - a.count || b.failed - a.failed),
    byTaskType: [...taskTypeMap.values()].sort((a, b) => b.count - a.count || b.failed - a.failed)
  };
};
