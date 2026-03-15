import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SqliteStore } from '../src/db/sqlite.js';
import { ProjectsService } from '../src/modules/projects/projects.service.js';
import { LibraryService } from '../src/modules/library/library.service.js';
import { StudioService } from '../src/modules/studio/studio.service.js';
import { MockAiProvider } from '../src/modules/pipeline/providers/mock.provider.js';

const createServices = () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'human2-library-test-'));
  const dataFile = path.join(tempRoot, 'app.db');
  const store = new SqliteStore(dataFile);
  const projects = new ProjectsService(store);
  const library = new LibraryService(store);
  const studio = new StudioService(store, new MockAiProvider());
  return {
    store,
    projects,
    library,
    studio,
    cleanup: () => fs.rmSync(tempRoot, { recursive: true, force: true })
  };
};

test('library service should support CRUD and import from asset', async () => {
  const { store, projects, studio, library, cleanup } = createServices();
  try {
    const created = library.createResource({
      type: 'character',
      name: 'Alice',
      prompt: 'short hair, cinematic light',
      imageUrl: 'https://example.com/alice.png',
      tags: ['hero', 'female']
    });
    assert.equal(created.type, 'character');
    assert.equal(created.tags.length, 2);

    const list = library.listResourcesPaged({ page: 1, pageSize: 20 });
    assert.ok(list.total >= 1);
    assert.equal(list.items[0].id, created.id);

    const updated = library.updateResource(created.id, { name: 'Alice v2', tags: ['hero'] });
    assert.ok(updated);
    assert.equal(updated?.name, 'Alice v2');
    assert.equal(updated?.tags.length, 1);

    const used = library.markResourceUsed(created.id);
    assert.ok(used);
    assert.equal(used?.usageCount, 1);
    assert.ok(used?.lastUsedAt);

    const project = projects.createProject({ name: 'Library Import Project' });
    studio.saveNovel(project.id, { title: 'n', content: '第一段。第二段。' });
    const outlines = await studio.generateOutlines(project.id, { chapterCount: 2 });
    assert.ok(outlines && outlines.length > 0);
    const script = await studio.generateScript(project.id, { outlineId: outlines[0].id });
    assert.ok(script);
    store.replaceStoryboards(project.id, script!.id, [{ id: 'sb-1', title: '分镜1', prompt: 'p1' }]);
    const asset = store.createAsset({
      id: 'asset-1',
      projectId: project.id,
      storyboardId: 'sb-1',
      name: 'Forest BG',
      type: 'scene',
      prompt: 'dense forest, mist',
      imageUrl: 'https://example.com/forest.png'
    });
    assert.ok(asset);
    const imported = library.importFromProjectAsset(project.id, 'asset-1', ['bg']);
    assert.ok(imported);
    assert.equal(imported?.type, 'scene');
    assert.equal(imported?.sourceAssetId, 'asset-1');

    const filtered = library.listResourcesPaged({ type: 'scene', q: 'forest', page: 1, pageSize: 20 });
    assert.ok(filtered.total >= 1);

    const deleted = library.deleteResource(created.id);
    assert.equal(deleted, true);
  } finally {
    cleanup();
  }
});

test('library service should support batch import, reverse asset create and json io', async () => {
  const { store, projects, studio, library, cleanup } = createServices();
  try {
    const project = projects.createProject({ name: 'Library Batch Project' });
    studio.saveNovel(project.id, { title: 'n', content: '第一段。第二段。' });
    const outlines = await studio.generateOutlines(project.id, { chapterCount: 2 });
    assert.ok(outlines && outlines.length > 0);
    const script = await studio.generateScript(project.id, { outlineId: outlines[0].id });
    assert.ok(script);
    store.replaceStoryboards(project.id, script!.id, [
      { id: 'sb-a', title: '分镜A', prompt: 'A' },
      { id: 'sb-b', title: '分镜B', prompt: 'B' }
    ]);
    store.createAsset({
      id: 'asset-a',
      projectId: project.id,
      storyboardId: 'sb-a',
      name: 'Hero',
      type: 'character',
      prompt: 'red cape hero',
      imageUrl: null
    });
    store.createAsset({
      id: 'asset-b',
      projectId: project.id,
      storyboardId: 'sb-b',
      name: 'City',
      type: 'scene',
      prompt: 'night city skyline',
      imageUrl: null
    });

    const batch = library.importFromProjectAssetsBatch({ projectId: project.id, limit: 10 });
    assert.equal(batch.created.length, 2);
    assert.equal(batch.skippedAssetIds.length, 0);

    const batchAgain = library.importFromProjectAssetsBatch({ projectId: project.id, limit: 10 });
    assert.equal(batchAgain.created.length, 0);
    assert.equal(batchAgain.skippedAssetIds.length, 2);

    const createdAsset = library.createProjectAssetFromResource(batch.created[0].id, {
      projectId: project.id,
      storyboardId: 'sb-a'
    });
    assert.ok(createdAsset);
    assert.equal(createdAsset?.storyboardId, 'sb-a');

    const exported = library.exportResources({ q: 'hero' });
    assert.ok(exported.length >= 1);

    const imported = library.importResourcesJson({
      strategy: 'skip_existing',
      items: [
        {
          type: 'character',
          name: 'Hero',
          prompt: 'red cape hero',
          tags: ['lead']
        },
        {
          type: 'prop',
          name: 'Magic Book',
          prompt: 'ancient glowing book',
          tags: ['item']
        }
      ]
    });
    assert.equal(imported.created.length, 1);
    assert.equal(imported.skipped, 1);

    const duplicated = library.importResourcesJson({
      strategy: 'always_create',
      items: [
        {
          type: 'character',
          name: 'Hero',
          prompt: 'red cape hero',
          tags: ['dup']
        }
      ]
    });
    assert.equal(duplicated.created.length, 1);

    const groups = library.listDuplicateGroups();
    assert.ok(groups.length >= 1);

    const dedup = library.deduplicateResources({ strategy: 'keep_latest' });
    assert.ok(dedup.groups >= 1);
    assert.ok(dedup.removed >= 1);

    const duplicated2 = library.importResourcesJson({
      strategy: 'always_create',
      items: [
        {
          type: 'scene',
          name: 'City',
          prompt: 'night city skyline'
        }
      ]
    });
    assert.equal(duplicated2.created.length, 1);
    const groups2 = library.listDuplicateGroups();
    assert.ok(groups2.length >= 1);
    const preview = library.previewDuplicateGroup({
      fingerprint: groups2[0].fingerprint,
      strategy: 'keep_latest'
    });
    assert.ok(preview);
    assert.ok((preview?.candidates.length ?? 0) >= 2);
    const resolvedByKeep = library.resolveDuplicateGroupByKeepId({
      fingerprint: groups2[0].fingerprint,
      keepId: preview!.candidates[0].id
    });
    assert.ok(resolvedByKeep);
    assert.ok((resolvedByKeep?.removed ?? 0) >= 1);

    const duplicated3 = library.importResourcesJson({
      strategy: 'always_create',
      items: [
        {
          type: 'prop',
          name: 'Magic Book',
          prompt: 'ancient glowing book'
        }
      ]
    });
    assert.equal(duplicated3.created.length, 1);
    const groups3 = library.listDuplicateGroups();
    assert.ok(groups3.length >= 1);
    const resolved = library.resolveDuplicateGroup({
      fingerprint: groups3[0].fingerprint,
      strategy: 'keep_most_used'
    });
    assert.ok(resolved);
    assert.ok((resolved?.removed ?? 0) >= 1);

    const duplicated4 = library.importResourcesJson({
      strategy: 'always_create',
      items: [
        {
          type: 'character',
          name: 'Hero',
          prompt: 'red cape hero'
        }
      ]
    });
    assert.equal(duplicated4.created.length, 1);
    const dedup2 = library.deduplicateResources({ strategy: 'keep_latest' });
    assert.ok(dedup2.removed >= 1);
    const undoStack = library.listDedupUndoStack();
    assert.ok(undoStack.length >= 1);
    assert.ok(undoStack[0].removedCount >= 1);
    const undoDetail = library.getDedupUndoEntryDetail(undoStack[0].id);
    assert.ok(undoDetail);
    assert.ok((undoDetail?.removedItems.length ?? 0) >= 1);
    const undoById = library.undoDeduplicateByEntryId(undoStack[0].id);
    assert.ok(undoById);
    assert.ok((undoById?.restored ?? 0) >= 1);
    const undo = library.undoLastDeduplicate();
    assert.ok(undo.restored >= 1);
    assert.equal(undo.expired, false);
    assert.ok(typeof undo.entryId === 'string' || undo.entryId === null);

    const duplicated5 = library.importResourcesJson({
      strategy: 'always_create',
      items: [
        {
          type: 'scene',
          name: 'City',
          prompt: 'night city skyline'
        }
      ]
    });
    assert.equal(duplicated5.created.length, 1);
    const dedup3 = library.deduplicateResources({ strategy: 'keep_latest' });
    assert.ok(dedup3.removed >= 1);
    const stack2 = library.listDedupUndoStack();
    assert.ok(stack2.length >= 1);
    const deletedUndoEntry = library.deleteDedupUndoEntry(stack2[0].id);
    assert.equal(deletedUndoEntry, true);

    const duplicated6 = library.importResourcesJson({
      strategy: 'always_create',
      items: [
        {
          type: 'prop',
          name: 'Magic Book',
          prompt: 'ancient glowing book'
        }
      ]
    });
    assert.equal(duplicated6.created.length, 1);
    const dedup4 = library.deduplicateResources({ strategy: 'keep_latest' });
    assert.ok(dedup4.removed >= 1);
    const cleared = library.clearDedupUndoStack();
    assert.ok(cleared >= 1);
  } finally {
    cleanup();
  }
});
