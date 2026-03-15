import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SqliteStore } from '../src/db/sqlite.js';
import { ProjectsService } from '../src/modules/projects/projects.service.js';
import { StudioService } from '../src/modules/studio/studio.service.js';
import { PipelineService } from '../src/modules/pipeline/pipeline.service.js';
import { MockAiProvider } from '../src/modules/pipeline/providers/mock.provider.js';
import { DomainService } from '../src/modules/domain/domain.service.js';

const createServices = () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'human2-domain-test-'));
  const dataFile = path.join(tempRoot, 'app.db');
  const store = new SqliteStore(dataFile);
  const provider = new MockAiProvider();
  const projects = new ProjectsService(store);
  const studio = new StudioService(store, provider);
  const pipeline = new PipelineService(store, provider, 2, { videoMergeEngine: 'placeholder' });
  const domain = new DomainService(store);
  return {
    store,
    projects,
    studio,
    pipeline,
    domain,
    cleanup: async () => {
      await pipeline.shutdown();
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  };
};

test('domain service should enforce strong delete constraints', async () => {
  const { projects, studio, pipeline, domain, cleanup } = createServices();
  try {
    const project = projects.createProject({ name: 'Domain Delete Constraints Project' });
    studio.saveNovel(project.id, { title: 'N', content: '第一段。第二段。第三段。' });
    const outlines = await studio.generateOutlines(project.id, { chapterCount: 2 });
    assert.ok(outlines && outlines.length > 0);
    const script = await studio.generateScript(project.id, { outlineId: outlines![0].id });
    assert.ok(script);
    const boards = await pipeline.generateStoryboards(project.id, script!.id);
    assert.ok(boards && boards.length > 0);

    const freeEntity = domain.createDomainEntity(project.id, {
      type: 'character',
      name: '自由角色',
      prompt: 'hero'
    });
    assert.ok(freeEntity);
    const freeDeleteCheck = domain.previewDomainEntityDelete(project.id, freeEntity!.id);
    assert.ok(freeDeleteCheck);
    assert.equal(freeDeleteCheck!.allowed, true);
    assert.equal(freeDeleteCheck!.reason, 'ok');

    const inUseEntity = domain.createDomainEntity(project.id, {
      type: 'character',
      name: '引用角色',
      prompt: 'villain'
    });
    assert.ok(inUseEntity);
    const replaced = domain.replaceStoryboardDomainEntityRelations(project.id, boards![0].id, {
      characterEntityIds: [inUseEntity!.id]
    });
    assert.ok(replaced);
    const inUseDeleteCheck = domain.previewDomainEntityDelete(project.id, inUseEntity!.id);
    assert.ok(inUseDeleteCheck);
    assert.equal(inUseDeleteCheck!.allowed, false);
    assert.equal(inUseDeleteCheck!.reason, 'entity_in_use');
    const inUseDeleteResult = domain.deleteDomainEntity(project.id, inUseEntity!.id);
    assert.ok(inUseDeleteResult);
    assert.equal(inUseDeleteResult!.deleted, false);
    assert.equal(inUseDeleteResult!.check.reason, 'entity_in_use');

    const inReviewEntity = domain.createDomainEntity(project.id, {
      type: 'prop',
      name: '审核道具',
      prompt: 'sword'
    });
    assert.ok(inReviewEntity);
    const transitioned = domain.transitionDomainEntityLifecycle(project.id, inReviewEntity!.id, { toStatus: 'in_review' });
    assert.ok(transitioned);
    assert.equal(transitioned!.check.allowed, true);
    const protectedDeleteResult = domain.deleteDomainEntity(project.id, inReviewEntity!.id);
    assert.ok(protectedDeleteResult);
    assert.equal(protectedDeleteResult!.deleted, false);
    assert.equal(protectedDeleteResult!.check.reason, 'protected_status');
  } finally {
    await cleanup();
  }
});

test('domain service should expose drama production chain summary across script storyboard asset video merge delivery', async () => {
  const { store, projects, studio, pipeline, domain, cleanup } = createServices();
  try {
    const project = projects.createProject({ name: 'Domain Production Chain Project' });
    const drama = domain.upsertDrama(project.id, { name: '主线' });
    assert.ok(drama);
    const episode = domain.createEpisode(project.id, { dramaId: drama!.id, title: '第1集' });
    assert.ok(episode);

    studio.saveNovel(project.id, { title: 'N', content: '第一段。第二段。第三段。' });
    const outlines = await studio.generateOutlines(project.id, { chapterCount: 2 });
    assert.ok(outlines && outlines.length > 0);
    const script = await studio.generateScript(project.id, { outlineId: outlines![0].id });
    assert.ok(script);
    store.updateScriptEpisode(project.id, script!.id, episode!.id);

    const boards = await pipeline.generateStoryboards(project.id, script!.id);
    assert.ok(boards && boards.length > 0);
    for (const board of boards!) {
      domain.assignStoryboardToEpisode(project.id, board.id, episode!.id);
    }

    const videoTasks = boards!.map((board, index) => {
      const assets = store.createAssets(project.id, board.id, [
        {
          id: `asset-chain-${index + 1}`,
          name: `镜头资产${index + 1}`,
          type: 'scene',
          prompt: 'scene',
          imageUrl: null
        }
      ]);
      assert.ok(assets && assets.length > 0);
      store.replaceStoryboardAssetRelations(project.id, board.id, { sceneAssetId: assets![0].id });

      const videoTask = store.createVideoTask({
        id: `video-chain-${index + 1}`,
        projectId: project.id,
        storyboardId: board.id,
        prompt: 'video',
        modelName: 'mock',
        params: {},
        priority: 'medium'
      });
      assert.ok(videoTask);
      store.updateVideoTask(project.id, videoTask!.id, {
        status: 'done',
        progress: 100,
        resultUrl: `/video/chain-${index + 1}.mp4`
      });
      return videoTask!;
    });

    const audioTask = store.createAudioTask({
      id: 'audio-chain-1',
      projectId: project.id,
      storyboardId: boards![0].id,
      prompt: 'audio',
      modelName: 'mock',
      params: {},
      priority: 'medium'
    });
    assert.ok(audioTask);
    store.updateAudioTask(project.id, audioTask!.id, {
      status: 'done',
      progress: 100,
      resultUrl: '/audio/chain.mp3'
    });
    const merge = store.createVideoMerge({
      id: 'merge-chain-1',
      projectId: project.id,
      title: '第1集合成',
      status: 'done',
      clips: boards!.map((board, index) => ({ storyboardId: board.id, videoTaskId: videoTasks[index]!.id })),
      params: {}
    });
    assert.ok(merge);
    store.updateVideoMerge(project.id, merge!.id, {
      status: 'done',
      resultUrl: '/merge/chain.mp4'
    });
    domain.updateEpisode(project.id, episode!.id, { status: 'published' });

    const chain = domain.getDramaProductionChain(drama!.id);
    assert.ok(chain);
    assert.equal(chain?.counts.episode, 1);
    assert.equal(chain?.counts.storyboardGenerated, boards!.length);
    assert.equal(chain?.counts.videoTaskDone, boards!.length);
    assert.equal(chain?.counts.audioTaskDone, 1);
    assert.equal(chain?.counts.videoMergeDone, 1);
    assert.equal(chain?.stage.current, 'done');
    assert.equal(chain?.episodes[0].stage.current, 'done');
    assert.equal(chain?.episodes[0].counts.assetLinked, boards!.length);
  } finally {
    await cleanup();
  }
});

test('domain service should import episodes from existing unassigned scripts', async () => {
  const { projects, studio, domain, cleanup } = createServices();
  try {
    const project = projects.createProject({ name: 'Domain Import Episodes Project' });
    const drama = domain.upsertDrama(project.id, { name: '主线' });
    assert.ok(drama);

    studio.saveNovel(project.id, { title: 'N', content: '第一段。第二段。第三段。第四段。' });
    const outlines = await studio.generateOutlines(project.id, { chapterCount: 2 });
    assert.ok(outlines && outlines.length === 2);
    const firstScript = await studio.generateScript(project.id, { outlineId: outlines![0].id });
    const secondScript = await studio.generateScript(project.id, { outlineId: outlines![1].id });
    assert.ok(firstScript);
    assert.ok(secondScript);
    assert.equal(firstScript?.episodeId ?? null, null);
    assert.equal(secondScript?.episodeId ?? null, null);

    const imported = domain.importEpisodesFromScriptsByDrama(drama!.id);
    assert.ok(imported);
    assert.equal(imported?.createdEpisodes.length, 2);
    assert.equal(imported?.boundScripts.length, 2);
    assert.equal(imported?.skippedScriptIds.length, 0);
    assert.equal(imported?.createdEpisodes[0].orderIndex, 1);
    assert.equal(imported?.createdEpisodes[1].orderIndex, 2);
    assert.equal(imported?.boundScripts[0].episodeId, imported?.createdEpisodes[0].id);
    assert.equal(imported?.boundScripts[1].episodeId, imported?.createdEpisodes[1].id);

    const episodes = domain.listEpisodesByDrama(drama!.id);
    assert.ok(episodes);
    assert.equal(episodes?.length, 2);
  } finally {
    await cleanup();
  }
});
