import test from 'node:test';
import assert from 'node:assert/strict';
import { ModelConfigAwareAiProvider } from '../src/modules/pipeline/providers/model-config-aware.provider.js';
import { AiProvider, ProviderCapability, ProviderTextInput } from '../src/modules/pipeline/providers/types.js';

const createProvider = (label: string, calls: string[]): AiProvider => ({
  getCapabilities(): ProviderCapability[] {
    return [];
  },
  async generateText(_input: ProviderTextInput) {
    calls.push(label);
    return { text: label };
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

test('model-config-aware provider should prefer configured provider when modelConfig exists', async () => {
  const calls: string[] = [];
  const provider = new ModelConfigAwareAiProvider(createProvider('configured', calls), createProvider('fallback', calls));

  const configuredResult = await provider.generateText({
    prompt: 'p',
    projectId: 'project-1',
    modelConfig: {
      provider: 'http',
      manufacturer: 'atlascloud',
      model: 'atlas-model',
      authType: 'bearer',
      endpoint: 'https://api.atlascloud.ai/v1/chat/completions',
      endpoints: {},
      apiKey: 'k',
      capabilities: {}
    }
  });
  const fallbackResult = await provider.generateText({
    prompt: 'p',
    projectId: 'project-2'
  });

  assert.equal(configuredResult.text, 'configured');
  assert.equal(fallbackResult.text, 'fallback');
  assert.deepEqual(calls, ['configured', 'fallback']);
});
