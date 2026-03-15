import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { BIZ_CODE } from '../src/constants/bizCode.js';
import { buildAuthMiddleware } from '../src/middleware/auth.js';
import { parsePayload, parseQuery } from '../src/utils/validation.js';
import { SqliteStore } from '../src/db/sqlite.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { PipelineService } from '../src/modules/pipeline/pipeline.service.js';
import { MockAiProvider } from '../src/modules/pipeline/providers/mock.provider.js';
import { ProjectsService } from '../src/modules/projects/projects.service.js';
import { StudioService } from '../src/modules/studio/studio.service.js';

const createStoreContext = () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'human2-api-contract-test-'));
  const dataFile = path.join(tempRoot, 'app.db');
  const store = new SqliteStore(dataFile);
  return {
    store,
    cleanup: () => fs.rmSync(tempRoot, { recursive: true, force: true })
  };
};

test('contract: auth middleware should return 401 + UNAUTHORIZED', () => {
  const { store, cleanup } = createStoreContext();
  try {
    const authService = new AuthService(store, 'test-secret', '1h');
    const middleware = buildAuthMiddleware(authService);
    const req = { headers: {} } as any;
    const statusCalls: number[] = [];
    const jsonCalls: Array<Record<string, unknown>> = [];
    const res = {
      status(code: number) {
        statusCalls.push(code);
        return this;
      },
      json(body: Record<string, unknown>) {
        jsonCalls.push(body);
        return this;
      },
      locals: {}
    } as any;
    let calledNext = false;
    middleware(req, res, () => {
      calledNext = true;
    });
    assert.equal(calledNext, false);
    assert.equal(statusCalls[0], 401);
    assert.equal(jsonCalls[0].bizCode, BIZ_CODE.UNAUTHORIZED);
  } finally {
    cleanup();
  }
});

test('contract: parseQuery and parsePayload should map to INVALID_QUERY / INVALID_PAYLOAD', () => {
  const res = {} as any;
  const failCalls: Array<{ status: number; message: string; bizCode: string }> = [];
  const fail = (_res: unknown, status: number, message: string, bizCode: string) => {
    failCalls.push({ status, message, bizCode });
    return res;
  };

  const querySchema = z.object({
    page: z.coerce.number().int().min(1)
  });
  const payloadSchema = z.object({
    name: z.string().min(1)
  });

  const badQuery = parseQuery(querySchema, { page: 0 }, res, fail);
  const badPayload = parsePayload(payloadSchema, { name: '' }, res, fail);
  assert.equal(badQuery, null);
  assert.equal(badPayload, null);

  assert.equal(failCalls.length, 2);
  assert.deepEqual(failCalls[0], {
    status: 400,
    message: 'Invalid query',
    bizCode: BIZ_CODE.INVALID_QUERY
  });
  assert.deepEqual(failCalls[1], {
    status: 400,
    message: 'Invalid payload',
    bizCode: BIZ_CODE.INVALID_PAYLOAD
  });
});

test('contract: pipeline file resolvers should expose FORBIDDEN and CONFLICT reasons', async () => {
  const { store, cleanup } = createStoreContext();
  const provider = new MockAiProvider();
  const projects = new ProjectsService(store);
  const pipeline = new PipelineService(store, provider, 1, { videoMergeEngine: 'placeholder' });

  try {
    const project = projects.createProject({ name: 'Contract Project' });

    const forbiddenUpload = pipeline.resolveUploadedImage(project.id, 'bad$name');
    assert.deepEqual(forbiddenUpload, { reason: 'forbidden' });

    const merge = store.createVideoMerge({
      id: 'merge-not-ready',
      projectId: project.id,
      title: 'M',
      status: 'done',
      clips: [{ storyboardId: 'sb-1', sourceUrl: 'http://example.com/a.mp4' }],
      params: {}
    });
    assert.ok(merge);

    const notReady = pipeline.resolveVideoMergeDownload(project.id, 'merge-not-ready');
    assert.deepEqual(notReady, { reason: 'not_ready' });
  } finally {
    await pipeline.shutdown();
    cleanup();
  }
});

test('contract: task runtime snapshot should provide worker/queue observability fields', async () => {
  const { store, cleanup } = createStoreContext();
  const provider = new MockAiProvider();
  const projects = new ProjectsService(store);
  const studio = new StudioService(store, provider);
  const pipeline = new PipelineService(store, provider, 1, { videoMergeEngine: 'placeholder' });

  try {
    const project = projects.createProject({ name: 'Runtime Contract Project' });
    studio.saveNovel(project.id, { title: 'N', content: '第一段。第二段。第三段。' });
    const outlines = await studio.generateOutlines(project.id, { chapterCount: 2 });
    assert.ok(outlines && outlines.length > 0);
    const script = await studio.generateScript(project.id, { outlineId: outlines![0].id });
    assert.ok(script);
    const boards = await pipeline.generateStoryboards(project.id, script!.id);
    assert.ok(boards && boards.length > 0);
    const created = await pipeline.createAndRunVideoTask(project.id, boards![0].id);
    assert.ok(created);

    const snapshot = pipeline.getVideoTaskRuntimeSnapshot();
    assert.equal(typeof snapshot.heartbeatAt, 'string');
    assert.equal(typeof snapshot.maxConcurrent, 'number');
    assert.equal(typeof snapshot.queuedProjects, 'number');
    assert.equal(typeof snapshot.queuedTotal, 'number');
    assert.equal(Array.isArray(snapshot.projects), true);
  } finally {
    await pipeline.shutdown();
    cleanup();
  }
});
