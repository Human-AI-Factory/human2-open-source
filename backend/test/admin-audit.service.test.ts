import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SqliteStore } from '../src/db/sqlite.js';
import { AdminAuditService } from '../src/modules/settings/admin-audit.service.js';

const createHarness = () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'human2-admin-audit-test-'));
  const dataFile = path.join(tempRoot, 'app.db');
  const store = new SqliteStore(dataFile);
  return {
    service: new AdminAuditService(store),
    cleanup: () => fs.rmSync(tempRoot, { recursive: true, force: true })
  };
};

test('admin audit service should record, filter and export logs', () => {
  const { service, cleanup } = createHarness();
  try {
    const first = service.record({
      scope: 'settings',
      action: 'settings.runtime.update',
      actorId: 'u-admin',
      actorRole: 'admin',
      requestId: 'req-1',
      targetId: 'task-runtime',
      details: { videoTaskAutoRetry: 2 }
    });
    service.record({
      scope: 'tasks',
      action: 'tasks.failure-injection.update',
      actorId: 'u-admin',
      actorRole: 'admin',
      requestId: 'req-2',
      targetId: 'failure-injection-config',
      details: { enabled: true }
    });

    assert.equal(first.scope, 'settings');
    assert.equal(first.actorRole, 'admin');

    const all = service.list({ limit: 10 });
    assert.equal(all.length, 2);
    assert.equal(all[0].scope, 'tasks');

    const filtered = service.list({ scope: 'settings', action: 'runtime' });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].targetId, 'task-runtime');

    const exportedJson = service.export({ format: 'json', limit: 10, actorId: 'u-admin' });
    assert.equal(exportedJson.contentType, 'application/json; charset=utf-8');
    assert.ok(exportedJson.body.includes('settings.runtime.update'));

    const exportedCsv = service.export({ format: 'csv', limit: 10 });
    assert.equal(exportedCsv.contentType, 'text/csv; charset=utf-8');
    assert.ok(exportedCsv.body.includes('"scope","action","actorId"'));
  } finally {
    cleanup();
  }
});
