import { SqliteStore } from '../db/sqlite.js';
import { ProjectsService } from '../modules/projects/projects.service.js';
import { StudioService } from '../modules/studio/studio.service.js';
import { PipelineService } from '../modules/pipeline/pipeline.service.js';
import { MockAiProvider } from '../modules/pipeline/providers/mock.provider.js';

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

const main = async () => {
  const dataFile = process.env.DATA_FILE || 'data/app.db';
  const workerCount = Math.max(1, Math.min(8, Number(process.env.WORKER_COUNT || 2)));
  const requestedTaskCount = Math.max(1, Number(process.env.TASK_COUNT || 6));

  const provider = new MockAiProvider();
  const store = new SqliteStore(dataFile);
  const projects = new ProjectsService(store);
  const studio = new StudioService(store, provider);
  const apiPipeline = new PipelineService(store, provider, 2, {
    queueDriver: 'external',
    queueLoopEnabled: false,
    videoMergeEngine: 'placeholder'
  });
  const workers = Array.from({ length: workerCount }, (_, idx) =>
    new PipelineService(store, provider, 2, {
      queueDriver: 'external',
      queueLoopEnabled: true,
      queueLeaseOwnerId: `stress-worker-${idx + 1}`,
      queueLeaseTtlMs: 5000,
      videoMergeEngine: 'placeholder'
    })
  );

  const startedAt = Date.now();
  try {
    const project = projects.createProject({ name: `Queue Stress ${new Date().toISOString()}` });
    studio.saveNovel(project.id, { title: 'Stress', content: '第一段。第二段。第三段。第四段。第五段。第六段。' });
    const outlines = await studio.generateOutlines(project.id, { chapterCount: 2 });
    if (!outlines || outlines.length === 0) {
      throw new Error('Failed to generate outlines');
    }
    const script = await studio.generateScript(project.id, { outlineId: outlines[0].id });
    if (!script) {
      throw new Error('Failed to generate script');
    }
    const storyboards = await apiPipeline.generateStoryboards(project.id, script.id);
    if (!storyboards || storyboards.length === 0) {
      throw new Error('Failed to generate storyboards');
    }

    const picked = storyboards.slice(0, Math.min(requestedTaskCount, storyboards.length));
    const createdIds: string[] = [];
    for (const board of picked) {
      const task = await apiPipeline.createAndRunVideoTask(project.id, board.id, 'medium');
      if (task) {
        createdIds.push(task.id);
      }
    }

    const targetCount = createdIds.length;
    if (targetCount === 0) {
      throw new Error('No tasks created');
    }
    console.log(`[queue-stress] created ${targetCount} tasks, workers=${workerCount}, dataFile=${dataFile}`);

    while (true) {
      const tasks = apiPipeline.listVideoTasks(project.id) ?? [];
      const tracked = tasks.filter((item) => createdIds.includes(item.id));
      const done = tracked.filter((item) => item.status === 'done').length;
      const failed = tracked.filter((item) => item.status === 'failed' || item.status === 'cancelled').length;
      const running = tracked.filter((item) => item.status === 'queued' || item.status === 'submitting' || item.status === 'polling').length;
      console.log(`[queue-stress] done=${done}/${targetCount}, failed=${failed}, running=${running}`);
      if (done + failed >= targetCount) {
        break;
      }
      await sleep(350);
    }

    const finished = apiPipeline.listVideoTasks(project.id) ?? [];
    const doneCount = finished.filter((item) => createdIds.includes(item.id) && item.status === 'done').length;
    const failedCount = finished.filter((item) => createdIds.includes(item.id) && item.status !== 'done').length;
    const durationMs = Date.now() - startedAt;
    console.log(`[queue-stress] complete: done=${doneCount}, failed=${failedCount}, durationMs=${durationMs}`);
  } finally {
    await apiPipeline.shutdown();
    for (const worker of workers) {
      await worker.shutdown();
    }
  }
};

void main().catch((error) => {
  console.error('[queue-stress] failed:', error);
  process.exit(1);
});
