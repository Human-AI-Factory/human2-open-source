import type { TaskCatalogAlertEvent } from '../../core/types.js';
import { SqliteStore } from '../../db/sqlite.js';
import { evaluateTaskCatalogContract, type TaskCatalogContractCheckResult } from './task-catalog-contract.js';
import { TASK_TYPE_CATALOG } from './task-type-catalog.js';

const TASK_CATALOG_ALERT_EVENTS_KEY = 'task_catalog_alert_events';

export class TaskCatalogAlertService {
  constructor(private readonly store: SqliteStore) {}

  getTaskTypeCatalogContractCheck(): TaskCatalogContractCheckResult {
    const result = evaluateTaskCatalogContract(TASK_TYPE_CATALOG);
    this.maybeRecordTaskCatalogAlertEvent(result);
    return result;
  }

  getTaskCatalogAlertEvents(input?: { limit?: number }): TaskCatalogAlertEvent[] {
    const limit = this.clampInt(input?.limit ?? 20, 1, 200);
    return this.listTaskCatalogAlertEvents().slice(-limit).reverse();
  }

  listTaskCatalogAlertEvents(): TaskCatalogAlertEvent[] {
    return this.readTaskCatalogAlertEvents();
  }

  exportTaskCatalogAlertEvents(input: { format: 'json' | 'csv'; limit: number }): {
    filename: string;
    contentType: string;
    body: string;
  } {
    const events = this.readTaskCatalogAlertEvents().slice(-this.clampInt(input.limit, 1, 500));
    if (input.format === 'json') {
      return {
        filename: `task-catalog-alerts-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify(events, null, 2)
      };
    }
    const csvEscape = (raw: string): string => `"${raw.replaceAll('"', '""')}"`;
    const rows = events.map((item) =>
      [item.id, item.at, item.level, item.reason, String(item.driftCount), String(item.total)].map(csvEscape).join(',')
    );
    return {
      filename: `task-catalog-alerts-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`,
      contentType: 'text/csv; charset=utf-8',
      body: ['"id","at","level","reason","driftCount","total"', ...rows].join('\n')
    };
  }

  private maybeRecordTaskCatalogAlertEvent(result: TaskCatalogContractCheckResult): void {
    const events = this.readTaskCatalogAlertEvents();
    const last = events[events.length - 1];
    const nowMs = Date.now();
    const lastMs = last ? new Date(last.at).getTime() : 0;
    if (result.level === 'green') {
      if (!last || last.level === 'green') {
        return;
      }
    } else if (
      last &&
      last.level === result.level &&
      last.reason === result.reason &&
      last.driftCount === result.driftCount &&
      last.total === result.total &&
      Number.isFinite(lastMs) &&
      nowMs - lastMs < 60_000
    ) {
      return;
    }
    const next: TaskCatalogAlertEvent = {
      id: `tca_${nowMs}_${Math.random().toString(36).slice(2, 8)}`,
      at: new Date(nowMs).toISOString(),
      level: result.level,
      reason: result.reason,
      driftCount: result.driftCount,
      total: result.total
    };
    this.writeTaskCatalogAlertEvents([...events, next]);
  }

  private readTaskCatalogAlertEvents(): TaskCatalogAlertEvent[] {
    const raw = this.store.getSystemSetting(TASK_CATALOG_ALERT_EVENTS_KEY) ?? '';
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed
        .filter((item): item is TaskCatalogAlertEvent => Boolean(item && typeof item === 'object'))
        .map((item) => ({
          id: typeof item.id === 'string' ? item.id : '',
          at: typeof item.at === 'string' ? item.at : '',
          level: (item.level === 'red' ? 'red' : item.level === 'green' ? 'green' : 'yellow') as 'green' | 'yellow' | 'red',
          reason: typeof item.reason === 'string' ? item.reason : '',
          driftCount: typeof item.driftCount === 'number' ? this.clampInt(item.driftCount, 0, 1000) : 0,
          total: typeof item.total === 'number' ? this.clampInt(item.total, 0, 1000) : 0
        }))
        .filter((item) => item.id && item.at);
    } catch {
      return [];
    }
  }

  private writeTaskCatalogAlertEvents(events: TaskCatalogAlertEvent[]): void {
    const normalized = events.slice(-200);
    this.store.setSystemSetting(TASK_CATALOG_ALERT_EVENTS_KEY, JSON.stringify(normalized));
  }

  private clampInt(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, Math.trunc(value)));
  }
}
