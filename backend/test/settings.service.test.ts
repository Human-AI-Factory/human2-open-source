import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SqliteStore } from '../src/db/sqlite.js';
import { SettingsService } from '../src/modules/settings/settings.service.js';
import { appendProviderLog } from '../src/modules/pipeline/providers/provider-logs.js';
import { appendAutoRepairLog } from '../src/modules/pipeline/auto-repair-logs.js';
import { nowIso } from '../src/utils/time.js';

const createService = () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'human2-settings-test-'));
  const dataFile = path.join(tempRoot, 'app.db');
  const store = new SqliteStore(dataFile);
  return {
    store,
    service: new SettingsService(store),
    cleanup: () => fs.rmSync(tempRoot, { recursive: true, force: true })
  };
};

test('settings service should manage model configs and prompt templates', () => {
  const { service, cleanup } = createService();
  try {
    const model = service.createModelConfig({
      type: 'video',
      name: 'Mock Video Model',
      provider: 'mock',
      endpoint: 'http://example.test/video',
      apiKey: 'secret',
      isDefault: true
    });
    assert.equal(model.type, 'video');
    assert.equal(model.isDefault, true);

    const models = service.listModelConfigs('video');
    assert.ok(models.length > 0);

    const updated = service.updateModelConfig(model.id, { name: 'Updated Video Model', enabled: false });
    assert.ok(updated);
    assert.equal(updated?.name, 'Updated Video Model');
    assert.equal(updated?.enabled, false);

    const prompts = service.listPromptTemplates();
    assert.ok(prompts.length > 0);
    const prompt = service.updatePromptTemplate(prompts[0].id, { content: `${prompts[0].content}\n[patched]` });
    assert.ok(prompt);
    assert.ok(prompt?.content.includes('[patched]'));
    const versions = service.listPromptTemplateVersions(prompts[0].id);
    assert.ok(versions.length > 0);
    assert.ok(versions[0].content.length > 0);

    const runtime = service.getTaskRuntimeConfig();
    assert.ok(runtime.videoTaskAutoRetry >= 0);
    const updatedRuntime = service.updateTaskRuntimeConfig({
      videoTaskAutoRetry: 2,
      videoTaskRetryDelayMs: 1200,
      videoTaskPollIntervalMs: 3000
    });
    assert.equal(updatedRuntime.videoTaskAutoRetry, 2);
    assert.equal(updatedRuntime.videoTaskRetryDelayMs, 1200);
    assert.equal(updatedRuntime.videoTaskPollIntervalMs, 3000);

    const failurePolicies = service.getTaskFailurePolicies();
    assert.equal(failurePolicies.items.length >= 5, true);
    const updatedPolicies = service.updateTaskFailurePolicies({
      items: failurePolicies.items.map((item) =>
        item.errorCode === 'PROVIDER_TIMEOUT'
          ? { ...item, action: 'recreate_conservative', preferredMode: 'text', disableAudio: true, priority: 'low' }
          : item
      )
    });
    const timeoutPolicy = updatedPolicies.items.find((item) => item.errorCode === 'PROVIDER_TIMEOUT');
    assert.equal(timeoutPolicy?.action, 'recreate_conservative');
    assert.equal(timeoutPolicy?.preferredMode, 'text');
    assert.equal(timeoutPolicy?.disableAudio, true);
    assert.equal(timeoutPolicy?.priority, 'low');
  } finally {
    cleanup();
  }
});

test('settings service should manage task center filter presets', () => {
  const { service, cleanup } = createService();
  try {
    assert.deepEqual(service.listTaskCenterFilterPresets('u-admin'), []);

    const first = service.upsertTaskCenterFilterPreset('u-admin', '默认失败任务', {
      q: '',
      providerTaskId: '',
      status: 'failed',
      providerErrorCode: '',
      createdFrom: '',
      createdTo: '',
      sortBy: 'createdAt',
      order: 'desc'
    });
    assert.equal(first.length, 1);
    assert.equal(first[0].name, '默认失败任务');
    assert.equal(first[0].status, 'failed');
    assert.equal(first[0].isDefault, true);
    assert.equal(first[0].lastUsedAt, null);

    const replaced = service.upsertTaskCenterFilterPreset('u-admin', '默认失败任务', {
      q: 'demo',
      providerTaskId: 'p-1',
      status: 'failed',
      providerErrorCode: 'PROVIDER_TIMEOUT',
      createdFrom: '',
      createdTo: '',
      sortBy: 'updatedAt',
      order: 'asc'
    });
    assert.equal(replaced.length, 1);
    assert.equal(replaced[0].q, 'demo');
    assert.equal(replaced[0].providerErrorCode, 'PROVIDER_TIMEOUT');
    assert.equal(replaced[0].sortBy, 'updatedAt');
    assert.equal(replaced[0].order, 'asc');
    assert.equal(replaced[0].isDefault, true);

    const marked = service.markTaskCenterFilterPresetUsed('u-admin', '默认失败任务');
    assert.ok(marked[0].lastUsedAt);

    service.upsertTaskCenterFilterPreset('u-admin', 'preset-default', {
      q: '',
      providerTaskId: '',
      status: '',
      providerErrorCode: '',
      createdFrom: '',
      createdTo: '',
      sortBy: 'createdAt',
      order: 'desc'
    });
    const setDefault = service.setDefaultTaskCenterFilterPreset('u-admin', 'preset-default');
    const defaultItem = setDefault.find((item) => item.name === 'preset-default');
    assert.equal(defaultItem?.isDefault, true);
    assert.equal(setDefault.filter((item) => item.isDefault).length, 1);

    for (let i = 0; i < 25; i += 1) {
      service.upsertTaskCenterFilterPreset('u-admin', `preset-${i}`, {
        q: String(i),
        providerTaskId: '',
        status: '',
        providerErrorCode: '',
        createdFrom: '',
        createdTo: '',
        sortBy: 'createdAt',
        order: 'desc'
      });
    }
    const limited = service.listTaskCenterFilterPresets('u-admin');
    assert.equal(limited.length, 27);
    assert.equal(limited[0].name, 'preset-default');
    assert.equal(limited[0].isDefault, true);
    assert.equal(limited.some((item) => item.name === 'preset-24'), true);

    const page1 = service.listTaskCenterFilterPresetsPaged('u-admin', { page: 1, pageSize: 10 });
    assert.equal(page1.items.length, 10);
    assert.equal(page1.total, 27);

    const deleted = service.deleteTaskCenterFilterPreset('u-admin', 'preset-24');
    assert.equal(deleted.some((item) => item.name === 'preset-24'), false);

    service.upsertTaskCenterFilterPreset('u-second', '隔离预设', {
      q: '',
      providerTaskId: '',
      status: '',
      providerErrorCode: '',
      createdFrom: '',
      createdTo: '',
      sortBy: 'createdAt',
      order: 'desc'
    });
    assert.equal(service.listTaskCenterFilterPresets('u-second').some((item) => item.name === '隔离预设'), true);
    assert.equal(service.listTaskCenterFilterPresets('u-admin').some((item) => item.name === '隔离预设'), false);
  } finally {
    cleanup();
  }
});

test('settings service should support ops summary, provider log clear and business reset', () => {
  const { store, service, cleanup } = createService();
  try {
    const timestamp = nowIso();
    store.createProject({
      id: 'p-ops',
      name: 'ops project',
      description: '',
      createdAt: timestamp,
      updatedAt: timestamp
    });
    store.createTask({
      id: 't-ops',
      projectId: 'p-ops',
      title: 'task',
      status: 'todo',
      priority: 'medium',
      dueAt: null,
      createdAt: timestamp,
      updatedAt: timestamp
    });
    store.createVideoMerge({
      id: 'm-ops',
      projectId: 'p-ops',
      title: 'merge',
      status: 'failed',
      clips: [],
      params: { keepAudio: true }
    });
    store.updateVideoMerge('p-ops', 'm-ops', {
      status: 'failed',
      errorCode: 'MERGE_SOURCE_NOT_FOUND',
      error: 'source file not found'
    });

    appendProviderLog({
      provider: 'mock',
      taskType: 'video',
      endpoint: '/submit',
      success: false,
      durationMs: 120,
      statusCode: 429,
      message: 'rate limited'
    });
    appendProviderLog({
      provider: 'vidu',
      taskType: 'image',
      endpoint: '/image',
      success: true,
      durationMs: 80
    });
    appendProviderLog({
      provider: 'mock',
      taskType: 'audio',
      endpoint: '/tts',
      success: true,
      durationMs: 60,
      message: 'ok'
    });
    appendAutoRepairLog({
      projectId: 'p-ops',
      taskId: 'v-1',
      storyboardId: 'sb-1',
      errorCode: 'PROVIDER_TIMEOUT',
      action: 'retry',
      success: true,
      detail: 'retry_enqueued',
      resultTaskId: 'v-1'
    });
    appendAutoRepairLog({
      projectId: 'p-ops',
      taskId: 'v-2',
      storyboardId: 'sb-2',
      errorCode: 'CAPABILITY_MISMATCH',
      action: 'recreate_conservative',
      success: false,
      detail: 'recreate_failed'
    });

    const filteredLogs = service.listProviderLogs({
      limit: 50,
      provider: 'mock',
      taskType: 'video',
      success: false,
      keyword: 'rate'
    });
    assert.equal(filteredLogs.length, 1);
    assert.equal(filteredLogs[0].provider, 'mock');
    assert.equal(filteredLogs[0].taskType, 'video');
    assert.equal(filteredLogs[0].success, false);

    const logBreakdown = service.getProviderLogBreakdown();
    assert.equal(logBreakdown.byProvider.length >= 2, true);
    const mockProvider = logBreakdown.byProvider.find((item) => item.provider === 'mock');
    assert.equal(mockProvider?.count, 2);
    assert.equal(mockProvider?.failed, 1);
    const videoStats = logBreakdown.byTaskType.find((item) => item.taskType === 'video');
    assert.equal(videoStats?.count, 1);
    assert.equal(videoStats?.failed, 1);

    const summary = service.getOpsSummary();
    assert.equal(summary.data.projectCount, 1);
    assert.equal(summary.data.taskCount, 1);
    assert.equal(summary.data.videoMergeCount, 1);
    assert.ok(summary.providerLogs.count >= 1);
    assert.ok(summary.autoRepairLogs.count >= 2);
    assert.ok(summary.autoRepairLogs.failed >= 1);
    const mergeStats = service.listVideoMergeErrorStats({ limit: 10 });
    assert.ok(mergeStats.length >= 1);
    assert.equal(mergeStats[0].errorCode, 'MERGE_SOURCE_NOT_FOUND');
    assert.ok(mergeStats[0].count >= 1);

    const cleared = service.clearProviderLogs();
    assert.ok(cleared.removed >= 1);
    assert.equal(service.getOpsSummary().providerLogs.count, 0);

    const autoRepairLogs = service.listAutoRepairLogs({ limit: 10, success: false, keyword: 'recreate' });
    assert.equal(autoRepairLogs.length, 1);
    assert.equal(autoRepairLogs[0].action, 'recreate_conservative');
    const autoRepairLogsByProject = service.listAutoRepairLogs({ limit: 10, projectId: 'p-ops' });
    assert.equal(autoRepairLogsByProject.length >= 2, true);
    const autoRepairLogsByTask = service.listAutoRepairLogs({ limit: 10, taskId: 'v-1' });
    assert.equal(autoRepairLogsByTask.length, 1);
    assert.equal(autoRepairLogsByTask[0].taskId, 'v-1');
    const autoRepairLogsByTaskIds = service.listAutoRepairLogs({ limit: 10, taskIds: ['v-1', 'v-2'] });
    assert.equal(autoRepairLogsByTaskIds.length >= 2, true);
    const autoRepairStats = service.getAutoRepairLogStats();
    assert.equal(autoRepairStats.count >= 2, true);
    assert.equal(autoRepairStats.byAction.some((item) => item.action === 'retry'), true);
    const clearedAutoRepairLogs = service.clearAutoRepairLogs();
    assert.ok(clearedAutoRepairLogs.removed >= 2);

    assert.equal(service.resetBusinessData('WRONG_CONFIRM'), null);
    const reset = service.resetBusinessData('RESET_BUSINESS_DATA');
    assert.ok(reset);
    assert.equal(reset?.removed.projects, 1);
    assert.equal(reset?.removed.tasks, 1);
    assert.equal(reset?.summary.data.projectCount, 0);
    assert.equal(reset?.summary.data.taskCount, 0);
  } finally {
    cleanup();
  }
});

test('settings service should export and import business backup', () => {
  const { store, service, cleanup } = createService();
  try {
    const timestamp = nowIso();
    store.createProject({
      id: 'p-backup',
      name: 'backup project',
      description: '',
      createdAt: timestamp,
      updatedAt: timestamp
    });
    store.createTask({
      id: 't-backup',
      projectId: 'p-backup',
      title: 'backup task',
      status: 'todo',
      priority: 'medium',
      dueAt: null,
      createdAt: timestamp,
      updatedAt: timestamp
    });

    const backup = service.exportBusinessBackup();
    assert.equal(backup.version, 'human2-backup-v1');
    assert.ok(Array.isArray(backup.tables.projects));
    assert.ok(backup.tables.projects.some((row) => row.id === 'p-backup'));

    service.resetBusinessData('RESET_BUSINESS_DATA');
    const afterReset = service.getOpsSummary();
    assert.equal(afterReset.data.projectCount, 0);

    const restored = service.importBusinessBackup(backup);
    assert.equal((restored.inserted.projects ?? 0) >= 1, true);
    assert.equal(restored.summary.data.projectCount, 1);
    assert.equal(restored.summary.data.taskCount, 1);
  } finally {
    cleanup();
  }
});

test('settings service should expose migration status', () => {
  const { service, cleanup } = createService();
  try {
    const status = service.getMigrationStatus();
    assert.equal(status.currentVersion >= 4, true);
    assert.equal(status.targetVersion, 4);
    assert.equal(Array.isArray(status.snapshots), true);
  } finally {
    cleanup();
  }
});

test('settings service should support migration snapshot download and restore by file', () => {
  const { service, cleanup } = createService();
  try {
    const status = service.getMigrationStatus();
    if (status.snapshots.length === 0) {
      throw new Error('expected migration snapshots to exist');
    }
    const fileName = status.snapshots[0].fileName;
    const content = service.getMigrationSnapshotContent(fileName);
    assert.ok(content);
    assert.equal(content?.fileName, fileName);
    assert.equal(typeof content?.payload, 'object');

    const restored = service.restoreMigrationSnapshotByFile(fileName);
    assert.ok(restored);
    assert.equal(restored?.restoredFrom, fileName);
    assert.ok(restored?.summary);
  } finally {
    cleanup();
  }
});
