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
import { DramaWorkflowService } from '../src/modules/domain/drama-workflow.service.js';
import { DomainEntityService } from '../src/modules/domain/domain-entity.service.js';

const createServices = () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'human2-domain-entity-test-'));
  const dataFile = path.join(tempRoot, 'app.db');
  const store = new SqliteStore(dataFile);
  const provider = new MockAiProvider();
  const projects = new ProjectsService(store);
  const studio = new StudioService(store, provider);
  const pipeline = new PipelineService(store, provider, 2, { videoMergeEngine: 'placeholder' });
  const dramaWorkflow = new DramaWorkflowService(store);
  const domainEntity = new DomainEntityService(store);
  return {
    store,
    projects,
    studio,
    pipeline,
    dramaWorkflow,
    domainEntity,
    cleanup: async () => {
      await pipeline.shutdown();
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  };
};

test('domain entity service should apply policy defaults and rename on approved conflicts', async () => {
  const { store, projects, studio, pipeline, dramaWorkflow, domainEntity, cleanup } = createServices();
  try {
    const project = projects.createProject({ name: 'Domain Apply Policy Project' });
    studio.saveNovel(project.id, { title: 'N', content: '第一段。第二段。第三段。' });
    const outlines = await studio.generateOutlines(project.id, { chapterCount: 2 });
    assert.ok(outlines && outlines.length > 0);
    const script = await studio.generateScript(project.id, { outlineId: outlines![0].id });
    assert.ok(script);
    const boards = await pipeline.generateStoryboards(project.id, script!.id);
    assert.ok(boards && boards.length > 0);

    const drama = dramaWorkflow.upsertDrama(project.id, { name: '主线剧集' });
    assert.ok(drama);
    const episode = dramaWorkflow.createEpisode(project.id, { dramaId: drama!.id, title: '第1集' });
    assert.ok(episode);
    for (const board of boards!) {
      dramaWorkflow.assignStoryboardToEpisode(project.id, board.id, episode!.id);
    }
    const episodeBoards = store.listStoryboardsByEpisode(project.id, episode.id) ?? [];
    assert.ok(episodeBoards.length > 0);

    const entity = domainEntity.createDomainEntity(project.id, {
      type: 'character',
      name: '角色统一稿',
      prompt: 'golden hero prompt'
    });
    assert.ok(entity);

    const updatedPolicy = domainEntity.updateDomainApplyPolicy(project.id, {
      defaultMode: 'all',
      byStatus: {
        approved: {
          character: {
            conflictStrategy: 'rename',
            renameSuffix: '(approved alias)'
          }
        }
      },
      actor: 'planner'
    });
    assert.ok(updatedPolicy);
    assert.equal(updatedPolicy!.defaultMode, 'all');
    assert.equal(updatedPolicy!.byStatus.approved?.character?.conflictStrategy, 'rename');

    const toReview = dramaWorkflow.transitionEpisodeWorkflow(project.id, episode.id, {
      toStatus: 'in_review',
      actor: 'planner'
    });
    assert.equal(toReview.reason, null);
    const transitioned = dramaWorkflow.transitionEpisodeWorkflow(project.id, episode.id, {
      toStatus: 'approved',
      actor: 'planner'
    });
    assert.equal(transitioned.reason, null);

    const firstPreview = domainEntity.previewDomainEntityApplyToEpisode(project.id, entity!.id, {
      episodeId: episode.id
    });
    assert.ok(firstPreview);
    assert.equal(firstPreview!.createCount, episodeBoards.length);
    assert.equal(firstPreview!.skipCount, 0);

    const firstApply = domainEntity.applyDomainEntityToEpisodeByStrategy(project.id, entity!.id, {
      episodeId: episode.id,
      actor: 'planner'
    });
    assert.ok(firstApply);
    assert.equal(firstApply!.created.length, episodeBoards.length);

    const secondApply = domainEntity.applyDomainEntityToEpisodeByStrategy(project.id, entity!.id, {
      episodeId: episode.id,
      actor: 'planner'
    });
    assert.ok(secondApply);
    assert.equal(secondApply!.created.length, episodeBoards.length);
    assert.ok(secondApply!.created.every((asset) => asset.name.includes('(approved alias)')));

    const relations = domainEntity.listEpisodeDomainEntityRelations(project.id, episode.id);
    assert.ok(relations?.some((item) => item.entityId === entity!.id && item.role === 'character'));

    const canonical = domainEntity.listCanonicalEntityWorkbench(project.id, {
      type: 'character',
      episodeId: episode.id
    });
    assert.ok(canonical?.some((item) => item.entityId === entity!.id && item.appearances >= episodeBoards.length));

    const audits = domainEntity.listDomainEntityAudits(project.id, {
      page: 1,
      pageSize: 50
    });
    assert.ok(audits);
    assert.ok(audits!.items.some((item) => item.action === 'domain_policy.update'));
    assert.ok(audits!.items.some((item) => item.action === 'domain_entity.apply'));
  } finally {
    await cleanup();
  }
});

test('domain entity service should batch lifecycle transitions and auto-recommend approved status', async () => {
  const { projects, studio, pipeline, dramaWorkflow, domainEntity, cleanup } = createServices();
  try {
    const project = projects.createProject({ name: 'Domain Lifecycle Project' });
    studio.saveNovel(project.id, { title: 'N', content: '第一段。第二段。第三段。' });
    const outlines = await studio.generateOutlines(project.id, { chapterCount: 2 });
    assert.ok(outlines && outlines.length > 0);
    const script = await studio.generateScript(project.id, { outlineId: outlines![0].id });
    assert.ok(script);
    const boards = await pipeline.generateStoryboards(project.id, script!.id);
    assert.ok(boards && boards.length > 0);

    const drama = dramaWorkflow.upsertDrama(project.id, { name: '主线剧集' });
    assert.ok(drama);
    const episode = dramaWorkflow.createEpisode(project.id, { dramaId: drama!.id, title: '第1集' });
    assert.ok(episode);
    for (const board of boards!) {
      dramaWorkflow.assignStoryboardToEpisode(project.id, board.id, episode!.id);
    }

    const character = domainEntity.createDomainEntity(project.id, {
      type: 'character',
      name: '生命周期角色',
      prompt: 'consistent hero'
    });
    const prop = domainEntity.createDomainEntity(project.id, {
      type: 'prop',
      name: '生命周期道具',
      prompt: 'signature sword'
    });
    assert.ok(character && prop);

    const linked = domainEntity.replaceStoryboardDomainEntityRelations(project.id, boards![0].id, {
      characterEntityIds: [character!.id]
    });
    assert.ok(linked);
    const episodeLinked = domainEntity.replaceEpisodeDomainEntityRelations(project.id, episode.id, {
      characterEntityIds: [character!.id]
    });
    assert.ok(episodeLinked);

    const initialRecommendation = domainEntity.recommendDomainEntityLifecycleStatusByEpisode(project.id, character!.id);
    assert.ok(initialRecommendation);
    assert.equal(initialRecommendation!.recommendedStatus, 'draft');

    const batchToReview = domainEntity.batchTransitionDomainEntityLifecycle(project.id, {
      entityIds: [character!.id, prop!.id],
      toStatus: 'in_review',
      actor: 'reviewer'
    });
    assert.ok(batchToReview);
    assert.equal(batchToReview!.updated.length, 2);
    assert.equal(batchToReview!.rejected.length, 0);

    const archivePreview = domainEntity.previewDomainEntityLifecycleTransition(project.id, character!.id, {
      toStatus: 'archived'
    });
    assert.ok(archivePreview);
    assert.equal(archivePreview!.reason, 'entity_in_use');

    const toReview = dramaWorkflow.transitionEpisodeWorkflow(project.id, episode.id, {
      toStatus: 'in_review',
      actor: 'reviewer'
    });
    assert.equal(toReview.reason, null);
    const approvedTransition = dramaWorkflow.transitionEpisodeWorkflow(project.id, episode.id, {
      toStatus: 'approved',
      actor: 'reviewer'
    });
    assert.equal(approvedTransition.reason, null);

    const approvedRecommendation = domainEntity.recommendDomainEntityLifecycleStatusByEpisode(project.id, character!.id);
    assert.ok(approvedRecommendation);
    assert.equal(approvedRecommendation!.recommendedStatus, 'approved');

    const autoRecommended = domainEntity.batchTransitionDomainEntityLifecycle(project.id, {
      entityIds: [character!.id],
      autoRecommend: true,
      actor: 'reviewer'
    });
    assert.ok(autoRecommended);
    assert.equal(autoRecommended!.updated.length, 1);
    assert.equal(autoRecommended!.updated[0].toStatus, 'approved');
  } finally {
    await cleanup();
  }
});
