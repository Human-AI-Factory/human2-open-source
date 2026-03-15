import { request } from '@/api/client';
import { buildQuery } from '@/api/utils';
import type {
  AutoRepairLogEntry,
  AutoRepairLogStats,
  ModelConnectionTestResult,
  ModelConfig,
  OpsSummary,
  PromptTemplate,
  PromptTemplateVersion,
  ProviderLogBreakdown,
  ProviderLogEntry,
  TaskFailurePolicyConfig,
  TaskFailurePolicyItem,
  TaskRuntimeConfig,
  VideoMergeErrorStat
} from '@/types/models';

export const getModelConfigs = (type?: 'text' | 'image' | 'video' | 'audio'): Promise<ModelConfig[]> =>
  request(`/api/settings/models?${buildQuery({ type })}`);

export const createModelConfig = (payload: {
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
}): Promise<ModelConfig> =>
  request('/api/settings/models', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const testDraftModelConnection = (payload: {
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
}): Promise<ModelConnectionTestResult> =>
  request('/api/settings/models/test-connection', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const importModelConfigExample = (payload: {
  example: string;
  name?: string;
  isDefault?: boolean;
  enabled?: boolean;
}): Promise<{
  type: 'text' | 'image' | 'video' | 'audio';
  name: string;
  provider: string;
  manufacturer: string;
  model: string;
  authType: 'bearer' | 'api_key' | 'none';
  endpoint: string;
  endpoints: Record<string, string>;
  capabilities: Record<string, unknown>;
  apiKey: string;
  priority: number;
  rateLimit: number;
  isDefault: boolean;
  enabled: boolean;
  source: 'curl' | 'python_requests' | 'python_openai_sdk';
  warnings: string[];
}> =>
  request('/api/settings/models/import-example', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const updateModelConfig = (
  modelId: string,
  payload: {
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
): Promise<ModelConfig> =>
  request(`/api/settings/models/${modelId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });

export const testSavedModelConnection = (
  modelId: string,
  payload: {
    type?: 'text' | 'image' | 'video' | 'audio';
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
  } = {}
): Promise<ModelConnectionTestResult> =>
  request(`/api/settings/models/${modelId}/test-connection`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const deleteModelConfig = (modelId: string): Promise<void> =>
  request(`/api/settings/models/${modelId}`, {
    method: 'DELETE'
  });

export const getProviderCapabilityPresets = (): Promise<Record<string, Record<string, Record<string, unknown>>>> =>
  request('/api/settings/providers/capability-presets');

export const getProviderCapabilities = (): Promise<Record<string, Array<Record<string, unknown>>>> =>
  request('/api/settings/providers/capabilities');

export const getModelCapabilities = (modelId: string): Promise<Record<string, unknown>> =>
  request(`/api/settings/models/${modelId}/capabilities`);

export const getModelVoices = (modelId: string): Promise<{
  voices: string[];
  voiceCloning: boolean;
  voiceCloningNote: string | null;
  formats: string[];
  speeds: number[];
  emotions: string[];
  providerOptions: Record<string, unknown>;
}> =>
  request(`/api/settings/models/${modelId}/voices`);

export const cloneVoice = (modelId: string, payload: { audioUrl: string; name: string }): Promise<{
  success: boolean;
  voiceId?: string;
  message: string;
}> =>
  request(`/api/settings/models/${modelId}/clone-voice`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const getPromptTemplates = (): Promise<PromptTemplate[]> =>
  request('/api/settings/prompts');

export const updatePromptTemplate = (
  promptId: string,
  payload: { title?: string; content?: string }
): Promise<PromptTemplate> =>
  request(`/api/settings/prompts/${promptId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });

export const getPromptTemplateVersions = (promptId: string): Promise<PromptTemplateVersion[]> =>
  request(`/api/settings/prompts/${promptId}/versions`);

export const getTaskRuntimeConfig = (): Promise<TaskRuntimeConfig> =>
  request('/api/settings/runtime');

export const updateTaskRuntimeConfig = (payload: {
  videoTaskAutoRetry?: number;
  videoTaskRetryDelayMs?: number;
  videoTaskPollIntervalMs?: number;
}): Promise<TaskRuntimeConfig> =>
  request('/api/settings/runtime', {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });

export const getTaskFailurePolicies = (): Promise<TaskFailurePolicyConfig> =>
  request('/api/settings/task-failure-policies');

export const updateTaskFailurePolicies = (payload: {
  autoApply?: boolean;
  maxAutoApplyPerTask?: number;
  items: TaskFailurePolicyItem[];
}): Promise<TaskFailurePolicyConfig> =>
  request('/api/settings/task-failure-policies', {
    method: 'PUT',
    body: JSON.stringify(payload)
  });

export const getProviderLogs = (input: {
  limit?: number;
  provider?: string;
  taskType?: 'text' | 'image' | 'video' | 'audio';
  success?: boolean;
  keyword?: string;
} = {}): Promise<ProviderLogEntry[]> =>
  request(`/api/settings/logs/providers?${buildQuery({ limit: input.limit ?? 100, ...input })}`);

export const getProviderLogStats = (): Promise<ProviderLogBreakdown> =>
  request('/api/settings/logs/providers/stats');

export const clearProviderLogs = (): Promise<{ removed: number }> =>
  request('/api/settings/logs/providers', {
    method: 'DELETE'
  });

export const getAutoRepairLogs = (input: {
  limit?: number;
  action?: 'retry' | 'recreate_conservative' | 'manual';
  errorCode?: string;
  projectId?: string;
  taskId?: string;
  taskIds?: string;
  success?: boolean;
  keyword?: string;
} = {}): Promise<AutoRepairLogEntry[]> =>
  request(`/api/settings/logs/auto-repair?${buildQuery({ limit: input.limit ?? 100, ...input })}`);

export const getAutoRepairLogStats = (): Promise<AutoRepairLogStats> =>
  request('/api/settings/logs/auto-repair/stats');

export const clearAutoRepairLogs = (): Promise<{ removed: number }> =>
  request('/api/settings/logs/auto-repair', {
    method: 'DELETE'
  });

export const getOpsSummary = (): Promise<OpsSummary> =>
  request('/api/settings/ops/summary');

export const getVideoMergeErrorStats = (input: { limit?: number; projectId?: string } = {}): Promise<VideoMergeErrorStat[]> =>
  request(`/api/settings/ops/video-merge-errors?${buildQuery(input)}`);

export const resetBusinessData = (
  confirmText: string
): Promise<{
  removed: {
    projects: number;
    tasks: number;
    novels: number;
    outlines: number;
    scripts: number;
    storyboards: number;
    assets: number;
    videoTasks: number;
    videoTaskEvents: number;
    audioTasks: number;
  };
  summary: OpsSummary;
}> =>
  request('/api/settings/ops/reset-business-data', {
    method: 'POST',
    body: JSON.stringify({ confirmText })
  });

export const exportBusinessBackup = (): Promise<{
  version: string;
  exportedAt: string;
  tables: Record<string, Array<Record<string, unknown>>>;
}> =>
  request('/api/settings/ops/backup/export');

export const importBusinessBackup = (payload: {
  version: string;
  tables: Record<string, Array<Record<string, unknown>>>;
}): Promise<{
  inserted: Record<string, number>;
  summary: OpsSummary;
}> =>
  request('/api/settings/ops/backup/import', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const getMigrationStatus = (): Promise<{
  currentVersion: number;
  targetVersion: number;
  snapshots: Array<{ fileName: string; path: string; createdAt: string; size: number }>;
}> =>
  request('/api/settings/ops/migrations');

export const restoreLatestMigrationSnapshot = (): Promise<{
  restoredFrom: string;
  inserted: Record<string, number>;
  summary: OpsSummary;
}> =>
  request('/api/settings/ops/migrations/restore-latest', {
    method: 'POST'
  });

export const restoreMigrationSnapshotByFile = (fileName: string): Promise<{
  restoredFrom: string;
  inserted: Record<string, number>;
  summary: OpsSummary;
}> =>
  request('/api/settings/ops/migrations/restore', {
    method: 'POST',
    body: JSON.stringify({ fileName })
  });

export const getMigrationSnapshotContent = (fileName: string): Promise<{ fileName: string; payload: Record<string, unknown> }> =>
  request(`/api/settings/ops/migrations/snapshots/${encodeURIComponent(fileName)}`);
