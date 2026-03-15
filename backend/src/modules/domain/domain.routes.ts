import { Response, Router } from 'express';
import { z } from 'zod';
import { BIZ_CODE } from '../../constants/bizCode.js';
import { parsePayload, parseQuery } from '../../utils/validation.js';
import { DomainService } from './domain.service.js';

const dramaUpsertSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional()
});

const episodeCreateSchema = z.object({
  dramaId: z.string().min(1),
  title: z.string().min(1).max(200),
  orderIndex: z.coerce.number().int().min(1).max(10000).optional()
});
const episodeCreateByDramaSchema = z.object({
  title: z.string().min(1).max(200),
  orderIndex: z.coerce.number().int().min(1).max(10000).optional()
});

const episodeUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  orderIndex: z.coerce.number().int().min(1).max(10000).optional(),
  status: z.enum(['draft', 'ready', 'published']).optional()
});

const storyboardEpisodeSchema = z.object({
  episodeId: z.string().min(1).nullable()
});
const episodeAssetRelationsReplaceSchema = z.object({
  sceneAssetIds: z.array(z.string().min(1)).max(50).optional(),
  characterAssetIds: z.array(z.string().min(1)).max(200).optional(),
  propAssetIds: z.array(z.string().min(1)).max(200).optional()
});
const episodeWorkflowTransitionSchema = z.object({
  toStatus: z.enum(['draft', 'in_review', 'approved', 'rejected']),
  actor: z.string().min(1).max(120).optional(),
  comment: z.string().max(2000).optional()
});
const episodeWorkflowAuditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional()
});
const workflowEpisodesQuerySchema = z.object({
  status: z.enum(['draft', 'in_review', 'approved', 'rejected']).optional(),
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20)
});
const workflowTransitionBatchSchema = z.object({
  episodeIds: z.array(z.string().min(1)).min(1).max(500),
  toStatus: z.enum(['draft', 'in_review', 'approved', 'rejected']),
  actor: z.string().min(1).max(120).optional(),
  comment: z.string().max(2000).optional()
});
const workflowOverrideBatchSchema = z.object({
  episodeIds: z.array(z.string().min(1)).min(1).max(500),
  toStatus: z.enum(['draft', 'in_review', 'approved', 'rejected']),
  actor: z.string().min(1).max(120).optional(),
  comment: z.string().max(2000).optional()
});
const workflowTransitionBatchUndoSchema = z.object({
  entryId: z.string().min(1).optional(),
  actor: z.string().min(1).max(120).optional(),
  comment: z.string().max(2000).optional()
});
const workflowAuditsQuerySchema = z.object({
  episodeId: z.string().min(1).optional(),
  actor: z.string().trim().max(120).optional(),
  toStatus: z.enum(['draft', 'in_review', 'approved', 'rejected']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20)
});
const workflowOpLogCreateSchema = z.object({
  action: z.string().trim().min(1).max(120),
  estimated: z.string().trim().min(1).max(2000),
  actual: z.string().trim().min(1).max(2000),
  note: z.string().trim().max(2000).optional(),
  time: z.string().trim().max(120).optional()
});
const entitiesQuerySchema = z.object({
  type: z.enum(['character', 'scene', 'prop']).optional(),
  episodeId: z.string().min(1).optional()
});
const domainEntitiesQuerySchema = z.object({
  type: z.enum(['character', 'scene', 'prop']).optional(),
  includeDeleted: z.coerce.boolean().optional()
});
const domainEntityConflictsQuerySchema = z.object({
  type: z.enum(['character', 'scene', 'prop']).optional()
});
const createEntitySchema = z.object({
  storyboardId: z.string().min(1).optional(),
  episodeId: z.string().min(1).optional(),
  type: z.enum(['character', 'scene', 'prop']),
  name: z.string().min(1).max(120),
  prompt: z.string().min(1).max(5000),
  imageUrl: z.string().url().nullable().optional(),
  voiceProfile: z
    .object({
      voice: z.string().min(1).max(120),
      speed: z.coerce.number().min(0.25).max(4).optional(),
      providerOptions: z.record(z.unknown()).optional(),
      provider: z.string().optional()
    })
    .nullable()
    .optional()
});
const createDomainEntitySchema = z.object({
  type: z.enum(['character', 'scene', 'prop']),
  name: z.string().min(1).max(120),
  prompt: z.string().min(1).max(5000),
  imageUrl: z.string().url().nullable().optional()
});
const updateEntitySchema = z.object({
  type: z.enum(['character', 'scene', 'prop']).optional(),
  name: z.string().min(1).max(120).optional(),
  prompt: z.string().min(1).max(5000).optional(),
  imageUrl: z.string().url().nullable().optional(),
  voiceProfile: z
    .object({
      voice: z.string().min(1).max(120),
      speed: z.coerce.number().min(0.25).max(4).optional(),
      providerOptions: z.record(z.unknown()).optional(),
      provider: z.string().optional()
    })
    .nullable()
    .optional()
});
const updateDomainEntitySchema = updateEntitySchema;
const restoreDomainEntitySchema = z.object({
  actor: z.string().trim().min(1).max(120).optional()
});
const mergeDomainEntitySchema = z.object({
  targetEntityId: z.string().min(1),
  actor: z.string().trim().min(1).max(120).optional(),
  note: z.string().trim().max(2000).optional()
});
const domainEntityLifecycleCheckQuerySchema = z.object({
  toStatus: z.enum(['draft', 'in_review', 'approved', 'archived'])
});
const domainEntityLifecycleTransitionSchema = z.object({
  toStatus: z.enum(['draft', 'in_review', 'approved', 'archived']),
  actor: z.string().trim().min(1).max(120).optional(),
  note: z.string().trim().max(2000).optional()
});
const domainEntityLifecycleRecommendQuerySchema = z.object({
  entityIds: z.string().trim().min(1)
});
const domainEntityLifecycleBatchTransitionSchema = z
  .object({
    entityIds: z.array(z.string().min(1)).min(1).max(1000),
    toStatus: z.enum(['draft', 'in_review', 'approved', 'archived']).optional(),
    toStatusByType: z
      .object({
        character: z.enum(['draft', 'in_review', 'approved', 'archived']).optional(),
        scene: z.enum(['draft', 'in_review', 'approved', 'archived']).optional(),
        prop: z.enum(['draft', 'in_review', 'approved', 'archived']).optional()
      })
      .optional(),
    autoRecommend: z.boolean().optional(),
    actor: z.string().trim().min(1).max(120).optional(),
    note: z.string().trim().max(2000).optional()
  })
  .superRefine((value, ctx) => {
    if (!value.autoRecommend && !value.toStatus && !value.toStatusByType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'toStatus or toStatusByType is required when autoRecommend is false'
      });
      return;
    }
    if (value.toStatusByType && !value.toStatusByType.character && !value.toStatusByType.scene && !value.toStatusByType.prop) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'toStatusByType must include at least one type status'
      });
    }
  });
const episodeDomainEntityRelationsReplaceSchema = z.object({
  sceneEntityIds: z.array(z.string().min(1)).max(50).optional(),
  characterEntityIds: z.array(z.string().min(1)).max(200).optional(),
  propEntityIds: z.array(z.string().min(1)).max(200).optional()
});
const storyboardDomainEntityRelationsReplaceSchema = z.object({
  sceneEntityId: z.string().min(1).nullable().optional(),
  characterEntityIds: z.array(z.string().min(1)).max(200).optional(),
  propEntityIds: z.array(z.string().min(1)).max(200).optional()
});
const entityWorkbenchQuerySchema = z.object({
  type: z.enum(['character', 'scene', 'prop']).optional(),
  q: z.string().trim().max(200).optional(),
  episodeId: z.string().min(1).optional()
});
const applyEntityToEpisodeSchema = z.object({
  episodeId: z.string().min(1),
  mode: z.enum(['missing_only', 'all']).optional(),
  overrideName: z.string().min(1).max(120).optional(),
  overridePrompt: z.string().min(1).max(5000).optional(),
  overrideImageUrl: z.string().url().nullable().optional()
});
const canonicalEntityWorkbenchQuerySchema = z.object({
  type: z.enum(['character', 'scene', 'prop']).optional(),
  q: z.string().trim().max(200).optional(),
  episodeId: z.string().min(1).optional()
});
const domainEntityApplyPreviewSchema = z.object({
  episodeId: z.string().min(1),
  mode: z.enum(['missing_only', 'all']).optional(),
  conflictStrategy: z.enum(['skip', 'overwrite_prompt', 'overwrite_all', 'rename']).optional(),
  priority: z.enum(['entity_first', 'existing_first']).optional(),
  renameSuffix: z.string().trim().max(80).optional()
});
const domainEntityApplySchema = domainEntityApplyPreviewSchema.extend({
  actor: z.string().trim().min(1).max(120).optional(),
  note: z.string().trim().max(2000).optional()
});
const domainApplyPolicyRuleSchema = z.object({
  conflictStrategy: z.enum(['skip', 'overwrite_prompt', 'overwrite_all', 'rename']).optional(),
  priority: z.enum(['entity_first', 'existing_first']).optional(),
  renameSuffix: z.string().trim().max(80).optional()
});
const domainApplyPolicyUpdateSchema = z.object({
  defaultMode: z.enum(['missing_only', 'all']).optional(),
  byType: z
    .object({
      character: domainApplyPolicyRuleSchema.optional(),
      scene: domainApplyPolicyRuleSchema.optional(),
      prop: domainApplyPolicyRuleSchema.optional()
    })
    .optional(),
  byStatus: z
    .object({
      draft: z.union([
        domainApplyPolicyRuleSchema,
        z.object({
          character: domainApplyPolicyRuleSchema.optional(),
          scene: domainApplyPolicyRuleSchema.optional(),
          prop: domainApplyPolicyRuleSchema.optional()
        })
      ]).optional(),
      in_review: z.union([
        domainApplyPolicyRuleSchema,
        z.object({
          character: domainApplyPolicyRuleSchema.optional(),
          scene: domainApplyPolicyRuleSchema.optional(),
          prop: domainApplyPolicyRuleSchema.optional()
        })
      ]).optional(),
      approved: z.union([
        domainApplyPolicyRuleSchema,
        z.object({
          character: domainApplyPolicyRuleSchema.optional(),
          scene: domainApplyPolicyRuleSchema.optional(),
          prop: domainApplyPolicyRuleSchema.optional()
        })
      ]).optional(),
      rejected: z.union([
        domainApplyPolicyRuleSchema,
        z.object({
          character: domainApplyPolicyRuleSchema.optional(),
          scene: domainApplyPolicyRuleSchema.optional(),
          prop: domainApplyPolicyRuleSchema.optional()
        })
      ]).optional()
    })
    .optional(),
  actor: z.string().trim().min(1).max(120).optional()
});
const domainEntityAuditQuerySchema = z.object({
  actor: z.string().trim().max(120).optional(),
  action: z.string().trim().max(160).optional(),
  targetType: z.enum(['domain_entity', 'episode_relation', 'storyboard_relation', 'apply']).optional(),
  startAt: z.string().trim().max(64).optional(),
  endAt: z.string().trim().max(64).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50)
});

export const buildDomainRouter = (service: DomainService): Router => {
  const router = Router();
  const fail = (res: Response, status: number, message: string, bizCode: string) =>
    res.status(status).json({ message, bizCode });
  const parsePayloadOrFail = <S extends z.ZodTypeAny>(schema: S, input: unknown, res: Response) => {
    const data = parsePayload(schema, input, res, fail);
    if (!data) {
      return null;
    }
    return { data };
  };
  const parseQueryOrFail = <S extends z.ZodTypeAny>(schema: S, input: unknown, res: Response) => {
    const data = parseQuery(schema, input, res, fail);
    if (!data) {
      return null;
    }
    return { data };
  };
  const resolveProjectIdByDrama = (res: Response, dramaId: string): string | null => {
    const drama = service.getDramaById(dramaId);
    if (!drama) {
      fail(res, 404, 'Drama not found', BIZ_CODE.NOT_FOUND);
      return null;
    }
    return drama.projectId;
  };

  router.get('/dramas', (_req, res) => {
    const items = service.listDramas();
    return res.json(items);
  });

  router.get('/dramas/:dramaId', (req, res) => {
    const item = service.getDramaById(req.params.dramaId);
    if (!item) {
      return fail(res, 404, 'Drama not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(item);
  });

  router.patch('/dramas/:dramaId/style', (req, res) => {
    const parsed = parsePayloadOrFail(z.object({ style: z.string() }), req.body ?? {}, res);
    if (!parsed) {
      return;
    }
    const item = service.updateDramaStyle(req.params.dramaId, parsed.data.style);
    if (!item) {
      return fail(res, 404, 'Drama not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(item);
  });

  router.get('/dramas/:dramaId/episodes', (req, res) => {
    const items = service.listEpisodesByDrama(req.params.dramaId);
    if (!items) {
      return fail(res, 404, 'Drama not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(items);
  });

  router.post('/dramas/:dramaId/episodes', (req, res) => {
    const parsed = parsePayloadOrFail(episodeCreateByDramaSchema, req.body ?? {}, res);
    if (!parsed) {
      return;
    }
    const item = service.createEpisodeByDrama(req.params.dramaId, parsed.data);
    if (!item) {
      return fail(res, 404, 'Drama not found', BIZ_CODE.NOT_FOUND);
    }
    return res.status(201).json(item);
  });

  router.post('/dramas/:dramaId/episodes/import-from-scripts', (_req, res) => {
    const result = service.importEpisodesFromScriptsByDrama(_req.params.dramaId);
    if (!result) {
      return fail(res, 404, 'Drama not found', BIZ_CODE.NOT_FOUND);
    }
    return res.status(201).json(result);
  });

  router.patch('/dramas/:dramaId/episodes/:episodeId', (req, res) => {
    const parsed = parsePayloadOrFail(episodeUpdateSchema, req.body ?? {}, res);
    if (!parsed) {
      return;
    }
    const item = service.updateEpisodeByDrama(req.params.dramaId, req.params.episodeId, parsed.data);
    if (!item) {
      return fail(res, 404, 'Drama or episode not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(item);
  });

  router.get('/dramas/:dramaId/workflow/episodes', (req, res) => {
    const parsed = parseQueryOrFail(workflowEpisodesQuerySchema, req.query ?? {}, res);
    if (!parsed) {
      return;
    }
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    const page = service.listProjectWorkflowEpisodes(projectId, parsed.data);
    if (!page) {
      return fail(res, 404, 'Project not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(page);
  });

  router.get('/dramas/:dramaId/workflow/summary', (req, res) => {
    const item = service.getDramaWorkflowSummary(req.params.dramaId);
    if (!item) {
      return fail(res, 404, 'Drama not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(item);
  });

  router.get('/dramas/:dramaId/production-chain', (req, res) => {
    const item = service.getDramaProductionChain(req.params.dramaId);
    if (!item) {
      return fail(res, 404, 'Drama not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(item);
  });

  router.post('/dramas/:dramaId/workflow/episodes/transition-batch', (req, res) => {
    const parsed = parsePayloadOrFail(workflowTransitionBatchSchema, req.body ?? {}, res);
    if (!parsed) {
      return;
    }
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    const result = service.transitionProjectWorkflowEpisodesBatch(projectId, {
      episodeIds: [...new Set(parsed.data.episodeIds)],
      toStatus: parsed.data.toStatus,
      actor: parsed.data.actor?.trim() || 'operator',
      comment: parsed.data.comment
    });
    if (!result) {
      return fail(res, 404, 'Project not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(result);
  });

  router.post('/dramas/:dramaId/workflow/episodes/override-batch', (req, res) => {
    const parsed = parsePayloadOrFail(workflowOverrideBatchSchema, req.body ?? {}, res);
    if (!parsed) {
      return;
    }
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    const result = service.overrideProjectWorkflowEpisodesBatch(projectId, {
      episodeIds: [...new Set(parsed.data.episodeIds)],
      toStatus: parsed.data.toStatus,
      actor: parsed.data.actor?.trim() || 'operator',
      comment: parsed.data.comment
    });
    if (!result) {
      return fail(res, 404, 'Project not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(result);
  });

  router.get('/dramas/:dramaId/workflow/episodes/transition-batch/undo-stack', (req, res) => {
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    const items = service.listWorkflowTransitionUndoStack(projectId);
    if (!items) {
      return fail(res, 404, 'Project not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(items);
  });

  router.post('/dramas/:dramaId/workflow/episodes/transition-batch/undo', (req, res) => {
    const parsed = parsePayloadOrFail(workflowTransitionBatchUndoSchema, req.body ?? {}, res);
    if (!parsed) {
      return;
    }
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    const result = service.undoWorkflowTransitionBatch(projectId, {
      entryId: parsed.data.entryId,
      actor: parsed.data.actor?.trim() || 'operator',
      comment: parsed.data.comment
    });
    if (!result) {
      return fail(res, 404, 'Undo entry not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(result);
  });

  router.get('/dramas/:dramaId/workflow/audits', (req, res) => {
    const parsed = parseQueryOrFail(workflowAuditsQuerySchema, req.query ?? {}, res);
    if (!parsed) {
      return;
    }
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    const page = service.listProjectWorkflowAudits(projectId, parsed.data);
    if (!page) {
      return fail(res, 404, 'Project not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(page);
  });

  router.get('/dramas/:dramaId/workflow/op-logs', (req, res) => {
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    const items = service.listWorkflowOpLogs(projectId);
    if (!items) {
      return fail(res, 404, 'Project not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(items);
  });

  router.post('/dramas/:dramaId/workflow/op-logs', (req, res) => {
    const parsed = parsePayloadOrFail(workflowOpLogCreateSchema, req.body ?? {}, res);
    if (!parsed) {
      return;
    }
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    const item = service.appendWorkflowOpLog(projectId, parsed.data);
    if (!item) {
      return fail(res, 404, 'Project not found', BIZ_CODE.NOT_FOUND);
    }
    return res.status(201).json(item);
  });

  router.delete('/dramas/:dramaId/workflow/op-logs', (req, res) => {
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    const cleared = service.clearWorkflowOpLogs(projectId);
    if (cleared === null) {
      return fail(res, 404, 'Project not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json({ cleared });
  });

  router.get('/projects/:projectId/drama', (req, res) => {
    const item = service.getDrama(req.params.projectId);
    if (!item) {
      return fail(res, 404, 'Drama not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(item);
  });

  router.get('/projects/:projectId/model', (req, res) => {
    const item = service.getDomainModel(req.params.projectId);
    if (!item) {
      return fail(res, 404, 'Project not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(item);
  });

  router.get('/projects/:projectId/workflow/episodes', (req, res) => {
    const parsed = parseQueryOrFail(workflowEpisodesQuerySchema, req.query ?? {}, res);
    if (!parsed) {
      return;
    }
    const page = service.listProjectWorkflowEpisodes(req.params.projectId, parsed.data);
    if (!page) {
      return fail(res, 404, 'Project not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(page);
  });

  router.post('/projects/:projectId/workflow/episodes/transition-batch', (req, res) => {
    const parsed = parsePayloadOrFail(workflowTransitionBatchSchema, req.body ?? {}, res);
    if (!parsed) {
      return;
    }
    const result = service.transitionProjectWorkflowEpisodesBatch(req.params.projectId, {
      episodeIds: [...new Set(parsed.data.episodeIds)],
      toStatus: parsed.data.toStatus,
      actor: parsed.data.actor?.trim() || 'operator',
      comment: parsed.data.comment
    });
    if (!result) {
      return fail(res, 404, 'Project not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(result);
  });

  router.post('/projects/:projectId/workflow/episodes/override-batch', (req, res) => {
    const parsed = parsePayloadOrFail(workflowOverrideBatchSchema, req.body ?? {}, res);
    if (!parsed) {
      return;
    }
    const result = service.overrideProjectWorkflowEpisodesBatch(req.params.projectId, {
      episodeIds: [...new Set(parsed.data.episodeIds)],
      toStatus: parsed.data.toStatus,
      actor: parsed.data.actor?.trim() || 'operator',
      comment: parsed.data.comment
    });
    if (!result) {
      return fail(res, 404, 'Project not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(result);
  });

  router.get('/projects/:projectId/workflow/episodes/transition-batch/undo-stack', (req, res) => {
    const items = service.listWorkflowTransitionUndoStack(req.params.projectId);
    if (!items) {
      return fail(res, 404, 'Project not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(items);
  });

  router.post('/projects/:projectId/workflow/episodes/transition-batch/undo', (req, res) => {
    const parsed = parsePayloadOrFail(workflowTransitionBatchUndoSchema, req.body ?? {}, res);
    if (!parsed) {
      return;
    }
    const result = service.undoWorkflowTransitionBatch(req.params.projectId, {
      entryId: parsed.data.entryId,
      actor: parsed.data.actor?.trim() || 'operator',
      comment: parsed.data.comment
    });
    if (!result) {
      return fail(res, 404, 'Undo entry not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(result);
  });

  router.get('/projects/:projectId/workflow/audits', (req, res) => {
    const parsed = parseQueryOrFail(workflowAuditsQuerySchema, req.query ?? {}, res);
    if (!parsed) {
      return;
    }
    const page = service.listProjectWorkflowAudits(req.params.projectId, parsed.data);
    if (!page) {
      return fail(res, 404, 'Project not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(page);
  });

  router.get('/projects/:projectId/workflow/op-logs', (req, res) => {
    const items = service.listWorkflowOpLogs(req.params.projectId);
    if (!items) {
      return fail(res, 404, 'Project not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(items);
  });

  router.post('/projects/:projectId/workflow/op-logs', (req, res) => {
    const parsed = parsePayloadOrFail(workflowOpLogCreateSchema, req.body ?? {}, res);
    if (!parsed) {
      return;
    }
    const item = service.appendWorkflowOpLog(req.params.projectId, parsed.data);
    if (!item) {
      return fail(res, 404, 'Project not found', BIZ_CODE.NOT_FOUND);
    }
    return res.status(201).json(item);
  });

  router.delete('/projects/:projectId/workflow/op-logs', (req, res) => {
    const cleared = service.clearWorkflowOpLogs(req.params.projectId);
    if (cleared === null) {
      return fail(res, 404, 'Project not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json({ cleared });
  });

  router.put('/projects/:projectId/drama', (req, res) => {
    const parsed = parsePayloadOrFail(dramaUpsertSchema, req.body ?? {}, res);
    if (!parsed) {
      return;
    }
    const item = service.upsertDrama(req.params.projectId, parsed.data);
    if (!item) {
      return fail(res, 404, 'Project not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(item);
  });

  router.get('/projects/:projectId/episodes', (req, res) => {
    const items = service.listEpisodes(req.params.projectId);
    if (!items) {
      return fail(res, 404, 'Project not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(items);
  });

  router.post('/projects/:projectId/episodes', (req, res) => {
    const parsed = parsePayloadOrFail(episodeCreateSchema, req.body ?? {}, res);
    if (!parsed) {
      return;
    }
    const item = service.createEpisode(req.params.projectId, parsed.data);
    if (!item) {
      return fail(res, 404, 'Drama not found', BIZ_CODE.NOT_FOUND);
    }
    return res.status(201).json(item);
  });

  router.patch('/projects/:projectId/episodes/:episodeId', (req, res) => {
    const parsed = parsePayloadOrFail(episodeUpdateSchema, req.body ?? {}, res);
    if (!parsed) {
      return;
    }
    const item = service.updateEpisode(req.params.projectId, req.params.episodeId, parsed.data);
    if (!item) {
      return fail(res, 404, 'Episode not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(item);
  });

  router.delete('/projects/:projectId/episodes/:episodeId', (req, res) => {
    const ok = service.deleteEpisode(req.params.projectId, req.params.episodeId);
    if (!ok) {
      return fail(res, 404, 'Episode not found', BIZ_CODE.NOT_FOUND);
    }
    return res.status(204).send();
  });

  router.put('/projects/:projectId/storyboards/:storyboardId/episode', (req, res) => {
    const parsed = parsePayloadOrFail(storyboardEpisodeSchema, req.body ?? {}, res);
    if (!parsed) {
      return;
    }
    const storyboard = service.assignStoryboardToEpisode(req.params.projectId, req.params.storyboardId, parsed.data.episodeId ?? null);
    if (!storyboard) {
      return fail(res, 400, 'Storyboard episode assignment violates domain constraints', BIZ_CODE.INVALID_PAYLOAD);
    }
    return res.json(storyboard);
  });

  router.get('/projects/:projectId/episodes/:episodeId/storyboards', (req, res) => {
    const items = service.listEpisodeStoryboards(req.params.projectId, req.params.episodeId);
    if (!items) {
      return fail(res, 404, 'Episode not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(items);
  });

  router.get('/projects/:projectId/episodes/:episodeId/asset-relations', (req, res) => {
    const items = service.listEpisodeAssetRelations(req.params.projectId, req.params.episodeId);
    if (!items) {
      return fail(res, 404, 'Episode not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(items);
  });

  router.put('/projects/:projectId/episodes/:episodeId/asset-relations', (req, res) => {
    const parsed = parsePayloadOrFail(episodeAssetRelationsReplaceSchema, req.body ?? {}, res);
    if (!parsed) {
      return;
    }
    const items = service.replaceEpisodeAssetRelations(req.params.projectId, req.params.episodeId, parsed.data);
    if (!items) {
      return fail(res, 400, 'Episode asset assignment violates domain constraints', BIZ_CODE.INVALID_PAYLOAD);
    }
    return res.json(items);
  });

  router.get('/projects/:projectId/episodes/:episodeId/domain-entity-relations', (req, res) => {
    const items = service.listEpisodeDomainEntityRelations(req.params.projectId, req.params.episodeId);
    if (!items) {
      return fail(res, 404, 'Episode not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(items);
  });

  router.put('/projects/:projectId/episodes/:episodeId/domain-entity-relations', (req, res) => {
    const parsed = parsePayloadOrFail(episodeDomainEntityRelationsReplaceSchema, req.body ?? {}, res);
    if (!parsed) {
      return;
    }
    const items = service.replaceEpisodeDomainEntityRelations(req.params.projectId, req.params.episodeId, parsed.data);
    if (!items) {
      return fail(res, 400, 'Episode domain entity assignment violates constraints', BIZ_CODE.INVALID_PAYLOAD);
    }
    return res.json(items);
  });

  router.get('/projects/:projectId/storyboards/:storyboardId/domain-entity-relations', (req, res) => {
    const items = service.listStoryboardDomainEntityRelations(req.params.projectId, req.params.storyboardId);
    if (!items) {
      return fail(res, 404, 'Storyboard not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(items);
  });

  router.put('/projects/:projectId/storyboards/:storyboardId/domain-entity-relations', (req, res) => {
    const parsed = parsePayloadOrFail(storyboardDomainEntityRelationsReplaceSchema, req.body ?? {}, res);
    if (!parsed) {
      return;
    }
    const items = service.replaceStoryboardDomainEntityRelations(req.params.projectId, req.params.storyboardId, parsed.data);
    if (!items) {
      return fail(res, 400, 'Storyboard domain entity assignment violates constraints', BIZ_CODE.INVALID_PAYLOAD);
    }
    return res.json(items);
  });

  router.get('/projects/:projectId/episodes/:episodeId/workflow', (req, res) => {
    const item = service.getEpisodeWorkflowState(req.params.projectId, req.params.episodeId);
    if (!item) {
      return fail(res, 404, 'Episode not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(item);
  });

  router.post('/projects/:projectId/episodes/:episodeId/workflow/transition', (req, res) => {
    const parsed = parsePayloadOrFail(episodeWorkflowTransitionSchema, req.body ?? {}, res);
    if (!parsed) {
      return;
    }
    const actor = parsed.data.actor?.trim() || 'operator';
    const result = service.transitionEpisodeWorkflow(req.params.projectId, req.params.episodeId, {
      toStatus: parsed.data.toStatus,
      actor,
      comment: parsed.data.comment
    });
    if (result.reason === 'not_found') {
      return fail(res, 404, 'Episode not found', BIZ_CODE.NOT_FOUND);
    }
    if (result.reason === 'invalid_transition' || !result.state) {
      return fail(res, 400, 'Invalid workflow transition', BIZ_CODE.INVALID_PAYLOAD);
    }
    return res.json(result.state);
  });

  router.get('/projects/:projectId/episodes/:episodeId/workflow/audits', (req, res) => {
    const parsed = parseQueryOrFail(episodeWorkflowAuditQuerySchema, req.query ?? {}, res);
    if (!parsed) {
      return;
    }
    const items = service.listEpisodeWorkflowAudits(req.params.projectId, req.params.episodeId, parsed.data.limit);
    if (!items) {
      return fail(res, 404, 'Episode not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(items);
  });

  router.get('/projects/:projectId/entities', (req, res) => {
    const parsed = parseQueryOrFail(entitiesQuerySchema, req.query ?? {}, res);
    if (!parsed) {
      return;
    }
    const items = service.listEntities(req.params.projectId, parsed.data);
    if (!items) {
      return fail(res, 404, 'Project not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(items);
  });

  router.get('/projects/:projectId/domain-entities', (req, res) => {
    const parsed = parseQueryOrFail(domainEntitiesQuerySchema, req.query ?? {}, res);
    if (!parsed) {
      return;
    }
    const items = service.listDomainEntities(req.params.projectId, parsed.data);
    if (!items) {
      return fail(res, 404, 'Project not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(items);
  });

  router.get('/projects/:projectId/domain-entities/conflicts', (req, res) => {
    const parsed = parseQueryOrFail(domainEntityConflictsQuerySchema, req.query ?? {}, res);
    if (!parsed) {
      return;
    }
    const data = service.listDomainEntityConflicts(req.params.projectId, parsed.data);
    if (!data) {
      return fail(res, 404, 'Project not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(data);
  });

  router.get('/projects/:projectId/domain-entities/workbench', (req, res) => {
    const parsed = parseQueryOrFail(canonicalEntityWorkbenchQuerySchema, req.query ?? {}, res);
    if (!parsed) {
      return;
    }
    const items = service.listCanonicalEntityWorkbench(req.params.projectId, parsed.data);
    if (!items) {
      return fail(res, 404, 'Project not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(items);
  });

  router.post('/projects/:projectId/entities', (req, res) => {
    const parsed = parsePayloadOrFail(createEntitySchema, req.body ?? {}, res);
    if (!parsed) {
      return;
    }
    const item = service.createEntity(req.params.projectId, parsed.data);
    if (!item) {
      return fail(res, 400, 'Entity creation violates domain constraints', BIZ_CODE.INVALID_PAYLOAD);
    }
    return res.status(201).json(item);
  });

  router.post('/projects/:projectId/domain-entities', (req, res) => {
    const parsed = parsePayloadOrFail(createDomainEntitySchema, req.body ?? {}, res);
    if (!parsed) {
      return;
    }
    const item = service.createDomainEntity(req.params.projectId, parsed.data);
    if (!item) {
      return fail(res, 404, 'Project not found', BIZ_CODE.NOT_FOUND);
    }
    return res.status(201).json(item);
  });

  router.get('/projects/:projectId/domain-apply-policy', (req, res) => {
    const item = service.getDomainApplyPolicy(req.params.projectId);
    if (!item) {
      return fail(res, 404, 'Project not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(item);
  });

  router.put('/projects/:projectId/domain-apply-policy', (req, res) => {
    const parsed = parsePayloadOrFail(domainApplyPolicyUpdateSchema, req.body ?? {}, res);
    if (!parsed) {
      return;
    }
    const item = service.updateDomainApplyPolicy(req.params.projectId, parsed.data);
    if (!item) {
      return fail(res, 404, 'Project not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(item);
  });

  router.post('/projects/:projectId/domain-entities/:entityId/apply-preview', (req, res) => {
    const parsed = parsePayloadOrFail(domainEntityApplyPreviewSchema, req.body ?? {}, res);
    if (!parsed) {
      return;
    }
    const result = service.previewDomainEntityApplyToEpisode(req.params.projectId, req.params.entityId, parsed.data);
    if (!result) {
      return fail(res, 404, 'Entity or episode not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(result);
  });

  router.post('/projects/:projectId/domain-entities/:entityId/apply-to-episode', (req, res) => {
    const parsed = parsePayloadOrFail(domainEntityApplySchema, req.body ?? {}, res);
    if (!parsed) {
      return;
    }
    const result = service.applyDomainEntityToEpisodeByStrategy(req.params.projectId, req.params.entityId, parsed.data);
    if (!result) {
      return fail(res, 404, 'Entity or episode not found', BIZ_CODE.NOT_FOUND);
    }
    return res.status(201).json(result);
  });

  router.patch('/projects/:projectId/entities/:assetId', (req, res) => {
    const parsed = parsePayloadOrFail(updateEntitySchema, req.body ?? {}, res);
    if (!parsed) {
      return;
    }
    const item = service.updateEntity(req.params.projectId, req.params.assetId, parsed.data);
    if (!item) {
      return fail(res, 404, 'Entity not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(item);
  });

  router.patch('/projects/:projectId/domain-entities/:entityId', (req, res) => {
    const parsed = parsePayloadOrFail(updateDomainEntitySchema, req.body ?? {}, res);
    if (!parsed) {
      return;
    }
    const item = service.updateDomainEntity(req.params.projectId, req.params.entityId, parsed.data);
    if (!item) {
      return fail(res, 404, 'Domain entity not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(item);
  });

  router.delete('/projects/:projectId/entities/:assetId', (req, res) => {
    const ok = service.deleteEntity(req.params.projectId, req.params.assetId);
    if (!ok) {
      return fail(res, 404, 'Entity not found', BIZ_CODE.NOT_FOUND);
    }
    return res.status(204).send();
  });

  router.get('/projects/:projectId/domain-entities/:entityId/delete-check', (req, res) => {
    const result = service.previewDomainEntityDelete(req.params.projectId, req.params.entityId);
    if (!result) {
      return fail(res, 404, 'Project not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(result);
  });

  router.delete('/projects/:projectId/domain-entities/:entityId', (req, res) => {
    const result = service.deleteDomainEntity(req.params.projectId, req.params.entityId);
    if (!result) {
      return fail(res, 404, 'Project not found', BIZ_CODE.NOT_FOUND);
    }
    if (result.check.reason === 'not_found' || result.check.reason === 'deleted') {
      return fail(res, 404, 'Domain entity not found', BIZ_CODE.NOT_FOUND);
    }
    if (!result.deleted) {
      return fail(res, 409, `Domain entity delete rejected: ${result.check.reason}`, BIZ_CODE.CONFLICT);
    }
    return res.status(204).send();
  });

  router.post('/projects/:projectId/domain-entities/:entityId/restore', (req, res) => {
    const parsed = parsePayloadOrFail(restoreDomainEntitySchema, req.body ?? {}, res);
    if (!parsed) {
      return;
    }
    const item = service.restoreDomainEntity(req.params.projectId, req.params.entityId, parsed.data);
    if (!item) {
      return fail(res, 404, 'Domain entity not found or not deleted', BIZ_CODE.NOT_FOUND);
    }
    return res.json(item);
  });

  router.post('/projects/:projectId/domain-entities/:entityId/merge', (req, res) => {
    const parsed = parsePayloadOrFail(mergeDomainEntitySchema, req.body ?? {}, res);
    if (!parsed) {
      return;
    }
    const item = service.mergeDomainEntity(req.params.projectId, req.params.entityId, parsed.data);
    if (!item) {
      return fail(res, 400, 'Domain entity merge failed', BIZ_CODE.INVALID_PAYLOAD);
    }
    return res.json(item);
  });

  router.get('/projects/:projectId/domain-entities/:entityId/lifecycle-check', (req, res) => {
    const parsed = parseQueryOrFail(domainEntityLifecycleCheckQuerySchema, req.query ?? {}, res);
    if (!parsed) {
      return;
    }
    const result = service.previewDomainEntityLifecycleTransition(req.params.projectId, req.params.entityId, parsed.data);
    if (!result) {
      return fail(res, 404, 'Project not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(result);
  });

  router.post('/projects/:projectId/domain-entities/:entityId/lifecycle-transition', (req, res) => {
    const parsed = parsePayloadOrFail(domainEntityLifecycleTransitionSchema, req.body ?? {}, res);
    if (!parsed) {
      return;
    }
    const result = service.transitionDomainEntityLifecycle(req.params.projectId, req.params.entityId, parsed.data);
    if (!result) {
      return fail(res, 404, 'Project or entity not found', BIZ_CODE.NOT_FOUND);
    }
    if (result.check.reason === 'not_found') {
      return fail(res, 404, 'Domain entity not found', BIZ_CODE.NOT_FOUND);
    }
    if (!result.check.allowed || !result.entity) {
      return fail(res, 400, `Lifecycle transition rejected: ${result.check.reason}`, BIZ_CODE.INVALID_PAYLOAD);
    }
    return res.json(result);
  });

  router.get('/projects/:projectId/domain-entities/lifecycle-recommendations', (req, res) => {
    const parsed = parseQueryOrFail(domainEntityLifecycleRecommendQuerySchema, req.query ?? {}, res);
    if (!parsed) {
      return;
    }
    const entityIds = parsed.data.entityIds
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    const items = entityIds
      .map((entityId) => service.recommendDomainEntityLifecycleStatusByEpisode(req.params.projectId, entityId))
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
    return res.json({ items, total: items.length });
  });

  router.post('/projects/:projectId/domain-entities/lifecycle-batch-transition', (req, res) => {
    const parsed = parsePayloadOrFail(domainEntityLifecycleBatchTransitionSchema, req.body ?? {}, res);
    if (!parsed) {
      return;
    }
    const result = service.batchTransitionDomainEntityLifecycle(req.params.projectId, {
      entityIds: [...new Set(parsed.data.entityIds)],
      toStatus: parsed.data.toStatus,
      toStatusByType: parsed.data.toStatusByType,
      autoRecommend: Boolean(parsed.data.autoRecommend),
      actor: parsed.data.actor,
      note: parsed.data.note
    });
    if (!result) {
      return fail(res, 404, 'Project not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(result);
  });

  router.get('/projects/:projectId/entity-workbench', (req, res) => {
    const parsed = parseQueryOrFail(entityWorkbenchQuerySchema, req.query ?? {}, res);
    if (!parsed) {
      return;
    }
    const items = service.listEntityWorkbench(req.params.projectId, parsed.data);
    if (!items) {
      return fail(res, 404, 'Project not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(items);
  });

  router.get('/projects/:projectId/domain-entity-audits', (req, res) => {
    const parsed = parseQueryOrFail(domainEntityAuditQuerySchema, req.query ?? {}, res);
    if (!parsed) {
      return;
    }
    const items = service.listDomainEntityAudits(req.params.projectId, parsed.data);
    if (!items) {
      return fail(res, 404, 'Project not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(items);
  });

  router.get('/projects/:projectId/domain-entity-audits/stats', (req, res) => {
    const parsed = parseQueryOrFail(domainEntityAuditQuerySchema, req.query ?? {}, res);
    if (!parsed) {
      return;
    }
    const stats = service.getDomainEntityAuditStats(req.params.projectId, parsed.data);
    if (!stats) {
      return fail(res, 404, 'Project not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(stats);
  });

  router.get('/projects/:projectId/domain-entity-audits/export.csv', (req, res) => {
    const parsed = parseQueryOrFail(domainEntityAuditQuerySchema, req.query ?? {}, res);
    if (!parsed) {
      return;
    }
    const csv = service.exportDomainEntityAuditsCsv(req.params.projectId, parsed.data);
    if (!csv) {
      return fail(res, 404, 'Project not found', BIZ_CODE.NOT_FOUND);
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=\"domain-entity-audits-${req.params.projectId}.csv\"`);
    return res.send(csv);
  });

  router.post('/projects/:projectId/entity-workbench/:entityId/apply-to-episode', (req, res) => {
    const parsed = parsePayloadOrFail(applyEntityToEpisodeSchema, req.body ?? {}, res);
    if (!parsed) {
      return;
    }
    const result = service.applyEntityToEpisode(req.params.projectId, req.params.entityId, parsed.data);
    if (!result) {
      return fail(res, 404, 'Entity or episode not found', BIZ_CODE.NOT_FOUND);
    }
    return res.status(201).json(result);
  });

  return router;
};
