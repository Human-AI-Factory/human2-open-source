import type { Ref } from 'vue';
import {
  getAutoRepairLogStats,
  getAutoRepairLogs,
  getModelConfigs,
  getOpsSummary,
  getMigrationStatus,
  getProviderCapabilityPresets,
  getProviderTemplates,
  getProviderLogStats,
  getProviderLogs,
  getPromptTemplates,
  getTaskFailurePolicies,
  getTaskRuntimeConfig,
  getVideoMergeErrorStats
} from '@/api/settings-admin';
import type {
  AutoRepairLogEntry,
  AutoRepairLogStats,
  ModelConfig,
  OpsSummary,
  ProviderTemplateDescriptor,
  PromptTemplate,
  ProviderLogBreakdown,
  ProviderLogEntry,
  TaskFailurePolicyItem,
  TaskRuntimeConfig,
  VideoMergeErrorStat
} from '@/types/models';
import { toErrorMessage } from '@/utils/errors';

type ProviderLogQuery = {
  limit: number;
  provider?: string;
  taskType?: 'text' | 'image' | 'video' | 'audio';
  success?: boolean;
  keyword?: string;
};

type AutoRepairLogQuery = {
  limit: number;
  action?: 'retry' | 'recreate_conservative' | 'manual';
  projectId?: string;
  taskId?: string;
  taskIds?: string;
  errorCode?: string;
  success?: boolean;
  keyword?: string;
};

type MigrationSnapshot = {
  fileName: string;
  path: string;
  createdAt: string;
  size: number;
};

type UseSettingsDataAccessOptions = {
  error: Ref<string>;
  modelConfigs: Ref<ModelConfig[]>;
  prompts: Ref<PromptTemplate[]>;
  promptDrafts: Ref<Record<string, string>>;
  providerTemplates: Ref<ProviderTemplateDescriptor[]>;
  runtimeConfig: Ref<TaskRuntimeConfig>;
  taskFailurePolicies: Ref<TaskFailurePolicyItem[]>;
  taskFailurePolicyAutoApply: Ref<boolean>;
  taskFailurePolicyMaxAutoApplyPerTask: Ref<number>;
  capabilityPresets: Ref<Record<string, Record<string, Record<string, unknown>>>>;
  opsSummary: Ref<OpsSummary | null>;
  mergeErrorStats: Ref<VideoMergeErrorStat[]>;
  mergeErrorProjectId: Ref<string>;
  mergeErrorLimit: Ref<number>;
  providerLogs: Ref<ProviderLogEntry[]>;
  providerLogStats: Ref<ProviderLogBreakdown | null>;
  autoRepairLogs: Ref<AutoRepairLogEntry[]>;
  autoRepairLogStats: Ref<AutoRepairLogStats | null>;
  migrationCurrentVersion: Ref<number>;
  migrationTargetVersion: Ref<number>;
  migrationSnapshots: Ref<MigrationSnapshot[]>;
  buildProviderLogQuery: () => ProviderLogQuery;
  buildAutoRepairLogQuery: () => AutoRepairLogQuery;
};

export const useSettingsDataAccess = (options: UseSettingsDataAccessOptions) => {
  const loadAll = async (): Promise<void> => {
    try {
      const [
        models,
        promptList,
        runtime,
        failurePolicies,
        presets,
        templates,
        summary,
        mergeErrors,
        logs,
        logStats,
        repairLogs,
        repairStats,
        migrationStatus
      ] = await Promise.all([
        getModelConfigs(),
        getPromptTemplates(),
        getTaskRuntimeConfig(),
        getTaskFailurePolicies(),
        getProviderCapabilityPresets(),
        getProviderTemplates(),
        getOpsSummary(),
        getVideoMergeErrorStats({
          limit: options.mergeErrorLimit.value,
          projectId: options.mergeErrorProjectId.value.trim() || undefined
        }),
        getProviderLogs(options.buildProviderLogQuery()),
        getProviderLogStats(),
        getAutoRepairLogs(options.buildAutoRepairLogQuery()),
        getAutoRepairLogStats(),
        getMigrationStatus()
      ]);
      options.modelConfigs.value = models;
      options.prompts.value = promptList;
      options.runtimeConfig.value = runtime;
      options.taskFailurePolicies.value = failurePolicies.items;
      options.taskFailurePolicyAutoApply.value = failurePolicies.autoApply;
      options.taskFailurePolicyMaxAutoApplyPerTask.value = failurePolicies.maxAutoApplyPerTask;
      options.capabilityPresets.value = presets;
      options.providerTemplates.value = templates;
      options.opsSummary.value = summary;
      options.mergeErrorStats.value = mergeErrors;
      options.promptDrafts.value = Object.fromEntries(promptList.map((item) => [item.id, item.content]));
      options.providerLogs.value = logs;
      options.providerLogStats.value = logStats;
      options.autoRepairLogs.value = repairLogs;
      options.autoRepairLogStats.value = repairStats;
      options.migrationCurrentVersion.value = migrationStatus.currentVersion;
      options.migrationTargetVersion.value = migrationStatus.targetVersion;
      options.migrationSnapshots.value = migrationStatus.snapshots;
      options.error.value = '';
    } catch (err) {
      options.error.value = toErrorMessage(err, '加载设置失败');
    }
  };

  const loadProviderLogs = async (): Promise<void> => {
    try {
      const [logs, summary, logStats] = await Promise.all([
        getProviderLogs(options.buildProviderLogQuery()),
        getOpsSummary(),
        getProviderLogStats()
      ]);
      options.providerLogs.value = logs;
      options.providerLogStats.value = logStats;
      options.opsSummary.value = summary;
      options.error.value = '';
    } catch (err) {
      options.error.value = toErrorMessage(err, '加载 provider 日志失败');
    }
  };

  const loadAutoRepairLogs = async (): Promise<void> => {
    try {
      const [logs, stats, summary] = await Promise.all([
        getAutoRepairLogs(options.buildAutoRepairLogQuery()),
        getAutoRepairLogStats(),
        getOpsSummary()
      ]);
      options.autoRepairLogs.value = logs;
      options.autoRepairLogStats.value = stats;
      options.opsSummary.value = summary;
      options.error.value = '';
    } catch (err) {
      options.error.value = toErrorMessage(err, '加载自动修复日志失败');
    }
  };

  return {
    loadAll,
    loadAutoRepairLogs,
    loadProviderLogs
  };
};
