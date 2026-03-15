import type {
  TaskUnifiedAlertActionLog,
  TaskUnifiedAlertEvent,
  TaskUnifiedAlertPolicyConfig,
  TaskUnifiedAlertState
} from '../../core/types.js';
import { SqliteStore } from '../../db/sqlite.js';
import { TaskCatalogAlertService } from '../tasks/task-catalog-alert.service.js';
import { QueueRuntimeAlertService } from './queue-runtime-alert.service.js';
import { UnifiedAlertIncidentService } from './unified-alert-incident.service.js';

const TASK_UNIFIED_ALERT_POLICY_KEY = 'task_unified_alert_policy';
const TASK_UNIFIED_ALERT_ACTION_LOGS_KEY = 'task_unified_alert_action_logs';

export class UnifiedAlertStateService {
  constructor(
    private readonly store: SqliteStore,
    private readonly queueRuntimeAlertService: QueueRuntimeAlertService,
    private readonly taskCatalogAlertService: TaskCatalogAlertService,
    private readonly unifiedAlertIncidentService: UnifiedAlertIncidentService
  ) {}

  getUnifiedAlertState(input?: { limit?: number; windowMinutes?: number }): TaskUnifiedAlertState {
    const limit = this.clampInt(input?.limit ?? 50, 1, 500);
    const windowMinutes = this.clampInt(input?.windowMinutes ?? 60, 5, 24 * 60);
    const toMs = Date.now();
    const fromMs = toMs - windowMinutes * 60_000;
    const queueEvents = this.queueRuntimeAlertService.listQueueRuntimeAlertEvents().map<TaskUnifiedAlertEvent>((item) => ({
      id: item.id,
      at: item.at,
      level: item.level,
      reason: item.reason,
      source: 'queue',
      acknowledgedAt: item.acknowledgedAt,
      acknowledgedBy: item.acknowledgedBy,
      queue: {
        queuedTotal: item.queuedTotal,
        runningTotal: item.runningTotal,
        pumpErrorCount: item.pumpErrorCount,
        warnQueuedThreshold: item.warnQueuedThreshold,
        criticalQueuedThreshold: item.criticalQueuedThreshold
      }
    }));
    const contractEvents = this.taskCatalogAlertService.listTaskCatalogAlertEvents().map<TaskUnifiedAlertEvent>((item) => ({
      id: item.id,
      at: item.at,
      level: item.level,
      reason: item.reason,
      source: 'contract',
      contract: {
        driftCount: item.driftCount,
        total: item.total
      }
    }));
    const merged = [...queueEvents, ...contractEvents]
      .filter((item) => {
        const atMs = Date.parse(item.at);
        return Number.isFinite(atMs) && atMs >= fromMs && atMs <= toMs;
      })
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
      .slice(0, limit);
    const byLevel = { green: 0, yellow: 0, red: 0 };
    const bySource = { queue: 0, contract: 0 };
    for (const item of merged) {
      byLevel[item.level] += 1;
      bySource[item.source] += 1;
    }
    const state: TaskUnifiedAlertState = {
      windowMinutes,
      from: new Date(fromMs).toISOString(),
      to: new Date(toMs).toISOString(),
      total: merged.length,
      byLevel,
      bySource,
      events: merged
    };
    this.maybeRecordUnifiedAlertAction(state);
    this.unifiedAlertIncidentService.maybeAutoTriggerIncidentEscalations();
    return state;
  }

  exportUnifiedAlertState(input: { format: 'json' | 'csv'; limit: number; windowMinutes: number }): {
    filename: string;
    contentType: string;
    body: string;
  } {
    const state = this.getUnifiedAlertState(input);
    if (input.format === 'json') {
      return {
        filename: `task-unified-alerts-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify(state, null, 2)
      };
    }
    const csvEscape = (raw: string): string => `"${raw.replaceAll('"', '""')}"`;
    const rows = state.events.map((item) =>
      [
        item.id,
        item.at,
        item.source,
        item.level,
        item.reason,
        item.source === 'queue' ? String(item.queue?.queuedTotal ?? 0) : '',
        item.source === 'queue' ? String(item.queue?.runningTotal ?? 0) : '',
        item.source === 'queue' ? String(item.queue?.pumpErrorCount ?? 0) : '',
        item.source === 'contract' ? String(item.contract?.driftCount ?? 0) : '',
        item.source === 'contract' ? String(item.contract?.total ?? 0) : '',
        item.acknowledgedAt ?? '',
        item.acknowledgedBy ?? ''
      ]
        .map(csvEscape)
        .join(',')
    );
    return {
      filename: `task-unified-alerts-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`,
      contentType: 'text/csv; charset=utf-8',
      body: [
        '"id","at","source","level","reason","queuedTotal","runningTotal","pumpErrorCount","contractDriftCount","contractTotal","acknowledgedAt","acknowledgedBy"',
        ...rows
      ].join('\n')
    };
  }

  getUnifiedAlertPolicyConfig(): TaskUnifiedAlertPolicyConfig {
    const raw = this.store.getSystemSetting(TASK_UNIFIED_ALERT_POLICY_KEY) ?? '';
    const fallback: TaskUnifiedAlertPolicyConfig = {
      redTotalThreshold: 3,
      redQueueThreshold: 2,
      redContractThreshold: 1,
      cooldownMinutes: 15,
      updatedAt: ''
    };
    if (!raw) {
      return fallback;
    }
    try {
      const parsed = JSON.parse(raw) as Partial<TaskUnifiedAlertPolicyConfig>;
      return {
        redTotalThreshold: this.clampInt(Number(parsed.redTotalThreshold ?? fallback.redTotalThreshold), 1, 1000),
        redQueueThreshold: this.clampInt(Number(parsed.redQueueThreshold ?? fallback.redQueueThreshold), 1, 1000),
        redContractThreshold: this.clampInt(Number(parsed.redContractThreshold ?? fallback.redContractThreshold), 1, 1000),
        cooldownMinutes: this.clampInt(Number(parsed.cooldownMinutes ?? fallback.cooldownMinutes), 1, 24 * 60),
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : fallback.updatedAt
      };
    } catch {
      return fallback;
    }
  }

  updateUnifiedAlertPolicyConfig(input: {
    redTotalThreshold?: number;
    redQueueThreshold?: number;
    redContractThreshold?: number;
    cooldownMinutes?: number;
  }): TaskUnifiedAlertPolicyConfig {
    const current = this.getUnifiedAlertPolicyConfig();
    const next: TaskUnifiedAlertPolicyConfig = {
      redTotalThreshold: this.clampInt(input.redTotalThreshold ?? current.redTotalThreshold, 1, 1000),
      redQueueThreshold: this.clampInt(input.redQueueThreshold ?? current.redQueueThreshold, 1, 1000),
      redContractThreshold: this.clampInt(input.redContractThreshold ?? current.redContractThreshold, 1, 1000),
      cooldownMinutes: this.clampInt(input.cooldownMinutes ?? current.cooldownMinutes, 1, 24 * 60),
      updatedAt: new Date().toISOString()
    };
    this.store.setSystemSetting(TASK_UNIFIED_ALERT_POLICY_KEY, JSON.stringify(next));
    return next;
  }

  getUnifiedAlertActionLogs(input?: { limit?: number }): TaskUnifiedAlertActionLog[] {
    const limit = this.clampInt(input?.limit ?? 50, 1, 500);
    return this.readUnifiedAlertActionLogs().slice(-limit).reverse();
  }

  exportUnifiedAlertActionLogs(input: { format: 'json' | 'csv'; limit: number }): {
    filename: string;
    contentType: string;
    body: string;
  } {
    const logs = this.readUnifiedAlertActionLogs().slice(-this.clampInt(input.limit, 1, 1000));
    if (input.format === 'json') {
      return {
        filename: `task-unified-alert-action-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify(logs, null, 2)
      };
    }
    const csvEscape = (raw: string): string => `"${raw.replaceAll('"', '""')}"`;
    const rows = logs.map((item) =>
      [
        item.id,
        item.at,
        item.level,
        item.reason,
        String(item.windowMinutes),
        String(item.totals.total),
        String(item.totals.red),
        String(item.totals.queue),
        String(item.totals.contract)
      ]
        .map(csvEscape)
        .join(',')
    );
    return {
      filename: `task-unified-alert-action-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`,
      contentType: 'text/csv; charset=utf-8',
      body: ['"id","at","level","reason","windowMinutes","total","red","queue","contract"', ...rows].join('\n')
    };
  }

  private maybeRecordUnifiedAlertAction(state: TaskUnifiedAlertState): void {
    const policy = this.getUnifiedAlertPolicyConfig();
    const redCount = state.byLevel.red;
    const queueCount = state.bySource.queue;
    const contractCount = state.bySource.contract;
    if (
      redCount < policy.redTotalThreshold &&
      queueCount < policy.redQueueThreshold &&
      contractCount < policy.redContractThreshold
    ) {
      return;
    }
    const nowMs = Date.now();
    const logs = this.readUnifiedAlertActionLogs();
    const last = logs[logs.length - 1];
    const lastMs = last ? Date.parse(last.at) : 0;
    if (Number.isFinite(lastMs) && nowMs - lastMs < policy.cooldownMinutes * 60_000) {
      return;
    }
    const reasons: string[] = [];
    if (redCount >= policy.redTotalThreshold) reasons.push(`red=${redCount} >= ${policy.redTotalThreshold}`);
    if (queueCount >= policy.redQueueThreshold) reasons.push(`queue=${queueCount} >= ${policy.redQueueThreshold}`);
    if (contractCount >= policy.redContractThreshold) reasons.push(`contract=${contractCount} >= ${policy.redContractThreshold}`);
    const log: TaskUnifiedAlertActionLog = {
      id: `tua_${nowMs}_${Math.random().toString(36).slice(2, 8)}`,
      at: new Date(nowMs).toISOString(),
      level: redCount > 0 ? 'red' : state.byLevel.yellow > 0 ? 'yellow' : 'green',
      reason: reasons.join(' | '),
      windowMinutes: state.windowMinutes,
      totals: {
        total: state.total,
        red: redCount,
        queue: queueCount,
        contract: contractCount
      }
    };
    this.writeUnifiedAlertActionLogs([...logs, log]);
    this.unifiedAlertIncidentService.upsertUnifiedAlertIncident(log);
  }

  private readUnifiedAlertActionLogs(): TaskUnifiedAlertActionLog[] {
    const raw = this.store.getSystemSetting(TASK_UNIFIED_ALERT_ACTION_LOGS_KEY) ?? '';
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed
        .filter((item): item is TaskUnifiedAlertActionLog => Boolean(item && typeof item === 'object'))
        .map((item) => ({
          id: typeof item.id === 'string' ? item.id : '',
          at: typeof item.at === 'string' ? item.at : '',
          level: (item.level === 'red' ? 'red' : item.level === 'green' ? 'green' : 'yellow') as 'green' | 'yellow' | 'red',
          reason: typeof item.reason === 'string' ? item.reason : '',
          windowMinutes: typeof item.windowMinutes === 'number' ? this.clampInt(item.windowMinutes, 1, 24 * 60) : 60,
          totals: {
            total: typeof item.totals?.total === 'number' ? this.clampInt(item.totals.total, 0, 100_000) : 0,
            red: typeof item.totals?.red === 'number' ? this.clampInt(item.totals.red, 0, 100_000) : 0,
            queue: typeof item.totals?.queue === 'number' ? this.clampInt(item.totals.queue, 0, 100_000) : 0,
            contract: typeof item.totals?.contract === 'number' ? this.clampInt(item.totals.contract, 0, 100_000) : 0
          }
        }))
        .filter((item) => item.id && item.at);
    } catch {
      return [];
    }
  }

  private writeUnifiedAlertActionLogs(logs: TaskUnifiedAlertActionLog[]): void {
    const normalized = logs.slice(-500);
    this.store.setSystemSetting(TASK_UNIFIED_ALERT_ACTION_LOGS_KEY, JSON.stringify(normalized));
  }

  private clampInt(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, Math.trunc(value)));
  }
}
