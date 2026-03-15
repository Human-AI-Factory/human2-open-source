import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createLocalRuntimeController } = require('../../desktop/shell/local-runtime-controller.cjs') as {
  createLocalRuntimeController: (input: Record<string, unknown>) => {
    bootstrap: () => Promise<void>;
    queueSummary: () => { recoveredTaskCount: number; total: number; done: number };
    enqueueLocalTask: (type: string, payload: Record<string, unknown>, source?: string) => Promise<{ id: string }>;
    processQueueTick: () => Promise<void>;
    getLocalQueueSnapshot: () => { tasks: Array<Record<string, any>> };
    exportDiagnostics: (filePath: string, meta: { appVersion: string; platform: string }) => Promise<{ filePath: string }>;
    dispose: () => void;
  };
};

test('desktop local runtime controller should recover running tasks and process local preview jobs', async () => {
  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'human2-desktop-runtime-test-'));
  const desktopStatePath = path.join(tempRoot, 'desktop.json');
  const localQueuePath = path.join(tempRoot, 'queue.json');
  const localJobsDir = path.join(tempRoot, 'jobs');
  const diagnosticsPath = path.join(tempRoot, 'diagnostics.json');
  const nowIso = () => '2026-03-07T00:00:00.000Z';

  await fsp.writeFile(
    localQueuePath,
    JSON.stringify({
      tasks: [
        {
          id: 'recovered-running-task',
          type: 'noop',
          source: 'session',
          payload: {},
          status: 'running',
          createdAt: nowIso(),
          updatedAt: nowIso()
        }
      ]
    }),
    'utf8'
  );

  const controller = createLocalRuntimeController({
    fs,
    fsp,
    collectMediaFiles: async () => [],
    desktopStatePath,
    localQueuePath,
    localJobsDir,
    nowIso,
    queueTickMs: 10
  });

  try {
    await controller.bootstrap();
    assert.equal(controller.queueSummary().recoveredTaskCount, 1);

    const enqueued = await controller.enqueueLocalTask(
      'compose-local-preview',
      {
        title: 'Smoke Preview',
        clips: [{ id: 'clip-1' }]
      },
      'test'
    );
    assert.ok(enqueued.id);

    await controller.processQueueTick();
    const snapshot = controller.getLocalQueueSnapshot();
    const previewTask = snapshot.tasks.find((task) => task.type === 'compose-local-preview');
    assert.ok(previewTask);
    assert.equal(previewTask.status, 'done');
    assert.ok(typeof previewTask.result?.outputFile === 'string');
    assert.ok(fs.existsSync(previewTask.result.outputFile));

    const diagnostics = await controller.exportDiagnostics(diagnosticsPath, {
      appVersion: '0.1.0-test',
      platform: 'darwin'
    });
    assert.equal(diagnostics.filePath, diagnosticsPath);
    assert.ok(fs.existsSync(diagnosticsPath));
  } finally {
    controller.dispose();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
