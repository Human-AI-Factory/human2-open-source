import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SqliteStore } from '../src/db/sqlite.js';
import { PipelineService } from '../src/modules/pipeline/pipeline.service.js';
import { MockAiProvider } from '../src/modules/pipeline/providers/mock.provider.js';
import { TasksService } from '../src/modules/tasks/tasks.service.js';
import { TASK_TYPE_CATALOG } from '../src/modules/tasks/task-type-catalog.js';

const createTasksService = () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'human2-task-catalog-contract-'));
  const dataFile = path.join(tempRoot, 'app.db');
  const store = new SqliteStore(dataFile);
  const pipeline = new PipelineService(store, new MockAiProvider(), 1, { videoMergeEngine: 'placeholder' });
  const tasks = new TasksService(store, pipeline);
  return {
    tasks,
    cleanup: async () => {
      await pipeline.shutdown();
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  };
};

test('contract matrix: task catalog endpoint should mirror source catalog', async () => {
  const { tasks, cleanup } = createTasksService();
  try {
    const runtimeCatalog = tasks.getTaskTypeCatalog();
    assert.equal(runtimeCatalog.length, TASK_TYPE_CATALOG.length);
    for (const item of TASK_TYPE_CATALOG) {
      const found = runtimeCatalog.find((entry) => entry.taskType === item.taskType);
      assert.ok(found, `missing taskType=${item.taskType}`);
      assert.equal(found?.queueTopic, item.queueTopic);
      assert.deepEqual(found?.terminalStatuses, item.terminalStatuses);
      assert.deepEqual(found?.retryableStatuses, item.retryableStatuses);
      assert.equal(found?.defaultPriority, item.defaultPriority);
    }
  } finally {
    await cleanup();
  }
});

for (const item of TASK_TYPE_CATALOG) {
  test(`contract matrix: taskType=${item.taskType} should satisfy catalog invariants`, () => {
    assert.ok(item.queueTopic.trim().length > 0, 'queueTopic should not be empty');
    assert.ok(item.terminalStatuses.length > 0, 'terminalStatuses should not be empty');
    assert.ok(item.retryableStatuses.length > 0, 'retryableStatuses should not be empty');
    assert.ok(item.retryableStatuses.every((status) => item.terminalStatuses.includes(status)), 'retryableStatuses must be subset of terminalStatuses');
    assert.ok(['low', 'medium', 'high'].includes(item.defaultPriority), 'defaultPriority should be low/medium/high');
    assert.equal(new Set(item.terminalStatuses).size, item.terminalStatuses.length, 'terminalStatuses should be unique');
    assert.equal(new Set(item.retryableStatuses).size, item.retryableStatuses.length, 'retryableStatuses should be unique');
  });
}
