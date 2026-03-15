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
import { OrchestrationService } from '../src/modules/orchestration/orchestration.service.js';

const createServices = () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'human2-orchestration-test-'));
  const dataFile = path.join(tempRoot, 'app.db');
  const store = new SqliteStore(dataFile);
  const provider = new MockAiProvider();
  const studio = new StudioService(store, provider);
  const pipeline = new PipelineService(store, provider, 2);

  return {
    projects: new ProjectsService(store),
    orchestration: new OrchestrationService(studio, pipeline),
    studio,
    cleanup: async () => {
      await pipeline.shutdown();
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  };
};

test('orchestration full chain should generate from saved novel', async () => {
  const { projects, orchestration, studio, cleanup } = createServices();

  try {
    const project = projects.createProject({ name: 'Orchestration Project' });
    studio.saveNovel(project.id, {
      title: 'N',
      content: '第一段。第二段。第三段。第四段。第五段。第六段。'
    });

    const result = await orchestration.runProjectFullChain(project.id, { chapterCount: 3 });
    assert.ok(result);
    assert.ok(result!.outlines.length > 0);
    assert.ok(result!.scripts.length > 0);
    assert.ok(result!.storyboards.length > 0);
    assert.ok(result!.assets.length > 0);
    assert.ok(result!.videoTasks.length > 0);
  } finally {
    await cleanup();
  }
});
