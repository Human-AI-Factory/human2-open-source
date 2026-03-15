import { v4 as uuid } from 'uuid';
import { env } from '../../config/env.js';
import {
  ModelConfig,
  PageResult,
  PromptTemplate,
  PromptTemplateVersion,
  TaskCenterFilterPreset,
  TaskRuntimeConfig,
  TeamWorkspaceLayoutTemplate
} from '../../core/types.js';
import { SqliteStore } from '../../db/sqlite.js';
import { nowIso } from '../../utils/time.js';
import { clearProviderLogs, getProviderLogsBreakdown, getProviderLogsStats, listProviderLogs, ProviderLogEntry } from '../pipeline/providers/provider-logs.js';
import {
  AutoRepairAction,
  AutoRepairLogEntry,
  clearAutoRepairLogs,
  getAutoRepairLogStats,
  listAutoRepairLogs
} from '../pipeline/auto-repair-logs.js';

const TASK_CENTER_FILTER_PRESETS_KEY = 'task_center_filter_presets';
const TASK_CENTER_FILTER_PRESETS_MAX = 200;
const TEAM_WORKSPACE_LAYOUT_TEMPLATES_KEY = 'team_workspace_layout_templates';
const TEAM_WORKSPACE_LAYOUT_TEMPLATES_MAX = 300;
const TASK_FAILURE_POLICIES_KEY = 'task_failure_policies';
const BUSINESS_RESET_CONFIRM_TEXT = 'RESET_BUSINESS_DATA';
const TARGET_SCHEMA_VERSION = 4;

type TaskFailurePolicyCode =
  | 'CAPABILITY_MISMATCH'
  | 'PROVIDER_AUTH_FAILED'
  | 'PROVIDER_RATE_LIMITED'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_UNKNOWN';
type TaskFailurePolicyAction = 'retry' | 'recreate_conservative' | 'manual';
type TaskFailurePolicyItem = {
  errorCode: TaskFailurePolicyCode;
  action: TaskFailurePolicyAction;
  preferredMode: 'keep' | 'text' | 'singleImage' | 'startEnd' | 'multiImage' | 'reference';
  disableAudio: boolean;
  priority: 'keep' | 'low' | 'medium' | 'high';
};
type TaskFailurePolicyConfig = {
  updatedAt: string;
  autoApply: boolean;
  maxAutoApplyPerTask: number;
  items: TaskFailurePolicyItem[];
};

const TASK_FAILURE_POLICY_DEFAULTS: TaskFailurePolicyItem[] = [
  {
    errorCode: 'CAPABILITY_MISMATCH',
    action: 'recreate_conservative',
    preferredMode: 'text',
    disableAudio: true,
    priority: 'medium'
  },
  {
    errorCode: 'PROVIDER_AUTH_FAILED',
    action: 'manual',
    preferredMode: 'keep',
    disableAudio: false,
    priority: 'keep'
  },
  {
    errorCode: 'PROVIDER_RATE_LIMITED',
    action: 'retry',
    preferredMode: 'keep',
    disableAudio: false,
    priority: 'low'
  },
  {
    errorCode: 'PROVIDER_TIMEOUT',
    action: 'retry',
    preferredMode: 'keep',
    disableAudio: false,
    priority: 'medium'
  },
  {
    errorCode: 'PROVIDER_UNKNOWN',
    action: 'retry',
    preferredMode: 'keep',
    disableAudio: false,
    priority: 'medium'
  }
];

type OpsSummary = {
  now: string;
  uptimeSec: number;
  env: {
    nodeEnv: string;
    aiProvider: string;
    videoMaxConcurrent: number;
  };
  data: {
    projectCount: number;
    taskCount: number;
    novelCount: number;
    outlineCount: number;
    scriptCount: number;
    storyboardCount: number;
    assetCount: number;
    videoTaskCount: number;
    audioTaskCount: number;
    videoMergeCount: number;
  };
  providerLogs: {
    count: number;
    max: number;
  };
  autoRepairLogs: {
    count: number;
    max: number;
    success: number;
    failed: number;
  };
};

export class SettingsService {
  private readonly startedAt = Date.now();

  constructor(private readonly store: SqliteStore) {}

  listModelConfigs(type?: 'text' | 'image' | 'video' | 'audio'): ModelConfig[] {
    return this.store.listModelConfigs(type);
  }

  getModelConfigById(id: string): ModelConfig | null {
    return this.store.getModelConfigById(id);
  }

  getModelConfigCapabilities(id: string): Record<string, unknown> | null {
    const model = this.store.getModelConfigById(id);
    if (!model) {
      return null;
    }
    return model.capabilities ?? {};
  }

  createModelConfig(input: {
    type: 'text' | 'image' | 'video' | 'audio';
    name: string;
    provider: string;
    manufacturer?: string;
    model?: string;
    authType?: 'bearer' | 'api_key' | 'none';
    endpoint: string;
    endpoints?: Record<string, string>;
    apiKey?: string;
    capabilities?: Record<string, unknown>;
    priority?: number;
    rateLimit?: number;
    isDefault?: boolean;
    enabled?: boolean;
  }): ModelConfig {
    return this.store.createModelConfig({
      id: uuid(),
      type: input.type,
      name: input.name,
      provider: input.provider,
      manufacturer: input.manufacturer ?? input.provider,
      model: input.model ?? input.name,
      authType: input.authType ?? 'bearer',
      endpoint: input.endpoint,
      endpoints: input.endpoints ?? {},
      apiKey: input.apiKey ?? '',
      capabilities: input.capabilities ?? {},
      priority: input.priority ?? 100,
      rateLimit: input.rateLimit ?? 0,
      isDefault: input.isDefault ?? false,
      enabled: input.enabled ?? true
    });
  }

  updateModelConfig(
    id: string,
    input: {
      name?: string;
      provider?: string;
      manufacturer?: string;
      model?: string;
      authType?: 'bearer' | 'api_key' | 'none';
      endpoint?: string;
      endpoints?: Record<string, string>;
      apiKey?: string;
      capabilities?: Record<string, unknown>;
      priority?: number;
      rateLimit?: number;
      isDefault?: boolean;
      enabled?: boolean;
    }
  ): ModelConfig | null {
    return this.store.updateModelConfig(id, input);
  }

  deleteModelConfig(id: string): boolean {
    return this.store.deleteModelConfig(id);
  }

  listPromptTemplates(): PromptTemplate[] {
    return this.store.listPromptTemplates();
  }

  listPromptTemplateVersions(promptId: string): PromptTemplateVersion[] {
    return this.store.listPromptTemplateVersions(promptId);
  }

  updatePromptTemplate(id: string, input: { title?: string; content?: string }): PromptTemplate | null {
    return this.store.updatePromptTemplate(id, input);
  }

  getTaskRuntimeConfig(): TaskRuntimeConfig {
    return this.store.getTaskRuntimeConfig();
  }

  updateTaskRuntimeConfig(input: {
    videoTaskAutoRetry?: number;
    videoTaskRetryDelayMs?: number;
    videoTaskPollIntervalMs?: number;
  }): TaskRuntimeConfig {
    return this.store.updateTaskRuntimeConfig(input);
  }

  getTaskFailurePolicies(): TaskFailurePolicyConfig {
    const raw = this.store.getSystemSetting(TASK_FAILURE_POLICIES_KEY);
    if (!raw) {
      return {
        updatedAt: nowIso(),
        autoApply: false,
        maxAutoApplyPerTask: 1,
        items: TASK_FAILURE_POLICY_DEFAULTS
      };
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      const normalized = this.normalizeTaskFailurePolicyConfig(parsed);
      if (!normalized) {
        return {
          updatedAt: nowIso(),
          autoApply: false,
          maxAutoApplyPerTask: 1,
          items: TASK_FAILURE_POLICY_DEFAULTS
        };
      }
      return normalized;
    } catch {
      return {
        updatedAt: nowIso(),
        autoApply: false,
        maxAutoApplyPerTask: 1,
        items: TASK_FAILURE_POLICY_DEFAULTS
      };
    }
  }

  updateTaskFailurePolicies(input: { autoApply?: boolean; maxAutoApplyPerTask?: number; items: TaskFailurePolicyItem[] }): TaskFailurePolicyConfig {
    const normalized = this.normalizeTaskFailurePolicyConfig({
      updatedAt: nowIso(),
      autoApply: input.autoApply,
      maxAutoApplyPerTask: input.maxAutoApplyPerTask,
      items: input.items
    });
    const result: TaskFailurePolicyConfig = normalized ?? {
      updatedAt: nowIso(),
      autoApply: false,
      maxAutoApplyPerTask: 1,
      items: TASK_FAILURE_POLICY_DEFAULTS
    };
    this.store.setSystemSetting(TASK_FAILURE_POLICIES_KEY, JSON.stringify(result));
    return result;
  }

  listProviderLogs(input: {
    limit?: number;
    provider?: string;
    taskType?: 'text' | 'image' | 'video' | 'audio';
    success?: boolean;
    keyword?: string;
  } = {}): ProviderLogEntry[] {
    return listProviderLogs({
      limit: input.limit ?? 100,
      provider: input.provider,
      taskType: input.taskType,
      success: input.success,
      keyword: input.keyword
    });
  }

  clearProviderLogs(): { removed: number } {
    return { removed: clearProviderLogs() };
  }

  getProviderLogBreakdown(): {
    byProvider: Array<{ provider: string; count: number; failed: number }>;
    byTaskType: Array<{ taskType: 'text' | 'image' | 'video' | 'audio' | 'embedding' | 'asr'; count: number; failed: number }>;
  } {
    return getProviderLogsBreakdown();
  }

  listAutoRepairLogs(input: {
    limit?: number;
    action?: AutoRepairAction;
    errorCode?: string;
    projectId?: string;
    taskId?: string;
    taskIds?: string[];
    success?: boolean;
    keyword?: string;
  } = {}): AutoRepairLogEntry[] {
    return listAutoRepairLogs({
      limit: input.limit ?? 100,
      action: input.action,
      errorCode: input.errorCode,
      projectId: input.projectId,
      taskId: input.taskId,
      taskIds: input.taskIds,
      success: input.success,
      keyword: input.keyword
    });
  }

  clearAutoRepairLogs(): { removed: number } {
    return { removed: clearAutoRepairLogs() };
  }

  getAutoRepairLogStats(): {
    count: number;
    max: number;
    success: number;
    failed: number;
    byErrorCode: Array<{ errorCode: string; count: number; failed: number }>;
    byAction: Array<{ action: AutoRepairAction; count: number; failed: number }>;
  } {
    return getAutoRepairLogStats();
  }

  listVideoMergeErrorStats(input: { limit?: number; projectId?: string }): Array<{ errorCode: string; count: number; latestAt: string }> {
    return this.store.listVideoMergeErrorStats({
      limit: input.limit ?? 10,
      projectId: input.projectId
    });
  }

  getOpsSummary(): OpsSummary {
    return {
      now: nowIso(),
      uptimeSec: Math.floor((Date.now() - this.startedAt) / 1000),
      env: {
        nodeEnv: process.env.NODE_ENV ?? 'development',
        aiProvider: env.aiProvider,
        videoMaxConcurrent: env.videoMaxConcurrent
      },
      data: this.store.getBusinessDataSummary(),
      providerLogs: getProviderLogsStats(),
      autoRepairLogs: getAutoRepairLogStats()
    };
  }

  exportBusinessBackup(): {
    version: string;
    exportedAt: string;
    tables: Record<string, Array<Record<string, unknown>>>;
  } {
    return this.store.exportBusinessBackup();
  }

  importBusinessBackup(input: {
    version: string;
    tables: Record<string, Array<Record<string, unknown>>>;
  }): {
    inserted: Record<string, number>;
    summary: OpsSummary;
  } {
    const result = this.store.importBusinessBackup(input);
    return {
      inserted: result.inserted,
      summary: this.getOpsSummary()
    };
  }

  getMigrationStatus(): {
    currentVersion: number;
    targetVersion: number;
    snapshots: Array<{ fileName: string; path: string; createdAt: string; size: number }>;
  } {
    return {
      currentVersion: this.store.getSchemaVersion(),
      targetVersion: TARGET_SCHEMA_VERSION,
      snapshots: this.store.listMigrationSnapshots(20)
    };
  }

  restoreLatestMigrationSnapshot(): {
    restoredFrom: string;
    inserted: Record<string, number>;
    summary: OpsSummary;
  } | null {
    const restored = this.store.restoreLatestMigrationSnapshot();
    if (!restored) {
      return null;
    }
    return {
      restoredFrom: restored.restoredFrom,
      inserted: restored.inserted,
      summary: this.getOpsSummary()
    };
  }

  restoreMigrationSnapshotByFile(fileName: string): {
    restoredFrom: string;
    inserted: Record<string, number>;
    summary: OpsSummary;
  } | null {
    const restored = this.store.restoreMigrationSnapshotByFile(fileName);
    if (!restored) {
      return null;
    }
    return {
      restoredFrom: restored.restoredFrom,
      inserted: restored.inserted,
      summary: this.getOpsSummary()
    };
  }

  getMigrationSnapshotContent(fileName: string): { fileName: string; payload: Record<string, unknown> } | null {
    return this.store.getMigrationSnapshotContent(fileName);
  }

  resetBusinessData(confirmText: string): {
    removed: Record<string, number>;
    summary: OpsSummary;
  } | null {
    if (confirmText.trim() !== BUSINESS_RESET_CONFIRM_TEXT) {
      return null;
    }
    const removed = this.store.resetBusinessData();
    return { removed, summary: this.getOpsSummary() };
  }

  listTaskCenterFilterPresets(userScope = 'global'): TaskCenterFilterPreset[] {
    const raw = this.store.getSystemSetting(this.buildTaskCenterPresetKey(userScope));
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed
        .map((item) => this.normalizeTaskCenterFilterPreset(item))
        .filter((item): item is TaskCenterFilterPreset => item !== null)
        .slice(0, TASK_CENTER_FILTER_PRESETS_MAX);
    } catch {
      return [];
    }
  }

  listTaskCenterFilterPresetsPaged(
    userScope: string,
    input: { page: number; pageSize: number; q?: string }
  ): PageResult<TaskCenterFilterPreset> {
    const keyword = input.q?.trim().toLowerCase();
    const all = this.listTaskCenterFilterPresets(userScope);
    const filtered = keyword ? all.filter((item) => item.name.toLowerCase().includes(keyword)) : all;
    const page = Math.max(1, Math.trunc(input.page));
    const pageSize = Math.max(1, Math.min(100, Math.trunc(input.pageSize)));
    const offset = (page - 1) * pageSize;
    return {
      items: filtered.slice(offset, offset + pageSize),
      total: filtered.length,
      page,
      pageSize
    };
  }

  upsertTaskCenterFilterPreset(
    userScope: string,
    name: string,
    payload: Omit<TaskCenterFilterPreset, 'name' | 'isDefault' | 'updatedAt' | 'lastUsedAt'>
  ): TaskCenterFilterPreset[] {
    const timestamp = nowIso();
    const list = this.listTaskCenterFilterPresets(userScope);
    const existing = list.find((item) => item.name === name);
    const nextPreset: TaskCenterFilterPreset = {
      name,
      q: payload.q,
      providerTaskId: payload.providerTaskId,
      status: payload.status,
      providerErrorCode: payload.providerErrorCode,
      createdFrom: payload.createdFrom,
      createdTo: payload.createdTo,
      sortBy: payload.sortBy,
      order: payload.order,
      isDefault: existing?.isDefault ?? false,
      updatedAt: timestamp,
      lastUsedAt: existing?.lastUsedAt ?? null
    };
    const index = list.findIndex((item) => item.name === name);
    if (index >= 0) {
      list[index] = nextPreset;
    } else {
      list.unshift(nextPreset);
    }
    if (!list.some((item) => item.isDefault) && list.length > 0) {
      list[0] = { ...list[0], isDefault: true, updatedAt: timestamp };
    }
    return this.persistTaskCenterPresets(userScope, list);
  }

  deleteTaskCenterFilterPreset(userScope: string, name: string): TaskCenterFilterPreset[] {
    const list = this.listTaskCenterFilterPresets(userScope).filter((item) => item.name !== name);
    if (list.length > 0 && !list.some((item) => item.isDefault)) {
      list[0] = { ...list[0], isDefault: true, updatedAt: nowIso() };
    }
    return this.persistTaskCenterPresets(userScope, list);
  }

  setDefaultTaskCenterFilterPreset(userScope: string, name: string): TaskCenterFilterPreset[] {
    const timestamp = nowIso();
    const list = this.listTaskCenterFilterPresets(userScope);
    let found = false;
    const next = list.map((item) => {
      const isDefault = item.name === name;
      if (isDefault) {
        found = true;
      }
      return {
        ...item,
        isDefault,
        updatedAt: isDefault ? timestamp : item.updatedAt
      };
    });
    if (!found) {
      return list;
    }
    return this.persistTaskCenterPresets(userScope, next);
  }

  markTaskCenterFilterPresetUsed(userScope: string, name: string): TaskCenterFilterPreset[] {
    const timestamp = nowIso();
    const list = this.listTaskCenterFilterPresets(userScope);
    let found = false;
    const next = list.map((item) => {
      if (item.name !== name) {
        return item;
      }
      found = true;
      return {
        ...item,
        lastUsedAt: timestamp,
        updatedAt: timestamp
      };
    });
    if (!found) {
      return list;
    }
    return this.persistTaskCenterPresets(userScope, next);
  }

  listTeamWorkspaceLayoutTemplates(contextScope: string): TeamWorkspaceLayoutTemplate[] {
    const raw = this.store.getSystemSetting(this.buildTeamWorkspaceLayoutTemplatesKey(contextScope));
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed
        .map((item) => this.normalizeTeamWorkspaceLayoutTemplate(item, contextScope))
        .filter((item): item is TeamWorkspaceLayoutTemplate => item !== null)
        .slice(0, TEAM_WORKSPACE_LAYOUT_TEMPLATES_MAX);
    } catch {
      return [];
    }
  }

  upsertTeamWorkspaceLayoutTemplate(
    contextScope: string,
    name: string,
    input: { uiPrefs: Record<string, unknown> },
    actor: string,
    actorRole?: string
  ): TeamWorkspaceLayoutTemplate[] {
    const timestamp = nowIso();
    const list = this.listTeamWorkspaceLayoutTemplates(contextScope);
    const next: TeamWorkspaceLayoutTemplate = {
      name,
      contextScope,
      uiPrefs: input.uiPrefs,
      updatedAt: timestamp,
      updatedBy: actor,
      updatedByRole: actorRole?.trim() || undefined
    };
    const index = list.findIndex((item) => item.name === name);
    if (index >= 0) {
      list[index] = next;
    } else {
      list.unshift(next);
    }
    return this.persistTeamWorkspaceLayoutTemplates(contextScope, list);
  }

  deleteTeamWorkspaceLayoutTemplate(contextScope: string, name: string): TeamWorkspaceLayoutTemplate[] {
    const next = this.listTeamWorkspaceLayoutTemplates(contextScope).filter((item) => item.name !== name);
    return this.persistTeamWorkspaceLayoutTemplates(contextScope, next);
  }

  private normalizeTaskCenterFilterPreset(input: unknown): TaskCenterFilterPreset | null {
    if (!input || typeof input !== 'object') {
      return null;
    }
    const item = input as Record<string, unknown>;
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    if (!name) {
      return null;
    }
    const status =
      typeof item.status === 'string' &&
      ['', 'queued', 'submitting', 'polling', 'running', 'done', 'failed', 'cancelled'].includes(item.status)
        ? (item.status as TaskCenterFilterPreset['status'])
        : '';
    const providerErrorCode =
      typeof item.providerErrorCode === 'string' &&
      ['', 'CAPABILITY_MISMATCH', 'PROVIDER_AUTH_FAILED', 'PROVIDER_RATE_LIMITED', 'PROVIDER_TIMEOUT', 'PROVIDER_UNKNOWN'].includes(
        item.providerErrorCode
      )
        ? (item.providerErrorCode as TaskCenterFilterPreset['providerErrorCode'])
        : '';
    const sortBy =
      typeof item.sortBy === 'string' && ['createdAt', 'updatedAt', 'priority', 'status'].includes(item.sortBy)
        ? (item.sortBy as TaskCenterFilterPreset['sortBy'])
        : 'createdAt';
    const order = item.order === 'asc' ? 'asc' : 'desc';

    return {
      name,
      q: typeof item.q === 'string' ? item.q : '',
      providerTaskId: typeof item.providerTaskId === 'string' ? item.providerTaskId : '',
      status,
      providerErrorCode,
      createdFrom: typeof item.createdFrom === 'string' ? item.createdFrom : '',
      createdTo: typeof item.createdTo === 'string' ? item.createdTo : '',
      sortBy,
      order,
      isDefault: Boolean(item.isDefault),
      updatedAt: typeof item.updatedAt === 'string' && item.updatedAt ? item.updatedAt : nowIso(),
      lastUsedAt: typeof item.lastUsedAt === 'string' && item.lastUsedAt ? item.lastUsedAt : null
    };
  }

  private normalizeTeamWorkspaceLayoutTemplate(input: unknown, contextScope: string): TeamWorkspaceLayoutTemplate | null {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return null;
    }
    const item = input as Record<string, unknown>;
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    if (!name) {
      return null;
    }
    const payloadScope = typeof item.contextScope === 'string' && item.contextScope.trim() ? item.contextScope.trim() : contextScope;
    const uiPrefs = item.uiPrefs;
    if (!uiPrefs || typeof uiPrefs !== 'object' || Array.isArray(uiPrefs)) {
      return null;
    }
    return {
      name,
      contextScope: payloadScope,
      uiPrefs: uiPrefs as Record<string, unknown>,
      updatedAt: typeof item.updatedAt === 'string' && item.updatedAt ? item.updatedAt : nowIso(),
      updatedBy: typeof item.updatedBy === 'string' && item.updatedBy ? item.updatedBy : 'system',
      updatedByRole: typeof item.updatedByRole === 'string' && item.updatedByRole ? item.updatedByRole : undefined
    };
  }

  private normalizeTaskFailurePolicyConfig(input: unknown): TaskFailurePolicyConfig | null {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return null;
    }
    const payload = input as Record<string, unknown>;
    const updatedAt = typeof payload.updatedAt === 'string' && payload.updatedAt ? payload.updatedAt : nowIso();
    const autoApply = typeof payload.autoApply === 'boolean' ? payload.autoApply : false;
    const maxRaw = Number(payload.maxAutoApplyPerTask);
    const maxAutoApplyPerTask = Number.isFinite(maxRaw) && maxRaw >= 0 ? Math.min(3, Math.floor(maxRaw)) : 1;
    const source = Array.isArray(payload.items) ? payload.items : [];

    const allowedCodes: TaskFailurePolicyCode[] = [
      'CAPABILITY_MISMATCH',
      'PROVIDER_AUTH_FAILED',
      'PROVIDER_RATE_LIMITED',
      'PROVIDER_TIMEOUT',
      'PROVIDER_UNKNOWN'
    ];
    const dedup = new Map<TaskFailurePolicyCode, TaskFailurePolicyItem>();
    for (const code of allowedCodes) {
      const fallback = TASK_FAILURE_POLICY_DEFAULTS.find((item) => item.errorCode === code)!;
      dedup.set(code, fallback);
    }

    for (const raw of source) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        continue;
      }
      const item = raw as Record<string, unknown>;
      const errorCode = item.errorCode;
      if (typeof errorCode !== 'string' || !allowedCodes.includes(errorCode as TaskFailurePolicyCode)) {
        continue;
      }
      const action = item.action;
      const preferredMode = item.preferredMode;
      const priority = item.priority;
      dedup.set(errorCode as TaskFailurePolicyCode, {
        errorCode: errorCode as TaskFailurePolicyCode,
        action:
          typeof action === 'string' && ['retry', 'recreate_conservative', 'manual'].includes(action)
            ? (action as TaskFailurePolicyAction)
            : dedup.get(errorCode as TaskFailurePolicyCode)!.action,
        preferredMode:
          typeof preferredMode === 'string' && ['keep', 'text', 'singleImage', 'startEnd', 'multiImage', 'reference'].includes(preferredMode)
            ? (preferredMode as TaskFailurePolicyItem['preferredMode'])
            : dedup.get(errorCode as TaskFailurePolicyCode)!.preferredMode,
        disableAudio: Boolean(item.disableAudio),
        priority:
          typeof priority === 'string' && ['keep', 'low', 'medium', 'high'].includes(priority)
            ? (priority as TaskFailurePolicyItem['priority'])
            : dedup.get(errorCode as TaskFailurePolicyCode)!.priority
      });
    }

    return {
      updatedAt,
      autoApply,
      maxAutoApplyPerTask,
      items: allowedCodes.map((code) => dedup.get(code)!)
    };
  }

  private persistTaskCenterPresets(userScope: string, list: TaskCenterFilterPreset[]): TaskCenterFilterPreset[] {
    const sorted = [...list]
      .sort((a, b) => {
        if (a.isDefault !== b.isDefault) {
          return a.isDefault ? -1 : 1;
        }
        const aUsed = a.lastUsedAt ? Date.parse(a.lastUsedAt) : 0;
        const bUsed = b.lastUsedAt ? Date.parse(b.lastUsedAt) : 0;
        if (aUsed !== bUsed) {
          return bUsed - aUsed;
        }
        return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
      })
      .slice(0, TASK_CENTER_FILTER_PRESETS_MAX);
    this.store.setSystemSetting(this.buildTaskCenterPresetKey(userScope), JSON.stringify(sorted));
    return sorted;
  }

  private buildTaskCenterPresetKey(userScope: string): string {
    return `${TASK_CENTER_FILTER_PRESETS_KEY}:${userScope}`;
  }

  private buildTeamWorkspaceLayoutTemplatesKey(contextScope: string): string {
    const normalized = contextScope.trim() || 'global';
    return `${TEAM_WORKSPACE_LAYOUT_TEMPLATES_KEY}:${normalized}`;
  }

  private persistTeamWorkspaceLayoutTemplates(
    contextScope: string,
    list: TeamWorkspaceLayoutTemplate[]
  ): TeamWorkspaceLayoutTemplate[] {
    const normalized = list
      .map((item) => this.normalizeTeamWorkspaceLayoutTemplate(item, contextScope))
      .filter((item): item is TeamWorkspaceLayoutTemplate => item !== null)
      .slice(0, TEAM_WORKSPACE_LAYOUT_TEMPLATES_MAX);
    this.store.setSystemSetting(this.buildTeamWorkspaceLayoutTemplatesKey(contextScope), JSON.stringify(normalized));
    return normalized;
  }
}
