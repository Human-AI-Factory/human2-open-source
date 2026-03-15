import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { v4 as uuid } from 'uuid';
import { SqliteStore } from '../src/db/sqlite.js';
import { ProjectsService } from '../src/modules/projects/projects.service.js';
import { StudioService } from '../src/modules/studio/studio.service.js';
import { PipelineService } from '../src/modules/pipeline/pipeline.service.js';
import { MockAiProvider } from '../src/modules/pipeline/providers/mock.provider.js';
import { ProviderRateLimitError, ProviderTransientError, ProviderValidationError } from '../src/modules/pipeline/providers/errors.js';
import { SettingsService } from '../src/modules/settings/settings.service.js';
import type { AiProvider } from '../src/modules/pipeline/providers/types.js';
import { DomainService } from '../src/modules/domain/domain.service.js';

const createServices = () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'human2-pipeline-test-'));
  const dataFile = path.join(tempRoot, 'app.db');
  const store = new SqliteStore(dataFile);
  const baseProvider = new MockAiProvider();
  const provider: AiProvider = {
    getCapabilities() {
      return baseProvider.getCapabilities();
    },
    async generateText(input) {
      return baseProvider.generateText(input);
    },
    async generateImage(input) {
      return baseProvider.generateImage(input);
    },
    async generateVideo(input) {
      return baseProvider.generateVideo(input);
    },
    async generateAudio(input) {
      return {
        url: `https://audio.example/${input.projectId}-${input.storyboardId}.mp3`,
      };
    },
  };
  const settings = new SettingsService(store);
  settings.createModelConfig({
    type: 'audio',
    name: 'Test Audio Model',
    provider: 'http',
    manufacturer: 'other',
    model: 'audio-test-v1',
    authType: 'none',
    endpoint: 'http://example.test/audio',
    apiKey: 'noop',
    enabled: true,
    isDefault: true,
  });

  const pipeline = new PipelineService(store, provider, 2, { videoMergeEngine: 'placeholder' });
  return {
    projects: new ProjectsService(store),
    studio: new StudioService(store, provider),
    pipeline,
    settings,
    cleanup: async () => {
      await pipeline.shutdown();
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  };
};

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

const waitForTaskTerminal = async (
  pipeline: PipelineService,
  projectId: string,
  taskId: string,
  timeoutMs = 5000
) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const task = (pipeline.listVideoTasks(projectId) ?? []).find((item) => item.id === taskId);
    if (task && (task.status === 'done' || task.status === 'failed' || task.status === 'cancelled')) {
      return task;
    }
    await sleep(40);
  }
  throw new Error(`task timeout: ${taskId}`);
};

const waitForMergeTerminal = async (
  pipeline: PipelineService,
  projectId: string,
  mergeId: string,
  timeoutMs = 5000
) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const merge = (pipeline.listVideoMerges(projectId) ?? []).find((item) => item.id === mergeId);
    if (merge && (merge.status === 'done' || merge.status === 'failed')) {
      return merge;
    }
    await sleep(40);
  }
  throw new Error(`merge timeout: ${mergeId}`);
};

test('pipeline chain should generate storyboard assets and video task', async () => {
  const { projects, studio, pipeline, cleanup } = createServices();

  try {
    const project = projects.createProject({ name: 'Pipeline Project' });
    studio.saveNovel(project.id, {
      title: 'N',
      content: '第一段。第二段。第三段。'
    });
    const outlines = await studio.generateOutlines(project.id, { chapterCount: 2 });
    assert.ok(outlines && outlines.length > 0);

    const script = await studio.generateScript(project.id, { outlineId: outlines![0].id });
    assert.ok(script);

    const storyboards = await pipeline.generateStoryboards(project.id, script!.id);
    assert.ok(storyboards && storyboards.length > 0);
    assert.ok(storyboards![0]?.imageUrl?.includes('/mock/'), 'generated storyboard should persist imageUrl');
    assert.ok(!storyboards![0]!.prompt.includes('[image:'), 'generated storyboard prompt should stay clean');
    assert.ok(!storyboards![0]!.prompt.includes('【场次标题】'), 'generated storyboard prompt should not leak script labels');
    assert.ok(storyboards![0]!.plan, 'generated storyboard should persist structured plan');
    assert.ok(storyboards![0]!.plan?.finalImagePrompt.includes('场景：'));

    const assets = await pipeline.generateAssets(project.id, storyboards![0].id);
    assert.ok(assets && assets.length > 0);

    const task = await pipeline.createAndRunVideoTask(project.id, storyboards![0].id);
    assert.ok(task);
    const completed = await waitForTaskTerminal(pipeline, project.id, task!.id);
    assert.equal(completed.status, 'done');
    assert.equal(completed.progress, 100);
  } finally {
    await cleanup();
  }
});

test('pipeline should preserve script episode binding when generating storyboards', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'human2-pipeline-episode-binding-test-'));
  const dataFile = path.join(tempRoot, 'app.db');
  const store = new SqliteStore(dataFile);
  const provider = new MockAiProvider();
  const projects = new ProjectsService(store);
  const studio = new StudioService(store, provider);
  const pipeline = new PipelineService(store, provider, 2, { videoMergeEngine: 'placeholder' });
  const domain = new DomainService(store);

  try {
    const project = projects.createProject({ name: 'Pipeline Episode Binding Project' });
    const drama = domain.upsertDrama(project.id, { name: '主线' });
    assert.ok(drama);
    const episode = domain.createEpisode(project.id, { dramaId: drama!.id, title: '第1集' });
    assert.ok(episode);

    studio.saveNovel(project.id, { title: 'N', content: '第一段。第二段。第三段。' });
    const outlines = await studio.generateOutlines(project.id, { chapterCount: 2 });
    assert.ok(outlines && outlines.length > 0);
    const script = await studio.generateScript(project.id, { outlineId: outlines![0].id });
    assert.ok(script);

    const boundScript = store.updateScriptEpisode(project.id, script!.id, episode!.id);
    assert.ok(boundScript);
    assert.equal(boundScript?.episodeId, episode!.id);

    const storyboards = await pipeline.generateStoryboards(project.id, script!.id);
    assert.ok(storyboards && storyboards.length > 0);
    assert.ok(storyboards!.every((item) => item.episodeId === episode!.id));

    const episodeBoards = store.listStoryboardsByEpisode(project.id, episode!.id) ?? [];
    assert.equal(episodeBoards.length, storyboards!.length);
  } finally {
    await pipeline.shutdown();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('pipeline should separate storyboard planning from rendering', async () => {
  const { projects, studio, pipeline, cleanup } = createServices();

  try {
    const project = projects.createProject({ name: 'Pipeline Plan Render Project' });
    studio.saveNovel(project.id, { title: 'N', content: '第一段。第二段。第三段。' });
    const outlines = await studio.generateOutlines(project.id, { chapterCount: 2 });
    assert.ok(outlines && outlines.length > 0);
    const script = await studio.generateScript(project.id, { outlineId: outlines![0].id });
    assert.ok(script);

    const planned = await pipeline.planStoryboards(project.id, script!.id);
    assert.ok(planned && planned.length > 0);
    assert.ok(planned!.every((item) => item.status === 'draft'));
    assert.ok(planned!.every((item) => item.imageUrl === null));

    const rendered = await pipeline.renderStoryboardImages(project.id, { scriptId: script!.id });
    assert.ok(rendered && rendered.length === planned!.length);
    assert.ok(rendered!.every((item) => item.status === 'generated'));
    assert.ok(rendered!.every((item) => item.imageUrl?.includes('/mock/')));
  } finally {
    await cleanup();
  }
});

test('pipeline should normalize DashScope storyboard render prompts for image safety before generation', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'human2-pipeline-safe-image-render-test-'));
  const dataFile = path.join(tempRoot, 'app.db');
  const store = new SqliteStore(dataFile);
  const baseProvider = new MockAiProvider();
  const imagePrompts: string[] = [];
  const provider: AiProvider = {
    getCapabilities() {
      return baseProvider.getCapabilities();
    },
    async generateText(input) {
      return baseProvider.generateText(input);
    },
    async generateImage(input) {
      imagePrompts.push(input.prompt);
      return { url: `/mock/storyboard/${imagePrompts.length}.png` };
    },
    async generateVideo(input) {
      return baseProvider.generateVideo(input);
    },
    async generateAudio(input) {
      return baseProvider.generateAudio(input);
    },
  };

  const projects = new ProjectsService(store);
  const studio = new StudioService(store, provider);
  const settings = new SettingsService(store);
  settings.createModelConfig({
    type: 'image',
    name: 'wan-image',
    provider: 'http',
    manufacturer: 'wan',
    model: 'qwen-image-2.0-pro',
    authType: 'bearer',
    endpoint: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
    apiKey: 'wan-test-key',
    enabled: true,
    isDefault: true,
  });
  const pipeline = new PipelineService(store, provider, 2, { videoMergeEngine: 'placeholder' });

  try {
    const project = projects.createProject({ name: 'Pipeline Safe Image Prompt Project' });
    studio.saveNovel(project.id, {
      title: 'N',
      content: '第一段。第二段。第三段。'
    });
    const outlines = await studio.generateOutlines(project.id, { chapterCount: 1 });
    assert.ok(outlines && outlines.length === 1);
    const script = await studio.generateScript(project.id, { outlineId: outlines![0].id });
    assert.ok(script);

    const sensitiveAction = '龙梅拖着她半边身体在冰面爬行，指甲在冰壳刮出五道鲜红血线；玉荣昏倒在冰裂纹旁，左膝渗血，皮肤发黑龟裂。';
    const storyboards = store.replaceStoryboards(project.id, script!.id, [
      {
        id: uuid(),
        title: '龙梅冰面爬行刮出血线，救出冰缝羔羊',
        prompt: '占位分镜 prompt',
        status: 'draft',
        plan: {
          shotTitle: '龙梅冰面爬行刮出血线，救出冰缝羔羊',
          continuityGroupId: 'snowstorm-group-a',
          scene: '雪原冻湖边缘',
          time: '清晨',
          subject: '11岁龙梅和8岁玉荣',
          action: sensitiveAction,
          composition: '近景，玉荣倒在雪地上，龙梅奋力靠近她，冰面裂纹向远处延展。',
          lighting: '冷冽晨光穿透云层，雪面反光刺眼。',
          finalImagePrompt:
            '清晨的雪原冻湖边缘，11岁龙梅拖着受伤身体在冰面爬行，指甲刮出鲜红血线；8岁玉荣昏倒在冰裂纹旁，左膝渗血，皮肤发黑龟裂，画面冷冽写实。',
          characterIds: [],
          sceneEntityId: null,
          propEntityIds: [],
          baseSceneAssetId: null,
          baseCharacterAssetIds: [],
          shotSceneStateId: null,
          shotCharacterStateIds: [],
          sceneAssetId: null,
          characterAssetIds: [],
          propAssetIds: [],
        },
      },
    ]);
    assert.ok(storyboards && storyboards.length === 1);

    const rendered = await pipeline.renderStoryboardImages(project.id, { scriptId: script!.id });
    assert.ok(rendered && rendered.length === 1);
    assert.equal(imagePrompts.length, 1);

    const submittedPrompt = imagePrompts[0]!;
    assert.ok(submittedPrompt.includes('年幼'));
    assert.ok(submittedPrompt.includes('膝部受伤、行动艰难'));
    assert.ok(submittedPrompt.includes('醒目的痕迹'));
    assert.ok(submittedPrompt.includes('冻伤明显、状态极差'));
    assert.ok(submittedPrompt.includes('以克制方式表现危险处境'));
    assert.ok(!submittedPrompt.includes('11岁'));
    assert.ok(!submittedPrompt.includes('8岁'));
    assert.ok(!submittedPrompt.includes('鲜红血线'));
    assert.ok(!submittedPrompt.includes('左膝渗血'));
    assert.ok(!submittedPrompt.includes('皮肤发黑龟裂'));
    assert.ok(!submittedPrompt.includes('参考图='));
    assert.ok(!submittedPrompt.includes('场景资产基准：'));
    assert.ok(!submittedPrompt.includes('角色资产基准：'));

    const stored = store.getStoryboard(project.id, rendered![0]!.id);
    assert.ok(stored?.prompt.includes('鲜红血线'));
    assert.ok(stored?.prompt.includes('左膝渗血'));
    assert.ok(stored?.prompt.includes('皮肤发黑龟裂'));
  } finally {
    await pipeline.shutdown();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('pipeline should compile clean audio prompts for audio tasks', async () => {
  const { projects, studio, pipeline, cleanup } = createServices();

  try {
    const project = projects.createProject({ name: 'Pipeline Audio Prompt Project' });
    studio.saveNovel(project.id, { title: 'N', content: '第一段。第二段。第三段。' });
    const outlines = await studio.generateOutlines(project.id, { chapterCount: 1 });
    assert.ok(outlines && outlines.length === 1);
    const script = await studio.generateScript(project.id, { outlineId: outlines![0].id });
    assert.ok(script);

    const storyboards = await pipeline.generateStoryboards(project.id, script!.id);
    assert.ok(storyboards && storyboards.length > 0);

    const task = await pipeline.createAndRunAudioTask(project.id, storyboards![0]!.id);
    assert.ok(task);
    const stored = (pipeline.listAudioTasks(project.id) ?? []).find((item) => item.id === task!.id);
    assert.ok(stored);
    assert.ok(!stored!.prompt.includes('参考图='));
    assert.ok(!stored!.prompt.includes('场景资产基准：'));
    assert.ok(!stored!.prompt.includes('角色资产基准：'));
    assert.ok(!stored!.prompt.includes('为该镜头生成配套旁白与环境声'));
    assert.ok(stored!.prompt.length <= 96);
  } finally {
    await cleanup();
  }
});

test('pipeline should require a real configured audio model before generating audio tasks', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'human2-pipeline-audio-model-required-test-'));
  const dataFile = path.join(tempRoot, 'app.db');
  const store = new SqliteStore(dataFile);
  const provider = new MockAiProvider();
  const projects = new ProjectsService(store);
  const studio = new StudioService(store, provider);
  const pipeline = new PipelineService(store, provider, 2, { videoMergeEngine: 'placeholder' });

  try {
    const project = projects.createProject({ name: 'Pipeline Audio Model Required Project' });
    studio.saveNovel(project.id, { title: 'N', content: '第一段。第二段。第三段。' });
    const outlines = await studio.generateOutlines(project.id, { chapterCount: 1 });
    assert.ok(outlines && outlines.length === 1);
    const script = await studio.generateScript(project.id, { outlineId: outlines![0].id });
    assert.ok(script);
    const storyboards = await pipeline.generateStoryboards(project.id, script!.id);
    assert.ok(storyboards && storyboards.length > 0);

    await assert.rejects(
      () => pipeline.createAndRunAudioTask(project.id, storyboards![0]!.id),
      /No real audio model is configured/
    );
  } finally {
    await pipeline.shutdown();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('pipeline should persist inline audio task output and sync timeline audio with local file sources', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'human2-pipeline-inline-audio-test-'));
  const dataFile = path.join(tempRoot, 'app.db');
  const store = new SqliteStore(dataFile);
  const baseProvider = new MockAiProvider();
  const provider: AiProvider = {
    getCapabilities() {
      return baseProvider.getCapabilities();
    },
    async generateText(input) {
      return baseProvider.generateText(input);
    },
    async generateImage(input) {
      return baseProvider.generateImage(input);
    },
    async generateVideo(input) {
      return baseProvider.generateVideo(input);
    },
    async generateAudio() {
      return {
        url: `data:audio/ogg;base64,${Buffer.from('inline-audio-binary').toString('base64')}`,
      };
    },
  };
  const settings = new SettingsService(store);
  settings.createModelConfig({
    type: 'audio',
    name: 'APIMart Audio',
    provider: 'http',
    manufacturer: 'apimart',
    model: 'gpt-4o-mini-tts',
    authType: 'bearer',
    endpoint: 'https://api.apimart.ai/v1/audio/speech',
    apiKey: 'apimart-audio-key',
    enabled: true,
    isDefault: true,
  });
  const projects = new ProjectsService(store);
  const studio = new StudioService(store, provider);
  const pipeline = new PipelineService(store, provider, 2, { videoMergeEngine: 'placeholder' });

  try {
    const project = projects.createProject({ name: 'Pipeline Inline Audio Project' });
    studio.saveNovel(project.id, { title: 'N', content: '第一段。第二段。第三段。' });
    const outlines = await studio.generateOutlines(project.id, { chapterCount: 1 });
    assert.ok(outlines && outlines.length === 1);
    const script = await studio.generateScript(project.id, { outlineId: outlines![0].id });
    assert.ok(script);
    const storyboards = await pipeline.generateStoryboards(project.id, script!.id);
    assert.ok(storyboards && storyboards.length > 0);

    const task = await pipeline.createAndRunAudioTask(project.id, storyboards![0]!.id, 'medium', { format: 'opus', voice: 'alloy' });
    assert.ok(task);
    const stored = (pipeline.listAudioTasks(project.id) ?? []).find((item) => item.id === task!.id);
    assert.ok(stored?.resultUrl);
    assert.match(stored!.resultUrl!, /\/api\/pipeline\/projects\/.+\/audio-tasks\/.+\/file$/);

    const resolved = pipeline.resolveAudioTaskDownload(project.id, task!.id);
    assert.ok('path' in resolved);
    assert.equal(path.extname(resolved.path), '.opus');
    assert.equal(fs.readFileSync(resolved.path, 'utf8'), 'inline-audio-binary');

    const savedPlan = pipeline.saveTimelinePlan(project.id, {
      title: 'Episode Timeline',
      episodeId: null,
      clips: storyboards!.map((storyboard, index) => ({
        storyboardId: storyboard.id,
        sourceUrl: `/mock/videos/${storyboard.id}.mp4`,
        durationSec: 4,
        startMs: index * 4000,
        endMs: (index + 1) * 4000,
      })),
    });
    assert.ok(savedPlan);

    const synced = pipeline.syncTimelineAudioTrack(project.id, null);
    assert.ok(synced);
    const audioTrack = synced!.plan.tracks.find((item) => item.type === 'audio');
    assert.ok(audioTrack);
    assert.equal(audioTrack!.clips[0]?.sourceUrl, resolved.path);
  } finally {
    await pipeline.shutdown();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('pipeline should sync done audio tasks and subtitle track into timeline plan', async () => {
  const { projects, studio, pipeline, cleanup } = createServices();

  try {
    const project = projects.createProject({ name: 'Pipeline Timeline Post Project' });
    studio.saveNovel(project.id, { title: 'N', content: '第一段。第二段。第三段。' });
    const outlines = await studio.generateOutlines(project.id, { chapterCount: 1 });
    assert.ok(outlines && outlines.length === 1);
    const script = await studio.generateScript(project.id, { outlineId: outlines![0].id });
    assert.ok(script);

    const storyboards = await pipeline.generateStoryboards(project.id, script!.id);
    assert.ok(storyboards && storyboards.length > 0);

    for (const [index, storyboard] of storyboards!.entries()) {
      const task = await pipeline.createAndRunAudioTask(project.id, storyboard.id, index % 2 === 0 ? 'medium' : 'low');
      assert.ok(task);
    }

    const savedPlan = pipeline.saveTimelinePlan(project.id, {
      title: 'Episode Timeline',
      episodeId: null,
      clips: storyboards!.map((storyboard, index) => ({
        storyboardId: storyboard.id,
        sourceUrl: `/mock/videos/${storyboard.id}.mp4`,
        durationSec: 4,
        startMs: index * 4000,
        endMs: (index + 1) * 4000,
      })),
    });
    assert.ok(savedPlan);

    const synced = pipeline.syncTimelineAudioTrack(project.id, null);
    assert.ok(synced);
    assert.equal(synced!.syncedClipCount, storyboards!.length);
    assert.equal(synced!.skippedMockClipCount, 0);
    assert.equal(synced!.requiresRealAudioModel, false);
    const audioTrack = synced!.plan.tracks.find((item) => item.type === 'audio');
    assert.ok(audioTrack);
    assert.equal(audioTrack!.clips.length, storyboards!.length);
    assert.ok(audioTrack!.clips.every((item) => item.sourceUrl?.includes('https://audio.example/')));

    const subtitles = await pipeline.generateTimelineSubtitleTrack(project.id, null);
    assert.ok(subtitles);
    assert.equal(subtitles!.generatedClipCount, storyboards!.length);
    const textTrack = subtitles!.plan.tracks.find((item) => item.type === 'text');
    assert.ok(textTrack);
    assert.equal(textTrack!.clips.length, storyboards!.length);
    assert.ok(textTrack!.clips.every((item) => typeof item.sourceUrl === 'string' && item.sourceUrl.length > 0));

    const merge = await pipeline.createVideoMergeFromTimeline(project.id, null, 'Episode Final Cut');
    assert.ok(merge);
    assert.equal(merge!.params.keepAudio, false);
    assert.equal(merge!.params.audioTracks?.[0]?.clips.length, storyboards!.length);
    assert.equal(merge!.params.textTracks?.[0]?.clips.length, storyboards!.length);
    assert.equal(merge!.params.subtitleBurnIn, true);
  } finally {
    await cleanup();
  }
});

test('pipeline should create dialogue-first audio tasks and sync multi-speaker dialogue tracks', async () => {
  const { projects, studio, pipeline, cleanup } = createServices();

  try {
    const project = projects.createProject({ name: 'Pipeline Dialogue Audio Project' });
    studio.saveNovel(project.id, { title: 'N', content: '第一段。第二段。第三段。' });
    const outlines = await studio.generateOutlines(project.id, { chapterCount: 1 });
    assert.ok(outlines && outlines.length === 1);
    const script = await studio.generateScript(project.id, { outlineId: outlines![0].id });
    assert.ok(script);

    const storyboards = await pipeline.generateStoryboards(project.id, script!.id);
    assert.ok(storyboards && storyboards.length > 0);

    const savedPlan = pipeline.saveTimelinePlan(project.id, {
      title: 'Dialogue Episode Timeline',
      episodeId: null,
      clips: storyboards!.map((storyboard, index) => ({
        storyboardId: storyboard.id,
        sourceUrl: `/mock/videos/${storyboard.id}.mp4`,
        durationSec: 4,
        startMs: index * 4000,
        endMs: (index + 1) * 4000,
      })),
    });
    assert.ok(savedPlan);

    const batch = await pipeline.createTimelineAudioTasksBatch(project.id, null, 'medium');
    assert.ok(batch);
    assert.ok(batch!.createdTaskCount >= storyboards!.length);
    assert.ok(batch!.speakerCount >= 1);
    assert.ok(batch!.tasks.some((item) => item.params.trackKind === 'dialogue'));
    assert.ok(batch!.tasks.some((item) => typeof item.params.segmentIndex === 'number'));

    const synced = pipeline.syncTimelineAudioTrack(project.id, null);
    assert.ok(synced);
    assert.ok(synced!.syncedTrackCount >= 1);
    assert.ok(synced!.dialogueClipCount >= storyboards!.length);
    const audioTracks = synced!.plan.tracks.filter((item) => item.type === 'audio');
    assert.ok(audioTracks.length >= 1);
    assert.ok(audioTracks.some((item) => item.name.includes('对白')));
    assert.ok(audioTracks.flatMap((item) => item.clips).every((clip) => typeof clip.sourceUrl === 'string' && clip.sourceUrl.length > 0));

    const subtitles = await pipeline.generateTimelineSubtitleTrack(project.id, null);
    assert.ok(subtitles);
    const textTrack = subtitles!.plan.tracks.find((item) => item.type === 'text');
    assert.ok(textTrack);
    assert.ok(textTrack!.clips.some((clip) => String(clip.sourceUrl).includes('：')));
    assert.equal(subtitles!.modelLabel, '对白音轨');
  } finally {
    await cleanup();
  }
});

test('pipeline should bind dialogue voices from character assets when voice profiles exist', async () => {
  const { projects, studio, pipeline, settings, cleanup } = createServices();

  try {
    const project = projects.createProject({ name: 'Pipeline Character Voice Binding Project' });
    studio.saveNovel(project.id, { title: 'N', content: '第一段。第二段。第三段。' });
    const outlines = await studio.generateOutlines(project.id, { chapterCount: 1 });
    assert.ok(outlines && outlines.length === 1);
    const script = await studio.generateScript(project.id, { outlineId: outlines![0].id });
    assert.ok(script);

    const storyboards = await pipeline.generateStoryboards(project.id, script!.id);
    assert.ok(storyboards && storyboards.length > 0);
    const storyboard = storyboards![0]!;
    const audioModel = settings.listModelConfigs('audio')[0];
    assert.ok(audioModel);
    settings.updateModelConfig(audioModel!.id, {
      capabilities: {
        voices: ['nova', 'alloy'],
        speeds: [1, 1.08],
      },
    });

    const madoka = pipeline.createAsset(project.id, {
      storyboardId: storyboard.id,
      name: '小圆',
      type: 'character',
      prompt: '粉发少女，神情迟疑',
      voiceProfile: { voice: 'nova', speed: 1.08 },
    });
    const sayaka = pipeline.createAsset(project.id, {
      storyboardId: storyboard.id,
      name: '沙耶香',
      type: 'character',
      prompt: '短发少女，语气坚定',
      voiceProfile: { voice: 'alloy' },
    });
    assert.ok(madoka);
    assert.ok(sayaka);
    const relations = pipeline.replaceStoryboardAssetRelations(project.id, storyboard.id, {
      characterAssetIds: [madoka!.id, sayaka!.id],
    });
    assert.ok(relations);

    const savedPlan = pipeline.saveTimelinePlan(project.id, {
      title: 'Dialogue Episode Timeline',
      episodeId: null,
      clips: [
        {
          storyboardId: storyboard.id,
          sourceUrl: `/mock/videos/${storyboard.id}.mp4`,
          durationSec: 4,
          startMs: 0,
          endMs: 4000,
        },
      ],
    });
    assert.ok(savedPlan);

    const batch = await pipeline.createTimelineAudioTasksBatch(project.id, null, 'medium');
    assert.ok(batch);
    const dialogueTasks = (pipeline.listAudioTasks(project.id) ?? []).filter(
      (item) => item.storyboardId === storyboard.id && item.params.trackKind === 'dialogue'
    );
    assert.ok(dialogueTasks.length >= 2);
    const madokaTask = dialogueTasks.find((item) => item.params.speaker === '小圆');
    const sayakaTask = dialogueTasks.find((item) => item.params.speaker === '沙耶香');
    assert.ok(madokaTask);
    assert.ok(sayakaTask);
    assert.equal(madokaTask!.params.voice, 'nova');
    assert.equal(madokaTask!.params.speed, 1.08);
    assert.equal(sayakaTask!.params.voice, 'alloy');
  } finally {
    await cleanup();
  }
});

test('pipeline should skip mock audio tracks during timeline sync and final merge', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'human2-pipeline-skip-mock-audio-test-'));
  const dataFile = path.join(tempRoot, 'app.db');
  const store = new SqliteStore(dataFile);
  const provider = new MockAiProvider();
  const projects = new ProjectsService(store);
  const studio = new StudioService(store, provider);
  const pipeline = new PipelineService(store, provider, 2, { videoMergeEngine: 'placeholder' });

  try {
    const project = projects.createProject({ name: 'Pipeline Skip Mock Audio Project' });
    studio.saveNovel(project.id, { title: 'N', content: '第一段。第二段。第三段。' });
    const outlines = await studio.generateOutlines(project.id, { chapterCount: 1 });
    assert.ok(outlines && outlines.length === 1);
    const script = await studio.generateScript(project.id, { outlineId: outlines![0].id });
    assert.ok(script);
    const storyboards = await pipeline.generateStoryboards(project.id, script!.id);
    assert.ok(storyboards && storyboards.length > 0);

    for (const storyboard of storyboards!) {
      const task = store.createAudioTask({
        id: `mock-audio-${storyboard.id}`,
        projectId: project.id,
        storyboardId: storyboard.id,
        prompt: 'mock audio',
        modelName: 'mock-audio',
        params: {},
        priority: 'medium',
      });
      assert.ok(task);
      store.updateAudioTask(project.id, task!.id, {
        status: 'done',
        progress: 100,
        resultUrl: `/mock/audio/${project.id}-${storyboard.id}.mp3`,
        error: null,
      });
    }

    const savedPlan = pipeline.saveTimelinePlan(project.id, {
      title: 'Episode Timeline',
      episodeId: null,
      clips: storyboards!.map((storyboard, index) => ({
        storyboardId: storyboard.id,
        sourceUrl: `/mock/videos/${storyboard.id}.mp4`,
        durationSec: 4,
        startMs: index * 4000,
        endMs: (index + 1) * 4000,
      })),
    });
    assert.ok(savedPlan);

    const synced = pipeline.syncTimelineAudioTrack(project.id, null);
    assert.ok(synced);
    assert.equal(synced!.syncedClipCount, 0);
    assert.equal(synced!.skippedMockClipCount, storyboards!.length);
    assert.equal(synced!.requiresRealAudioModel, true);
    const audioTrack = synced!.plan.tracks.find((item) => item.type === 'audio');
    assert.ok(audioTrack);
    assert.equal(audioTrack!.clips.length, 0);

    const merge = await pipeline.createVideoMergeFromTimeline(project.id, null, 'Episode Final Cut');
    assert.ok(merge);
    assert.equal(merge!.params.keepAudio, true);
    assert.equal(merge!.params.audioTracks?.length ?? 0, 0);
  } finally {
    await pipeline.shutdown();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('pipeline should fall back to structured script parsing when storyboard planner output is invalid', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'human2-pipeline-storyboard-fallback-test-'));
  const dataFile = path.join(tempRoot, 'app.db');
  const store = new SqliteStore(dataFile);
  const projects = new ProjectsService(store);
  const provider: AiProvider = {
    getCapabilities() {
      return [];
    },
    async generateText(input) {
      if (input.prompt.includes('只输出严格 JSON') && input.prompt.includes('"outlines"')) {
        return {
          text: JSON.stringify({
            outlines: [{ title: '第一章：目标建立', summary: '主角明确目标并进入任务。' }]
          })
        };
      }
      if (input.prompt.includes('你是影视编剧，请把下面的大纲改写成可继续用于分镜拆解的中文分场脚本')) {
        return {
          text: [
            '【场次标题】测试脚本',
            '【剧情概述】主角在压力中推进任务。',
            '【分场脚本】',
            '1. 场景：麻美公寓楼下 / 傍晚',
            '角色动作：小圆站在楼下恍惚失神，沙耶香走近试探性发问。',
            '2. 场景：公寓入口 / 夜',
            '小圆看向楼道入口，迟迟没有迈步。'
          ].join('\n')
        };
      }
      if (input.prompt.includes('"storyboards"') && input.prompt.includes('"finalImagePrompt"')) {
        return {
          text: 'not-json'
        };
      }
      return { text: `novel:${input.projectId}` };
    },
    async generateImage(input) {
      return { url: `/mock/image/${input.projectId}-${input.kind}.png` };
    },
    async generateVideo(input) {
      return { url: `/mock/video/${input.projectId}-${input.storyboardId}.mp4` };
    },
    async generateAudio(input) {
      return { url: `/mock/audio/${input.projectId}-${input.storyboardId}.mp3` };
    }
  };
  const studio = new StudioService(store, provider);
  const pipeline = new PipelineService(store, provider, 2, { videoMergeEngine: 'placeholder' });

  try {
    const project = projects.createProject({ name: 'Pipeline Storyboard Fallback Project' });
    studio.saveNovel(project.id, { title: 'N', content: '第一段。第二段。第三段。' });
    const outlines = await studio.generateOutlines(project.id, { chapterCount: 1 });
    assert.ok(outlines && outlines.length === 1);
    const script = await studio.generateScript(project.id, { outlineId: outlines![0].id });
    assert.ok(script);

    const storyboards = await pipeline.generateStoryboards(project.id, script!.id);
    assert.ok(storyboards && storyboards.length === 2);
    assert.equal(storyboards![0]?.plan?.scene, '麻美公寓楼下');
    assert.equal(storyboards![0]?.plan?.time, '傍晚');
    assert.ok(!(storyboards![0]?.prompt ?? '').includes('【场次标题】'));
    assert.ok((storyboards![0]?.prompt ?? '').includes('主体：'));
  } finally {
    await pipeline.shutdown();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('pipeline should build storyboard assets from linked domain entities and feed them back into storyboard rendering', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'human2-pipeline-domain-asset-forward-test-'));
  const dataFile = path.join(tempRoot, 'app.db');
  const store = new SqliteStore(dataFile);
  const projects = new ProjectsService(store);
  const imageCalls: Array<{ kind: 'storyboard' | 'asset'; prompt: string }> = [];

  const project = projects.createProject({ name: 'Pipeline Domain Asset Forward Project' });
  const dramaDomain = new DomainService(store);
  const drama = dramaDomain.upsertDrama(project.id, { name: '主线' });
  assert.ok(drama);
  const episode = dramaDomain.createEpisode(project.id, { dramaId: drama!.id, title: '第1集' });
  assert.ok(episode);
  store.replaceOutlines(project.id, [{ id: 'outline-1', title: '第一章', summary: '建立冲突', orderIndex: 0 }]);

  const sceneEntity = dramaDomain.createDomainEntity(project.id, {
    type: 'scene',
    name: '麻美公寓',
    prompt: 'warm apartment interior with untouched tea set',
    imageUrl: 'https://assets.example/scene.png'
  });
  const characterEntity = dramaDomain.createDomainEntity(project.id, {
    type: 'character',
    name: '小圆',
    prompt: 'pink-haired school girl with soft expression'
  });
  const propEntity = dramaDomain.createDomainEntity(project.id, {
    type: 'prop',
    name: '茶杯',
    prompt: 'red porcelain teacup on wooden table'
  });
  assert.ok(sceneEntity && characterEntity && propEntity);

  const script = store.createScript({
    id: 'script-1',
    projectId: project.id,
    outlineId: 'outline-1',
    episodeId: episode!.id,
    title: '第1集脚本',
    content: '场景：麻美公寓 / 黄昏\n动作：小圆拿起茶杯，情绪崩溃。'
  });
  assert.ok(script);

  dramaDomain.replaceEpisodeDomainEntityRelations(project.id, episode!.id, {
    sceneEntityIds: [sceneEntity!.id],
    characterEntityIds: [characterEntity!.id],
    propEntityIds: [propEntity!.id]
  });

  const provider: AiProvider = {
    getCapabilities() {
      return [];
    },
    async generateText(input) {
      if (input.prompt.includes('"storyboards"') && input.prompt.includes('"sceneEntityId"')) {
        return {
          text: JSON.stringify({
            storyboards: [
              {
                shotTitle: '茶杯与沉默',
                scene: '麻美公寓',
                time: '黄昏',
                subject: '小圆',
                action: '小圆拿起茶杯，情绪崩溃',
                composition: '近景俯视构图，茶杯位于视觉中心',
                lighting: '暖光昏暗，室内静止压抑',
                finalImagePrompt: '黄昏的麻美公寓内，小圆拿起茶杯，情绪崩溃',
                characterIds: [characterEntity!.id],
                sceneEntityId: sceneEntity!.id,
                propEntityIds: [propEntity!.id]
              }
            ]
          })
        };
      }
      return { text: 'unused' };
    },
    async generateImage(input) {
      imageCalls.push({ kind: input.kind, prompt: input.prompt });
      return { url: `/mock/${input.kind}/${imageCalls.length}.png` };
    },
    async generateVideo(input) {
      return { url: `/mock/video/${input.storyboardId}.mp4` };
    },
    async generateAudio(input) {
      return { url: `/mock/audio/${input.storyboardId}.mp3` };
    }
  };

  const pipeline = new PipelineService(store, provider, 2, { videoMergeEngine: 'placeholder' });
  try {
    const planned = await pipeline.planStoryboards(project.id, script!.id);
    assert.ok(planned && planned.length === 1);
    assert.deepEqual(planned![0].plan?.characterIds, [characterEntity!.id]);
    assert.equal(planned![0].plan?.sceneEntityId, sceneEntity!.id);
    assert.deepEqual(planned![0].plan?.propEntityIds, [propEntity!.id]);

    const assets = await pipeline.generateAssets(project.id, planned![0].id);
    assert.ok(assets && assets.length === 2);
    assert.ok(assets!.some((item) => item.type === 'scene' && item.scope === 'shot' && item.name.includes('场景镜头状态')));
    assert.ok(assets!.some((item) => item.type === 'character' && item.scope === 'shot' && item.name.includes('角色镜头状态')));
    const allAssets = store.listAssets(project.id);
    assert.ok(allAssets && allAssets.length === 5);
    assert.ok(allAssets!.some((item) => item.type === 'scene' && item.scope === 'base' && item.name === '麻美公寓-场景主资产' && item.imageUrl === sceneEntity!.imageUrl));
    assert.ok(allAssets!.some((item) => item.type === 'character' && item.scope === 'base' && item.name === '小圆-角色主资产'));
    assert.ok(allAssets!.some((item) => item.type === 'prop' && item.scope === 'base' && item.name === '茶杯-道具主资产'));
    const backfilledCharacter = store.getDomainEntity(project.id, characterEntity!.id);
    const backfilledProp = store.getDomainEntity(project.id, propEntity!.id);
    assert.ok(backfilledCharacter?.imageUrl?.includes('/mock/asset/'));
    assert.ok(backfilledProp?.imageUrl?.includes('/mock/asset/'));

    const rendered = await pipeline.renderStoryboardImages(project.id, { scriptId: script!.id });
    assert.ok(rendered && rendered.length === 1);
    assert.ok(rendered![0].prompt.includes('角色设定：小圆；pink-haired school girl with soft expression'));
    assert.ok(rendered![0].prompt.includes('场景资产基准：'));
    assert.ok(rendered![0].prompt.includes('角色资产基准：'));
    assert.ok(rendered![0].plan?.baseSceneAssetId);
    assert.equal(rendered![0].plan?.baseCharacterAssetIds.length, 1);
    assert.ok(rendered![0].plan?.shotSceneStateId);
    assert.equal(rendered![0].plan?.shotCharacterStateIds.length, 1);
    assert.ok(rendered![0].plan?.sceneAssetId);
    assert.equal(rendered![0].plan?.characterAssetIds.length, 1);
    assert.equal(rendered![0].plan?.propAssetIds.length, 0);
  } finally {
    await pipeline.shutdown();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('pipeline should auto-hydrate storyboard and asset references into video tasks', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'human2-pipeline-video-reference-test-'));
  const dataFile = path.join(tempRoot, 'app.db');
  const store = new SqliteStore(dataFile);
  const projects = new ProjectsService(store);
  const baseProvider = new MockAiProvider();
  const videoCalls: Array<Parameters<AiProvider['generateVideo']>[0]> = [];

  const provider: AiProvider = {
    getCapabilities() {
      return baseProvider.getCapabilities();
    },
    async generateText(input) {
      return baseProvider.generateText(input);
    },
    async generateImage(input) {
      return baseProvider.generateImage(input);
    },
    async generateVideo(input) {
      videoCalls.push(input);
      return {
        url: `/mock/video/${input.projectId}-${input.storyboardId}.mp4`,
        providerTaskId: 'mock-reference-task'
      };
    },
    async generateAudio(input) {
      return baseProvider.generateAudio(input);
    }
  };

  const studio = new StudioService(store, provider);
  const pipeline = new PipelineService(store, provider, 2, { videoMergeEngine: 'placeholder' });

  try {
    const project = projects.createProject({ name: 'Pipeline Video Reference Project' });
    studio.saveNovel(project.id, { title: 'N', content: '第一段。第二段。第三段。第四段。' });
    const outlines = await studio.generateOutlines(project.id, { chapterCount: 2 });
    assert.ok(outlines && outlines.length > 0);
    const script = await studio.generateScript(project.id, { outlineId: outlines![0].id });
    assert.ok(script);

    const storyboards = await pipeline.generateStoryboards(project.id, script!.id);
    assert.ok(storyboards && storyboards.length > 0);
    const storyboard = storyboards![0]!;
    assert.ok(storyboard.imageUrl);

    const assets = await pipeline.generateAssets(project.id, storyboard.id);
    assert.ok(assets && assets.length > 0);
    const assetUrls = assets!.map((item) => item.imageUrl).filter((item): item is string => Boolean(item));
    assert.ok(assetUrls.length > 0);

    const task = await pipeline.createAndRunVideoTask(project.id, storyboard.id, 'medium');
    assert.ok(task);
    assert.equal(task?.params.mode, 'reference');
    assert.ok(Array.isArray(task?.params.imageInputs));
    assert.ok((task?.params.imageInputs?.length ?? 0) >= 2);
    assert.equal(task?.params.imageInputs?.[0], storyboard.imageUrl);
    assert.ok(task?.params.imageInputs?.some((item) => assetUrls.includes(item)));
    assert.ok(task?.params.imageWithRoles?.some((item) => item.role === 'first_frame' && item.url === storyboard.imageUrl));
    assert.ok(task?.params.imageWithRoles?.some((item) => item.role === 'reference' && assetUrls.includes(item.url)));
    assert.ok(task?.prompt.includes('镜头标题：'));
    assert.ok(task?.prompt.includes('immutable canon：'));
    assert.ok(task?.prompt.includes('mutable shot delta：'));
    assert.ok(task?.prompt.includes('当前动作：'));
    assert.ok(!task?.prompt.includes('参考图='));
    assert.ok(!task?.prompt.includes('场景资产基准：'));
    assert.ok(!task?.prompt.includes('角色资产基准：'));

    const completed = await waitForTaskTerminal(pipeline, project.id, task!.id);
    assert.equal(completed.status, 'done');
    assert.equal(videoCalls.length, 1);
    assert.equal(videoCalls[0]?.mode, 'reference');
    assert.equal(videoCalls[0]?.imageInputs?.[0], storyboard.imageUrl);
    assert.ok(videoCalls[0]?.imageInputs?.some((item) => assetUrls.includes(item)));
    assert.ok(videoCalls[0]?.imageWithRoles?.some((item) => item.role === 'first_frame' && item.url === storyboard.imageUrl));
    assert.ok(videoCalls[0]?.imageWithRoles?.some((item) => item.role === 'reference' && assetUrls.includes(item.url)));
    assert.ok(videoCalls[0]?.prompt.includes('镜头标题：'));
    assert.ok(videoCalls[0]?.prompt.includes('immutable canon：'));
    assert.ok(videoCalls[0]?.prompt.includes('mutable shot delta：'));
    assert.ok(videoCalls[0]?.prompt.includes('当前动作：'));
    assert.ok(!videoCalls[0]?.prompt.includes('参考图='));
    assert.ok(!videoCalls[0]?.prompt.includes('场景资产基准：'));
    assert.ok(!videoCalls[0]?.prompt.includes('角色资产基准：'));
  } finally {
    await pipeline.shutdown();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('pipeline should chain previous storyboard frames within the same continuity group', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'human2-pipeline-video-continuity-test-'));
  const dataFile = path.join(tempRoot, 'app.db');
  const store = new SqliteStore(dataFile);
  const projects = new ProjectsService(store);
  const baseProvider = new MockAiProvider();
  const videoCalls: Array<Parameters<AiProvider['generateVideo']>[0]> = [];

  const provider: AiProvider = {
    getCapabilities() {
      return baseProvider.getCapabilities();
    },
    async generateText(input) {
      return baseProvider.generateText(input);
    },
    async generateImage(input) {
      return baseProvider.generateImage(input);
    },
    async generateVideo(input) {
      videoCalls.push(input);
      return {
        url: `/mock/video/${input.projectId}-${input.storyboardId}.mp4`,
        providerTaskId: 'mock-continuity-task'
      };
    },
    async generateAudio(input) {
      return baseProvider.generateAudio(input);
    }
  };

  const domain = new DomainService(store);
  const studio = new StudioService(store, provider);
  const pipeline = new PipelineService(store, provider, 2, { videoMergeEngine: 'placeholder' });

  try {
    const project = projects.createProject({ name: 'Pipeline Continuity Project' });
    const drama = domain.upsertDrama(project.id, { name: '主线' });
    const episode = domain.createEpisode(project.id, { dramaId: drama!.id, title: '第1集' });
    studio.saveNovel(project.id, { title: 'N', content: '第一段。第二段。第三段。第四段。' });
    const outlines = await studio.generateOutlines(project.id, { chapterCount: 2 });
    const script = await studio.generateScript(project.id, { outlineId: outlines![0].id });
    store.updateScriptEpisode(project.id, script!.id, episode!.id);

    const storyboards = await pipeline.generateStoryboards(project.id, script!.id);
    assert.ok(storyboards && storyboards.length >= 2);

    const first = storyboards![0]!;
    const second = storyboards![1]!;
    const continuityGroupId = first.plan?.continuityGroupId ?? 'cg:test';
    assert.ok(continuityGroupId);
    store.updateStoryboard(project.id, second.id, {
      plan: second.plan
        ? {
            ...second.plan,
            continuityGroupId,
          }
        : null,
    });

    const task = await pipeline.createAndRunVideoTask(project.id, second.id, 'medium');
    assert.ok(task);
    const completed = await waitForTaskTerminal(pipeline, project.id, task!.id);
    assert.equal(completed.status, 'done');
    assert.equal(videoCalls.length, 1);
    assert.equal(videoCalls[0]?.imageInputs?.[0], first.imageUrl);
    assert.ok(videoCalls[0]?.imageInputs?.includes(second.imageUrl ?? ''));
    assert.equal(videoCalls[0]?.imageWithRoles?.[0]?.role, 'first_frame');
    assert.equal(videoCalls[0]?.imageWithRoles?.[0]?.url, first.imageUrl);
  } finally {
    await pipeline.shutdown();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('pipeline domain model should support scenes and storyboard-asset relations', async () => {
  const { projects, studio, pipeline, cleanup } = createServices();
  try {
    const project = projects.createProject({ name: 'Pipeline Domain Project' });
    studio.saveNovel(project.id, { title: 'N', content: '第一段。第二段。第三段。' });
    const outlines = await studio.generateOutlines(project.id, { chapterCount: 2 });
    assert.ok(outlines && outlines.length > 0);
    const script = await studio.generateScript(project.id, { outlineId: outlines![0].id });
    assert.ok(script);

    const storyboards = await pipeline.generateStoryboards(project.id, script!.id);
    assert.ok(storyboards && storyboards.length > 0);
    const storyboard = storyboards![0];

    const scene = pipeline.createScene(project.id, {
      name: '客厅夜景',
      description: '主角在客厅对峙',
      prompt: 'cinematic living room at night'
    });
    assert.ok(scene);

    const updatedStoryboard = pipeline.updateStoryboard(project.id, storyboard.id, { sceneId: scene!.id });
    assert.ok(updatedStoryboard);
    assert.equal(updatedStoryboard?.sceneId, scene!.id);

    const generatedAssets = await pipeline.generateAssets(project.id, storyboard.id);
    assert.ok(generatedAssets && generatedAssets.length >= 2);
    const characterAsset = generatedAssets!.find((item) => item.type === 'character');
    const sceneAsset = generatedAssets!.find((item) => item.type === 'scene');
    assert.ok(characterAsset);
    assert.ok(sceneAsset);

    const propAsset = pipeline.createAsset(project.id, {
      storyboardId: storyboard.id,
      name: '道具-长剑',
      type: 'prop',
      prompt: 'ancient sword prop'
    });
    assert.ok(propAsset);

    const relations = pipeline.replaceStoryboardAssetRelations(project.id, storyboard.id, {
      sceneAssetId: sceneAsset!.id,
      characterAssetIds: [characterAsset!.id],
      propAssetIds: [propAsset!.id]
    });
    assert.ok(relations);
    assert.equal(relations?.length, 3);

    const listed = pipeline.listStoryboardAssetRelations(project.id, storyboard.id);
    assert.ok(listed);
    assert.equal(listed?.filter((item) => item.role === 'scene').length, 1);
    assert.equal(listed?.filter((item) => item.role === 'character').length, 1);
    assert.equal(listed?.filter((item) => item.role === 'prop').length, 1);
  } finally {
    await cleanup();
  }
});

test('pipeline batch video tasks should create and skip existing tasks', async () => {
  const { projects, studio, pipeline, cleanup } = createServices();

  try {
    const project = projects.createProject({ name: 'Pipeline Batch Project' });
    studio.saveNovel(project.id, {
      title: 'N',
      content: '第一段。第二段。第三段。第四段。'
    });
    const outlines = await studio.generateOutlines(project.id, { chapterCount: 2 });
    assert.ok(outlines && outlines.length > 0);

    const script = await studio.generateScript(project.id, { outlineId: outlines![0].id });
    assert.ok(script);

    const storyboards = await pipeline.generateStoryboards(project.id, script!.id);
    assert.ok(storyboards && storyboards.length > 1);

    const firstBatch = await pipeline.createVideoTasksBatch(project.id);
    assert.ok(firstBatch);
    assert.equal(firstBatch?.createdStoryboardIds.length, storyboards!.length);
    assert.equal(firstBatch?.skippedStoryboardIds.length, 0);

    const secondBatch = await pipeline.createVideoTasksBatch(project.id);
    assert.ok(secondBatch);
    assert.equal(secondBatch?.createdStoryboardIds.length, 0);
    assert.equal(secondBatch?.skippedStoryboardIds.length, storyboards!.length);
  } finally {
    await cleanup();
  }
});

test('pipeline should dedupe active video task submissions with same signature', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'human2-pipeline-dedupe-test-'));
  const dataFile = path.join(tempRoot, 'app.db');
  const store = new SqliteStore(dataFile);
  const provider = new MockAiProvider();
  const projects = new ProjectsService(store);
  const studio = new StudioService(store, provider);
  const pipeline = new PipelineService(store, provider, 0);

  try {
    const project = projects.createProject({ name: 'Pipeline Dedupe Project' });
    studio.saveNovel(project.id, { title: 'N', content: '第一段。第二段。第三段。' });
    const outlines = await studio.generateOutlines(project.id, { chapterCount: 2 });
    assert.ok(outlines && outlines.length > 0);
    const script = await studio.generateScript(project.id, { outlineId: outlines![0].id });
    assert.ok(script);
    const storyboards = await pipeline.generateStoryboards(project.id, script!.id);
    assert.ok(storyboards && storyboards.length > 0);

    const first = await pipeline.createAndRunVideoTask(project.id, storyboards![0].id, 'high', {
      mode: 'text',
      duration: 5,
      resolution: '1080p',
      aspectRatio: '16:9'
    });
    const second = await pipeline.createAndRunVideoTask(project.id, storyboards![0].id, 'high', {
      mode: 'text',
      duration: 5,
      resolution: '1080p',
      aspectRatio: '16:9'
    });
    assert.ok(first);
    assert.ok(second);
    assert.equal(second!.id, first!.id);

    const tasks = pipeline.listVideoTasks(project.id) ?? [];
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].status, 'queued');
  } finally {
    await pipeline.shutdown();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('pipeline should enforce daily video task quota', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'human2-pipeline-quota-test-'));
  const dataFile = path.join(tempRoot, 'app.db');
  const store = new SqliteStore(dataFile);
  const provider = new MockAiProvider();
  const projects = new ProjectsService(store);
  const studio = new StudioService(store, provider);
  const pipeline = new PipelineService(store, provider, 2, { videoMergeEngine: 'placeholder' });

  try {
    const project = projects.createProject({ name: 'Pipeline Quota Project' });
    store.setSystemSetting('task_quota_daily_video_default', '1');
    studio.saveNovel(project.id, { title: 'N', content: '第一段。第二段。第三段。第四段。' });
    const outlines = await studio.generateOutlines(project.id, { chapterCount: 2 });
    assert.ok(outlines && outlines.length > 0);
    const script = await studio.generateScript(project.id, { outlineId: outlines![0].id });
    assert.ok(script);
    const boards = await pipeline.generateStoryboards(project.id, script!.id);
    assert.ok(boards && boards.length >= 2);

    const first = await pipeline.createAndRunVideoTask(project.id, boards![0].id);
    assert.ok(first);
    await waitForTaskTerminal(pipeline, project.id, first!.id);

    await assert.rejects(
      () => pipeline.createAndRunVideoTask(project.id, boards![1].id),
      /daily video task quota exceeded/
    );
  } finally {
    await pipeline.shutdown();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('external queue mode should be consumed by worker process only', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'human2-pipeline-worker-mode-test-'));
  const dataFile = path.join(tempRoot, 'app.db');
  const apiStore = new SqliteStore(dataFile);
  const workerStore = new SqliteStore(dataFile);
  const provider = new MockAiProvider();
  const projects = new ProjectsService(apiStore);
  const studio = new StudioService(apiStore, provider);
  const apiPipeline = new PipelineService(apiStore, provider, 2, {
    queueDriver: 'external',
    queueLoopEnabled: false,
    videoMergeEngine: 'placeholder'
  });
  const workerPipeline = new PipelineService(workerStore, provider, 2, {
    queueDriver: 'external',
    queueLoopEnabled: true,
    queueLeaseOwnerId: 'worker-a',
    queueLeaseTtlMs: 3000,
    videoMergeEngine: 'placeholder'
  });

  try {
    const project = projects.createProject({ name: 'External Queue Project' });
    studio.saveNovel(project.id, { title: 'N', content: '第一段。第二段。第三段。' });
    const outlines = await studio.generateOutlines(project.id, { chapterCount: 2 });
    assert.ok(outlines && outlines.length > 0);
    const script = await studio.generateScript(project.id, { outlineId: outlines![0].id });
    assert.ok(script);
    const storyboards = await apiPipeline.generateStoryboards(project.id, script!.id);
    assert.ok(storyboards && storyboards.length > 0);

    const created = await apiPipeline.createAndRunVideoTask(project.id, storyboards![0].id);
    assert.ok(created);
    await sleep(120);
    const apiRuntimeBeforeDone = apiPipeline.getVideoTaskRuntimeSnapshot();
    assert.equal(apiRuntimeBeforeDone.pumpCycleCount, 0);

    const done = await waitForTaskTerminal(workerPipeline, project.id, created!.id, 8000);
    assert.equal(done.status, 'done');

    const apiRuntime = apiPipeline.getVideoTaskRuntimeSnapshot();
    assert.equal(apiRuntime.queueDriver, 'external');
    assert.equal(apiRuntime.queueLoopEnabled, false);
    const workerRuntime = workerPipeline.getVideoTaskRuntimeSnapshot();
    assert.equal(workerRuntime.queueDriver, 'external');
    assert.equal(workerRuntime.queueLoopEnabled, true);
    assert.equal(workerRuntime.lockOwnerId, 'worker-a');
  } finally {
    await apiPipeline.shutdown();
    await workerPipeline.shutdown();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('queue worker lease should support contention and release', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'human2-pipeline-lease-test-'));
  const dataFile = path.join(tempRoot, 'app.db');
  const storeA = new SqliteStore(dataFile);
  const storeB = new SqliteStore(dataFile);
  try {
    const first = storeA.upsertQueueWorkerLease({ ownerId: 'owner-a', ttlMs: 5000 });
    assert.equal(first.acquired, true);
    assert.equal(first.ownerId, 'owner-a');

    const second = storeB.upsertQueueWorkerLease({ ownerId: 'owner-b', ttlMs: 5000 });
    assert.equal(second.acquired, false);
    assert.equal(second.ownerId, 'owner-a');

    const wrongRelease = storeB.releaseQueueWorkerLease('owner-b');
    assert.equal(wrongRelease, false);
    const rightRelease = storeA.releaseQueueWorkerLease('owner-a');
    assert.equal(rightRelease, true);

    const third = storeB.upsertQueueWorkerLease({ ownerId: 'owner-b', ttlMs: 5000 });
    assert.equal(third.acquired, true);
    assert.equal(third.ownerId, 'owner-b');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('pipeline full chain should generate storyboards assets and video tasks from script', async () => {
  const { projects, studio, pipeline, cleanup } = createServices();

  try {
    const project = projects.createProject({ name: 'Pipeline Full Chain Project' });
    studio.saveNovel(project.id, {
      title: 'N',
      content: '第一段。第二段。第三段。第四段。第五段。'
    });

    const outlines = await studio.generateOutlines(project.id, { chapterCount: 2 });
    assert.ok(outlines && outlines.length > 0);

    const script = await studio.generateScript(project.id, { outlineId: outlines![0].id });
    assert.ok(script);

    const firstRun = await pipeline.runFullChainFromScript(project.id, script!.id);
    assert.ok(firstRun);
    assert.ok(firstRun!.storyboards.length > 0);
    assert.equal(firstRun!.createdAssetStoryboardIds.length, firstRun!.storyboards.length);
    assert.equal(firstRun!.createdVideoStoryboardIds.length, firstRun!.storyboards.length);

    const secondRun = await pipeline.runFullChainFromScript(project.id, script!.id);
    assert.ok(secondRun);
    assert.ok(secondRun!.storyboards.length > 0);
    assert.equal(secondRun!.createdAssetStoryboardIds.length, secondRun!.storyboards.length);
    assert.equal(secondRun!.createdVideoStoryboardIds.length, secondRun!.storyboards.length);
  } finally {
    await cleanup();
  }
});

test('pipeline should use default model config when generating media', async () => {
  const { projects, studio, pipeline, settings, cleanup } = createServices();

  try {
    settings.createModelConfig({
      type: 'image',
      name: 'img-default',
      provider: 'mock',
      endpoint: 'http://image',
      apiKey: 'k',
      isDefault: true
    });
    settings.createModelConfig({
      type: 'video',
      name: 'vid-default',
      provider: 'mock',
      endpoint: 'http://video',
      apiKey: 'k',
      isDefault: true
    });

    const project = projects.createProject({ name: 'Pipeline Model Linked Project' });
    studio.saveNovel(project.id, {
      title: 'N',
      content: '第一段。第二段。第三段。'
    });
    const outlines = await studio.generateOutlines(project.id, { chapterCount: 2 });
    assert.ok(outlines && outlines.length > 0);
    const script = await studio.generateScript(project.id, { outlineId: outlines![0].id });
    assert.ok(script);

    const storyboards = await pipeline.generateStoryboards(project.id, script!.id);
    assert.ok(storyboards && storyboards.length > 0);
    assert.ok((storyboards![0].imageUrl ?? '').includes('img-default'));
    assert.ok(!storyboards![0].prompt.includes('img-default'));

    const task = await pipeline.createAndRunVideoTask(project.id, storyboards![0].id);
    assert.ok(task);
    const completed = await waitForTaskTerminal(pipeline, project.id, task!.id);
    assert.ok((completed.resultUrl ?? '').includes('vid-default'));
  } finally {
    await cleanup();
  }
});

test('pipeline should redraw asset image with image model override', async () => {
  const { projects, studio, pipeline, cleanup } = createServices();
  try {
    const project = projects.createProject({ name: 'Pipeline Asset Redraw Project' });
    studio.saveNovel(project.id, { title: 'N', content: '第一段。第二段。第三段。' });
    const outlines = await studio.generateOutlines(project.id, { chapterCount: 2 });
    assert.ok(outlines && outlines.length > 0);
    const script = await studio.generateScript(project.id, { outlineId: outlines![0].id });
    assert.ok(script);
    const storyboards = await pipeline.generateStoryboards(project.id, script!.id);
    assert.ok(storyboards && storyboards.length > 0);
    const assets = await pipeline.generateAssets(project.id, storyboards![0].id);
    assert.ok(assets && assets.length > 0);

    const first = assets![0];
    assert.ok(first.imageUrl);
    const redrawn = await pipeline.redrawAssetImage(project.id, first.id, {
      customModel: 'img-redraw-custom',
      instruction: '提升细节层次与光影对比'
    });
    assert.ok(redrawn);
    assert.ok(redrawn!.imageUrl);
    assert.notEqual(redrawn!.imageUrl, first.imageUrl);
    assert.ok((redrawn!.imageUrl ?? '').includes('img-redraw-custom'));
  } finally {
    await cleanup();
  }
});

test('pipeline should retry asset image generation after provider rate limit', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'human2-pipeline-image-retry-'));
  const dataFile = path.join(tempRoot, 'app.db');
  const store = new SqliteStore(dataFile);
  const baseProvider = new MockAiProvider();
  let assetImageCalls = 0;
  const provider: AiProvider = {
    getCapabilities() {
      return baseProvider.getCapabilities();
    },
    async generateText(input) {
      return baseProvider.generateText(input);
    },
    async generateImage(input) {
      if (input.kind === 'asset') {
        assetImageCalls += 1;
        if (assetImageCalls === 1) {
          throw new ProviderRateLimitError('dashscope rate limited');
        }
      }
      return baseProvider.generateImage(input);
    },
    async generateVideo(input) {
      return baseProvider.generateVideo(input);
    },
    async generateAudio(input) {
      return {
        url: `https://audio.example/${input.projectId}-${input.storyboardId}.mp3`,
      };
    },
  };

  const projects = new ProjectsService(store);
  const studio = new StudioService(store, provider);
  const pipeline = new PipelineService(store, provider, 2, { videoMergeEngine: 'placeholder' });

  try {
    const project = projects.createProject({ name: 'Pipeline Asset Retry Project' });
    studio.saveNovel(project.id, { title: 'N', content: '第一段。第二段。第三段。' });
    const outlines = await studio.generateOutlines(project.id, { chapterCount: 2 });
    assert.ok(outlines && outlines.length > 0);
    const script = await studio.generateScript(project.id, { outlineId: outlines![0].id });
    assert.ok(script);
    const storyboards = await pipeline.generateStoryboards(project.id, script!.id);
    assert.ok(storyboards && storyboards.length > 0);

    const assets = await pipeline.generateAssets(project.id, storyboards![0].id);
    assert.ok(assets && assets.length > 0);
    assert.ok(assetImageCalls >= 2);
  } finally {
    await pipeline.shutdown();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('pipeline should keep cancelled task as cancelled', async () => {
  const { projects, studio, pipeline, cleanup } = createServices();

  try {
    const project = projects.createProject({ name: 'Pipeline Cancel Project' });
    studio.saveNovel(project.id, {
      title: 'N',
      content: '第一段。第二段。第三段。'
    });
    const outlines = await studio.generateOutlines(project.id, { chapterCount: 2 });
    assert.ok(outlines && outlines.length > 0);
    const script = await studio.generateScript(project.id, { outlineId: outlines![0].id });
    assert.ok(script);
    const storyboards = await pipeline.generateStoryboards(project.id, script!.id);
    assert.ok(storyboards && storyboards.length > 0);

    const created = await pipeline.createAndRunVideoTask(project.id, storyboards![0].id);
    assert.ok(created);
    const taskId = created!.id;
    await sleep(20);

    const cancelled = await pipeline.cancelVideoTask(project.id, taskId);
    assert.ok(cancelled);
    assert.equal(cancelled?.status, 'cancelled');
    assert.equal(cancelled?.error, 'Cancelled by user');

    const finalTask = await waitForTaskTerminal(pipeline, project.id, taskId);
    assert.equal(finalTask.id, taskId);
    assert.equal(finalTask.status, 'cancelled');
    assert.equal(finalTask.error, 'Cancelled by user');
  } finally {
    await cleanup();
  }
});

test('pipeline should validate providerOptions against model capabilities', async () => {
  const { projects, studio, pipeline, settings, cleanup } = createServices();
  try {
    const project = projects.createProject({ name: 'Pipeline Provider Options Validation Project' });
    studio.saveNovel(project.id, { title: 'N', content: '第一段。第二段。第三段。' });
    const outlines = await studio.generateOutlines(project.id, { chapterCount: 2 });
    assert.ok(outlines && outlines.length > 0);
    const script = await studio.generateScript(project.id, { outlineId: outlines![0].id });
    assert.ok(script);
    const storyboards = await pipeline.generateStoryboards(project.id, script!.id);
    assert.ok(storyboards && storyboards.length > 0);

    const model = settings.createModelConfig({
      type: 'audio',
      name: 'Audio With Options Rule',
      provider: 'http',
      manufacturer: 'volcengine',
      model: 'audio-v1',
      authType: 'none',
      endpoint: 'http://example.test/audio',
      apiKey: 'noop',
      capabilities: {
        audio: {
          providerOptions: {
            language: { type: 'string', enum: ['zh', 'en'] },
            sampleRate: { type: 'number', integer: true, enum: [16000, 24000] }
          }
        }
      },
      isDefault: true
    });

    await assert.rejects(
      async () =>
        pipeline.createAndRunAudioTask(project.id, storyboards![0].id, 'medium', {
          modelId: model.id,
          providerOptions: { language: 'jp' }
        }),
      /Provider option language does not support value jp/
    );

    const videoModel = settings.createModelConfig({
      type: 'video',
      name: 'Video With Camera Rule',
      provider: 'mock',
      manufacturer: 'volcengine',
      model: 'video-v1',
      authType: 'none',
      endpoint: 'http://example.test/video',
      apiKey: 'noop',
      capabilities: {
        video: {
          modes: ['text'],
          providerOptions: {
            camera: {
              type: 'object',
              properties: {
                moveX: { type: 'number', min: -1, max: 1 },
                zoom: { type: 'number', min: 0.5, max: 2 }
              }
            }
          }
        }
      },
      isDefault: true
    });

    await assert.rejects(
      async () =>
        pipeline.createAndRunVideoTask(project.id, storyboards![0].id, 'medium', {
          modelId: videoModel.id,
          mode: 'text',
          providerOptions: { camera: { moveX: 3 } }
        }),
      /Provider option camera.moveX must be <= 1/
    );
  } finally {
    await cleanup();
  }
});

test('pipeline should follow runtime retry config for video generation', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'human2-pipeline-retry-test-'));
  const dataFile = path.join(tempRoot, 'app.db');
  const store = new SqliteStore(dataFile);
  const projects = new ProjectsService(store);
  const settings = new SettingsService(store);

  let videoCalls = 0;
  const flakyProvider: AiProvider = {
    async generateText(input) {
      if (input.prompt.includes('只输出严格 JSON') && input.prompt.includes('"outlines"')) {
        return {
          text: JSON.stringify({
            outlines: [
              { title: '第一章：目标建立', summary: '主角明确目标并进入任务。' },
              { title: '第二章：阻碍升级', summary: '外部压力与内部犹豫同时升级。' }
            ]
          })
        };
      }
      if (input.prompt.includes('你是影视编剧，请把下面的大纲改写成可继续用于分镜拆解的中文分场脚本')) {
        return {
          text: '【场次标题】测试脚本\n【剧情概述】主角在压力中推进任务。\n【分场脚本】\n1. 场景：室内 / 夜\n主角整理线索。\n2. 场景：街道 / 夜\n冲突升级。\n3. 场景：办公室 / 夜\n团队协作推进。\n4. 场景：天台 / 凌晨\n主角完成抉择。'
        };
      }
      return { text: `novel:${input.projectId}` };
    },
    async generateImage(input) {
      return { url: `/mock/image/${input.projectId}.png` };
    },
    async generateVideo(input) {
      videoCalls += 1;
      if (videoCalls === 1) {
        throw new ProviderTransientError('temporary provider error');
      }
      return { url: `/mock/video/${input.projectId}.mp4` };
    },
    async generateAudio(input) {
      return { url: `/mock/audio/${input.projectId}-${input.storyboardId}.mp3` };
    }
  };

  const studio = new StudioService(store, flakyProvider);
  const pipeline = new PipelineService(store, flakyProvider, 2);

  try {
    settings.updateTaskRuntimeConfig({
      videoTaskAutoRetry: 1,
      videoTaskRetryDelayMs: 100
    });
    const project = projects.createProject({ name: 'Pipeline Retry Runtime Project' });
    studio.saveNovel(project.id, {
      title: 'N',
      content: '第一段。第二段。第三段。'
    });
    const outlines = await studio.generateOutlines(project.id, { chapterCount: 2 });
    assert.ok(outlines && outlines.length > 0);
    const script = await studio.generateScript(project.id, { outlineId: outlines![0].id });
    assert.ok(script);
    const storyboards = await pipeline.generateStoryboards(project.id, script!.id);
    assert.ok(storyboards && storyboards.length > 0);

    const task = await pipeline.createAndRunVideoTask(project.id, storyboards![0].id);
    assert.ok(task);
    const completed = await waitForTaskTerminal(pipeline, project.id, task!.id);
    assert.equal(completed.status, 'done');
    assert.equal(videoCalls, 2);
  } finally {
    await pipeline.shutdown();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('pipeline should not retry non-transient provider errors', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'human2-pipeline-no-retry-test-'));
  const dataFile = path.join(tempRoot, 'app.db');
  const store = new SqliteStore(dataFile);
  const projects = new ProjectsService(store);
  const settings = new SettingsService(store);

  let videoCalls = 0;
  const nonRetryProvider: AiProvider = {
    async generateText(input) {
      if (input.prompt.includes('只输出严格 JSON') && input.prompt.includes('"outlines"')) {
        return {
          text: JSON.stringify({
            outlines: [
              { title: '第一章：目标建立', summary: '主角明确目标并进入任务。' },
              { title: '第二章：阻碍升级', summary: '外部压力与内部犹豫同时升级。' }
            ]
          })
        };
      }
      if (input.prompt.includes('你是影视编剧，请把下面的大纲改写成可继续用于分镜拆解的中文分场脚本')) {
        return {
          text: '【场次标题】测试脚本\n【剧情概述】主角在压力中推进任务。\n【分场脚本】\n1. 场景：室内 / 夜\n主角整理线索。\n2. 场景：街道 / 夜\n冲突升级。\n3. 场景：办公室 / 夜\n团队协作推进。\n4. 场景：天台 / 凌晨\n主角完成抉择。'
        };
      }
      return { text: `novel:${input.projectId}` };
    },
    async generateImage(input) {
      return { url: `/mock/image/${input.projectId}.png` };
    },
    async generateVideo() {
      videoCalls += 1;
      throw new ProviderValidationError('invalid provider payload');
    },
    async generateAudio(input) {
      return { url: `/mock/audio/${input.projectId}-${input.storyboardId}.mp3` };
    }
  };

  const studio = new StudioService(store, nonRetryProvider);
  const pipeline = new PipelineService(store, nonRetryProvider, 2);

  try {
    settings.updateTaskRuntimeConfig({
      videoTaskAutoRetry: 3,
      videoTaskRetryDelayMs: 100
    });
    const project = projects.createProject({ name: 'Pipeline No Retry Project' });
    studio.saveNovel(project.id, {
      title: 'N',
      content: '第一段。第二段。第三段。'
    });
    const outlines = await studio.generateOutlines(project.id, { chapterCount: 2 });
    assert.ok(outlines && outlines.length > 0);
    const script = await studio.generateScript(project.id, { outlineId: outlines![0].id });
    assert.ok(script);
    const storyboards = await pipeline.generateStoryboards(project.id, script!.id);
    assert.ok(storyboards && storyboards.length > 0);

    const task = await pipeline.createAndRunVideoTask(project.id, storyboards![0].id);
    assert.ok(task);
    const failed = await waitForTaskTerminal(pipeline, project.id, task!.id);
    assert.equal(failed.status, 'failed');
    assert.equal(videoCalls, 1);
    assert.equal(failed.providerErrorCode, 'CAPABILITY_MISMATCH');
  } finally {
    await pipeline.shutdown();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('pipeline should persist video task priority and list high priority first', async () => {
  const { projects, studio, pipeline, cleanup } = createServices();
  try {
    const project = projects.createProject({ name: 'Pipeline Priority Project' });
    studio.saveNovel(project.id, { title: 'N', content: '第一段。第二段。第三段。第四段。' });
    const outlines = await studio.generateOutlines(project.id, { chapterCount: 2 });
    assert.ok(outlines && outlines.length > 0);
    const script = await studio.generateScript(project.id, { outlineId: outlines![0].id });
    assert.ok(script);
    const storyboards = await pipeline.generateStoryboards(project.id, script!.id);
    assert.ok(storyboards && storyboards.length > 1);

    await pipeline.createAndRunVideoTask(project.id, storyboards![0].id, 'low');
    await pipeline.createAndRunVideoTask(project.id, storyboards![1].id, 'high');
    await sleep(30);

    const tasks = pipeline.listVideoTasks(project.id) ?? [];
    assert.ok(tasks.length >= 2);
    assert.equal(tasks[0].priority, 'high');
    assert.equal(tasks[1].priority, 'low');
  } finally {
    await cleanup();
  }
});

test('pipeline should create and finish video merge task from completed storyboard videos', async () => {
  const { projects, studio, pipeline, cleanup } = createServices();
  try {
    const project = projects.createProject({ name: 'Pipeline Merge Project' });
    studio.saveNovel(project.id, { title: 'N', content: '第一段。第二段。第三段。第四段。' });
    const outlines = await studio.generateOutlines(project.id, { chapterCount: 2 });
    assert.ok(outlines && outlines.length > 0);
    const script = await studio.generateScript(project.id, { outlineId: outlines![0].id });
    assert.ok(script);
    const storyboards = await pipeline.generateStoryboards(project.id, script!.id);
    assert.ok(storyboards && storyboards.length > 1);

    const firstTask = await pipeline.createAndRunVideoTask(project.id, storyboards![0].id);
    const secondTask = await pipeline.createAndRunVideoTask(project.id, storyboards![1].id);
    assert.ok(firstTask);
    assert.ok(secondTask);
    await waitForTaskTerminal(pipeline, project.id, firstTask!.id);
    await waitForTaskTerminal(pipeline, project.id, secondTask!.id);

    const merge = await pipeline.createAndRunVideoMerge(project.id, {
      title: 'Episode-1 rough cut',
      clips: [
        { storyboardId: storyboards![0].id, videoTaskId: firstTask!.id, transition: 'cut' },
        { storyboardId: storyboards![1].id, videoTaskId: secondTask!.id, transition: 'fade' }
      ],
      params: { keepAudio: true, fps: 24, crf: 23, preset: 'veryfast' }
    });
    assert.ok(merge);
    assert.equal(merge?.status, 'queued');

    const done = await waitForMergeTerminal(pipeline, project.id, merge!.id);
    assert.equal(done.status, 'done');
    assert.ok((done.resultUrl ?? '').includes('/mock/merged/'));
    assert.equal(done.params.keepAudio, true);
    assert.equal(done.params.fps, 24);
    assert.equal(done.params.crf, 23);
    assert.equal(done.params.preset, 'veryfast');
  } finally {
    await cleanup();
  }
});

test('pipeline should allow retry for failed video merge task', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'human2-merge-retry-test-'));
  const dataFile = path.join(tempRoot, 'app.db');
  const store = new SqliteStore(dataFile);
  const provider = new MockAiProvider();
  const projects = new ProjectsService(store);
  const studio = new StudioService(store, provider);
  const pipeline = new PipelineService(store, provider, 2, {
    videoMergeEngine: 'ffmpeg',
    ffmpegBin: '/path/not-exists-ffmpeg'
  });

  try {
    const project = projects.createProject({ name: 'Pipeline Merge Retry Project' });
    studio.saveNovel(project.id, { title: 'N', content: '第一段。第二段。第三段。第四段。' });
    const outlines = await studio.generateOutlines(project.id, { chapterCount: 2 });
    assert.ok(outlines && outlines.length > 0);
    const script = await studio.generateScript(project.id, { outlineId: outlines![0].id });
    assert.ok(script);
    const storyboards = await pipeline.generateStoryboards(project.id, script!.id);
    assert.ok(storyboards && storyboards.length > 1);

    const firstTask = await pipeline.createAndRunVideoTask(project.id, storyboards![0].id);
    const secondTask = await pipeline.createAndRunVideoTask(project.id, storyboards![1].id);
    assert.ok(firstTask);
    assert.ok(secondTask);
    await waitForTaskTerminal(pipeline, project.id, firstTask!.id);
    await waitForTaskTerminal(pipeline, project.id, secondTask!.id);

    const merge = await pipeline.createAndRunVideoMerge(project.id, {
      title: 'Episode-1 bad ffmpeg',
      clips: [
        { storyboardId: storyboards![0].id, videoTaskId: firstTask!.id, transition: 'cut' },
        { storyboardId: storyboards![1].id, videoTaskId: secondTask!.id, transition: 'cut' }
      ]
    });
    assert.ok(merge);

    const failed = await waitForMergeTerminal(pipeline, project.id, merge!.id);
    assert.equal(failed.status, 'failed');
    assert.ok((failed.errorCode ?? '').startsWith('MERGE_'));
    assert.ok((failed.error ?? '').length > 0);

    const retried = await pipeline.retryVideoMerge(project.id, merge!.id);
    assert.ok(retried);
    assert.equal(retried?.status, 'queued');
    const failedAgain = await waitForMergeTerminal(pipeline, project.id, merge!.id);
    assert.equal(failedAgain.status, 'failed');
  } finally {
    await pipeline.shutdown();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
