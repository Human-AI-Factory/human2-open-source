import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SqliteStore } from '../src/db/sqlite.js';
import { ProjectsService } from '../src/modules/projects/projects.service.js';
import { DramaWorkflowService } from '../src/modules/domain/drama-workflow.service.js';

const createServices = () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'human2-drama-workflow-test-'));
  const dataFile = path.join(tempRoot, 'app.db');
  const store = new SqliteStore(dataFile);
  const projects = new ProjectsService(store);
  const dramaWorkflow = new DramaWorkflowService(store);
  return {
    projects,
    dramaWorkflow,
    cleanup: () => {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    },
  };
};

test('drama workflow service should manage drama, episode workflow, undo and op logs', () => {
  const { projects, dramaWorkflow, cleanup } = createServices();
  try {
    const project = projects.createProject({ name: 'Drama Workflow Direct Service' });
    const drama = dramaWorkflow.upsertDrama(project.id, {
      name: '主线 Drama',
      description: '测试描述',
    });
    assert.ok(drama);

    const episode = dramaWorkflow.createEpisode(project.id, {
      dramaId: drama!.id,
      title: '第 1 集 开端',
      orderIndex: 1,
    });
    assert.ok(episode);

    const summary = dramaWorkflow.getProjectWorkflowSummary(project.id);
    assert.ok(summary);
    assert.equal(summary!.stage.current, 'writing');
    assert.equal(summary!.stage.nextAction, 'create_novel');

    const batch = dramaWorkflow.transitionProjectWorkflowEpisodesBatch(project.id, {
      episodeIds: [episode!.id],
      toStatus: 'in_review',
      actor: 'tester',
      comment: 'submit',
    });
    assert.ok(batch);
    assert.equal(batch!.updated.length, 1);
    assert.ok(batch!.undoEntryId);

    const workflow = dramaWorkflow.getEpisodeWorkflowState(project.id, episode!.id);
    assert.ok(workflow);
    assert.equal(workflow!.status, 'in_review');

    const undoStack = dramaWorkflow.listWorkflowTransitionUndoStack(project.id);
    assert.ok(undoStack);
    assert.equal(undoStack!.length, 1);

    const undone = dramaWorkflow.undoWorkflowTransitionBatch(project.id, {
      entryId: batch!.undoEntryId || undefined,
      actor: 'tester',
      comment: 'undo',
    });
    assert.ok(undone);
    assert.equal(undone!.restored, 1);
    assert.equal(undone!.expired, false);

    const restoredWorkflow = dramaWorkflow.getEpisodeWorkflowState(project.id, episode!.id);
    assert.ok(restoredWorkflow);
    assert.equal(restoredWorkflow!.status, 'draft');

    const opLog = dramaWorkflow.appendWorkflowOpLog(project.id, {
      action: 'sync_episode',
      estimated: '10m',
      actual: '8m',
      note: 'ok',
    });
    assert.ok(opLog);

    const opLogs = dramaWorkflow.listWorkflowOpLogs(project.id);
    assert.ok(opLogs);
    assert.equal(opLogs!.length, 1);
    assert.equal(opLogs![0].action, 'sync_episode');

    const cleared = dramaWorkflow.clearWorkflowOpLogs(project.id);
    assert.equal(cleared, 1);
    assert.equal(dramaWorkflow.listWorkflowOpLogs(project.id)?.length, 0);
  } finally {
    cleanup();
  }
});
