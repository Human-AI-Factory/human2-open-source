import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SqliteStore } from '../src/db/sqlite.js';
import { ProviderValidationError } from '../src/modules/pipeline/providers/errors.js';
import type { AiProvider, ProviderCapability, ProviderTextInput } from '../src/modules/pipeline/providers/types.js';
import { ModelConnectionService } from '../src/modules/settings/model-connection.service.js';

const createHarness = () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'human2-model-connection-test-'));
  const dataFile = path.join(tempRoot, 'app.db');
  const store = new SqliteStore(dataFile);
  const cleanup = () => fs.rmSync(tempRoot, { recursive: true, force: true });
  return { store, cleanup };
};

const createProvider = (handlers: {
  onText?: (input: ProviderTextInput) => Promise<{ text: string }>;
}): AiProvider => ({
  getCapabilities(): ProviderCapability[] {
    return [];
  },
  async generateText(input) {
    if (!handlers.onText) {
      throw new Error('text handler missing');
    }
    return handlers.onText(input);
  },
  async generateImage() {
    throw new Error('not used');
  },
  async generateVideo() {
    throw new Error('not used');
  },
  async generateAudio() {
    throw new Error('not used');
  }
});

test('model connection service should report success for text draft models', async () => {
  const { store, cleanup } = createHarness();
  const service = new ModelConnectionService(
    store,
    createProvider({
      async onText(input) {
        assert.equal(input.modelConfig?.manufacturer, 'atlascloud');
        assert.equal(input.modelConfig?.endpoint, 'https://api.atlascloud.ai/v1/chat/completions');
        return { text: 'CONNECTION_OK' };
      }
    })
  );

  try {
    const result = await service.testDraft({
      type: 'text',
      name: 'Atlas Text',
      provider: 'http',
      manufacturer: 'atlascloud',
      model: 'deepseek-ai/deepseek-v3.2-speciale',
      authType: 'bearer',
      endpoint: 'https://api.atlascloud.ai/v1/chat/completions',
      apiKey: 'atlas-key'
    });

    assert.equal(result.ok, true);
    assert.equal(result.preview, 'CONNECTION_OK');
    assert.equal(result.statusCode, null);
    assert.equal(result.errorKind, null);
  } finally {
    cleanup();
  }
});

test('model connection service should preserve saved api key for edit-time connection tests', async () => {
  const { store, cleanup } = createHarness();
  let receivedApiKey = '';
  const service = new ModelConnectionService(
    store,
    createProvider({
      async onText(input) {
        receivedApiKey = input.modelConfig?.apiKey ?? '';
        return { text: 'CONNECTION_OK' };
      }
    })
  );

  try {
    const model = store.createModelConfig({
      id: 'model-atlas',
      type: 'text',
      name: 'Atlas Text',
      provider: 'http',
      manufacturer: 'atlascloud',
      model: 'deepseek-ai/deepseek-v3.2-speciale',
      authType: 'bearer',
      endpoint: 'https://api.atlascloud.ai/v1/chat/completions',
      endpoints: {},
      apiKey: 'stored-atlas-key',
      capabilities: {},
      priority: 100,
      rateLimit: 0,
      isDefault: true,
      enabled: true
    });

    const result = await service.testStoredModel(model.id, {
      model: 'deepseek-ai/deepseek-v3.2-speciale',
      apiKey: ''
    });

    assert.ok(result);
    assert.equal(result?.ok, true);
    assert.equal(receivedApiKey, 'stored-atlas-key');
  } finally {
    cleanup();
  }
});

test('model connection service should surface provider status codes on failures', async () => {
  const { store, cleanup } = createHarness();
  const service = new ModelConnectionService(
    store,
    createProvider({
      async onText() {
        throw new ProviderValidationError('insufficient balance', 402);
      }
    })
  );

  try {
    const model = store.createModelConfig({
      id: 'model-atlas-fail',
      type: 'text',
      name: 'Atlas Text',
      provider: 'http',
      manufacturer: 'atlascloud',
      model: 'deepseek-ai/deepseek-v3.2-speciale',
      authType: 'bearer',
      endpoint: 'https://api.atlascloud.ai/v1/chat/completions',
      endpoints: {},
      apiKey: 'stored-atlas-key',
      capabilities: {},
      priority: 100,
      rateLimit: 0,
      isDefault: true,
      enabled: true
    });

    const result = await service.testStoredModel(model.id);
    assert.ok(result);
    assert.equal(result?.ok, false);
    assert.equal(result?.statusCode, 402);
    assert.equal(result?.errorKind, 'validation');
    assert.equal(result?.message, 'insufficient balance');
  } finally {
    cleanup();
  }
});
