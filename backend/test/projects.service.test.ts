import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SqliteStore } from '../src/db/sqlite.js';
import { ProjectsService } from '../src/modules/projects/projects.service.js';

const createService = () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'human2-projects-test-'));
  const dataFile = path.join(tempRoot, 'app.db');
  const store = new SqliteStore(dataFile);
  const service = new ProjectsService(store);

  return {
    service,
    cleanup: () => fs.rmSync(tempRoot, { recursive: true, force: true })
  };
};

test('projects service full lifecycle', () => {
  const { service, cleanup } = createService();

  try {
    const project = service.createProject({ name: 'P1', description: 'Desc' });
    assert.equal(project.name, 'P1');

    const task = service.createTask(project.id, { title: 'T1' });
    assert.ok(task);

    const updated = service.updateTask(project.id, task!.id, { status: 'done' });
    assert.equal(updated?.status, 'done');

    const summary = service.getSummary();
    assert.equal(summary.projectCount, 1);
    assert.equal(summary.taskCount, 1);
    assert.equal(summary.doneCount, 1);

    const deletedTask = service.deleteTask(project.id, task!.id);
    assert.equal(deletedTask, true);

    const deletedProject = service.deleteProject(project.id);
    assert.equal(deletedProject, true);
  } finally {
    cleanup();
  }
});

test('projects workflow summary should return current stage and progress', () => {
  const { service, cleanup } = createService();
  try {
    const project = service.createProject({ name: 'Workflow P', description: '' });
    const before = service.getProjectWorkflow(project.id);
    assert.ok(before);
    assert.equal(before?.stage.current, 'writing');
    assert.equal(before?.stage.nextAction, 'create_novel');
    assert.equal(before?.stage.progressPercent, 0);

    const store = (service as unknown as { store: SqliteStore }).store;
    const novel = store.upsertNovel(project.id, 'n1', 'c1');
    assert.ok(novel);
    const outlines = store.replaceOutlines(project.id, [{ id: 'o-1', title: 'o1', summary: 's1', orderIndex: 1 }]);
    assert.equal(outlines?.length, 1);
    const scripts = [
      store.createScript({
        id: 's-1',
        projectId: project.id,
        outlineId: outlines![0].id,
        title: 'script-1',
        content: 'content'
      })
    ];
    assert.equal(scripts?.length, 1);
    const boards = store.replaceStoryboards(project.id, scripts![0]!.id, [{ id: 'sb-1', title: 'b1', prompt: 'p1' }]);
    assert.equal(boards?.length, 1);
    const assets = store.createAssets(project.id, boards![0].id, [
      { id: 'a-1', name: 'a1', type: 'scene', prompt: 'p1', imageUrl: null }
    ]);
    assert.equal(assets?.length, 1);
    const task = store.createVideoTask({
      id: 'vt-1',
      projectId: project.id,
      storyboardId: boards![0].id,
      prompt: 'p',
      modelName: 'mock',
      params: {},
      priority: 'medium'
    });
    assert.ok(task);
    store.updateVideoTask(project.id, 'vt-1', {
      status: 'done',
      progress: 100,
      resultUrl: '/mock.mp4'
    });
    const merge = store.createVideoMerge({
      id: 'm-1',
      projectId: project.id,
      title: 'merge',
      status: 'done',
      clips: [{ storyboardId: boards![0].id, videoTaskId: 'vt-1' }],
      params: {}
    });
    assert.ok(merge);

    const after = service.getProjectWorkflow(project.id);
    assert.ok(after);
    assert.equal(after?.stage.current, 'done');
    assert.equal(after?.stage.nextAction, 'optimize_result');
    assert.equal(after?.stage.progressPercent, 100);
    const listed = service.listProjectWorkflows([project.id, 'missing']);
    assert.equal(listed.length, 1);
    assert.equal(listed[0].projectId, project.id);
  } finally {
    cleanup();
  }
});
