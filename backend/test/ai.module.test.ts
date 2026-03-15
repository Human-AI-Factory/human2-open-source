import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SqliteStore } from '../src/db/sqlite.js';
import { CapabilityCatalogService } from '../src/modules/ai/capability-catalog.service.js';
import { CharacterBibleService } from '../src/modules/ai/character-bible.service.js';
import { createAiModule } from '../src/modules/ai/ai.module.js';
import { MediaModelPolicyService } from '../src/modules/ai/media-model-policy.service.js';
import { PromptCompilerService } from '../src/modules/ai/prompt-compiler.service.js';
import { ProviderRegistryService } from '../src/modules/ai/provider-registry.service.js';
import { SettingsService } from '../src/modules/settings/settings.service.js';

const createHarness = () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'human2-ai-module-test-'));
  const dataFile = path.join(tempRoot, 'app.db');
  const store = new SqliteStore(dataFile);
  return {
    store,
    settings: new SettingsService(store),
    aiModule: createAiModule({ store }),
    cleanup: () => fs.rmSync(tempRoot, { recursive: true, force: true })
  };
};

test('ai module should expose stable provider registry snapshots', () => {
  const { aiModule, cleanup } = createHarness();
  try {
    assert.deepEqual(aiModule.providerRegistryService.listProviderNames(), ['http', 'mock']);
    assert.equal(aiModule.providerRegistryService.resolveProviderName('vidu'), 'http');
    assert.equal(aiModule.providerRegistryService.resolveProviderName('Demo'), 'mock');
    const descriptor = aiModule.providerRegistryService.resolveProviderDescriptor('doubao');
    assert.equal(descriptor?.provider, 'http');
    assert.equal(descriptor?.transport, 'http');
    const first = aiModule.providerRegistryService.getProviderCatalogCapabilities();
    assert.ok(first.mock.length > 0);
    first.mock[0].enabled = !first.mock[0].enabled;
    const second = aiModule.providerRegistryService.getProviderCatalogCapabilities();
    assert.notEqual(second.mock[0].enabled, first.mock[0].enabled);
  } finally {
    cleanup();
  }
});

test('ai module should preserve explicit injected service instances', () => {
  const { store, cleanup } = createHarness();
  try {
    const providerRegistryService = new ProviderRegistryService();
    const capabilityCatalogService = new CapabilityCatalogService();
    const promptCompilerService = new PromptCompilerService(store);
    const characterBibleService = new CharacterBibleService(store);
    const mediaModelPolicyService = new MediaModelPolicyService(store, capabilityCatalogService);

    const aiModule = createAiModule({
      store,
      providerRegistryService,
      capabilityCatalogService,
      promptCompilerService,
      characterBibleService,
      mediaModelPolicyService
    });

    assert.equal(aiModule.providerRegistryService, providerRegistryService);
    assert.equal(aiModule.capabilityCatalogService, capabilityCatalogService);
    assert.equal(aiModule.promptCompilerService, promptCompilerService);
    assert.equal(aiModule.characterBibleService, characterBibleService);
    assert.equal(aiModule.mediaModelPolicyService, mediaModelPolicyService);
  } finally {
    cleanup();
  }
});

test('ai module should share capability parsing and model policy over store-backed configs', () => {
  const { settings, aiModule, cleanup } = createHarness();
  try {
    const model = settings.createModelConfig({
      type: 'video',
      name: 'Module Video Model',
      provider: 'mock',
      manufacturer: 'mock',
      endpoint: 'http://example.test/video',
      apiKey: 'secret',
      isDefault: true,
      capabilities: {
        video: {
          modes: ['text', 'singleImage'],
          durations: [5, 10.7],
          resolutions: ['720p'],
          aspectRatios: ['16:9'],
          audioSupported: false,
          providerOptions: {
            seed: { type: 'number', min: 1, max: 99 }
          }
        }
      }
    });

    const capabilities = aiModule.capabilityCatalogService.getVideoCapabilities(model);
    assert.deepEqual(capabilities?.modes, ['text', 'singleImage']);
    assert.deepEqual(capabilities?.durations, [5, 10]);
    assert.deepEqual(capabilities?.resolutions, ['720p']);
    assert.deepEqual(aiModule.capabilityCatalogService.getProviderOptionRules(capabilities?.root ?? {}), {
      seed: { type: 'number', min: 1, max: 99 }
    });

    assert.equal(aiModule.mediaModelPolicyService.resolveModelName('video'), 'Module Video Model');
    const picked = aiModule.mediaModelPolicyService.pickModelConfig('video', 'Module Video Model');
    assert.equal(picked?.id, model.id);

    const templates = aiModule.promptCompilerService.listTemplates();
    assert.ok(templates.length > 0);
    const compiled = aiModule.promptCompilerService.compile({
      templateId: templates[0].id,
      variables: { title: 'AI 模块' },
      extraSections: ['附加：{{title}}']
    });
    assert.ok(compiled.content.includes('AI 模块'));

    const workflowPrompt = aiModule.promptCompilerService.compileWorkflowPrompt({
      projectId: 'missing-project',
      fallbackContent: 'Project={{projectId}}\nCharacters={{characterCount}}',
      includeCharacterBible: true
    });
    assert.ok(workflowPrompt.content.includes('Project=missing-project'));
    assert.ok(workflowPrompt.content.includes('Characters=0'));
  } finally {
    cleanup();
  }
});
