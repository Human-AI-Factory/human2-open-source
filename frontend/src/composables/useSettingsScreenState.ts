import { ref } from 'vue';
import type {
  AutoRepairLogEntry,
  AutoRepairLogStats,
  ModelConfig,
  OpsSummary,
  PromptTemplate,
  PromptTemplateVersion,
  ProviderLogBreakdown,
  ProviderLogEntry,
  TaskFailurePolicyItem,
  TaskRuntimeConfig,
  VideoMergeErrorStat
} from '@/types/models';

export type ModelDraft = {
  id?: string;
  type: 'text' | 'image' | 'video' | 'audio';
  name: string;
  provider: string;
  manufacturer: string;
  model: string;
  authType: 'bearer' | 'api_key' | 'none';
  endpoint: string;
  endpointsText: string;
  capabilitiesText: string;
  apiKey: string;
  priority: number;
  rateLimit: number;
  isDefault: boolean;
  enabled?: boolean;
};

export const buildEmptyModelDraft = (): ModelDraft => ({
  type: 'video',
  name: '',
  provider: '',
  manufacturer: '',
  model: '',
  authType: 'bearer',
  endpoint: '',
  endpointsText: '{}',
  capabilitiesText: '{}',
  apiKey: '',
  priority: 100,
  rateLimit: 0,
  isDefault: false
});

export const useSettingsScreenState = () => {
  const modelConfigs = ref<ModelConfig[]>([]);
  const prompts = ref<PromptTemplate[]>([]);
  const promptDrafts = ref<Record<string, string>>({});
  const promptVersions = ref<Record<string, PromptTemplateVersion[]>>({});
  const versionVisible = ref<Record<string, boolean>>({});
  const loading = ref(false);
  const error = ref('');
  const runtimeConfig = ref<TaskRuntimeConfig>({
    videoTaskAutoRetry: 1,
    videoTaskRetryDelayMs: 800,
    videoTaskPollIntervalMs: 2000
  });
  const taskFailurePolicies = ref<TaskFailurePolicyItem[]>([]);
  const taskFailurePolicyAutoApply = ref(false);
  const taskFailurePolicyMaxAutoApplyPerTask = ref(1);
  const providerLogs = ref<ProviderLogEntry[]>([]);
  const providerLogLimit = ref(100);
  const providerLogOutcome = ref<'success' | 'failed' | ''>('');
  const providerLogTaskType = ref<'text' | 'image' | 'video' | 'audio' | ''>('');
  const providerLogProvider = ref('');
  const providerLogKeyword = ref('');
  const providerLogStats = ref<ProviderLogBreakdown | null>(null);
  const opsSummary = ref<OpsSummary | null>(null);
  const opsLoading = ref(false);
  const backupFileInput = ref<HTMLInputElement | null>(null);
  const migrationCurrentVersion = ref(0);
  const migrationTargetVersion = ref(0);
  const migrationSnapshots = ref<Array<{ fileName: string; path: string; createdAt: string; size: number }>>([]);
  const mergeErrorStats = ref<VideoMergeErrorStat[]>([]);
  const mergeErrorProjectId = ref('');
  const mergeErrorLimit = ref(10);
  const autoRepairLogs = ref<AutoRepairLogEntry[]>([]);
  const autoRepairLogStats = ref<AutoRepairLogStats | null>(null);
  const autoRepairLogLimit = ref(100);
  const autoRepairLogAction = ref<'' | 'retry' | 'recreate_conservative' | 'manual'>('');
  const autoRepairLogOutcome = ref<'success' | 'failed' | ''>('');
  const autoRepairLogProjectId = ref('');
  const autoRepairLogTaskId = ref('');
  const autoRepairLogTaskIds = ref('');
  const autoRepairLogErrorCode = ref('');
  const autoRepairLogKeyword = ref('');
  const newModel = ref<ModelDraft>(buildEmptyModelDraft());
  const editingModel = ref<ModelDraft | null>(null);
  const capabilityPresets = ref<Record<string, Record<string, Record<string, unknown>>>>({});

  return {
    autoRepairLogs,
    autoRepairLogAction,
    autoRepairLogErrorCode,
    autoRepairLogKeyword,
    autoRepairLogLimit,
    autoRepairLogOutcome,
    autoRepairLogProjectId,
    autoRepairLogStats,
    autoRepairLogTaskId,
    autoRepairLogTaskIds,
    backupFileInput,
    capabilityPresets,
    editingModel,
    error,
    loading,
    mergeErrorLimit,
    mergeErrorProjectId,
    mergeErrorStats,
    migrationCurrentVersion,
    migrationSnapshots,
    migrationTargetVersion,
    modelConfigs,
    newModel,
    opsLoading,
    opsSummary,
    promptDrafts,
    prompts,
    promptVersions,
    providerLogs,
    providerLogKeyword,
    providerLogLimit,
    providerLogOutcome,
    providerLogProvider,
    providerLogStats,
    providerLogTaskType,
    runtimeConfig,
    taskFailurePolicies,
    taskFailurePolicyAutoApply,
    taskFailurePolicyMaxAutoApplyPerTask,
    versionVisible
  };
};
