import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SqliteStore } from '../src/db/sqlite.js';
import { AuthService } from '../src/modules/auth/auth.service.js';

const createStore = () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'human2-auth-test-'));
  const dataFile = path.join(tempRoot, 'app.db');
  const store = new SqliteStore(dataFile);

  return {
    store,
    cleanup: () => fs.rmSync(tempRoot, { recursive: true, force: true })
  };
};

test('auth service login and verify token', () => {
  const { store, cleanup } = createStore();
  try {
    const authService = new AuthService(store, 'test-secret', '1h');

    const failToken = authService.login('admin', 'wrong');
    assert.equal(failToken, null);

    const token = authService.login('admin', 'admin123');
    assert.ok(token);
    assert.equal(authService.verify(token), true);
  } finally {
    cleanup();
  }
});
