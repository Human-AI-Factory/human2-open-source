import type { Ref } from 'vue';
import type { Router } from 'vue-router';
import { getDramaDomain } from '@/api/domain-context';
import {
  clearAutoRepairLogs,
  clearProviderLogs,
  exportBusinessBackup,
  getMigrationSnapshotContent,
  getMigrationStatus,
  getOpsSummary,
  getVideoMergeErrorStats,
  importBusinessBackup,
  resetBusinessData,
  restoreLatestMigrationSnapshot,
  restoreMigrationSnapshotByFile
} from '@/api/settings-admin';
import type { OpsSummary, VideoMergeErrorStat } from '@/types/models';
import { toErrorMessage } from '@/utils/errors';
import { buildDramaFallbackMessage, resolveDramaIdForNavigation } from '@/utils/route-context';

type MigrationSnapshotItem = {
  fileName: string;
  path: string;
  createdAt: string;
  size: number;
};

type UseSettingsOpsPanelOptions = {
  router: Router;
  error: Ref<string>;
  opsLoading: Ref<boolean>;
  opsSummary: Ref<OpsSummary | null>;
  backupFileInput: Ref<HTMLInputElement | null>;
  migrationCurrentVersion: Ref<number>;
  migrationTargetVersion: Ref<number>;
  migrationSnapshots: Ref<MigrationSnapshotItem[]>;
  mergeErrorStats: Ref<VideoMergeErrorStat[]>;
  mergeErrorProjectId: Ref<string>;
  mergeErrorLimit: Ref<number>;
  loadAll: () => Promise<void>;
  loadProviderLogs: () => Promise<void>;
  loadAutoRepairLogs: () => Promise<void>;
};

const downloadJsonFile = (payload: unknown, fileName: string): void => {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export const useSettingsOpsPanel = (options: UseSettingsOpsPanelOptions) => {
  const loadOpsPanel = async (): Promise<void> => {
    try {
      const [summary, mergeErrors, migrationStatus] = await Promise.all([
        getOpsSummary(),
        getVideoMergeErrorStats({
          limit: options.mergeErrorLimit.value,
          projectId: options.mergeErrorProjectId.value.trim() || undefined
        }),
        getMigrationStatus()
      ]);
      options.opsSummary.value = summary;
      options.mergeErrorStats.value = mergeErrors;
      options.migrationCurrentVersion.value = migrationStatus.currentVersion;
      options.migrationTargetVersion.value = migrationStatus.targetVersion;
      options.migrationSnapshots.value = migrationStatus.snapshots;
      options.error.value = '';
    } catch (err) {
      options.error.value = toErrorMessage(err, '加载运维概览失败');
    }
  };

  const loadMergeErrorStats = async (): Promise<void> => {
    try {
      options.mergeErrorStats.value = await getVideoMergeErrorStats({
        limit: options.mergeErrorLimit.value,
        projectId: options.mergeErrorProjectId.value.trim() || undefined
      });
      options.error.value = '';
    } catch (err) {
      options.error.value = toErrorMessage(err, '加载 merge 错误码榜单失败');
    }
  };

  const goToProjectMergeError = async (errorCode: string): Promise<void> => {
    const projectId = options.mergeErrorProjectId.value.trim();
    if (!projectId) {
      options.error.value = '请先输入项目ID，再执行定位';
      return;
    }
    try {
      const dramaId = await resolveDramaIdForNavigation({
        preferredDramaId: (await getDramaDomain(projectId).catch(() => null))?.id || '',
        projectId,
        fallbackName: `Project ${projectId}`
      });
      if (dramaId) {
        options.error.value = '';
        await options.router.push({
          path: `/dramas/${encodeURIComponent(dramaId)}`,
          query: {
            stage: 'video',
            mergeErrorCode: errorCode
          }
        });
        return;
      }
      options.error.value = buildDramaFallbackMessage('已回退项目详情');
    } catch (err) {
      options.error.value = buildDramaFallbackMessage('已回退项目详情', err);
    }
    await options.router.push({
      path: `/projects/${encodeURIComponent(projectId)}`,
      query: {
        stage: 'video',
        mergeErrorCode: errorCode
      }
    });
  };

  const clearProviderLogHistory = async (): Promise<void> => {
    options.opsLoading.value = true;
    try {
      await clearProviderLogs();
      await Promise.all([options.loadProviderLogs(), loadOpsPanel()]);
    } catch (err) {
      options.error.value = toErrorMessage(err, '清空 provider 日志失败');
    } finally {
      options.opsLoading.value = false;
    }
  };

  const clearAutoRepairLogHistory = async (): Promise<void> => {
    options.opsLoading.value = true;
    try {
      await clearAutoRepairLogs();
      await Promise.all([options.loadAutoRepairLogs(), loadOpsPanel()]);
    } catch (err) {
      options.error.value = toErrorMessage(err, '清空自动修复日志失败');
    } finally {
      options.opsLoading.value = false;
    }
  };

  const clearAllBusinessData = async (): Promise<void> => {
    const confirmation = window.prompt('危险操作：输入 RESET_BUSINESS_DATA 以清空业务数据（不影响用户/模型/提示词）');
    if (!confirmation) {
      return;
    }
    if (!window.confirm('确认清空业务数据？该操作不可恢复。')) {
      return;
    }
    options.opsLoading.value = true;
    try {
      await resetBusinessData(confirmation);
      await options.loadAll();
    } catch (err) {
      options.error.value = toErrorMessage(err, '清空业务数据失败');
    } finally {
      options.opsLoading.value = false;
    }
  };

  const restoreLatestMigrationBackup = async (): Promise<void> => {
    if (!window.confirm('确认回滚到最近一次迁移快照？这会覆盖当前业务数据。')) {
      return;
    }
    options.opsLoading.value = true;
    try {
      await restoreLatestMigrationSnapshot();
      await options.loadAll();
      options.error.value = '';
    } catch (err) {
      options.error.value = toErrorMessage(err, '回滚迁移快照失败');
    } finally {
      options.opsLoading.value = false;
    }
  };

  const restoreMigrationBackupByFile = async (fileName: string): Promise<void> => {
    if (!window.confirm(`确认回滚到快照 ${fileName}？这会覆盖当前业务数据。`)) {
      return;
    }
    options.opsLoading.value = true;
    try {
      await restoreMigrationSnapshotByFile(fileName);
      await options.loadAll();
      options.error.value = '';
    } catch (err) {
      options.error.value = toErrorMessage(err, '按文件回滚迁移快照失败');
    } finally {
      options.opsLoading.value = false;
    }
  };

  const downloadMigrationSnapshot = async (fileName: string): Promise<void> => {
    try {
      const data = await getMigrationSnapshotContent(fileName);
      downloadJsonFile(data.payload, data.fileName);
      options.error.value = '';
    } catch (err) {
      options.error.value = toErrorMessage(err, '下载迁移快照失败');
    }
  };

  const downloadBusinessBackup = async (): Promise<void> => {
    options.opsLoading.value = true;
    try {
      const payload = await exportBusinessBackup();
      downloadJsonFile(payload, `human2-business-backup-${Date.now()}.json`);
      options.error.value = '';
    } catch (err) {
      options.error.value = toErrorMessage(err, '导出业务备份失败');
    } finally {
      options.opsLoading.value = false;
    }
  };

  const triggerImportBackup = (): void => {
    options.backupFileInput.value?.click();
  };

  const handleImportBackupFile = async (event: Event): Promise<void> => {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) {
      return;
    }
    if (!window.confirm('确认导入该备份文件？这会覆盖当前业务数据。')) {
      input.value = '';
      return;
    }
    options.opsLoading.value = true;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('备份文件格式错误');
      }
      const payload = parsed as { version?: unknown; tables?: unknown };
      if (typeof payload.version !== 'string' || !payload.version.trim()) {
        throw new Error('备份文件缺少 version');
      }
      if (!payload.tables || typeof payload.tables !== 'object' || Array.isArray(payload.tables)) {
        throw new Error('备份文件缺少 tables');
      }
      await importBusinessBackup({
        version: payload.version,
        tables: payload.tables as Record<string, Array<Record<string, unknown>>>
      });
      await options.loadAll();
      options.error.value = '';
    } catch (err) {
      options.error.value = toErrorMessage(err, '导入业务备份失败');
    } finally {
      if (input) {
        input.value = '';
      }
      options.opsLoading.value = false;
    }
  };

  return {
    clearAllBusinessData,
    clearAutoRepairLogHistory,
    clearProviderLogHistory,
    downloadBusinessBackup,
    downloadMigrationSnapshot,
    goToProjectMergeError,
    handleImportBackupFile,
    loadMergeErrorStats,
    loadOpsPanel,
    restoreLatestMigrationBackup,
    restoreMigrationBackupByFile,
    triggerImportBackup
  };
};
