import { Response, Router } from 'express';
import { z } from 'zod';
import { BIZ_CODE } from '../../constants/bizCode.js';
import { parsePayload, parseQuery } from '../../utils/validation.js';
import { LibraryService } from './library.service.js';

const listQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  type: z.enum(['character', 'scene', 'prop']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20)
});

const createSchema = z.object({
  type: z.enum(['character', 'scene', 'prop']),
  name: z.string().trim().min(1).max(120),
  prompt: z.string().trim().min(1).max(5000),
  imageUrl: z.string().url().nullable().optional(),
  tags: z.array(z.string().trim().max(40)).max(12).optional()
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  prompt: z.string().trim().min(1).max(5000).optional(),
  imageUrl: z.string().url().nullable().optional(),
  tags: z.array(z.string().trim().max(40)).max(12).optional()
});

const importFromAssetSchema = z.object({
  projectId: z.string().min(1),
  assetId: z.string().min(1),
  tags: z.array(z.string().trim().max(40)).max(12).optional()
});

const importFromProjectAssetsSchema = z.object({
  projectId: z.string().min(1),
  storyboardId: z.string().min(1).optional(),
  type: z.enum(['character', 'scene', 'prop']).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  tags: z.array(z.string().trim().max(40)).max(12).optional()
});

const createAssetFromResourceSchema = z.object({
  projectId: z.string().min(1),
  storyboardId: z.string().min(1),
  name: z.string().trim().min(1).max(120).optional(),
  prompt: z.string().trim().min(1).max(5000).optional(),
  imageUrl: z.string().url().nullable().optional()
});
const createAssetsByEpisodeFromResourceSchema = z.object({
  projectId: z.string().min(1),
  episodeId: z.string().min(1),
  mode: z.enum(['missing_only', 'all']).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  prompt: z.string().trim().min(1).max(5000).optional(),
  imageUrl: z.string().url().nullable().optional()
});
const previewCreateAssetsByEpisodeFromResourceSchema = z.object({
  projectId: z.string().min(1),
  episodeId: z.string().min(1),
  mode: z.enum(['missing_only', 'all']).optional(),
  name: z.string().trim().min(1).max(120).optional()
});
const applyAuditQuerySchema = z.object({
  projectId: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(500).optional()
});

const importResourcesJsonSchema = z.object({
  items: z
    .array(
      z.object({
        type: z.enum(['character', 'scene', 'prop']),
        name: z.string().trim().min(1).max(120),
        prompt: z.string().trim().min(1).max(5000),
        imageUrl: z.string().url().nullable().optional(),
        tags: z.array(z.string().trim().max(40)).max(12).optional()
      })
    )
    .max(5000),
  strategy: z.enum(['skip_existing', 'always_create']).optional()
});

const deduplicateResourcesSchema = z.object({
  strategy: z.enum(['keep_latest', 'keep_most_used']).optional()
});

const resolveDuplicateGroupSchema = z.object({
  fingerprint: z.string().trim().min(1).max(12000),
  strategy: z.enum(['keep_latest', 'keep_most_used']).optional()
});

const resolveDuplicateGroupByKeepIdSchema = z.object({
  fingerprint: z.string().trim().min(1).max(12000),
  keepId: z.string().trim().min(1).max(200)
});

const deduplicateUndoByIdSchema = z.object({
  entryId: z.string().trim().min(1).max(200)
});

const conflictGroupsQuerySchema = z.object({
  kind: z.enum(['fingerprint', 'source', 'name']).optional(),
  type: z.enum(['character', 'scene', 'prop']).optional(),
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20)
});

const conflictGroupPreviewSchema = z.object({
  conflictKind: z.enum(['fingerprint', 'source', 'name']),
  conflictKey: z.string().trim().min(1).max(12000),
  strategy: z.enum(['keep_latest', 'keep_most_used']).optional()
});

const conflictGroupResolveSchema = z.object({
  conflictKind: z.enum(['fingerprint', 'source', 'name']),
  conflictKey: z.string().trim().min(1).max(12000),
  strategy: z.enum(['keep_latest', 'keep_most_used', 'manual_keep']).optional(),
  keepId: z.string().trim().min(1).max(200).optional()
});

const mergeAuditsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  strategy: z.enum(['keep_latest', 'keep_most_used', 'manual_keep']).optional(),
  conflictKind: z.enum(['fingerprint', 'source', 'name']).optional(),
  startAt: z.string().trim().max(64).optional(),
  endAt: z.string().trim().max(64).optional(),
  keepId: z.string().trim().max(200).optional(),
  removedId: z.string().trim().max(200).optional(),
  q: z.string().trim().max(200).optional()
});

export const buildLibraryRouter = (service: LibraryService): Router => {
  const router = Router();
  const fail = (res: Response, status: number, message: string, bizCode: string) =>
    res.status(status).json({ message, bizCode });

  router.get('/resources', (req, res) => {
    const query = parseQuery(listQuerySchema, req.query, res, fail);
    if (!query) {
      return;
    }
    return res.json(service.listResourcesPaged(query));
  });

  router.post('/resources', (req, res) => {
    const payload = parsePayload(createSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    return res.status(201).json(service.createResource(payload));
  });

  router.patch('/resources/:resourceId', (req, res) => {
    const payload = parsePayload(updateSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    const item = service.updateResource(req.params.resourceId, payload);
    if (!item) {
      return fail(res, 404, 'Resource not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(item);
  });

  router.delete('/resources/:resourceId', (req, res) => {
    const ok = service.deleteResource(req.params.resourceId);
    if (!ok) {
      return fail(res, 404, 'Resource not found', BIZ_CODE.NOT_FOUND);
    }
    return res.status(204).send();
  });

  router.post('/resources/:resourceId/use', (req, res) => {
    const item = service.markResourceUsed(req.params.resourceId);
    if (!item) {
      return fail(res, 404, 'Resource not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(item);
  });

  router.post('/resources/import-from-asset', (req, res) => {
    const payload = parsePayload(importFromAssetSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    const item = service.importFromProjectAsset(payload.projectId, payload.assetId, payload.tags);
    if (!item) {
      return fail(res, 404, 'Project asset not found', BIZ_CODE.NOT_FOUND);
    }
    return res.status(201).json(item);
  });

  router.post('/resources/import-from-project-assets', (req, res) => {
    const payload = parsePayload(importFromProjectAssetsSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    const result = service.importFromProjectAssetsBatch(payload);
    return res.status(201).json(result);
  });

  router.post('/resources/:resourceId/create-asset', (req, res) => {
    const payload = parsePayload(createAssetFromResourceSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    const created = service.createProjectAssetFromResource(req.params.resourceId, payload);
    if (!created) {
      return fail(res, 404, 'Resource or target storyboard not found', BIZ_CODE.NOT_FOUND);
    }
    return res.status(201).json(created);
  });

  router.post('/resources/:resourceId/create-assets-by-episode', (req, res) => {
    const payload = parsePayload(createAssetsByEpisodeFromResourceSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    const result = service.createProjectAssetsByEpisodeFromResource(req.params.resourceId, payload);
    if (!result) {
      return fail(res, 404, 'Resource or target episode not found', BIZ_CODE.NOT_FOUND);
    }
    return res.status(201).json(result);
  });

  router.post('/resources/:resourceId/create-assets-by-episode/preview', (req, res) => {
    const payload = parsePayload(previewCreateAssetsByEpisodeFromResourceSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    const result = service.previewCreateProjectAssetsByEpisodeFromResource(req.params.resourceId, payload);
    if (!result) {
      return fail(res, 404, 'Resource or target episode not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(result);
  });

  router.get('/resources/apply-audits', (req, res) => {
    const query = parseQuery(applyAuditQuerySchema, req.query ?? {}, res, fail);
    if (!query) {
      return;
    }
    const items = service.listApplyAudits(query.projectId, query.limit);
    if (!items) {
      return fail(res, 404, 'Project not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(items);
  });

  router.get('/resources/export-json', (req, res) => {
    const query = parseQuery(listQuerySchema, req.query, res, fail);
    if (!query) {
      return;
    }
    const items = service.exportResources({
      q: query.q,
      type: query.type
    });
    return res.json({
      exportedAt: new Date().toISOString(),
      count: items.length,
      items
    });
  });

  router.post('/resources/import-json', (req, res) => {
    const payload = parsePayload(importResourcesJsonSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    const result = service.importResourcesJson(payload);
    return res.status(201).json(result);
  });

  router.get('/resources/duplicates', (_req, res) => res.json(service.listDuplicateGroups()));

  router.post('/resources/deduplicate', (req, res) => {
    const payload = parsePayload(deduplicateResourcesSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    return res.json(service.deduplicateResources(payload));
  });

  router.post('/resources/duplicates/resolve', (req, res) => {
    const payload = parsePayload(resolveDuplicateGroupSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    const result = service.resolveDuplicateGroup(payload);
    if (!result) {
      return fail(res, 404, 'Duplicate group not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(result);
  });

  router.get('/resources/duplicates/preview', (req, res) => {
    const query = parseQuery(resolveDuplicateGroupSchema, req.query, res, fail);
    if (!query) {
      return;
    }
    const result = service.previewDuplicateGroup(query);
    if (!result) {
      return fail(res, 404, 'Duplicate group not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(result);
  });

  router.get('/resources/conflicts', (req, res) => {
    const query = parseQuery(conflictGroupsQuerySchema, req.query ?? {}, res, fail);
    if (!query) {
      return;
    }
    return res.json(service.listConflictGroups(query));
  });

  router.get('/resources/conflicts/preview', (req, res) => {
    const query = parseQuery(conflictGroupPreviewSchema, req.query ?? {}, res, fail);
    if (!query) {
      return;
    }
    const result = service.previewConflictGroup(query);
    if (!result) {
      return fail(res, 404, 'Conflict group not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(result);
  });

  router.post('/resources/conflicts/resolve', (req, res) => {
    const payload = parsePayload(conflictGroupResolveSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    const result = service.resolveConflictGroup(payload);
    if (!result) {
      return fail(res, 404, 'Conflict group not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(result);
  });

  router.get('/resources/merge-audits', (req, res) => {
    const query = parseQuery(mergeAuditsQuerySchema, req.query ?? {}, res, fail);
    if (!query) {
      return;
    }
    return res.json(service.listMergeAudits(query));
  });

  router.get('/resources/merge-audits/export.csv', (req, res) => {
    const query = parseQuery(mergeAuditsQuerySchema, req.query ?? {}, res, fail);
    if (!query) {
      return;
    }
    const csv = service.exportMergeAuditsCsv(query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="resource-library-merge-audits.csv"');
    return res.send(csv);
  });

  router.post('/resources/duplicates/resolve-by-keep', (req, res) => {
    const payload = parsePayload(resolveDuplicateGroupByKeepIdSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    const result = service.resolveDuplicateGroupByKeepId(payload);
    if (!result) {
      return fail(res, 404, 'Duplicate group not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(result);
  });

  router.get('/resources/deduplicate/undo-stack', (_req, res) => res.json(service.listDedupUndoStack()));

  router.get('/resources/deduplicate/undo-stack/:entryId', (req, res) => {
    const result = service.getDedupUndoEntryDetail(req.params.entryId);
    if (!result) {
      return fail(res, 404, 'Undo entry not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(result);
  });

  router.delete('/resources/deduplicate/undo-stack/:entryId', (req, res) => {
    const ok = service.deleteDedupUndoEntry(req.params.entryId);
    if (!ok) {
      return fail(res, 404, 'Undo entry not found', BIZ_CODE.NOT_FOUND);
    }
    return res.status(204).send();
  });

  router.delete('/resources/deduplicate/undo-stack', (_req, res) => {
    const cleared = service.clearDedupUndoStack();
    return res.json({ cleared });
  });

  router.post('/resources/deduplicate/undo-by-id', (req, res) => {
    const payload = parsePayload(deduplicateUndoByIdSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    const result = service.undoDeduplicateByEntryId(payload.entryId);
    if (!result) {
      return fail(res, 404, 'Undo entry not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(result);
  });

  router.post('/resources/deduplicate/undo', (_req, res) => res.json(service.undoLastDeduplicate()));

  return router;
};
