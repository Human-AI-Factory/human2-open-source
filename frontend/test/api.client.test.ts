import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from '../src/api/client';

const createLocalStorageStub = () => {
  const store = new Map<string, string>();
  return {
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    }
  };
};

test('api client should accept 201 enveloped responses as success', async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;

  globalThis.localStorage = createLocalStorageStub() as Storage;
  globalThis.window = { dispatchEvent() {} } as Window & typeof globalThis;
  globalThis.fetch = (async () =>
    ({
      ok: true,
      status: 201,
      async json() {
        return {
          code: 201,
          bizCode: 'OK',
          data: { id: 'novel-1', title: '站内生成成功' },
          message: 'created'
        };
      }
    }) as Response) as typeof fetch;

  try {
    const payload = await request<{ id: string; title: string }>('/api/studio/projects/p-1/novel/generate', {
      method: 'POST',
      body: JSON.stringify({ idea: 'x' })
    });
    assert.equal(payload.id, 'novel-1');
    assert.equal(payload.title, '站内生成成功');
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
    globalThis.localStorage = originalLocalStorage;
  }
});
