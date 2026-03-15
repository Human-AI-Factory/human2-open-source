import type { QueueRuntimeAlertConfig, QueueRuntimeAlertEvent, QueueRuntimeAlertState, VideoTaskRuntimeSnapshot } from '../../core/types.js';
import { SqliteStore } from '../../db/sqlite.js';

const QUEUE_ALERT_WARN_KEY = 'queue_alert_warn_queued_threshold';
const QUEUE_ALERT_CRITICAL_KEY = 'queue_alert_critical_queued_threshold';
const QUEUE_ALERT_UPDATED_AT_KEY = 'queue_alert_updated_at';
const QUEUE_ALERT_EVENTS_KEY = 'queue_alert_events';
const QUEUE_ALERT_SILENCED_UNTIL_KEY = 'queue_alert_silenced_until';

export class QueueRuntimeAlertService {
  constructor(private readonly store: SqliteStore) {}

  getQueueRuntimeAlertConfig(): QueueRuntimeAlertConfig {
    const warn = this.readBoundedIntSetting(QUEUE_ALERT_WARN_KEY, 12, 1, 10_000);
    const criticalRaw = this.readBoundedIntSetting(QUEUE_ALERT_CRITICAL_KEY, 30, 1, 10_000);
    const critical = Math.max(warn + 1, criticalRaw);
    const updatedAt = this.store.getSystemSetting(QUEUE_ALERT_UPDATED_AT_KEY) ?? '';
    return {
      warnQueuedThreshold: warn,
      criticalQueuedThreshold: critical,
      updatedAt,
    };
  }

  updateQueueRuntimeAlertConfig(input: { warnQueuedThreshold?: number; criticalQueuedThreshold?: number }): QueueRuntimeAlertConfig {
    const current = this.getQueueRuntimeAlertConfig();
    const warn = this.clampInt(input.warnQueuedThreshold ?? current.warnQueuedThreshold, 1, 10_000);
    const critical = Math.max(warn + 1, this.clampInt(input.criticalQueuedThreshold ?? current.criticalQueuedThreshold, 1, 10_000));
    const updatedAt = new Date().toISOString();
    this.store.setSystemSetting(QUEUE_ALERT_WARN_KEY, String(warn));
    this.store.setSystemSetting(QUEUE_ALERT_CRITICAL_KEY, String(critical));
    this.store.setSystemSetting(QUEUE_ALERT_UPDATED_AT_KEY, updatedAt);
    return {
      warnQueuedThreshold: warn,
      criticalQueuedThreshold: critical,
      updatedAt,
    };
  }

  getQueueRuntimeAlertState(input?: { limit?: number }): QueueRuntimeAlertState {
    const limit = this.clampInt(input?.limit ?? 20, 1, 200);
    const events = this.listQueueRuntimeAlertEvents().slice(-limit).reverse();
    const silencedUntilRaw = this.store.getSystemSetting(QUEUE_ALERT_SILENCED_UNTIL_KEY) ?? '';
    const silencedUntil = silencedUntilRaw.trim() ? silencedUntilRaw.trim() : null;
    return { silencedUntil, events };
  }

  exportQueueRuntimeAlerts(input: { format: 'json' | 'csv'; limit: number }): { filename: string; contentType: string; body: string } {
    const events = this.listQueueRuntimeAlertEvents().slice(-this.clampInt(input.limit, 1, 200));
    if (input.format === 'json') {
      return {
        filename: `queue-runtime-alerts-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify(events, null, 2),
      };
    }
    const csvEscape = (raw: string): string => `"${raw.replaceAll('"', '""')}"`;
    const rows = events.map((item) =>
      [
        item.id,
        item.at,
        item.level,
        item.reason,
        String(item.queuedTotal),
        String(item.runningTotal),
        String(item.pumpErrorCount),
        String(item.warnQueuedThreshold),
        String(item.criticalQueuedThreshold),
        item.acknowledgedAt ?? '',
        item.acknowledgedBy ?? '',
      ]
        .map(csvEscape)
        .join(',')
    );
    return {
      filename: `queue-runtime-alerts-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`,
      contentType: 'text/csv; charset=utf-8',
      body: [
        '"id","at","level","reason","queuedTotal","runningTotal","pumpErrorCount","warnQueuedThreshold","criticalQueuedThreshold","acknowledgedAt","acknowledgedBy"',
        ...rows,
      ].join('\n'),
    };
  }

  acknowledgeQueueRuntimeAlerts(input?: {
    eventId?: string;
    actor?: string;
    silenceMinutes?: number;
  }): QueueRuntimeAlertState {
    const eventId = input?.eventId?.trim() || '';
    const actor = input?.actor?.trim() || 'operator';
    const silenceMinutes = this.clampInt(input?.silenceMinutes ?? 0, 0, 24 * 60);
    const now = new Date().toISOString();
    const events = this.listQueueRuntimeAlertEvents();
    if (events.length > 0) {
      const index = eventId.length > 0 ? events.findIndex((item) => item.id === eventId) : [...events].reverse().findIndex((item) => !item.acknowledgedAt);
      const normalizedIndex = eventId.length > 0 ? index : index >= 0 ? events.length - 1 - index : -1;
      if (normalizedIndex >= 0) {
        events[normalizedIndex] = {
          ...events[normalizedIndex],
          acknowledgedAt: now,
          acknowledgedBy: actor,
        };
      }
    }
    this.writeQueueRuntimeAlertEvents(events);
    if (silenceMinutes > 0) {
      const until = new Date(Date.now() + silenceMinutes * 60_000).toISOString();
      this.store.setSystemSetting(QUEUE_ALERT_SILENCED_UNTIL_KEY, until);
    }
    return this.getQueueRuntimeAlertState({ limit: 20 });
  }

  recordQueueRuntimeAlertEvent(input: {
    level: 'green' | 'yellow' | 'red';
    reason: string;
    snapshot: VideoTaskRuntimeSnapshot;
    config: QueueRuntimeAlertConfig;
  }): void {
    const silencedUntilRaw = this.store.getSystemSetting(QUEUE_ALERT_SILENCED_UNTIL_KEY) ?? '';
    if (input.level !== 'green' && silencedUntilRaw) {
      const silencedAt = new Date(silencedUntilRaw).getTime();
      if (Number.isFinite(silencedAt) && silencedAt > Date.now()) {
        return;
      }
    }
    const events = this.listQueueRuntimeAlertEvents();
    const last = events[events.length - 1];
    const nowMs = Date.now();
    const lastMs = last ? new Date(last.at).getTime() : 0;
    if (input.level === 'green') {
      if (!last || last.level === 'green') {
        return;
      }
    } else if (
      last &&
      last.level === input.level &&
      last.reason === input.reason &&
      Number.isFinite(lastMs) &&
      nowMs - lastMs < 60_000
    ) {
      return;
    }
    const event: QueueRuntimeAlertEvent = {
      id: `qa_${nowMs}_${Math.random().toString(36).slice(2, 8)}`,
      at: new Date(nowMs).toISOString(),
      level: input.level,
      reason: input.reason,
      queuedTotal: input.snapshot.queuedTotal,
      runningTotal: input.snapshot.runningTotal,
      pumpErrorCount: input.snapshot.pumpErrorCount,
      warnQueuedThreshold: input.config.warnQueuedThreshold,
      criticalQueuedThreshold: input.config.criticalQueuedThreshold,
    };
    this.writeQueueRuntimeAlertEvents([...events, event]);
  }

  listQueueRuntimeAlertEvents(): QueueRuntimeAlertEvent[] {
    const raw = this.store.getSystemSetting(QUEUE_ALERT_EVENTS_KEY) ?? '';
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed
        .filter((item): item is QueueRuntimeAlertEvent => Boolean(item && typeof item === 'object'))
        .map((item) => ({
          id: typeof item.id === 'string' ? item.id : '',
          at: typeof item.at === 'string' ? item.at : '',
          level: (item.level === 'red' ? 'red' : item.level === 'green' ? 'green' : 'yellow') as 'green' | 'yellow' | 'red',
          reason: typeof item.reason === 'string' ? item.reason : '',
          queuedTotal: typeof item.queuedTotal === 'number' ? item.queuedTotal : 0,
          runningTotal: typeof item.runningTotal === 'number' ? item.runningTotal : 0,
          pumpErrorCount: typeof item.pumpErrorCount === 'number' ? item.pumpErrorCount : 0,
          warnQueuedThreshold: typeof item.warnQueuedThreshold === 'number' ? item.warnQueuedThreshold : 0,
          criticalQueuedThreshold: typeof item.criticalQueuedThreshold === 'number' ? item.criticalQueuedThreshold : 0,
          acknowledgedAt: typeof item.acknowledgedAt === 'string' ? item.acknowledgedAt : undefined,
          acknowledgedBy: typeof item.acknowledgedBy === 'string' ? item.acknowledgedBy : undefined,
        }))
        .filter((item) => item.id && item.at);
    } catch {
      return [];
    }
  }

  private writeQueueRuntimeAlertEvents(events: QueueRuntimeAlertEvent[]): void {
    const normalized = events.slice(-200);
    this.store.setSystemSetting(QUEUE_ALERT_EVENTS_KEY, JSON.stringify(normalized));
  }

  private readBoundedIntSetting(key: string, fallback: number, min: number, max: number): number {
    const raw = this.store.getSystemSetting(key);
    if (!raw) {
      return fallback;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return this.clampInt(parsed, min, max);
  }

  private clampInt(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, Math.trunc(value)));
  }
}
