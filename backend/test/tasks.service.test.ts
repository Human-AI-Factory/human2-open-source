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
import { ProviderValidationError } from '../src/modules/pipeline/providers/errors.js';
import { TasksService } from '../src/modules/tasks/tasks.service.js';
import type { AiProvider } from '../src/modules/pipeline/providers/types.js';

const createServices = (input?: {
  provider?: AiProvider;
  pipelineOptions?: {
    failureInjectionEnabled?: boolean;
    failureInjectionTaskTypes?: string;
    failureInjectionErrorCodes?: string;
    failureInjectionRatio?: number;
  };
}) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'human2-tasks-test-'));
  const dataFile = path.join(tempRoot, 'app.db');
  const store = new SqliteStore(dataFile);
  const projects = new ProjectsService(store);
  const provider = input?.provider ?? new MockAiProvider();
  const studio = new StudioService(store, provider);
  const pipeline = new PipelineService(store, provider, 2, input?.pipelineOptions);
  const tasks = new TasksService(store, pipeline);
  return {
    store,
    projects,
    studio,
    pipeline,
    tasks,
    cleanup: async () => {
      await pipeline.shutdown();
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  };
};

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

const waitForDone = async (pipeline: PipelineService, projectId: string, taskId: string): Promise<void> => {
  const start = Date.now();
  while (Date.now() - start < 5000) {
    const task = (pipeline.listVideoTasks(projectId) ?? []).find((item) => item.id === taskId);
    if (task?.status === 'done') {
      return;
    }
    await sleep(40);
  }
  throw new Error(`task not done: ${taskId}`);
};

const waitForTerminal = async (pipeline: PipelineService, projectId: string, taskId: string): Promise<void> => {
  const start = Date.now();
  while (Date.now() - start < 5000) {
    const task = (pipeline.listVideoTasks(projectId) ?? []).find((item) => item.id === taskId);
    if (task && (task.status === 'done' || task.status === 'failed' || task.status === 'cancelled')) {
      return;
    }
    await sleep(40);
  }
  throw new Error(`task not terminal: ${taskId}`);
};

test('tasks service should list global video tasks and support retry/cancel/events', async () => {
  const { projects, studio, pipeline, tasks, cleanup } = createServices();
  try {
    const project = projects.createProject({ name: 'Task Center Project' });
    studio.saveNovel(project.id, { title: 'N', content: '第一段。第二段。第三段。' });
    const outlines = await studio.generateOutlines(project.id, { chapterCount: 2 });
    assert.ok(outlines && outlines.length > 0);
    const script = await studio.generateScript(project.id, { outlineId: outlines![0].id });
    assert.ok(script);
    const storyboards = await pipeline.generateStoryboards(project.id, script!.id);
    assert.ok(storyboards && storyboards.length > 0);
    const created = await pipeline.createAndRunVideoTask(project.id, storyboards![0].id);
    assert.ok(created);
    await waitForDone(pipeline, project.id, created!.id);

    const page = tasks.listVideoTasks({ page: 1, pageSize: 20 });
    assert.ok(page.items.length > 0);
    assert.equal(page.items[0].projectName, 'Task Center Project');
    assert.ok(page.items[0].storyboardTitle.length > 0);
    const byTaskIdKeyword = tasks.listVideoTasks({ q: created!.id, page: 1, pageSize: 20 });
    assert.equal(byTaskIdKeyword.items.some((item) => item.id === created!.id), true);

    const cancelledDone = await tasks.cancelVideoTask(created!.id);
    assert.ok(cancelledDone);
    assert.equal(cancelledDone?.status, 'done');

    const retried = await tasks.retryVideoTask(created!.id);
    assert.ok(retried);
    assert.equal(retried?.id, created?.id);

    const events = tasks.listVideoTaskEvents(created!.id, 20);
    assert.ok(events.length > 0);
    const exportCount = tasks.countVideoTaskEventsForExport(created!.id, { status: 'done' });
    assert.ok(exportCount);
    assert.ok(exportCount!.count >= 1);
    const exportJson = tasks.exportVideoTaskEvents(created!.id, { format: 'json', status: 'done', limit: 1000 });
    assert.ok(exportJson);
    assert.equal(exportJson?.contentType.includes('application/json'), true);
    assert.equal(exportJson?.body.includes('"status": "done"'), true);
    const exportCsv = tasks.exportVideoTaskEvents(created!.id, { format: 'csv', q: '', limit: 1000 });
    assert.ok(exportCsv);
    assert.equal(exportCsv?.contentType.includes('text/csv'), true);
    assert.equal(exportCsv?.body.startsWith('"id","taskId","status"'), true);
    const metrics = tasks.getVideoTaskMetrics();
    assert.ok(metrics.total >= 1);
    assert.ok(metrics.done >= 1);
    const queueAlertConfigDefault = tasks.getQueueRuntimeAlertConfig();
    assert.equal(queueAlertConfigDefault.warnQueuedThreshold, 12);
    assert.equal(queueAlertConfigDefault.criticalQueuedThreshold, 30);
    const queueAlertConfigUpdated = tasks.updateQueueRuntimeAlertConfig({ warnQueuedThreshold: 15, criticalQueuedThreshold: 40 });
    assert.equal(queueAlertConfigUpdated.warnQueuedThreshold, 15);
    assert.equal(queueAlertConfigUpdated.criticalQueuedThreshold, 40);

    const activeTask = await pipeline.createAndRunVideoTask(project.id, storyboards![0].id);
    assert.ok(activeTask);

    const batchCancelResult = await tasks.batchCancelVideoTasks([activeTask.id, 'missing_task_id']);
    assert.equal(batchCancelResult.updated.length, 1);
    assert.equal(batchCancelResult.notFoundIds.length, 1);

    const batchRetryResult = await tasks.batchRetryVideoTasks([activeTask.id, created!.id]);
    assert.equal(batchRetryResult.updated.length, 1);
    assert.equal(batchRetryResult.unchangedIds.length, 1);
  } finally {
    await cleanup();
  }
});

test('tasks service should preserve providerTaskId when retrying a failed video task', async () => {
  const { projects, studio, pipeline, tasks, store, cleanup } = createServices();
  try {
    const project = projects.createProject({ name: 'Retry Preserve Provider Task Project' });
    studio.saveNovel(project.id, { title: 'N', content: '第一段。第二段。第三段。' });
    const outlines = await studio.generateOutlines(project.id, { chapterCount: 1 });
    const script = await studio.generateScript(project.id, { outlineId: outlines![0].id });
    const storyboards = await pipeline.generateStoryboards(project.id, script!.id);
    const created = await pipeline.createAndRunVideoTask(project.id, storyboards![0].id);
    assert.ok(created);
    await waitForTerminal(pipeline, project.id, created!.id);

    store.updateVideoTask(project.id, created!.id, {
      status: 'failed',
      progress: 100,
      resultUrl: null,
      error: 'provider timed out',
      providerTaskId: 'wan-existing-task-1',
    });

    const retried = await tasks.retryVideoTask(created!.id);
    assert.ok(retried);
    assert.equal(retried?.providerTaskId, 'wan-existing-task-1');
  } finally {
    await cleanup();
  }
});

test('tasks service should expose worker runtime snapshot', async () => {
  const { projects, studio, pipeline, tasks, cleanup } = createServices();
  try {
    const project = projects.createProject({ name: 'Runtime Snapshot Project' });
    studio.saveNovel(project.id, { title: 'N', content: '第一段。第二段。第三段。' });
    const outlines = await studio.generateOutlines(project.id, { chapterCount: 2 });
    assert.ok(outlines && outlines.length > 0);
    const script = await studio.generateScript(project.id, { outlineId: outlines![0].id });
    assert.ok(script);
    const boards = await pipeline.generateStoryboards(project.id, script!.id);
    assert.ok(boards && boards.length > 0);
    const created = await pipeline.createAndRunVideoTask(project.id, boards![0].id);
    assert.ok(created);
    await waitForTerminal(pipeline, project.id, created!.id);

    const snapshot = tasks.getVideoTaskRuntimeSnapshot();
    assert.ok(snapshot.heartbeatAt.length > 0);
    assert.ok(snapshot.maxConcurrent >= 1);
    assert.ok(snapshot.pumpCycleCount >= 1);
    assert.ok(Array.isArray(snapshot.activeTaskIds));
    assert.ok(Array.isArray(snapshot.projects));
  } finally {
    await cleanup();
  }
});

test('tasks service should expose failure injection report and reset', async () => {
  const { projects, studio, pipeline, tasks, cleanup } = createServices({
    pipelineOptions: {
      failureInjectionEnabled: true,
      failureInjectionTaskTypes: 'video',
      failureInjectionErrorCodes: 'PROVIDER_TIMEOUT',
      failureInjectionRatio: 1
    }
  });
  try {
    const project = projects.createProject({ name: 'Failure Injection Project' });
    studio.saveNovel(project.id, { title: 'N', content: '第一段。第二段。第三段。' });
    const outlines = await studio.generateOutlines(project.id, { chapterCount: 2 });
    assert.ok(outlines && outlines.length > 0);
    const script = await studio.generateScript(project.id, { outlineId: outlines![0].id });
    assert.ok(script);
    const boards = await pipeline.generateStoryboards(project.id, script!.id);
    assert.ok(boards && boards.length > 0);
    const created = await pipeline.createAndRunVideoTask(project.id, boards![0].id);
    assert.ok(created);
    await waitForTerminal(pipeline, project.id, created!.id);

    const report = tasks.getFailureInjectionReport({ limit: 20 });
    assert.equal(report.enabled, true);
    assert.equal(report.taskTypes.includes('video'), true);
    assert.equal(report.events.length >= 1, true);
    assert.equal(report.events[0].taskType, 'video');
    assert.equal(report.events[0].errorCode, 'PROVIDER_TIMEOUT');

    const cfg = tasks.getFailureInjectionConfig();
    assert.equal(cfg.enabled, true);
    assert.equal(cfg.ratio, 1);
    assert.equal(cfg.taskTypes.includes('video'), true);

    const updated = tasks.updateFailureInjectionConfig({
      enabled: true,
      ratio: 0.4,
      taskTypes: ['video', 'audio'],
      errorCodes: ['PROVIDER_RATE_LIMITED', 'PROVIDER_TIMEOUT']
    });
    assert.equal(updated.ratio, 0.4);
    assert.deepEqual(updated.taskTypes.sort(), ['audio', 'video']);
    assert.deepEqual(updated.errorCodes.sort(), ['PROVIDER_RATE_LIMITED', 'PROVIDER_TIMEOUT']);

    const exported = tasks.exportFailureInjectionEvents({
      format: 'csv',
      limit: 20,
      taskType: 'video',
      errorCode: 'PROVIDER_TIMEOUT'
    });
    assert.equal(exported.contentType.includes('text/csv'), true);
    assert.equal(exported.body.startsWith('"id","at","taskType"'), true);

    const reset = tasks.clearFailureInjectionEvents();
    assert.equal(reset.cleared >= 1, true);
    const after = tasks.getFailureInjectionReport({ limit: 20 });
    assert.equal(after.events.length, 0);
  } finally {
    await cleanup();
  }
});

test('tasks service should support runtime alerts state/ack/export', async () => {
  const { store, tasks, cleanup } = createServices();
  try {
    store.setSystemSetting(
      'queue_alert_events',
      JSON.stringify([
        {
          id: 'qa_yellow_1',
          at: '2026-03-05T00:00:00.000Z',
          level: 'yellow',
          reason: 'queued=12 >= warn=12',
          queuedTotal: 12,
          runningTotal: 3,
          pumpErrorCount: 0,
          warnQueuedThreshold: 12,
          criticalQueuedThreshold: 30
        },
        {
          id: 'qa_green_1',
          at: '2026-03-05T00:01:00.000Z',
          level: 'green',
          reason: 'queue healthy',
          queuedTotal: 0,
          runningTotal: 1,
          pumpErrorCount: 0,
          warnQueuedThreshold: 12,
          criticalQueuedThreshold: 30
        }
      ])
    );
    const initial = tasks.getQueueRuntimeAlertState({ limit: 10 });
    assert.equal(initial.events.length, 2);
    assert.equal(initial.events[0].id, 'qa_green_1');
    assert.equal(initial.events[1].id, 'qa_yellow_1');

    const acked = tasks.acknowledgeQueueRuntimeAlerts({
      eventId: 'qa_yellow_1',
      actor: 'test-user',
      silenceMinutes: 30
    });
    const yellow = acked.events.find((item) => item.id === 'qa_yellow_1');
    assert.ok(yellow?.acknowledgedAt);
    assert.equal(yellow?.acknowledgedBy, 'test-user');
    assert.ok(acked.silencedUntil);

    const jsonExport = tasks.exportQueueRuntimeAlerts({ format: 'json', limit: 10 });
    assert.equal(jsonExport.contentType.includes('application/json'), true);
    assert.equal(jsonExport.body.includes('"qa_yellow_1"'), true);

    const csvExport = tasks.exportQueueRuntimeAlerts({ format: 'csv', limit: 10 });
    assert.equal(csvExport.contentType.includes('text/csv'), true);
    assert.equal(csvExport.body.startsWith('"id","at","level"'), true);
  } finally {
    await cleanup();
  }
});

test('tasks service should support providerTaskId and providerErrorCode filtering', async () => {
  const failingProvider: AiProvider = {
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
      throw new ProviderValidationError('invalid provider payload');
    },
    async generateAudio(input) {
      return { url: `/mock/audio/${input.projectId}-${input.storyboardId}.mp3` };
    },
    getCapabilities() {
      return [];
    }
  };

  const doneServices = createServices();
  const failedServices = createServices({ provider: failingProvider });

  try {
    const doneProject = doneServices.projects.createProject({ name: 'Task Filter Done Project' });
    doneServices.studio.saveNovel(doneProject.id, { title: 'N', content: '第一段。第二段。第三段。' });
    const doneOutlines = await doneServices.studio.generateOutlines(doneProject.id, { chapterCount: 2 });
    assert.ok(doneOutlines && doneOutlines.length > 0);
    const doneScript = await doneServices.studio.generateScript(doneProject.id, { outlineId: doneOutlines![0].id });
    assert.ok(doneScript);
    const doneBoards = await doneServices.pipeline.generateStoryboards(doneProject.id, doneScript!.id);
    assert.ok(doneBoards && doneBoards.length > 0);
    const doneTask = await doneServices.pipeline.createAndRunVideoTask(doneProject.id, doneBoards![0].id);
    assert.ok(doneTask);
    await waitForDone(doneServices.pipeline, doneProject.id, doneTask!.id);
    const refreshedDoneTask = doneServices.tasks.getVideoTaskDetail(doneTask!.id, 5)?.task;
    assert.ok(refreshedDoneTask?.providerTaskId);

    const failedProject = failedServices.projects.createProject({ name: 'Task Filter Failed Project' });
    failedServices.studio.saveNovel(failedProject.id, { title: 'N', content: '第一段。第二段。第三段。' });
    const failedOutlines = await failedServices.studio.generateOutlines(failedProject.id, { chapterCount: 2 });
    assert.ok(failedOutlines && failedOutlines.length > 0);
    const failedScript = await failedServices.studio.generateScript(failedProject.id, { outlineId: failedOutlines![0].id });
    assert.ok(failedScript);
    const failedBoards = await failedServices.pipeline.generateStoryboards(failedProject.id, failedScript!.id);
    assert.ok(failedBoards && failedBoards.length > 0);
    const failedTask = await failedServices.pipeline.createAndRunVideoTask(failedProject.id, failedBoards![0].id);
    assert.ok(failedTask);
    await waitForTerminal(failedServices.pipeline, failedProject.id, failedTask!.id);

    const byProviderTaskId = doneServices.tasks.listVideoTasks({
      providerTaskId: refreshedDoneTask!.providerTaskId ?? undefined,
      page: 1,
      pageSize: 20
    });
    assert.equal(byProviderTaskId.items.length, 1);
    assert.equal(byProviderTaskId.items[0].id, doneTask!.id);

    const byProviderErrorCode = failedServices.tasks.listVideoTasks({
      providerErrorCode: 'CAPABILITY_MISMATCH',
      page: 1,
      pageSize: 20
    });
    assert.ok(byProviderErrorCode.items.length >= 1);
    assert.equal(byProviderErrorCode.items[0].providerErrorCode, 'CAPABILITY_MISMATCH');

    const byFutureRange = doneServices.tasks.listVideoTasks({
      createdFrom: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      sortBy: 'updatedAt',
      order: 'asc',
      page: 1,
      pageSize: 20
    });
    assert.equal(byFutureRange.items.length, 0);
  } finally {
    await doneServices.cleanup();
    await failedServices.cleanup();
  }
});

test('tasks service should expose task slo/quota config and quota usage', async () => {
  const { projects, studio, pipeline, tasks, cleanup } = createServices();
  try {
    const project = projects.createProject({ name: 'Task SLO Quota Project' });
    const tierProject = projects.createProject({ name: 'Task SLO Quota Tier Project' });
    studio.saveNovel(project.id, { title: 'N', content: '第一段。第二段。第三段。' });
    const outlines = await studio.generateOutlines(project.id, { chapterCount: 2 });
    assert.ok(outlines && outlines.length > 0);
    const script = await studio.generateScript(project.id, { outlineId: outlines![0].id });
    assert.ok(script);
    const boards = await pipeline.generateStoryboards(project.id, script!.id);
    assert.ok(boards && boards.length > 0);
    const created = await pipeline.createAndRunVideoTask(project.id, boards![0].id);
    assert.ok(created);
    await waitForTerminal(pipeline, project.id, created!.id);

    const sloUpdated = tasks.updateTaskSloConfig({
      p95QueueWaitWarnMs: 3_000,
      p95QueueWaitCriticalMs: 7_000,
      pumpErrorRateWarn: 0.01,
      pumpErrorRateCritical: 0.03,
      windowSamples: 10
    });
    assert.equal(sloUpdated.p95QueueWaitWarnMs, 3_000);
    assert.equal(sloUpdated.p95QueueWaitCriticalMs, 7_000);
    assert.equal(sloUpdated.windowSamples, 10);
    const sloState = tasks.getTaskSloState();
    assert.ok(['green', 'yellow', 'red'].includes(sloState.level));
    assert.ok(sloState.sampleSize >= 0);

    const quotaUpdated = tasks.updateTaskQuotaConfig({
      dailyVideoTaskDefault: 5,
      dailyVideoTaskOverrides: { [project.id]: 2 },
      dailyVideoTaskTierLimits: { standard: 5, pro: 9, enterprise: 30 },
      projectTierOverrides: { [tierProject.id]: 'pro' }
    });
    assert.equal(quotaUpdated.dailyVideoTaskDefault, 5);
    assert.equal(quotaUpdated.dailyVideoTaskOverrides[project.id], 2);
    assert.equal(quotaUpdated.dailyVideoTaskTierLimits?.pro, 9);
    assert.equal(quotaUpdated.projectTierOverrides?.[tierProject.id], 'pro');

    const usage = tasks.getTaskQuotaUsage(project.id);
    assert.equal(usage.projectId, project.id);
    assert.equal(usage.dailyLimit, 2);
    assert.ok(usage.used >= 1);
    assert.equal(usage.remaining, Math.max(0, usage.dailyLimit - usage.used));
    assert.equal(usage.limitSource, 'project_override');

    const tierUsage = tasks.getTaskQuotaUsage(tierProject.id);
    assert.equal(tierUsage.dailyLimit, 9);
    assert.equal(tierUsage.tier, 'pro');
    assert.equal(tierUsage.limitSource, 'tier_limit');
  } finally {
    await cleanup();
  }
});

test('tasks service should expose quota reject events and export', async () => {
  const { store, projects, studio, pipeline, tasks, cleanup } = createServices();
  try {
    const project = projects.createProject({ name: 'Task Quota Reject Project' });
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
    await waitForTerminal(pipeline, project.id, first!.id);
    await assert.rejects(
      () => pipeline.createAndRunVideoTask(project.id, boards![1].id),
      /daily video task quota exceeded/
    );

    const events = tasks.getTaskQuotaRejectEvents({ limit: 20, projectId: project.id });
    assert.ok(events.length >= 1);
    assert.equal(events[0].projectId, project.id);

    const usageEvents = tasks.getTaskQuotaUsageEvents({ limit: 20, projectId: project.id });
    assert.ok(usageEvents.length >= 1);
    assert.equal(usageEvents[0].projectId, project.id);
    const usageExportCsv = tasks.exportTaskQuotaUsageEvents({ format: 'csv', limit: 20, projectId: project.id });
    assert.equal(usageExportCsv.contentType.includes('text/csv'), true);
    assert.equal(usageExportCsv.body.startsWith('"id","at","projectId","taskId"'), true);

    const exportedJson = tasks.exportTaskQuotaRejectEvents({ format: 'json', limit: 20, projectId: project.id });
    assert.equal(exportedJson.contentType.includes('application/json'), true);
    assert.equal(exportedJson.body.includes(project.id), true);

    const exportedCsv = tasks.exportTaskQuotaRejectEvents({ format: 'csv', limit: 20, projectId: project.id });
    assert.equal(exportedCsv.contentType.includes('text/csv'), true);
    assert.equal(exportedCsv.body.startsWith('"id","at","projectId"'), true);
  } finally {
    await cleanup();
  }
});

test('tasks service should expose unified incident sla config and summary', async () => {
  const { store, tasks, cleanup } = createServices();
  try {
    store.setSystemSetting(
      'task_unified_alert_incidents',
      JSON.stringify([
        {
          id: 'inc_open_old',
          createdAt: '2026-03-05T00:00:00.000Z',
          updatedAt: '2026-03-05T00:00:00.000Z',
          status: 'open',
          level: 'red',
          reason: 'queue congested',
          latestActionLogId: 'log_1',
          occurrenceCount: 3
        },
        {
          id: 'inc_open_new',
          createdAt: '2026-03-05T03:50:00.000Z',
          updatedAt: '2026-03-05T03:50:00.000Z',
          status: 'open',
          level: 'yellow',
          reason: 'catalog drift',
          latestActionLogId: 'log_2',
          occurrenceCount: 1,
          assignee: 'ops'
        },
        {
          id: 'inc_resolved',
          createdAt: '2026-03-05T01:00:00.000Z',
          updatedAt: '2026-03-05T02:00:00.000Z',
          status: 'resolved',
          level: 'yellow',
          reason: 'resolved alert',
          latestActionLogId: 'log_3',
          occurrenceCount: 1
        }
      ])
    );
    const updatedConfig = tasks.updateUnifiedAlertIncidentSlaConfig({
      warnAfterMinutes: 20,
      criticalAfterMinutes: 40,
      escalationAfterMinutes: 60
    });
    assert.equal(updatedConfig.warnAfterMinutes, 20);
    assert.equal(updatedConfig.criticalAfterMinutes, 40);
    assert.equal(updatedConfig.escalationAfterMinutes, 60);

    const summary = tasks.getUnifiedAlertIncidentSlaSummary({
      limit: 5,
      nowIso: '2026-03-05T04:00:00.000Z'
    });
    assert.equal(summary.openTotal, 2);
    assert.equal(summary.resolvedTotal, 1);
    assert.equal(summary.warnTotal, 0);
    assert.equal(summary.criticalTotal, 1);
    assert.equal(summary.escalationCandidateTotal, 1);
    assert.equal(summary.byLevelOpen.red, 1);
    assert.equal(summary.topAging[0].incidentId, 'inc_open_old');
    assert.equal(summary.topAging[0].slaLevel, 'red');
    assert.equal(summary.topAging[0].shouldEscalate, true);

    const escalated = tasks.triggerUnifiedAlertIncidentEscalations({ limit: 10, actor: 'oncall' });
    assert.equal(escalated.created, 1);
    assert.equal(escalated.skipped, 0);
    assert.equal(escalated.logs[0].incidentId, 'inc_open_old');
    assert.equal(escalated.logs[0].actor, 'oncall');
    assert.equal(escalated.logs[0].notificationStatus, 'pending');

    const logs = tasks.getUnifiedAlertIncidentEscalationLogs({ limit: 10 });
    assert.equal(logs.length, 1);
    assert.equal(logs[0].incidentId, 'inc_open_old');
    const updatedEscalation = tasks.updateUnifiedAlertIncidentEscalationNotification({
      escalationId: logs[0].id,
      notificationStatus: 'sent',
      notificationMessage: 'webhook delivered'
    });
    assert.ok(updatedEscalation);
    assert.equal(updatedEscalation?.notificationStatus, 'sent');
    assert.equal(updatedEscalation?.notificationMessage, 'webhook delivered');

    const escalationConfig = tasks.updateUnifiedAlertIncidentEscalationConfig({
      autoEnabled: false,
      autoCooldownMinutes: 15
    });
    assert.equal(escalationConfig.autoEnabled, false);
    assert.equal(escalationConfig.autoCooldownMinutes, 15);

    const notificationConfig = tasks.updateUnifiedAlertIncidentNotificationConfig({
      enabled: false,
      endpoint: '',
      timeoutMs: 4000,
      maxRetries: 5,
      retryBaseDelaySeconds: 7
    });
    assert.equal(notificationConfig.enabled, false);
    assert.equal(notificationConfig.timeoutMs, 4000);
    assert.equal(notificationConfig.maxRetries, 5);
    assert.equal(notificationConfig.retryBaseDelaySeconds, 7);

    const revertedPending = tasks.updateUnifiedAlertIncidentEscalationNotification({
      escalationId: logs[0].id,
      notificationStatus: 'pending'
    });
    assert.equal(revertedPending?.notificationStatus, 'pending');
    const processed = await tasks.processUnifiedAlertIncidentEscalationNotifications({ limit: 10 });
    assert.equal(processed.processed, 1);
    assert.equal(processed.failed, 1);
    const failedLog = tasks.getUnifiedAlertIncidentEscalationLogs({ limit: 10 })[0];
    assert.equal(failedLog.notificationStatus, 'failed');
    assert.equal(typeof failedLog.notificationAttempt, 'number');
    assert.equal((failedLog.notificationAttempt ?? 0) >= 1, true);
    assert.equal(typeof failedLog.nextRetryAt, 'string');
    assert.equal((failedLog.nextRetryAt ?? '').length > 0, true);
    const deliveryLogs = tasks.getUnifiedAlertIncidentNotificationDeliveryLogs({ limit: 10 });
    assert.equal(deliveryLogs.length >= 1, true);
    assert.equal(deliveryLogs[0].status, 'failed');
    const failedOnly = tasks.getUnifiedAlertIncidentNotificationDeliveryLogs({ status: 'failed', limit: 10 });
    assert.equal(failedOnly.length >= 1, true);
    assert.equal(failedOnly.every((item) => item.status === 'failed'), true);
    const deliveryCsv = tasks.exportUnifiedAlertIncidentNotificationDeliveryLogs({ format: 'csv', limit: 10 });
    assert.equal(deliveryCsv.contentType.includes('text/csv'), true);
    assert.equal(deliveryCsv.body.startsWith('"id","at","escalationId"'), true);

    const exportedCsv = tasks.exportUnifiedAlertIncidentEscalationLogs({ format: 'csv', limit: 10 });
    assert.equal(exportedCsv.contentType.includes('text/csv'), true);
    assert.equal(exportedCsv.body.startsWith('"id","at","incidentId"'), true);
  } finally {
    await cleanup();
  }
});

test('tasks service should batch repair failed tasks by policy', async () => {
  const failingProvider: AiProvider = {
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
      throw new ProviderValidationError('invalid provider payload');
    },
    async generateAudio(input) {
      return { url: `/mock/audio/${input.projectId}-${input.storyboardId}.mp3` };
    },
    getCapabilities() {
      return [];
    }
  };
  const { store, projects, studio, pipeline, tasks, cleanup } = createServices({ provider: failingProvider });
  try {
    store.setSystemSetting(
      'task_failure_policies',
      JSON.stringify({
        autoApply: false,
        maxAutoApplyPerTask: 1,
        items: [
          {
            errorCode: 'CAPABILITY_MISMATCH',
            action: 'recreate_conservative',
            preferredMode: 'text',
            disableAudio: true,
            priority: 'low'
          },
          {
            errorCode: 'PROVIDER_UNKNOWN',
            action: 'manual',
            preferredMode: 'keep',
            disableAudio: false,
            priority: 'keep'
          }
        ]
      })
    );

    const project = projects.createProject({ name: 'Task Repair Project' });
    studio.saveNovel(project.id, { title: 'N', content: '第一段。第二段。第三段。' });
    const outlines = await studio.generateOutlines(project.id, { chapterCount: 2 });
    assert.ok(outlines && outlines.length > 0);
    const script = await studio.generateScript(project.id, { outlineId: outlines![0].id });
    assert.ok(script);
    const boards = await pipeline.generateStoryboards(project.id, script!.id);
    assert.ok(boards && boards.length > 0);
    const failedTask = await pipeline.createAndRunVideoTask(project.id, boards![0].id);
    assert.ok(failedTask);
    await waitForTerminal(pipeline, project.id, failedTask!.id);

    const result = await tasks.batchRepairVideoTasksByPolicy([failedTask!.id]);
    assert.equal(result.retried.length, 0);
    assert.equal(result.recreated.length, 1);
    assert.equal(result.manualIds.length, 0);
    assert.equal(result.notFoundIds.length, 0);
    assert.equal(result.recreated[0].params.audio, false);
    assert.equal(result.recreated[0].priority, 'low');

    const resultByQuery = await tasks.batchRepairVideoTasksByPolicyQuery({
      status: 'failed',
      maxCount: 50
    });
    assert.ok((resultByQuery.matchedCount ?? 0) >= 1);
  } finally {
    await cleanup();
  }
});
