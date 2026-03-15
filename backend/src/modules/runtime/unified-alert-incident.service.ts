import {
  TaskUnifiedAlertActionLog,
  TaskUnifiedAlertIncident,
  TaskUnifiedAlertIncidentEscalationConfig,
  TaskUnifiedAlertIncidentEscalationLog,
  TaskUnifiedAlertIncidentNotificationDeliveryLog,
  TaskUnifiedAlertIncidentNotificationConfig,
  TaskUnifiedAlertIncidentSlaConfig,
  TaskUnifiedAlertIncidentSlaSummary,
  TaskUnifiedAlertIncidentSlaSummaryItem,
} from '../../core/types.js';
import { env } from '../../config/env.js';
import { SqliteStore } from '../../db/sqlite.js';

const TASK_UNIFIED_ALERT_INCIDENTS_KEY = 'task_unified_alert_incidents';
const TASK_UNIFIED_ALERT_INCIDENT_SLA_CONFIG_KEY = 'task_unified_alert_incident_sla_config';
const TASK_UNIFIED_ALERT_INCIDENT_ESCALATION_LOGS_KEY = 'task_unified_alert_incident_escalation_logs';
const TASK_UNIFIED_ALERT_INCIDENT_ESCALATION_CONFIG_KEY = 'task_unified_alert_incident_escalation_config';
const TASK_UNIFIED_ALERT_INCIDENT_ESCALATION_AUTO_LAST_RUN_AT_KEY = 'task_unified_alert_incident_escalation_auto_last_run_at';
const TASK_UNIFIED_ALERT_INCIDENT_NOTIFICATION_CONFIG_KEY = 'task_unified_alert_incident_notification_config';
const TASK_UNIFIED_ALERT_INCIDENT_NOTIFICATION_DELIVERY_LOGS_KEY = 'task_unified_alert_incident_notification_delivery_logs';

export class UnifiedAlertIncidentService {
  constructor(private readonly store: SqliteStore) {}

  getUnifiedAlertIncidents(input?: { limit?: number; status?: 'open' | 'resolved' }): TaskUnifiedAlertIncident[] {
    const limit = this.clampInt(input?.limit ?? 100, 1, 1000);
    const all = this.readUnifiedAlertIncidents();
    const filtered = input?.status ? all.filter((item) => item.status === input.status) : all;
    return filtered.slice(-limit).reverse();
  }

  updateUnifiedAlertIncident(input: {
    incidentId: string;
    status?: 'open' | 'resolved';
    assignee?: string;
    note?: string;
  }): TaskUnifiedAlertIncident | null {
    const id = input.incidentId.trim();
    if (!id) {
      return null;
    }
    const incidents = this.readUnifiedAlertIncidents();
    const index = incidents.findIndex((item) => item.id === id);
    if (index < 0) {
      return null;
    }
    const now = new Date().toISOString();
    const next: TaskUnifiedAlertIncident = {
      ...incidents[index],
      status: input.status ?? incidents[index].status,
      assignee: input.assignee !== undefined ? input.assignee.trim() || undefined : incidents[index].assignee,
      note: input.note !== undefined ? input.note.trim() || undefined : incidents[index].note,
      updatedAt: now,
    };
    incidents[index] = next;
    this.writeUnifiedAlertIncidents(incidents);
    return next;
  }

  exportUnifiedAlertIncidents(input: { format: 'json' | 'csv'; limit: number; status?: 'open' | 'resolved' }): {
    filename: string;
    contentType: string;
    body: string;
  } {
    const incidents = this.getUnifiedAlertIncidents(input).slice(0, this.clampInt(input.limit, 1, 1000));
    if (input.format === 'json') {
      return {
        filename: `task-unified-alert-incidents-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify(incidents, null, 2),
      };
    }
    const csvEscape = (raw: string): string => `"${raw.replaceAll('"', '""')}"`;
    const rows = incidents.map((item) =>
      [
        item.id,
        item.createdAt,
        item.updatedAt,
        item.status,
        item.level,
        item.reason,
        item.latestActionLogId,
        String(item.occurrenceCount),
        item.assignee ?? '',
        item.note ?? '',
      ]
        .map(csvEscape)
        .join(',')
    );
    return {
      filename: `task-unified-alert-incidents-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`,
      contentType: 'text/csv; charset=utf-8',
      body: ['"id","createdAt","updatedAt","status","level","reason","latestActionLogId","occurrenceCount","assignee","note"', ...rows].join('\n'),
    };
  }

  getUnifiedAlertIncidentSlaConfig(): TaskUnifiedAlertIncidentSlaConfig {
    const raw = this.store.getSystemSetting(TASK_UNIFIED_ALERT_INCIDENT_SLA_CONFIG_KEY) ?? '';
    const fallback: TaskUnifiedAlertIncidentSlaConfig = {
      warnAfterMinutes: 30,
      criticalAfterMinutes: 120,
      escalationAfterMinutes: 240,
      updatedAt: '',
    };
    if (!raw) {
      return fallback;
    }
    try {
      const parsed = JSON.parse(raw) as Partial<TaskUnifiedAlertIncidentSlaConfig>;
      const warn = this.clampInt(Number(parsed.warnAfterMinutes ?? fallback.warnAfterMinutes), 1, 7 * 24 * 60);
      const criticalRaw = this.clampInt(Number(parsed.criticalAfterMinutes ?? fallback.criticalAfterMinutes), 1, 7 * 24 * 60);
      const critical = Math.max(warn + 1, criticalRaw);
      const escalationRaw = this.clampInt(Number(parsed.escalationAfterMinutes ?? fallback.escalationAfterMinutes), 1, 14 * 24 * 60);
      const escalationAfterMinutes = Math.max(critical, escalationRaw);
      return {
        warnAfterMinutes: warn,
        criticalAfterMinutes: critical,
        escalationAfterMinutes,
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : fallback.updatedAt,
      };
    } catch {
      return fallback;
    }
  }

  updateUnifiedAlertIncidentSlaConfig(input: {
    warnAfterMinutes?: number;
    criticalAfterMinutes?: number;
    escalationAfterMinutes?: number;
  }): TaskUnifiedAlertIncidentSlaConfig {
    const current = this.getUnifiedAlertIncidentSlaConfig();
    const warn = this.clampInt(input.warnAfterMinutes ?? current.warnAfterMinutes, 1, 7 * 24 * 60);
    const critical = Math.max(warn + 1, this.clampInt(input.criticalAfterMinutes ?? current.criticalAfterMinutes, 1, 7 * 24 * 60));
    const escalationAfterMinutes = Math.max(
      critical,
      this.clampInt(input.escalationAfterMinutes ?? current.escalationAfterMinutes, 1, 14 * 24 * 60)
    );
    const next: TaskUnifiedAlertIncidentSlaConfig = {
      warnAfterMinutes: warn,
      criticalAfterMinutes: critical,
      escalationAfterMinutes,
      updatedAt: new Date().toISOString(),
    };
    this.store.setSystemSetting(TASK_UNIFIED_ALERT_INCIDENT_SLA_CONFIG_KEY, JSON.stringify(next));
    return next;
  }

  getUnifiedAlertIncidentEscalationConfig(): TaskUnifiedAlertIncidentEscalationConfig {
    const raw = this.store.getSystemSetting(TASK_UNIFIED_ALERT_INCIDENT_ESCALATION_CONFIG_KEY) ?? '';
    const fallback: TaskUnifiedAlertIncidentEscalationConfig = {
      autoEnabled: true,
      autoCooldownMinutes: 10,
      updatedAt: '',
    };
    if (!raw) {
      return fallback;
    }
    try {
      const parsed = JSON.parse(raw) as Partial<TaskUnifiedAlertIncidentEscalationConfig>;
      return {
        autoEnabled: parsed.autoEnabled !== false,
        autoCooldownMinutes: this.clampInt(Number(parsed.autoCooldownMinutes ?? fallback.autoCooldownMinutes), 1, 24 * 60),
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : fallback.updatedAt,
      };
    } catch {
      return fallback;
    }
  }

  updateUnifiedAlertIncidentEscalationConfig(input: {
    autoEnabled?: boolean;
    autoCooldownMinutes?: number;
  }): TaskUnifiedAlertIncidentEscalationConfig {
    const current = this.getUnifiedAlertIncidentEscalationConfig();
    const next: TaskUnifiedAlertIncidentEscalationConfig = {
      autoEnabled: input.autoEnabled ?? current.autoEnabled,
      autoCooldownMinutes: this.clampInt(input.autoCooldownMinutes ?? current.autoCooldownMinutes, 1, 24 * 60),
      updatedAt: new Date().toISOString(),
    };
    this.store.setSystemSetting(TASK_UNIFIED_ALERT_INCIDENT_ESCALATION_CONFIG_KEY, JSON.stringify(next));
    return next;
  }

  getUnifiedAlertIncidentNotificationConfig(): TaskUnifiedAlertIncidentNotificationConfig {
    const raw = this.store.getSystemSetting(TASK_UNIFIED_ALERT_INCIDENT_NOTIFICATION_CONFIG_KEY) ?? '';
    const fallback: TaskUnifiedAlertIncidentNotificationConfig = {
      enabled: env.unifiedAlertNotificationEnabled,
      endpoint: env.unifiedAlertNotificationEndpoint.trim(),
      authHeader: env.unifiedAlertNotificationAuthHeader.trim(),
      timeoutMs: this.clampInt(
        Number.isFinite(env.unifiedAlertNotificationTimeoutMs) ? env.unifiedAlertNotificationTimeoutMs : 5000,
        500,
        60_000
      ),
      maxRetries: this.clampInt(Number.isFinite(env.unifiedAlertNotificationMaxRetries) ? env.unifiedAlertNotificationMaxRetries : 3, 0, 10),
      retryBaseDelaySeconds: this.clampInt(
        Number.isFinite(env.unifiedAlertNotificationRetryBaseDelaySeconds) ? env.unifiedAlertNotificationRetryBaseDelaySeconds : 30,
        1,
        3600
      ),
      updatedAt: '',
    };
    if (!raw) {
      return fallback;
    }
    try {
      const parsed = JSON.parse(raw) as Partial<TaskUnifiedAlertIncidentNotificationConfig>;
      return {
        enabled: parsed.enabled === true,
        endpoint: typeof parsed.endpoint === 'string' ? parsed.endpoint : '',
        authHeader: typeof parsed.authHeader === 'string' ? parsed.authHeader : '',
        timeoutMs: this.clampInt(Number(parsed.timeoutMs ?? fallback.timeoutMs), 500, 60_000),
        maxRetries: this.clampInt(Number(parsed.maxRetries ?? fallback.maxRetries), 0, 10),
        retryBaseDelaySeconds: this.clampInt(Number(parsed.retryBaseDelaySeconds ?? fallback.retryBaseDelaySeconds), 1, 3600),
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
      };
    } catch {
      return fallback;
    }
  }

  updateUnifiedAlertIncidentNotificationConfig(input: {
    enabled?: boolean;
    endpoint?: string;
    authHeader?: string;
    timeoutMs?: number;
    maxRetries?: number;
    retryBaseDelaySeconds?: number;
  }): TaskUnifiedAlertIncidentNotificationConfig {
    const current = this.getUnifiedAlertIncidentNotificationConfig();
    const next: TaskUnifiedAlertIncidentNotificationConfig = {
      enabled: input.enabled ?? current.enabled,
      endpoint: input.endpoint !== undefined ? input.endpoint.trim() : current.endpoint,
      authHeader: input.authHeader !== undefined ? input.authHeader.trim() : current.authHeader,
      timeoutMs: this.clampInt(input.timeoutMs ?? current.timeoutMs, 500, 60_000),
      maxRetries: this.clampInt(input.maxRetries ?? current.maxRetries, 0, 10),
      retryBaseDelaySeconds: this.clampInt(input.retryBaseDelaySeconds ?? current.retryBaseDelaySeconds, 1, 3600),
      updatedAt: new Date().toISOString(),
    };
    this.store.setSystemSetting(TASK_UNIFIED_ALERT_INCIDENT_NOTIFICATION_CONFIG_KEY, JSON.stringify(next));
    return next;
  }

  getUnifiedAlertIncidentSlaSummary(input?: { limit?: number; nowIso?: string }): TaskUnifiedAlertIncidentSlaSummary {
    const config = this.getUnifiedAlertIncidentSlaConfig();
    const incidents = this.readUnifiedAlertIncidents();
    const now = input?.nowIso ? Date.parse(input.nowIso) : Date.now();
    const safeNow = Number.isFinite(now) ? now : Date.now();
    const openIncidents = incidents.filter((item) => item.status === 'open');
    const resolvedTotal = incidents.length - openIncidents.length;
    const byLevelOpen = {
      green: openIncidents.filter((item) => item.level === 'green').length,
      yellow: openIncidents.filter((item) => item.level === 'yellow').length,
      red: openIncidents.filter((item) => item.level === 'red').length,
    };
    const items = openIncidents.map<TaskUnifiedAlertIncidentSlaSummaryItem>((item) => {
      const createdAtMs = Date.parse(item.createdAt);
      const ageMinutes = Number.isFinite(createdAtMs) ? Math.max(0, Math.floor((safeNow - createdAtMs) / 60_000)) : 0;
      const slaLevel: 'green' | 'yellow' | 'red' =
        ageMinutes >= config.criticalAfterMinutes ? 'red' : ageMinutes >= config.warnAfterMinutes ? 'yellow' : 'green';
      const shouldEscalate = ageMinutes >= config.escalationAfterMinutes && !item.assignee;
      return {
        incidentId: item.id,
        status: item.status,
        level: item.level,
        ageMinutes,
        slaLevel,
        shouldEscalate,
        assignee: item.assignee,
      };
    });
    const warnTotal = items.filter((item) => item.slaLevel === 'yellow').length;
    const criticalTotal = items.filter((item) => item.slaLevel === 'red').length;
    const escalationCandidateTotal = items.filter((item) => item.shouldEscalate).length;
    const limit = this.clampInt(input?.limit ?? 10, 1, 200);
    const topAging = [...items].sort((a, b) => b.ageMinutes - a.ageMinutes).slice(0, limit);
    return {
      generatedAt: new Date(safeNow).toISOString(),
      config,
      openTotal: openIncidents.length,
      resolvedTotal,
      warnTotal,
      criticalTotal,
      escalationCandidateTotal,
      byLevelOpen,
      topAging,
    };
  }

  triggerUnifiedAlertIncidentEscalations(input?: { limit?: number; actor?: string }): {
    created: number;
    skipped: number;
    logs: TaskUnifiedAlertIncidentEscalationLog[];
  } {
    const config = this.getUnifiedAlertIncidentSlaConfig();
    const nowMs = Date.now();
    const actor = input?.actor?.trim() || undefined;
    const limit = this.clampInt(input?.limit ?? 20, 1, 200);
    const incidents = this.readUnifiedAlertIncidents()
      .filter((item) => item.status === 'open' && !item.assignee)
      .map((item) => {
        const createdMs = Date.parse(item.createdAt);
        const ageMinutes = Number.isFinite(createdMs) ? Math.max(0, Math.floor((nowMs - createdMs) / 60_000)) : 0;
        return { item, ageMinutes };
      })
      .filter((item) => item.ageMinutes >= config.escalationAfterMinutes)
      .sort((a, b) => b.ageMinutes - a.ageMinutes)
      .slice(0, limit);

    const existingLogs = this.readUnifiedAlertIncidentEscalationLogs();
    const createdLogs: TaskUnifiedAlertIncidentEscalationLog[] = [];
    let skipped = 0;
    for (const candidate of incidents) {
      const allLogs = [...existingLogs, ...createdLogs];
      const last = [...allLogs].reverse().find((log) => log.incidentId === candidate.item.id);
      const lastMs = last ? Date.parse(last.at) : 0;
      if (Number.isFinite(lastMs) && nowMs - lastMs < 60_000) {
        skipped += 1;
        continue;
      }
      createdLogs.push({
        id: `tuesc_${nowMs}_${Math.random().toString(36).slice(2, 8)}`,
        at: new Date(nowMs).toISOString(),
        incidentId: candidate.item.id,
        actor,
        ageMinutes: candidate.ageMinutes,
        reason: `age=${candidate.ageMinutes}m >= escalation=${config.escalationAfterMinutes}m`,
        notificationStatus: 'pending',
        notificationAttempt: 0,
      });
    }
    if (createdLogs.length > 0) {
      this.writeUnifiedAlertIncidentEscalationLogs([...existingLogs, ...createdLogs]);
    }
    return {
      created: createdLogs.length,
      skipped,
      logs: createdLogs,
    };
  }

  getUnifiedAlertIncidentEscalationLogs(input?: { limit?: number; incidentId?: string }): TaskUnifiedAlertIncidentEscalationLog[] {
    const limit = this.clampInt(input?.limit ?? 100, 1, 1000);
    const incidentId = input?.incidentId?.trim() || '';
    const all = this.readUnifiedAlertIncidentEscalationLogs();
    const filtered = incidentId ? all.filter((item) => item.incidentId === incidentId) : all;
    return filtered.slice(-limit).reverse();
  }

  exportUnifiedAlertIncidentEscalationLogs(input: { format: 'json' | 'csv'; limit: number; incidentId?: string }): {
    filename: string;
    contentType: string;
    body: string;
  } {
    const logs = this.getUnifiedAlertIncidentEscalationLogs(input).slice(0, this.clampInt(input.limit, 1, 1000));
    if (input.format === 'json') {
      return {
        filename: `task-unified-alert-incident-escalations-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify(logs, null, 2),
      };
    }
    const csvEscape = (raw: string): string => `"${raw.replaceAll('"', '""')}"`;
    const rows = logs.map((item) =>
      [
        item.id,
        item.at,
        item.incidentId,
        item.actor ?? '',
        String(item.ageMinutes),
        item.reason,
        item.notificationStatus,
        item.notifiedAt ?? '',
        item.notificationMessage ?? '',
      ]
        .map(csvEscape)
        .join(',')
    );
    return {
      filename: `task-unified-alert-incident-escalations-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`,
      contentType: 'text/csv; charset=utf-8',
      body: ['"id","at","incidentId","actor","ageMinutes","reason","notificationStatus","notifiedAt","notificationMessage"', ...rows].join('\n'),
    };
  }

  updateUnifiedAlertIncidentEscalationNotification(input: {
    escalationId: string;
    notificationStatus: 'pending' | 'sent' | 'failed';
    notificationMessage?: string;
  }): TaskUnifiedAlertIncidentEscalationLog | null {
    const escalationId = input.escalationId.trim();
    if (!escalationId) {
      return null;
    }
    const logs = this.readUnifiedAlertIncidentEscalationLogs();
    const index = logs.findIndex((item) => item.id === escalationId);
    if (index < 0) {
      return null;
    }
    const status = input.notificationStatus;
    const next: TaskUnifiedAlertIncidentEscalationLog = {
      ...logs[index],
      notificationStatus: status,
      notificationAttempt: status === 'pending' ? 0 : logs[index].notificationAttempt,
      nextRetryAt: status === 'pending' ? undefined : logs[index].nextRetryAt,
      notifiedAt: status === 'pending' ? undefined : new Date().toISOString(),
      notificationMessage: input.notificationMessage?.trim() || undefined,
    };
    logs[index] = next;
    this.writeUnifiedAlertIncidentEscalationLogs(logs);
    return next;
  }

  async processUnifiedAlertIncidentEscalationNotifications(input?: {
    limit?: number;
  }): Promise<{ processed: number; sent: number; failed: number; skipped: number }> {
    const config = this.getUnifiedAlertIncidentNotificationConfig();
    const limit = this.clampInt(input?.limit ?? 20, 1, 200);
    const logs = this.readUnifiedAlertIncidentEscalationLogs();
    const nowMs = Date.now();
    const candidates = logs
      .map((item, index) => ({ item, index }))
      .filter((entry) => {
        if (entry.item.notificationStatus === 'pending') {
          return true;
        }
        if (entry.item.notificationStatus !== 'failed') {
          return false;
        }
        const attempt = this.clampInt(entry.item.notificationAttempt ?? 1, 0, 1000);
        if (attempt >= config.maxRetries) {
          return false;
        }
        const nextRetryAtMs = entry.item.nextRetryAt ? Date.parse(entry.item.nextRetryAt) : 0;
        return !Number.isFinite(nextRetryAtMs) || nextRetryAtMs <= nowMs;
      })
      .slice(0, limit);
    if (candidates.length === 0) {
      return { processed: 0, sent: 0, failed: 0, skipped: 0 };
    }
    let sent = 0;
    let failed = 0;
    let skipped = 0;
    const deliveryLogs = this.readUnifiedAlertIncidentNotificationDeliveryLogs();
    if (!config.enabled || !config.endpoint) {
      for (const entry of candidates) {
        const attempt = this.clampInt(entry.item.notificationAttempt ?? 0, 0, 1000) + 1;
        const nextRetryAt =
          attempt >= config.maxRetries
            ? undefined
            : new Date(Date.now() + this.calculateRetryDelaySeconds(config.retryBaseDelaySeconds, attempt) * 1000).toISOString();
        const message = !config.enabled ? 'notification_disabled' : 'notification_endpoint_missing';
        logs[entry.index] = {
          ...entry.item,
          notificationStatus: 'failed',
          notificationAttempt: attempt,
          nextRetryAt,
          notifiedAt: new Date().toISOString(),
          notificationMessage: message,
        };
        deliveryLogs.push({
          id: `tuind_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          at: new Date().toISOString(),
          escalationId: entry.item.id,
          incidentId: entry.item.incidentId,
          endpoint: config.endpoint || '',
          status: 'failed',
          message,
        });
        failed += 1;
      }
      this.writeUnifiedAlertIncidentEscalationLogs(logs);
      this.writeUnifiedAlertIncidentNotificationDeliveryLogs(deliveryLogs);
      return { processed: candidates.length, sent, failed, skipped };
    }

    const incidents = this.readUnifiedAlertIncidents();
    for (const entry of candidates) {
      const attempt = this.clampInt(entry.item.notificationAttempt ?? 0, 0, 1000) + 1;
      const relatedIncident = incidents.find((incident) => incident.id === entry.item.incidentId);
      const notifyResult = await this.dispatchEscalationNotification(config, entry.item, relatedIncident?.reason ?? '');
      deliveryLogs.push({
        id: `tuind_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        at: new Date().toISOString(),
        escalationId: entry.item.id,
        incidentId: entry.item.incidentId,
        endpoint: config.endpoint,
        status: notifyResult.ok ? 'sent' : 'failed',
        responseCode: notifyResult.responseCode,
        requestId: notifyResult.requestId,
        durationMs: notifyResult.durationMs,
        message: notifyResult.message,
      });
      if (notifyResult.ok) {
        logs[entry.index] = {
          ...entry.item,
          notificationStatus: 'sent',
          notificationAttempt: attempt,
          nextRetryAt: undefined,
          notifiedAt: new Date().toISOString(),
          notificationMessage: notifyResult.message,
        };
        sent += 1;
      } else if (notifyResult.skip) {
        skipped += 1;
      } else {
        const nextRetryAt =
          attempt >= config.maxRetries
            ? undefined
            : new Date(Date.now() + this.calculateRetryDelaySeconds(config.retryBaseDelaySeconds, attempt) * 1000).toISOString();
        logs[entry.index] = {
          ...entry.item,
          notificationStatus: 'failed',
          notificationAttempt: attempt,
          nextRetryAt,
          notifiedAt: new Date().toISOString(),
          notificationMessage: notifyResult.message,
        };
        failed += 1;
      }
    }
    this.writeUnifiedAlertIncidentEscalationLogs(logs);
    this.writeUnifiedAlertIncidentNotificationDeliveryLogs(deliveryLogs);
    return { processed: candidates.length, sent, failed, skipped };
  }

  getUnifiedAlertIncidentNotificationDeliveryLogs(input?: {
    limit?: number;
    escalationId?: string;
    incidentId?: string;
    status?: 'sent' | 'failed';
  }): TaskUnifiedAlertIncidentNotificationDeliveryLog[] {
    const limit = this.clampInt(input?.limit ?? 200, 1, 2000);
    const escalationId = input?.escalationId?.trim() || '';
    const incidentId = input?.incidentId?.trim() || '';
    const status = input?.status;
    const all = this.readUnifiedAlertIncidentNotificationDeliveryLogs();
    const filtered = all.filter((item) => {
      if (escalationId && item.escalationId !== escalationId) {
        return false;
      }
      if (incidentId && item.incidentId !== incidentId) {
        return false;
      }
      if (status && item.status !== status) {
        return false;
      }
      return true;
    });
    return filtered.slice(-limit).reverse();
  }

  exportUnifiedAlertIncidentNotificationDeliveryLogs(input: {
    format: 'json' | 'csv';
    limit: number;
    escalationId?: string;
    incidentId?: string;
    status?: 'sent' | 'failed';
  }): {
    filename: string;
    contentType: string;
    body: string;
  } {
    const logs = this.getUnifiedAlertIncidentNotificationDeliveryLogs(input).slice(0, this.clampInt(input.limit, 1, 2000));
    if (input.format === 'json') {
      return {
        filename: `task-unified-alert-incident-notification-delivery-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify(logs, null, 2),
      };
    }
    const csvEscape = (raw: string): string => `"${raw.replaceAll('"', '""')}"`;
    const rows = logs.map((item) =>
      [
        item.id,
        item.at,
        item.escalationId,
        item.incidentId,
        item.endpoint,
        item.status,
        item.responseCode === undefined ? '' : String(item.responseCode),
        item.requestId ?? '',
        item.durationMs === undefined ? '' : String(item.durationMs),
        item.message ?? '',
      ]
        .map(csvEscape)
        .join(',')
    );
    return {
      filename: `task-unified-alert-incident-notification-delivery-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`,
      contentType: 'text/csv; charset=utf-8',
      body: ['"id","at","escalationId","incidentId","endpoint","status","responseCode","requestId","durationMs","message"', ...rows].join('\n'),
    };
  }

  upsertUnifiedAlertIncident(log: TaskUnifiedAlertActionLog): void {
    const incidents = this.readUnifiedAlertIncidents();
    const openIndex = incidents.findIndex((item) => item.status === 'open' && item.reason === log.reason && item.level === log.level);
    const now = new Date().toISOString();
    if (openIndex >= 0) {
      incidents[openIndex] = {
        ...incidents[openIndex],
        updatedAt: now,
        latestActionLogId: log.id,
        occurrenceCount: incidents[openIndex].occurrenceCount + 1,
      };
      this.writeUnifiedAlertIncidents(incidents);
      return;
    }
    const next: TaskUnifiedAlertIncident = {
      id: `tui_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: now,
      updatedAt: now,
      status: 'open',
      level: log.level,
      reason: log.reason,
      latestActionLogId: log.id,
      occurrenceCount: 1,
    };
    this.writeUnifiedAlertIncidents([...incidents, next]);
  }

  maybeAutoTriggerIncidentEscalations(): void {
    const config = this.getUnifiedAlertIncidentEscalationConfig();
    if (!config.autoEnabled) {
      return;
    }
    const lastRunAtRaw = this.store.getSystemSetting(TASK_UNIFIED_ALERT_INCIDENT_ESCALATION_AUTO_LAST_RUN_AT_KEY) ?? '';
    const nowMs = Date.now();
    if (lastRunAtRaw) {
      const lastRunAtMs = Date.parse(lastRunAtRaw);
      if (Number.isFinite(lastRunAtMs) && nowMs - lastRunAtMs < config.autoCooldownMinutes * 60_000) {
        return;
      }
    }
    this.triggerUnifiedAlertIncidentEscalations({ limit: 20, actor: 'auto' });
    this.store.setSystemSetting(TASK_UNIFIED_ALERT_INCIDENT_ESCALATION_AUTO_LAST_RUN_AT_KEY, new Date(nowMs).toISOString());
  }

  private async dispatchEscalationNotification(
    config: TaskUnifiedAlertIncidentNotificationConfig,
    log: TaskUnifiedAlertIncidentEscalationLog,
    incidentReason: string
  ): Promise<{
    ok: boolean;
    skip?: boolean;
    message: string;
    responseCode?: number;
    requestId?: string;
    durationMs?: number;
  }> {
    if (!config.endpoint) {
      return { ok: false, message: 'notification_endpoint_missing' };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    const startedAt = Date.now();
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (config.authHeader) {
        headers.Authorization = config.authHeader;
      }
      const response = await fetch(config.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          escalationId: log.id,
          incidentId: log.incidentId,
          ageMinutes: log.ageMinutes,
          reason: log.reason,
          incidentReason,
          actor: log.actor,
          at: log.at,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        return {
          ok: false,
          message: `http_${response.status}`,
          responseCode: response.status,
          requestId: response.headers.get('x-request-id') ?? undefined,
          durationMs: Date.now() - startedAt,
        };
      }
      return {
        ok: true,
        message: 'delivered',
        responseCode: response.status,
        requestId: response.headers.get('x-request-id') ?? undefined,
        durationMs: Date.now() - startedAt,
      };
    } catch (err) {
      const text = err instanceof Error ? err.message : 'notification_error';
      return { ok: false, message: text, durationMs: Date.now() - startedAt };
    } finally {
      clearTimeout(timer);
    }
  }

  private readUnifiedAlertIncidents(): TaskUnifiedAlertIncident[] {
    const raw = this.store.getSystemSetting(TASK_UNIFIED_ALERT_INCIDENTS_KEY) ?? '';
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed
        .filter((item): item is TaskUnifiedAlertIncident => Boolean(item && typeof item === 'object'))
        .map<TaskUnifiedAlertIncident>((item) => {
          const status: 'open' | 'resolved' = item.status === 'resolved' ? 'resolved' : 'open';
          return {
            id: typeof item.id === 'string' ? item.id : '',
            createdAt: typeof item.createdAt === 'string' ? item.createdAt : '',
            updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : '',
            status,
            level: (item.level === 'red' ? 'red' : item.level === 'green' ? 'green' : 'yellow') as 'green' | 'yellow' | 'red',
            reason: typeof item.reason === 'string' ? item.reason : '',
            latestActionLogId: typeof item.latestActionLogId === 'string' ? item.latestActionLogId : '',
            occurrenceCount: typeof item.occurrenceCount === 'number' ? this.clampInt(item.occurrenceCount, 1, 1_000_000) : 1,
            assignee: typeof item.assignee === 'string' ? item.assignee : undefined,
            note: typeof item.note === 'string' ? item.note : undefined,
          };
        })
        .filter((item) => item.id && item.createdAt && item.updatedAt);
    } catch {
      return [];
    }
  }

  private writeUnifiedAlertIncidents(incidents: TaskUnifiedAlertIncident[]): void {
    const normalized = incidents.slice(-1000);
    this.store.setSystemSetting(TASK_UNIFIED_ALERT_INCIDENTS_KEY, JSON.stringify(normalized));
  }

  private readUnifiedAlertIncidentEscalationLogs(): TaskUnifiedAlertIncidentEscalationLog[] {
    const raw = this.store.getSystemSetting(TASK_UNIFIED_ALERT_INCIDENT_ESCALATION_LOGS_KEY) ?? '';
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed
        .filter((item): item is TaskUnifiedAlertIncidentEscalationLog => Boolean(item && typeof item === 'object'))
        .map<TaskUnifiedAlertIncidentEscalationLog>((item) => {
          const notificationStatus: 'pending' | 'sent' | 'failed' =
            item.notificationStatus === 'sent' ? 'sent' : item.notificationStatus === 'failed' ? 'failed' : 'pending';
          return {
            id: typeof item.id === 'string' ? item.id : '',
            at: typeof item.at === 'string' ? item.at : '',
            incidentId: typeof item.incidentId === 'string' ? item.incidentId : '',
            actor: typeof item.actor === 'string' ? item.actor : undefined,
            ageMinutes: typeof item.ageMinutes === 'number' ? this.clampInt(item.ageMinutes, 0, 365 * 24 * 60) : 0,
            reason: typeof item.reason === 'string' ? item.reason : '',
            notificationStatus,
            notificationAttempt: typeof item.notificationAttempt === 'number' ? this.clampInt(item.notificationAttempt, 0, 1000) : undefined,
            nextRetryAt: typeof item.nextRetryAt === 'string' ? item.nextRetryAt : undefined,
            notifiedAt: typeof item.notifiedAt === 'string' ? item.notifiedAt : undefined,
            notificationMessage: typeof item.notificationMessage === 'string' ? item.notificationMessage : undefined,
          };
        })
        .filter((item) => item.id && item.at && item.incidentId);
    } catch {
      return [];
    }
  }

  private writeUnifiedAlertIncidentEscalationLogs(logs: TaskUnifiedAlertIncidentEscalationLog[]): void {
    const normalized = logs.slice(-2000);
    this.store.setSystemSetting(TASK_UNIFIED_ALERT_INCIDENT_ESCALATION_LOGS_KEY, JSON.stringify(normalized));
  }

  private readUnifiedAlertIncidentNotificationDeliveryLogs(): TaskUnifiedAlertIncidentNotificationDeliveryLog[] {
    const raw = this.store.getSystemSetting(TASK_UNIFIED_ALERT_INCIDENT_NOTIFICATION_DELIVERY_LOGS_KEY) ?? '';
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed
        .filter((item): item is TaskUnifiedAlertIncidentNotificationDeliveryLog => Boolean(item && typeof item === 'object'))
        .map<TaskUnifiedAlertIncidentNotificationDeliveryLog>((item) => {
          const status: 'sent' | 'failed' = item.status === 'sent' ? 'sent' : 'failed';
          return {
            id: typeof item.id === 'string' ? item.id : '',
            at: typeof item.at === 'string' ? item.at : '',
            escalationId: typeof item.escalationId === 'string' ? item.escalationId : '',
            incidentId: typeof item.incidentId === 'string' ? item.incidentId : '',
            endpoint: typeof item.endpoint === 'string' ? item.endpoint : '',
            status,
            responseCode: typeof item.responseCode === 'number' ? this.clampInt(item.responseCode, 100, 599) : undefined,
            requestId: typeof item.requestId === 'string' ? item.requestId : undefined,
            durationMs: typeof item.durationMs === 'number' ? this.clampInt(item.durationMs, 0, 120_000) : undefined,
            message: typeof item.message === 'string' ? item.message : undefined,
          };
        })
        .filter((item) => item.id && item.at && item.escalationId && item.incidentId);
    } catch {
      return [];
    }
  }

  private writeUnifiedAlertIncidentNotificationDeliveryLogs(logs: TaskUnifiedAlertIncidentNotificationDeliveryLog[]): void {
    const normalized = logs.slice(-5000);
    this.store.setSystemSetting(TASK_UNIFIED_ALERT_INCIDENT_NOTIFICATION_DELIVERY_LOGS_KEY, JSON.stringify(normalized));
  }

  private calculateRetryDelaySeconds(baseDelaySeconds: number, attempt: number): number {
    const safeBase = this.clampInt(baseDelaySeconds, 1, 3600);
    const safeAttempt = this.clampInt(attempt, 1, 10);
    return Math.min(24 * 3600, safeBase * 2 ** (safeAttempt - 1));
  }

  private clampInt(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, Math.trunc(value)));
  }
}
