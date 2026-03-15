import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SqliteStore } from '../src/db/sqlite.js';
import { ProjectsService } from '../src/modules/projects/projects.service.js';
import { PipelineService } from '../src/modules/pipeline/pipeline.service.js';
import { MockAiProvider } from '../src/modules/pipeline/providers/mock.provider.js';
import { DomainEntityService } from '../src/modules/domain/domain-entity.service.js';
import { DramaProductionChainService } from '../src/modules/domain/drama-production-chain.service.js';
import { DramaWorkflowService } from '../src/modules/domain/drama-workflow.service.js';
import { createRuntimeModule } from '../src/modules/runtime/runtime.module.js';
import { createDomainModule } from '../src/modules/domain/domain.module.js';
import { QueueRuntimeAlertService } from '../src/modules/runtime/queue-runtime-alert.service.js';
import { TaskEventService } from '../src/modules/runtime/task-event.service.js';
import { TaskQueryService } from '../src/modules/runtime/task-query.service.js';
import { TaskQuotaService } from '../src/modules/runtime/task-quota.service.js';
import { TaskReconcileService } from '../src/modules/runtime/task-reconcile.service.js';
import { TaskRepairService } from '../src/modules/runtime/task-repair.service.js';
import { TaskRuntimeService } from '../src/modules/runtime/task-runtime.service.js';
import { TaskSloService } from '../src/modules/runtime/task-slo.service.js';
import { UnifiedAlertIncidentService } from '../src/modules/runtime/unified-alert-incident.service.js';
import { UnifiedAlertStateService } from '../src/modules/runtime/unified-alert-state.service.js';
import { TaskCatalogAlertService } from '../src/modules/tasks/task-catalog-alert.service.js';

const createHarness = () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'human2-module-wiring-test-'));
  const dataFile = path.join(tempRoot, 'app.db');
  const store = new SqliteStore(dataFile);
  const provider = new MockAiProvider();
  const pipeline = new PipelineService(store, provider, 2, { videoMergeEngine: 'placeholder' });
  return {
    store,
    projects: new ProjectsService(store),
    runtimeModule: createRuntimeModule({ store, pipelineService: pipeline }),
    domainModule: createDomainModule({ store }),
    cleanup: async () => {
      await pipeline.shutdown();
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  };
};

test('runtime module should expose working runtime services over shared store and pipeline', async () => {
  const { runtimeModule, cleanup } = createHarness();
  try {
    const page = runtimeModule.taskQueryService.listVideoTasks({ page: 1, pageSize: 10 });
    assert.equal(page.total, 0);
    assert.deepEqual(page.items, []);

    const snapshot = runtimeModule.taskRuntimeService.getVideoTaskRuntimeSnapshot();
    assert.equal(typeof snapshot.maxConcurrent, 'number');
    assert.equal(typeof snapshot.queuedTotal, 'number');

    const unified = runtimeModule.unifiedAlertStateService.getUnifiedAlertState({ limit: 10, windowMinutes: 60 });
    assert.equal(unified.total, 0);
    assert.deepEqual(unified.bySource, { queue: 0, contract: 0 });

    const reconcile = runtimeModule.taskReconcileService.getRuntimeReconcileSummary();
    assert.equal(reconcile.totals.issues, 0);
    assert.equal(typeof reconcile.runtime.queuedTotal, 'number');
  } finally {
    await cleanup();
  }
});

test('runtime and domain module factories should preserve explicit injected services', async () => {
  const { store, cleanup } = createHarness();
  const provider = new MockAiProvider();
  const pipeline = new PipelineService(store, provider, 2, { videoMergeEngine: 'placeholder' });
  try {
    const taskQueryService = new TaskQueryService(store);
    const taskEventService = new TaskEventService(store);
    const taskRuntimeService = new TaskRuntimeService(pipeline);
    const queueRuntimeAlertService = new QueueRuntimeAlertService(store);
    const taskSloService = new TaskSloService(store, taskRuntimeService);
    const taskQuotaService = new TaskQuotaService(store);
    const taskReconcileService = new TaskReconcileService(store, taskRuntimeService);
    const taskRepairService = new TaskRepairService(store, pipeline);
    const taskCatalogAlertService = new TaskCatalogAlertService(store);
    const unifiedAlertIncidentService = new UnifiedAlertIncidentService(store);
    const unifiedAlertStateService = new UnifiedAlertStateService(
      store,
      queueRuntimeAlertService,
      taskCatalogAlertService,
      unifiedAlertIncidentService
    );
    const runtimeModule = createRuntimeModule({
      store,
      pipelineService: pipeline,
      taskQueryService,
      taskEventService,
      taskRuntimeService,
      queueRuntimeAlertService,
      taskSloService,
      taskQuotaService,
      taskReconcileService,
      taskRepairService,
      taskCatalogAlertService,
      unifiedAlertIncidentService,
      unifiedAlertStateService
    });
    assert.equal(runtimeModule.taskQueryService, taskQueryService);
    assert.equal(runtimeModule.taskEventService, taskEventService);
    assert.equal(runtimeModule.taskRuntimeService, taskRuntimeService);
    assert.equal(runtimeModule.queueRuntimeAlertService, queueRuntimeAlertService);
    assert.equal(runtimeModule.taskSloService, taskSloService);
    assert.equal(runtimeModule.taskQuotaService, taskQuotaService);
    assert.equal(runtimeModule.taskReconcileService, taskReconcileService);
    assert.equal(runtimeModule.taskRepairService, taskRepairService);
    assert.equal(runtimeModule.taskCatalogAlertService, taskCatalogAlertService);
    assert.equal(runtimeModule.unifiedAlertIncidentService, unifiedAlertIncidentService);
    assert.equal(runtimeModule.unifiedAlertStateService, unifiedAlertStateService);

    const dramaWorkflowService = new DramaWorkflowService(store);
    const dramaProductionChainService = new DramaProductionChainService(store);
    const domainEntityService = new DomainEntityService(store);
    const domainModule = createDomainModule({
      store,
      dramaWorkflowService,
      dramaProductionChainService,
      domainEntityService
    });
    assert.equal(domainModule.dramaWorkflowService, dramaWorkflowService);
    assert.equal(domainModule.dramaProductionChainService, dramaProductionChainService);
    assert.equal(domainModule.domainEntityService, domainEntityService);
  } finally {
    await pipeline.shutdown();
    await cleanup();
  }
});

test('domain module should expose working workflow and entity services over shared store', async () => {
  const { projects, domainModule, cleanup } = createHarness();
  try {
    const project = projects.createProject({ name: 'Module Domain Project' });
    const drama = domainModule.dramaWorkflowService.upsertDrama(project.id, { name: '主线' });
    assert.ok(drama);

    const episode = domainModule.dramaWorkflowService.createEpisode(project.id, {
      dramaId: drama!.id,
      title: '第1集'
    });
    assert.ok(episode);
    assert.equal(domainModule.dramaWorkflowService.listEpisodes(project.id)?.length, 1);
    const chain = domainModule.dramaProductionChainService.getDramaProductionChain(drama!.id);
    assert.ok(chain);
    assert.equal(chain?.counts.episode, 1);
    assert.equal(chain?.episodes[0].episodeId, episode!.id);

    const entity = domainModule.domainEntityService.createDomainEntity(project.id, {
      type: 'character',
      name: '主角',
      prompt: 'steady hero'
    });
    assert.ok(entity);

    const characters = domainModule.domainEntityService.listDomainEntities(project.id, {
      type: 'character',
      includeDeleted: false
    });
    assert.equal(characters?.length, 1);
    assert.equal(characters?.[0].id, entity!.id);
  } finally {
    await cleanup();
  }
});
