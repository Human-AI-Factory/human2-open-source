import { nowIso } from '../../utils/time.js';
import { SqliteStore } from '../../db/sqlite.js';

const ADMIN_AUDIT_LOGS_KEY = 'admin_audit_logs_v1';
const ADMIN_AUDIT_LOGS_MAX = 1000;

export type AdminAuditScope = 'settings' | 'tasks';

export type AdminAuditLog = {
  id: string;
  at: string;
  scope: AdminAuditScope;
  action: string;
  actorId: string;
  actorRole: string;
  requestId: string | null;
  targetId: string | null;
  details: Record<string, unknown>;
};

export class AdminAuditService {
  constructor(private readonly store: SqliteStore) {}

  record(input: {
    scope: AdminAuditScope;
    action: string;
    actorId: string;
    actorRole: string;
    requestId?: string | null;
    targetId?: string | null;
    details?: Record<string, unknown>;
  }): AdminAuditLog {
    const next: AdminAuditLog = {
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      at: nowIso(),
      scope: input.scope,
      action: input.action.trim(),
      actorId: input.actorId.trim() || 'unknown',
      actorRole: input.actorRole.trim() || 'unknown',
      requestId: input.requestId?.trim() || null,
      targetId: input.targetId?.trim() || null,
      details: this.normalizeDetails(input.details)
    };
    const logs = [...this.readLogs(), next].slice(-ADMIN_AUDIT_LOGS_MAX);
    this.writeLogs(logs);
    return next;
  }

  list(input?: {
    limit?: number;
    scope?: AdminAuditScope;
    action?: string;
    actorId?: string;
  }): AdminAuditLog[] {
    const limit = this.clampInt(input?.limit ?? 100, 1, 1000);
    const action = input?.action?.trim().toLowerCase();
    const actorId = input?.actorId?.trim().toLowerCase();
    return this.readLogs()
      .filter((item) => {
        if (input?.scope && item.scope !== input.scope) {
          return false;
        }
        if (action && !item.action.toLowerCase().includes(action)) {
          return false;
        }
        if (actorId && !item.actorId.toLowerCase().includes(actorId)) {
          return false;
        }
        return true;
      })
      .slice(-limit)
      .reverse();
  }

  export(input: {
    format: 'json' | 'csv';
    limit: number;
    scope?: AdminAuditScope;
    action?: string;
    actorId?: string;
  }): { filename: string; contentType: string; body: string } {
    const logs = this.list(input).reverse();
    if (input.format === 'json') {
      return {
        filename: `admin-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify(logs, null, 2)
      };
    }
    const escape = (raw: string) => `"${raw.replaceAll('"', '""')}"`;
    const rows = logs.map((item) =>
      [
        item.id,
        item.at,
        item.scope,
        item.action,
        item.actorId,
        item.actorRole,
        item.requestId ?? '',
        item.targetId ?? '',
        JSON.stringify(item.details)
      ]
        .map((item) => escape(item))
        .join(',')
    );
    return {
      filename: `admin-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`,
      contentType: 'text/csv; charset=utf-8',
      body: ['"id","at","scope","action","actorId","actorRole","requestId","targetId","details"', ...rows].join('\n')
    };
  }

  private readLogs(): AdminAuditLog[] {
    const raw = this.store.getSystemSetting(ADMIN_AUDIT_LOGS_KEY) ?? '';
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed
        .map((item) => this.normalizeLog(item))
        .filter((item): item is AdminAuditLog => item !== null)
        .slice(-ADMIN_AUDIT_LOGS_MAX);
    } catch {
      return [];
    }
  }

  private writeLogs(logs: AdminAuditLog[]): void {
    this.store.setSystemSetting(ADMIN_AUDIT_LOGS_KEY, JSON.stringify(logs.slice(-ADMIN_AUDIT_LOGS_MAX)));
  }

  private normalizeLog(input: unknown): AdminAuditLog | null {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return null;
    }
    const item = input as Record<string, unknown>;
    const scope = item.scope === 'settings' || item.scope === 'tasks' ? item.scope : null;
    const action = typeof item.action === 'string' ? item.action.trim() : '';
    const actorId = typeof item.actorId === 'string' ? item.actorId.trim() : '';
    const actorRole = typeof item.actorRole === 'string' ? item.actorRole.trim() : '';
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const at = typeof item.at === 'string' ? item.at.trim() : '';
    if (!scope || !action || !actorId || !actorRole || !id || !at) {
      return null;
    }
    return {
      id,
      at,
      scope,
      action,
      actorId,
      actorRole,
      requestId: typeof item.requestId === 'string' && item.requestId.trim() ? item.requestId.trim() : null,
      targetId: typeof item.targetId === 'string' && item.targetId.trim() ? item.targetId.trim() : null,
      details: this.normalizeDetails(item.details as Record<string, unknown> | undefined)
    };
  }

  private normalizeDetails(details: Record<string, unknown> | undefined): Record<string, unknown> {
    if (!details || typeof details !== 'object' || Array.isArray(details)) {
      return {};
    }
    return JSON.parse(JSON.stringify(details)) as Record<string, unknown>;
  }

  private clampInt(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, Math.floor(value)));
  }
}
