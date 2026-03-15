import type { TaskQuotaConfig, TaskQuotaRejectEvent, TaskQuotaUsage, TaskQuotaUsageEvent } from '../../core/types.js';
import { SqliteStore } from '../../db/sqlite.js';

type TaskQuotaTier = 'standard' | 'pro' | 'enterprise';
type TaskQuotaLimitSource = 'default' | 'tier_limit' | 'project_override';

const TASK_QUOTA_DAILY_VIDEO_DEFAULT_KEY = 'task_quota_daily_video_default';
const TASK_QUOTA_DAILY_VIDEO_OVERRIDES_KEY = 'task_quota_daily_video_overrides';
const TASK_QUOTA_DAILY_VIDEO_TIER_LIMITS_KEY = 'task_quota_daily_video_tier_limits';
const TASK_QUOTA_PROJECT_TIER_OVERRIDES_KEY = 'task_quota_project_tier_overrides';
const TASK_QUOTA_UPDATED_AT_KEY = 'task_quota_updated_at';
const TASK_QUOTA_REJECT_EVENTS_KEY = 'task_quota_reject_events';
const TASK_QUOTA_USAGE_EVENTS_KEY = 'task_quota_usage_events';

export class TaskQuotaService {
  constructor(private readonly store: SqliteStore) {}

  getTaskQuotaConfig(): TaskQuotaConfig {
    const dailyDefault = this.readBoundedIntSetting(TASK_QUOTA_DAILY_VIDEO_DEFAULT_KEY, 200, 1, 100_000);
    const rawOverrides = this.store.getSystemSetting(TASK_QUOTA_DAILY_VIDEO_OVERRIDES_KEY) ?? '';
    const overrides = this.parseQuotaOverrides(rawOverrides);
    const rawTierLimits = this.store.getSystemSetting(TASK_QUOTA_DAILY_VIDEO_TIER_LIMITS_KEY) ?? '';
    const tierLimits = this.parseQuotaTierLimits(rawTierLimits, dailyDefault);
    const rawProjectTierOverrides = this.store.getSystemSetting(TASK_QUOTA_PROJECT_TIER_OVERRIDES_KEY) ?? '';
    const projectTierOverrides = this.parseProjectTierOverrides(rawProjectTierOverrides);
    const updatedAt = this.store.getSystemSetting(TASK_QUOTA_UPDATED_AT_KEY) ?? '';
    return {
      dailyVideoTaskDefault: dailyDefault,
      dailyVideoTaskOverrides: overrides,
      dailyVideoTaskTierLimits: tierLimits,
      projectTierOverrides,
      updatedAt,
    };
  }

  updateTaskQuotaConfig(input: {
    dailyVideoTaskDefault?: number;
    dailyVideoTaskOverrides?: Record<string, number>;
    dailyVideoTaskTierLimits?: Partial<Record<TaskQuotaTier, number>>;
    projectTierOverrides?: Record<string, TaskQuotaTier>;
  }): TaskQuotaConfig {
    const current = this.getTaskQuotaConfig();
    const dailyDefault = this.clampInt(input.dailyVideoTaskDefault ?? current.dailyVideoTaskDefault, 1, 100_000);
    const overrides = input.dailyVideoTaskOverrides
      ? this.normalizeQuotaOverrides(input.dailyVideoTaskOverrides)
      : current.dailyVideoTaskOverrides;
    const tierLimits = input.dailyVideoTaskTierLimits
      ? this.normalizeQuotaTierLimits(input.dailyVideoTaskTierLimits, dailyDefault)
      : this.normalizeQuotaTierLimits(current.dailyVideoTaskTierLimits ?? {}, dailyDefault);
    const projectTierOverrides = input.projectTierOverrides
      ? this.normalizeProjectTierOverrides(input.projectTierOverrides)
      : this.normalizeProjectTierOverrides(current.projectTierOverrides ?? {});
    const updatedAt = new Date().toISOString();
    this.store.setSystemSetting(TASK_QUOTA_DAILY_VIDEO_DEFAULT_KEY, String(dailyDefault));
    this.store.setSystemSetting(TASK_QUOTA_DAILY_VIDEO_OVERRIDES_KEY, JSON.stringify(overrides));
    this.store.setSystemSetting(TASK_QUOTA_DAILY_VIDEO_TIER_LIMITS_KEY, JSON.stringify(tierLimits));
    this.store.setSystemSetting(TASK_QUOTA_PROJECT_TIER_OVERRIDES_KEY, JSON.stringify(projectTierOverrides));
    this.store.setSystemSetting(TASK_QUOTA_UPDATED_AT_KEY, updatedAt);
    return {
      dailyVideoTaskDefault: dailyDefault,
      dailyVideoTaskOverrides: overrides,
      dailyVideoTaskTierLimits: tierLimits,
      projectTierOverrides,
      updatedAt,
    };
  }

  getTaskQuotaUsage(projectId: string): TaskQuotaUsage {
    const config = this.getTaskQuotaConfig();
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const date = start.toISOString().slice(0, 10);
    const quotaResolved = this.resolveDailyQuotaLimit({
      projectId,
      dailyDefault: config.dailyVideoTaskDefault,
      overrides: config.dailyVideoTaskOverrides,
      tierLimits: config.dailyVideoTaskTierLimits ?? {},
      projectTierOverrides: config.projectTierOverrides ?? {},
    });
    const dailyLimit = quotaResolved.dailyLimit;
    const used = this.store.countVideoTasksCreatedBetween(projectId, start.toISOString(), end.toISOString());
    return {
      projectId,
      date,
      dailyLimit,
      used,
      remaining: Math.max(0, dailyLimit - used),
      tier: quotaResolved.tier,
      limitSource: quotaResolved.limitSource,
    };
  }

  getTaskQuotaRejectEvents(input?: { limit?: number; projectId?: string }): TaskQuotaRejectEvent[] {
    const limit = this.clampInt(input?.limit ?? 50, 1, 500);
    const projectId = input?.projectId?.trim();
    const events = this.readTaskQuotaRejectEvents();
    const filtered = projectId ? events.filter((item) => item.projectId === projectId) : events;
    return filtered.slice(-limit).reverse();
  }

  exportTaskQuotaRejectEvents(input: {
    format: 'json' | 'csv';
    limit?: number;
    projectId?: string;
  }): { filename: string; contentType: string; body: string } {
    const events = this.getTaskQuotaRejectEvents(input).slice().reverse();
    if (input.format === 'json') {
      return {
        filename: `task-quota-reject-events-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify(events, null, 2),
      };
    }
    const csvEscape = (raw: string): string => `"${raw.replaceAll('"', '""')}"`;
    const rows = events.map((item) =>
      [item.id, item.at, item.projectId, item.date, String(item.used), String(item.dailyLimit), item.reason, item.tier ?? '', item.limitSource ?? '']
        .map(csvEscape)
        .join(',')
    );
    return {
      filename: `task-quota-reject-events-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`,
      contentType: 'text/csv; charset=utf-8',
      body: ['"id","at","projectId","date","used","dailyLimit","reason","tier","limitSource"', ...rows].join('\n'),
    };
  }

  getTaskQuotaUsageEvents(input?: { limit?: number; projectId?: string }): TaskQuotaUsageEvent[] {
    const limit = this.clampInt(input?.limit ?? 100, 1, 1000);
    const projectId = input?.projectId?.trim();
    const events = this.readTaskQuotaUsageEvents();
    const filtered = projectId ? events.filter((item) => item.projectId === projectId) : events;
    return filtered.slice(-limit).reverse();
  }

  exportTaskQuotaUsageEvents(input: {
    format: 'json' | 'csv';
    limit?: number;
    projectId?: string;
  }): { filename: string; contentType: string; body: string } {
    const events = this.getTaskQuotaUsageEvents(input).slice().reverse();
    if (input.format === 'json') {
      return {
        filename: `task-quota-usage-events-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify(events, null, 2),
      };
    }
    const csvEscape = (raw: string): string => `"${raw.replaceAll('"', '""')}"`;
    const rows = events.map((item) =>
      [
        item.id,
        item.at,
        item.projectId,
        item.taskId,
        item.storyboardId,
        item.date,
        String(item.consumed),
        String(item.usedAfter),
        String(item.dailyLimit),
        item.tier ?? '',
        item.limitSource ?? '',
      ]
        .map(csvEscape)
        .join(',')
    );
    return {
      filename: `task-quota-usage-events-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`,
      contentType: 'text/csv; charset=utf-8',
      body: ['"id","at","projectId","taskId","storyboardId","date","consumed","usedAfter","dailyLimit","tier","limitSource"', ...rows].join(
        '\n'
      ),
    };
  }

  private parseQuotaOverrides(raw: string): Record<string, number> {
    if (!raw) {
      return {};
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {};
      }
      return this.normalizeQuotaOverrides(parsed as Record<string, number>);
    } catch {
      return {};
    }
  }

  private normalizeQuotaOverrides(input: Record<string, number>): Record<string, number> {
    const output: Record<string, number> = {};
    for (const [projectId, value] of Object.entries(input)) {
      const id = projectId.trim();
      if (!id) {
        continue;
      }
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) {
        continue;
      }
      output[id] = this.clampInt(parsed, 1, 100_000);
    }
    return output;
  }

  private parseQuotaTierLimits(raw: string, dailyDefault: number): Partial<Record<TaskQuotaTier, number>> {
    if (!raw) {
      return this.normalizeQuotaTierLimits({}, dailyDefault);
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return this.normalizeQuotaTierLimits({}, dailyDefault);
      }
      return this.normalizeQuotaTierLimits(parsed as Partial<Record<TaskQuotaTier, number>>, dailyDefault);
    } catch {
      return this.normalizeQuotaTierLimits({}, dailyDefault);
    }
  }

  private normalizeQuotaTierLimits(
    input: Partial<Record<TaskQuotaTier, number>>,
    dailyDefault: number
  ): Partial<Record<TaskQuotaTier, number>> {
    const fallbackPro = this.clampInt(Math.max(dailyDefault * 2, 400), 1, 100_000);
    const fallbackEnterprise = this.clampInt(Math.max(dailyDefault * 5, 1000), 1, 100_000);
    const toBounded = (value: unknown, fallback: number): number => {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) {
        return fallback;
      }
      return this.clampInt(parsed, 1, 100_000);
    };
    return {
      standard: toBounded(input.standard, dailyDefault),
      pro: toBounded(input.pro, fallbackPro),
      enterprise: toBounded(input.enterprise, fallbackEnterprise),
    };
  }

  private parseProjectTierOverrides(raw: string): Record<string, TaskQuotaTier> {
    if (!raw) {
      return {};
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {};
      }
      return this.normalizeProjectTierOverrides(parsed as Record<string, TaskQuotaTier>);
    } catch {
      return {};
    }
  }

  private normalizeProjectTierOverrides(input: Record<string, TaskQuotaTier>): Record<string, TaskQuotaTier> {
    const output: Record<string, TaskQuotaTier> = {};
    for (const [projectId, value] of Object.entries(input)) {
      const id = projectId.trim();
      if (!id) {
        continue;
      }
      if (value !== 'standard' && value !== 'pro' && value !== 'enterprise') {
        continue;
      }
      output[id] = value;
    }
    return output;
  }

  private resolveDailyQuotaLimit(input: {
    projectId: string;
    dailyDefault: number;
    overrides: Record<string, number>;
    tierLimits: Partial<Record<TaskQuotaTier, number>>;
    projectTierOverrides: Record<string, TaskQuotaTier>;
  }): { dailyLimit: number; tier?: TaskQuotaTier; limitSource: TaskQuotaLimitSource } {
    const overrideLimit = input.overrides[input.projectId];
    if (typeof overrideLimit === 'number' && Number.isFinite(overrideLimit) && overrideLimit > 0) {
      return {
        dailyLimit: this.clampInt(overrideLimit, 1, 100_000),
        tier: input.projectTierOverrides[input.projectId],
        limitSource: 'project_override',
      };
    }
    const tier = input.projectTierOverrides[input.projectId];
    if (tier && typeof input.tierLimits[tier] === 'number') {
      return {
        dailyLimit: this.clampInt(Number(input.tierLimits[tier]), 1, 100_000),
        tier,
        limitSource: 'tier_limit',
      };
    }
    return {
      dailyLimit: this.clampInt(input.dailyDefault, 1, 100_000),
      tier,
      limitSource: 'default',
    };
  }

  private readTaskQuotaRejectEvents(): TaskQuotaRejectEvent[] {
    const raw = this.store.getSystemSetting(TASK_QUOTA_REJECT_EVENTS_KEY) ?? '';
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
        .map((item) => {
          const tierRaw = item.tier;
          const tier: 'standard' | 'pro' | 'enterprise' | undefined =
            tierRaw === 'standard' || tierRaw === 'pro' || tierRaw === 'enterprise' ? tierRaw : undefined;
          const limitSourceRaw = item.limitSource;
          const limitSource: 'default' | 'tier_limit' | 'project_override' | undefined =
            limitSourceRaw === 'default' || limitSourceRaw === 'tier_limit' || limitSourceRaw === 'project_override'
              ? limitSourceRaw
              : undefined;
          return {
            id: typeof item.id === 'string' ? item.id : '',
            at: typeof item.at === 'string' ? item.at : '',
            projectId: typeof item.projectId === 'string' ? item.projectId : '',
            date: typeof item.date === 'string' ? item.date : '',
            used: typeof item.used === 'number' ? item.used : 0,
            dailyLimit: typeof item.dailyLimit === 'number' ? item.dailyLimit : 0,
            reason: typeof item.reason === 'string' ? item.reason : '',
            tier,
            limitSource,
          };
        })
        .filter((item) => item.id && item.at && item.projectId);
    } catch {
      return [];
    }
  }

  private readTaskQuotaUsageEvents(): TaskQuotaUsageEvent[] {
    const raw = this.store.getSystemSetting(TASK_QUOTA_USAGE_EVENTS_KEY) ?? '';
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
        .map((item) => {
          const tierRaw = item.tier;
          const tier: 'standard' | 'pro' | 'enterprise' | undefined =
            tierRaw === 'standard' || tierRaw === 'pro' || tierRaw === 'enterprise' ? tierRaw : undefined;
          const limitSourceRaw = item.limitSource;
          const limitSource: 'default' | 'tier_limit' | 'project_override' | undefined =
            limitSourceRaw === 'default' || limitSourceRaw === 'tier_limit' || limitSourceRaw === 'project_override'
              ? limitSourceRaw
              : undefined;
          return {
            id: typeof item.id === 'string' ? item.id : '',
            at: typeof item.at === 'string' ? item.at : '',
            projectId: typeof item.projectId === 'string' ? item.projectId : '',
            taskId: typeof item.taskId === 'string' ? item.taskId : '',
            storyboardId: typeof item.storyboardId === 'string' ? item.storyboardId : '',
            date: typeof item.date === 'string' ? item.date : '',
            consumed: typeof item.consumed === 'number' ? item.consumed : 0,
            usedAfter: typeof item.usedAfter === 'number' ? item.usedAfter : 0,
            dailyLimit: typeof item.dailyLimit === 'number' ? item.dailyLimit : 0,
            tier,
            limitSource,
          };
        })
        .filter((item) => item.id && item.at && item.projectId && item.taskId);
    } catch {
      return [];
    }
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
