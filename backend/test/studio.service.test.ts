import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SqliteStore } from '../src/db/sqlite.js';
import { ProjectsService } from '../src/modules/projects/projects.service.js';
import { StudioService } from '../src/modules/studio/studio.service.js';
import { MockAiProvider } from '../src/modules/pipeline/providers/mock.provider.js';
import { SettingsService } from '../src/modules/settings/settings.service.js';
import { AiProvider, ProviderTextInput } from '../src/modules/pipeline/providers/types.js';

const createServices = () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'human2-studio-test-'));
  const dataFile = path.join(tempRoot, 'app.db');
  const store = new SqliteStore(dataFile);

  return {
    projects: new ProjectsService(store),
    studio: new StudioService(store, new MockAiProvider()),
    cleanup: () => fs.rmSync(tempRoot, { recursive: true, force: true })
  };
};

test('studio chain should generate outlines and scripts from novel', async () => {
  const { projects, studio, cleanup } = createServices();

  try {
    const project = projects.createProject({ name: 'Studio Project' });

    const novel = studio.saveNovel(project.id, {
      title: '测试小说',
      content: '第一章主角出场。第二章发生冲突。第三章危机升级。第四章反转。第五章高潮。第六章结局。'
    });
    assert.ok(novel);

    const outlines = await studio.generateOutlines(project.id, { chapterCount: 3 });
    assert.ok(outlines);
    assert.equal((outlines ?? []).length > 0, true);

    const script = await studio.generateScript(project.id, { outlineId: outlines![0].id });
    assert.ok(script);

    const scripts = studio.listScripts(project.id);
    assert.equal((scripts ?? []).length, 1);
  } finally {
    cleanup();
  }
});

test('studio novel generation should pass selected text model config to provider', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'human2-studio-text-model-test-'));
  const dataFile = path.join(tempRoot, 'app.db');
  const store = new SqliteStore(dataFile);
  const projects = new ProjectsService(store);
  const settings = new SettingsService(store);
  let receivedInput: ProviderTextInput | null = null;

  const provider: AiProvider = {
    getCapabilities() {
      return [];
    },
    async generateText(input) {
      receivedInput = input;
      return { text: '生成成功' };
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
  };

  const studio = new StudioService(store, provider);

  try {
    const project = projects.createProject({ name: 'Text Model Project' });
    const model = settings.createModelConfig({
      type: 'text',
      name: 'Atlas Text',
      provider: 'http',
      manufacturer: 'atlascloud',
      model: 'deepseek-ai/deepseek-v3.2-speciale',
      endpoint: 'https://api.atlascloud.ai/v1/chat/completions',
      apiKey: 'atlas-key',
      isDefault: true
    });

    const novel = await studio.generateNovel(project.id, {
      idea: '写一个短篇科幻故事',
      modelId: model.id
    });

    assert.ok(novel);
    assert.ok(receivedInput);
    assert.equal(receivedInput?.model, 'deepseek-ai/deepseek-v3.2-speciale');
    assert.equal(receivedInput?.modelConfig?.manufacturer, 'atlascloud');
    assert.equal(receivedInput?.modelConfig?.endpoint, 'https://api.atlascloud.ai/v1/chat/completions');
    assert.equal(receivedInput?.modelConfig?.apiKey, 'atlas-key');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('studio outline/script generation should use text provider and expose generation metadata', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'human2-studio-outline-script-test-'));
  const dataFile = path.join(tempRoot, 'app.db');
  const store = new SqliteStore(dataFile);
  const projects = new ProjectsService(store);
  const settings = new SettingsService(store);
  const receivedPrompts: string[] = [];

  const provider: AiProvider = {
    getCapabilities() {
      return [];
    },
    async generateText(input) {
      receivedPrompts.push(input.prompt);
      if (input.prompt.includes('只输出严格 JSON') && input.prompt.includes('"outlines"')) {
        return {
          text: JSON.stringify({
            outlines: [
              { title: '第一章：雨夜启程', summary: '主角接下最后一次翻盘任务，开始重整提案与团队关系。' },
              { title: '第二章：海边告别', summary: '主角在冲突与和解中完成最终表达，推动故事进入收束阶段。' }
            ]
          })
        };
      }
      return {
        text: '【场次标题】雨夜提案\n【剧情概述】主角在期限逼近时完成提案重组。\n【分场脚本】\n1. 场景：工作室 / 夜\n主角独自修改提案。\n2. 场景：走廊 / 暴雨\n外部压力继续逼近。\n3. 场景：会议室 / 凌晨\n团队重新集合推进。\n4. 场景：海边 / 清晨\n角色完成情绪收束。'
      };
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
  };

  const studio = new StudioService(store, provider);

  try {
    const project = projects.createProject({ name: 'Outline Script Project' });
    const model = settings.createModelConfig({
      type: 'text',
      name: 'ModelScope Text',
      provider: 'http',
      manufacturer: 'modelscope',
      model: 'Qwen/Qwen3-8B',
      endpoint: 'https://api-inference.modelscope.cn/v1/chat/completions',
      apiKey: 'sdk-token',
      isDefault: true
    });

    studio.saveNovel(project.id, {
      title: '暴雨夜的告别',
      content: '林远在暴雨夜必须赶出最后一次翻盘提案，并在海边短片的创作中重新确认自己真正想说的话。'
    });

    const outlines = await studio.generateOutlinesWithMeta(project.id, {
      chapterCount: 2,
      modelId: model.id
    });
    assert.ok(outlines);
    assert.equal(outlines?.items.length, 2);
    assert.equal(outlines?.generation.usedConfiguredModel, true);
    assert.equal(outlines?.generation.model, 'Qwen/Qwen3-8B');
    assert.equal(outlines?.generation.modelLabel, 'ModelScope Text');

    const script = await studio.generateScriptWithMeta(project.id, {
      outlineId: outlines!.items[0].id,
      modelId: model.id
    });
    assert.ok(script);
    assert.match(script?.script.content ?? '', /【场次标题】/);
    assert.equal(script?.generation.usedConfiguredModel, true);
    assert.equal(script?.generation.model, 'Qwen/Qwen3-8B');

    assert.equal(receivedPrompts.length, 2);
    assert.match(receivedPrompts[0] ?? '', /只输出严格 JSON/);
    assert.match(receivedPrompts[1] ?? '', /中文分场脚本/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('studio outline generation should auto-pick the single enabled text model when no default is set', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'human2-studio-single-model-test-'));
  const dataFile = path.join(tempRoot, 'app.db');
  const store = new SqliteStore(dataFile);
  const projects = new ProjectsService(store);
  const settings = new SettingsService(store);
  let receivedModel: string | null = null;

  const provider: AiProvider = {
    getCapabilities() {
      return [];
    },
    async generateText(input) {
      receivedModel = input.modelConfig?.model ?? null;
      return {
        text: JSON.stringify({
          outlines: [
            { title: '第一章：雨夜启程', summary: '主角接下最后一次翻盘任务，开始重整提案与团队关系。' }
          ]
        })
      };
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
  };

  const studio = new StudioService(store, provider);

  try {
    const project = projects.createProject({ name: 'Single Model Project' });
    settings.createModelConfig({
      type: 'text',
      name: 'Only Text Model',
      provider: 'http',
      manufacturer: 'openai-compatible',
      model: 'Qwen/Qwen3-8B',
      endpoint: 'https://api-inference.modelscope.cn/v1/chat/completions',
      apiKey: 'sdk-token',
      isDefault: false
    });

    studio.saveNovel(project.id, {
      title: '暴雨夜的告别',
      content: '林远在暴雨夜必须赶出最后一次翻盘提案，并在海边短片的创作中重新确认自己真正想说的话。'
    });

    const outlines = await studio.generateOutlinesWithMeta(project.id, { chapterCount: 1 });
    assert.ok(outlines);
    assert.equal(outlines?.generation.usedConfiguredModel, true);
    assert.equal(outlines?.generation.model, 'Qwen/Qwen3-8B');
    assert.equal(receivedModel, 'Qwen/Qwen3-8B');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
