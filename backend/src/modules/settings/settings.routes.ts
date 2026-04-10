import { Response, Router } from 'express';
import { z } from 'zod';
import { BIZ_CODE } from '../../constants/bizCode.js';
import { requireRole } from '../../middleware/authorization.js';
import { withAsyncRoute } from '../../utils/async-route.js';
import { parsePayload, parseQuery } from '../../utils/validation.js';
import { defaultProviderRegistryService, ProviderRegistryService } from '../ai/provider-registry.service.js';
import { AdminAuditService } from './admin-audit.service.js';
import { PROVIDER_CAPABILITY_PRESETS } from './capability-presets.js';
import { importModelDraftFromExample } from './model-config-example-import.js';
import { ModelConnectionService } from './model-connection.service.js';
import { listProviderTemplateDescriptors } from './provider-template-catalog.js';
import { SettingsService } from './settings.service.js';

const modelTypeSchema = z.enum(['text', 'image', 'video', 'audio']);
const authTypeSchema = z.enum(['bearer', 'api_key', 'none']);
const keyValueStringSchema = z.record(z.string(), z.string());
const unknownRecordSchema = z.record(z.string(), z.unknown());

const hasInvalidApiKeyPlaceholder = (value: string): boolean => {
  const normalized = value.trim();
  if (!normalized) {
    return false;
  }
  return (
    /[^\x20-\x7E]/.test(normalized) ||
    /<token>/i.test(normalized) ||
    /你的真实token/i.test(normalized) ||
    /your\s+(real\s+)?token/i.test(normalized) ||
    /replace.+token/i.test(normalized)
  );
};

const createModelSchema = z
  .object({
    type: modelTypeSchema,
    name: z.string().min(1),
    provider: z.string().min(1),
    manufacturer: z.string().min(1).optional(),
    model: z.string().min(1).optional(),
    authType: authTypeSchema.optional(),
    endpoint: z.string().min(1),
    endpoints: keyValueStringSchema.optional(),
    apiKey: z.string().optional().default(''),
    capabilities: unknownRecordSchema.optional(),
    priority: z.coerce.number().int().min(0).max(100000).optional(),
    rateLimit: z.coerce.number().int().min(0).max(100000).optional(),
    isDefault: z.boolean().optional(),
    enabled: z.boolean().optional()
  })
  .superRefine((value, ctx) => {
    if ((value.authType ?? 'bearer') !== 'none' && !value.apiKey.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['apiKey'],
        message: 'API key is required unless authType is none'
      });
    }
    if ((value.authType ?? 'bearer') !== 'none' && hasInvalidApiKeyPlaceholder(value.apiKey)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['apiKey'],
        message: 'API key still contains placeholder or non-ASCII characters. Replace it with the real provider token.'
      });
    }
  });

const updateModelSchema = z
  .object({
    name: z.string().min(1).optional(),
    provider: z.string().min(1).optional(),
    manufacturer: z.string().min(1).optional(),
    model: z.string().min(1).optional(),
    authType: authTypeSchema.optional(),
    endpoint: z.string().min(1).optional(),
    endpoints: keyValueStringSchema.optional(),
    apiKey: z.string().min(1).optional(),
    capabilities: unknownRecordSchema.optional(),
    priority: z.coerce.number().int().min(0).max(100000).optional(),
    rateLimit: z.coerce.number().int().min(0).max(100000).optional(),
    isDefault: z.boolean().optional(),
    enabled: z.boolean().optional()
  })
  .superRefine((value, ctx) => {
    if (value.authType !== 'none' && typeof value.apiKey === 'string' && hasInvalidApiKeyPlaceholder(value.apiKey)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['apiKey'],
        message: 'API key still contains placeholder or non-ASCII characters. Replace it with the real provider token.'
      });
    }
  });

const testModelOverrideSchema = z.object({
  type: modelTypeSchema.optional(),
  name: z.string().optional(),
  provider: z.string().optional(),
  manufacturer: z.string().optional(),
  model: z.string().optional(),
  authType: authTypeSchema.optional(),
  endpoint: z.string().optional(),
  endpoints: keyValueStringSchema.optional(),
  apiKey: z.string().optional(),
  capabilities: unknownRecordSchema.optional(),
  priority: z.coerce.number().int().min(0).max(100000).optional(),
  rateLimit: z.coerce.number().int().min(0).max(100000).optional(),
  isDefault: z.boolean().optional(),
  enabled: z.boolean().optional()
});

const importModelExampleSchema = z.object({
  example: z.string().min(1),
  name: z.string().trim().min(1).optional(),
  isDefault: z.boolean().optional(),
  enabled: z.boolean().optional()
});

const updatePromptSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().min(1).optional()
});

const listModelQuerySchema = z.object({
  type: modelTypeSchema.optional()
});

const updateRuntimeSchema = z.object({
  videoTaskAutoRetry: z.coerce.number().int().min(0).max(5).optional(),
  videoTaskRetryDelayMs: z.coerce.number().int().min(100).max(10000).optional(),
  videoTaskPollIntervalMs: z.coerce.number().int().min(500).max(10000).optional()
});
const taskFailurePolicyItemSchema = z.object({
  errorCode: z.enum(['CAPABILITY_MISMATCH', 'PROVIDER_AUTH_FAILED', 'PROVIDER_RATE_LIMITED', 'PROVIDER_TIMEOUT', 'PROVIDER_UNKNOWN']),
  action: z.enum(['retry', 'recreate_conservative', 'manual']),
  preferredMode: z.enum(['keep', 'text', 'singleImage', 'startEnd', 'multiImage', 'reference']),
  disableAudio: z.boolean(),
  priority: z.enum(['keep', 'low', 'medium', 'high'])
});
const updateTaskFailurePoliciesSchema = z.object({
  autoApply: z.boolean().optional(),
  maxAutoApplyPerTask: z.coerce.number().int().min(0).max(3).optional(),
  items: z.array(taskFailurePolicyItemSchema).max(20)
});

const providerLogsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  provider: z.string().trim().max(80).optional(),
  taskType: modelTypeSchema.optional(),
  success: z
    .union([z.coerce.boolean(), z.literal('true'), z.literal('false')])
    .optional()
    .transform((value) => {
      if (value === undefined) {
        return undefined;
      }
      if (value === 'true') {
        return true;
      }
      if (value === 'false') {
        return false;
      }
      return value;
    }),
  keyword: z.string().trim().max(200).optional()
});
const autoRepairLogsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  action: z.enum(['retry', 'recreate_conservative', 'manual']).optional(),
  errorCode: z.string().trim().max(80).optional(),
  projectId: z.string().trim().max(80).optional(),
  taskId: z.string().trim().max(80).optional(),
  taskIds: z.string().trim().max(2000).optional(),
  success: z
    .union([z.coerce.boolean(), z.literal('true'), z.literal('false')])
    .optional()
    .transform((value) => {
      if (value === undefined) {
        return undefined;
      }
      if (value === 'true') {
        return true;
      }
      if (value === 'false') {
        return false;
      }
      return value;
    }),
  keyword: z.string().trim().max(200).optional()
});
const videoMergeErrorsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(10),
  projectId: z.string().min(1).optional()
});
const resetBusinessDataSchema = z.object({
  confirmText: z.string().min(1)
});
const importBackupSchema = z.object({
  version: z.string().min(1),
  tables: z.record(z.string(), z.array(z.record(z.string(), z.unknown())))
});
const migrationSnapshotFileNameSchema = z.object({
  fileName: z.string().trim().min(1).max(200).regex(/^[A-Za-z0-9._-]+\.json$/)
});
const adminAuditListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  scope: z.enum(['settings', 'tasks']).optional(),
  action: z.string().trim().max(120).optional(),
  actorId: z.string().trim().max(120).optional()
});
const adminAuditExportQuerySchema = adminAuditListQuerySchema.extend({
  format: z.enum(['json', 'csv']).default('json')
});

const taskCenterPresetListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20)
});

const taskCenterPresetNameSchema = z.object({
  name: z.string().trim().min(1).max(40)
});

const taskCenterPresetPayloadSchema = z.object({
  q: z.string().max(200).default(''),
  providerTaskId: z.string().max(200).default(''),
  status: z.enum(['', 'queued', 'submitting', 'polling', 'running', 'done', 'failed', 'cancelled']).default(''),
  providerErrorCode: z
    .enum(['', 'CAPABILITY_MISMATCH', 'PROVIDER_AUTH_FAILED', 'PROVIDER_RATE_LIMITED', 'PROVIDER_TIMEOUT', 'PROVIDER_UNKNOWN'])
    .default(''),
  createdFrom: z.string().max(40).default(''),
  createdTo: z.string().max(40).default(''),
  sortBy: z.enum(['createdAt', 'updatedAt', 'priority', 'status']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc')
});
const teamWorkspaceLayoutTemplatesQuerySchema = z.object({
  contextScope: z.string().trim().max(120).default('global')
});
const teamWorkspaceLayoutTemplateNameSchema = z.object({
  name: z.string().trim().min(1).max(60)
});
const teamWorkspaceLayoutTemplatePayloadSchema = z.object({
  uiPrefs: unknownRecordSchema
});

type SettingsRouterDeps = {
  providerRegistryService?: ProviderRegistryService;
  adminAuditService?: AdminAuditService;
  modelConnectionService?: ModelConnectionService;
};

export const buildSettingsRouter = (service: SettingsService, deps: SettingsRouterDeps = {}): Router => {
  const router = Router();
  const providerRegistryService = deps.providerRegistryService ?? defaultProviderRegistryService;
  const adminAuditService = deps.adminAuditService;
  const modelConnectionService = deps.modelConnectionService;
  const adminOnly = requireRole('admin');
  const fail = (res: Response, status: number, message: string, bizCode: string) =>
    res.status(status).json({ message, bizCode });
  const getUserScope = (res: Response): string => {
    const auth = (res.locals.auth ?? {}) as { uid?: string };
    return typeof auth.uid === 'string' && auth.uid ? auth.uid : 'global';
  };
  const getUserRole = (res: Response): string => {
    const auth = (res.locals.auth ?? {}) as { role?: string };
    return typeof auth.role === 'string' && auth.role ? auth.role : 'viewer';
  };
  const normalizeModelPayload = <T extends { provider?: string; manufacturer?: string }>(payload: T): T => {
    if (!payload.provider) {
      return payload;
    }
    const normalized = providerRegistryService.normalizeModelProviderInput({
      provider: payload.provider,
      manufacturer: payload.manufacturer
    });
    return {
      ...payload,
      provider: normalized.provider,
      manufacturer: payload.manufacturer ?? normalized.manufacturer
    };
  };
  const canEditTeamTemplates = (role: string): boolean => ['admin', 'owner', 'editor'].includes(role);
  const recordAdminAudit = (
    res: Response,
    action: string,
    targetId?: string | null,
    details?: Record<string, unknown>
  ): void => {
    if (!adminAuditService) {
      return;
    }
    const auth = (res.locals.auth ?? {}) as { uid?: string; role?: string };
    const requestContext = (res.locals.requestContext ?? {}) as { requestId?: string };
    adminAuditService.record({
      scope: 'settings',
      action,
      actorId: typeof auth.uid === 'string' ? auth.uid : 'unknown',
      actorRole: typeof auth.role === 'string' ? auth.role : 'unknown',
      requestId: requestContext.requestId,
      targetId,
      details
    });
  };

  router.get('/providers/catalog', (_req, res) => {
    return res.json(providerRegistryService.listProviderDescriptors());
  });

  router.get('/providers/capabilities', (_req, res) => {
    return res.json(providerRegistryService.getProviderCatalogCapabilities());
  });

  router.get('/providers/templates', (_req, res) => {
    return res.json(listProviderTemplateDescriptors());
  });

  router.get('/providers/capability-presets', (_req, res) => {
    return res.json(PROVIDER_CAPABILITY_PRESETS);
  });

  router.get('/models', (req, res) => {
    const query = parseQuery(listModelQuerySchema, req.query, res, fail);
    if (!query) {
      return;
    }
    return res.json(service.listModelConfigs(query.type));
  });

  router.get('/models/:modelId/capabilities', (req, res) => {
    const capabilities = service.getModelConfigCapabilities(req.params.modelId);
    if (!capabilities) {
      return fail(res, 404, 'Model config not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(capabilities);
  });

  // Get voice list for a specific audio model
  router.get('/models/:modelId/voices', (req, res) => {
    const capabilities = service.getModelConfigCapabilities(req.params.modelId);
    if (!capabilities) {
      return fail(res, 404, 'Model config not found', BIZ_CODE.NOT_FOUND);
    }
    const audio = capabilities.audio as Record<string, unknown> | undefined;
    if (!audio) {
      return res.json({
        voices: [],
        voiceCloning: false,
        message: 'This model does not support audio/voice'
      });
    }
    return res.json({
      voices: audio.voices || [],
      voiceCloning: audio.voiceCloning || false,
      voiceCloningNote: audio.voiceCloningNote || null,
      formats: audio.formats || [],
      speeds: audio.speeds || [],
      emotions: audio.emotions || [],
      providerOptions: audio.providerOptions || {}
    });
  });

  // Voice cloning: upload audio sample and get voice_id
  // This is a placeholder - actual implementation would call vendor APIs
  router.post('/models/:modelId/clone-voice', (req, res) => {
    const model = service.getModelConfigById(req.params.modelId);
    if (!model) {
      return fail(res, 404, 'Model config not found', BIZ_CODE.NOT_FOUND);
    }
    const capabilities = model.capabilities as Record<string, unknown> | undefined;
    const audio = capabilities?.audio as Record<string, unknown> | undefined;
    if (!audio?.voiceCloning) {
      return fail(res, 400, 'This model does not support voice cloning', BIZ_CODE.INVALID_OPERATION);
    }
    // TODO: Implement actual voice cloning
    // 1. Upload audio file to temp storage
    // 2. Call vendor's voice cloning API (e.g., ElevenLabs /v1/voices/clone)
    // 3. Return the generated voice_id
    return res.json({
      success: false,
      message: 'Voice cloning API not yet implemented. Please configure API key for this provider first.',
      provider: model.manufacturer,
      requiredEndpoints: {
        clone: audio.cloneEndpoint || 'Not configured'
      }
    });
  });

  router.post('/models/test-connection', adminOnly, withAsyncRoute(async (req, res) => {
    if (!modelConnectionService) {
      return fail(res, 500, 'Model connection service unavailable', BIZ_CODE.INTERNAL_ERROR);
    }
    const payload = parsePayload(createModelSchema, req.body, res, fail);
    if (!payload) {
      return;
    }
    const result = await modelConnectionService.testDraft(normalizeModelPayload(payload));
    return res.json(result);
  }));

  router.post('/models/import-example', adminOnly, (req, res) => {
    const payload = parsePayload(importModelExampleSchema, req.body, res, fail);
    if (!payload) {
      return;
    }
    const draft = normalizeModelPayload(importModelDraftFromExample(payload));
    return res.json(draft);
  });

  router.post('/models', adminOnly, (req, res) => {
    const payload = parsePayload(createModelSchema, req.body, res, fail);
    if (!payload) {
      return;
    }
    const model = service.createModelConfig(normalizeModelPayload(payload));
    recordAdminAudit(res, 'settings.model.create', model.id, {
      type: model.type,
      provider: model.provider,
      name: model.name
    });
    return res.status(201).json(model);
  });

  router.patch('/models/:modelId', adminOnly, (req, res) => {
    const payload = parsePayload(updateModelSchema, req.body, res, fail);
    if (!payload) {
      return;
    }
    const model = service.updateModelConfig(req.params.modelId, normalizeModelPayload(payload));
    if (!model) {
      return fail(res, 404, 'Model config not found', BIZ_CODE.NOT_FOUND);
    }
    recordAdminAudit(res, 'settings.model.update', model.id, {
      updatedKeys: Object.keys(payload)
    });
    return res.json(model);
  });

  router.post('/models/:modelId/test-connection', adminOnly, withAsyncRoute(async (req, res) => {
    if (!modelConnectionService) {
      return fail(res, 500, 'Model connection service unavailable', BIZ_CODE.INTERNAL_ERROR);
    }
    const payload = parsePayload(testModelOverrideSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    const result = await modelConnectionService.testStoredModel(req.params.modelId, normalizeModelPayload(payload));
    if (!result) {
      return fail(res, 404, 'Model config not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(result);
  }));

  router.delete('/models/:modelId', adminOnly, (req, res) => {
    const ok = service.deleteModelConfig(req.params.modelId);
    if (!ok) {
      return fail(res, 404, 'Model config not found', BIZ_CODE.NOT_FOUND);
    }
    recordAdminAudit(res, 'settings.model.delete', req.params.modelId);
    return res.status(204).send();
  });

  router.get('/prompts', (_req, res) => {
    return res.json(service.listPromptTemplates());
  });

  router.get('/prompts/:promptId/versions', (req, res) => {
    return res.json(service.listPromptTemplateVersions(req.params.promptId));
  });

  router.patch('/prompts/:promptId', adminOnly, (req, res) => {
    const payload = parsePayload(updatePromptSchema, req.body, res, fail);
    if (!payload) {
      return;
    }
    const prompt = service.updatePromptTemplate(req.params.promptId, payload);
    if (!prompt) {
      return fail(res, 404, 'Prompt template not found', BIZ_CODE.NOT_FOUND);
    }
    recordAdminAudit(res, 'settings.prompt.update', prompt.id, {
      updatedKeys: Object.keys(payload)
    });
    return res.json(prompt);
  });

  router.get('/runtime', (_req, res) => {
    return res.json(service.getTaskRuntimeConfig());
  });

  router.patch('/runtime', adminOnly, (req, res) => {
    const payload = parsePayload(updateRuntimeSchema, req.body, res, fail);
    if (!payload) {
      return;
    }
    const result = service.updateTaskRuntimeConfig(payload);
    recordAdminAudit(res, 'settings.runtime.update', 'task-runtime', payload);
    return res.json(result);
  });

  router.get('/task-failure-policies', (_req, res) => {
    return res.json(service.getTaskFailurePolicies());
  });

  router.put('/task-failure-policies', adminOnly, (req, res) => {
    const payload = parsePayload(updateTaskFailurePoliciesSchema, req.body, res, fail);
    if (!payload) {
      return;
    }
    const result = service.updateTaskFailurePolicies(payload);
    recordAdminAudit(res, 'settings.failure-policy.update', 'task-failure-policies', {
      autoApply: payload.autoApply,
      maxAutoApplyPerTask: payload.maxAutoApplyPerTask,
      itemCount: payload.items.length
    });
    return res.json(result);
  });

  router.get('/logs/providers', (req, res) => {
    const query = parseQuery(providerLogsQuerySchema, req.query, res, fail);
    if (!query) {
      return;
    }
    return res.json(service.listProviderLogs(query));
  });

  router.get('/logs/providers/stats', (_req, res) => {
    return res.json(service.getProviderLogBreakdown());
  });

  router.delete('/logs/providers', adminOnly, (_req, res) => {
    const result = service.clearProviderLogs();
    recordAdminAudit(res, 'settings.provider-logs.clear', 'provider-logs', result);
    return res.json(result);
  });

  router.get('/logs/auto-repair', (req, res) => {
    const query = parseQuery(autoRepairLogsQuerySchema, req.query, res, fail);
    if (!query) {
      return;
    }
    const taskIds =
      typeof query.taskIds === 'string' && query.taskIds.trim()
        ? [...new Set(query.taskIds.split(',').map((item) => item.trim()).filter((item) => item.length > 0))].slice(0, 50)
        : undefined;
    return res.json(
      service.listAutoRepairLogs({
        ...query,
        taskIds
      })
    );
  });

  router.get('/logs/auto-repair/stats', (_req, res) => {
    return res.json(service.getAutoRepairLogStats());
  });

  router.delete('/logs/auto-repair', adminOnly, (_req, res) => {
    const result = service.clearAutoRepairLogs();
    recordAdminAudit(res, 'settings.auto-repair-logs.clear', 'auto-repair-logs', result);
    return res.json(result);
  });

  router.get('/ops/summary', adminOnly, (_req, res) => {
    return res.json(service.getOpsSummary());
  });

  router.get('/ops/video-merge-errors', adminOnly, (req, res) => {
    const query = parseQuery(videoMergeErrorsQuerySchema, req.query, res, fail);
    if (!query) {
      return;
    }
    return res.json(service.listVideoMergeErrorStats(query));
  });

  router.post('/ops/reset-business-data', adminOnly, (req, res) => {
    const payload = parsePayload(resetBusinessDataSchema, req.body, res, fail);
    if (!payload) {
      return;
    }
    const result = service.resetBusinessData(payload.confirmText);
    if (!result) {
      return fail(res, 400, 'Invalid confirm text, expected RESET_BUSINESS_DATA', BIZ_CODE.INVALID_PAYLOAD);
    }
    recordAdminAudit(res, 'settings.ops.reset-business-data', 'business-data', {
      removed: result.removed
    });
    return res.json(result);
  });

  router.get('/ops/backup/export', adminOnly, (_req, res) => {
    const result = service.exportBusinessBackup();
    recordAdminAudit(res, 'settings.ops.backup.export', 'business-backup', {
      tableCount: Object.keys(result.tables).length
    });
    return res.json(result);
  });

  router.post('/ops/backup/import', adminOnly, (req, res) => {
    const payload = parsePayload(importBackupSchema, req.body, res, fail);
    if (!payload) {
      return;
    }
    const result = service.importBusinessBackup(payload);
    recordAdminAudit(res, 'settings.ops.backup.import', 'business-backup', {
      version: payload.version,
      inserted: result.inserted
    });
    return res.json(result);
  });

  router.get('/ops/migrations', adminOnly, (_req, res) => {
    return res.json(service.getMigrationStatus());
  });

  router.post('/ops/migrations/restore-latest', adminOnly, (_req, res) => {
    const result = service.restoreLatestMigrationSnapshot();
    if (!result) {
      return fail(res, 404, 'No migration snapshot found', BIZ_CODE.NOT_FOUND);
    }
    recordAdminAudit(res, 'settings.ops.migrations.restore-latest', result.restoredFrom, {
      inserted: result.inserted
    });
    return res.json(result);
  });

  router.post('/ops/migrations/restore', adminOnly, (req, res) => {
    const payload = parsePayload(migrationSnapshotFileNameSchema, req.body, res, fail);
    if (!payload) {
      return;
    }
    const result = service.restoreMigrationSnapshotByFile(payload.fileName);
    if (!result) {
      return fail(res, 404, 'Migration snapshot not found', BIZ_CODE.NOT_FOUND);
    }
    recordAdminAudit(res, 'settings.ops.migrations.restore', payload.fileName, {
      restoredFrom: result.restoredFrom,
      inserted: result.inserted
    });
    return res.json(result);
  });

  router.get('/ops/migrations/snapshots/:fileName', adminOnly, (req, res) => {
    const query = parseQuery(migrationSnapshotFileNameSchema, req.params, res, fail);
    if (!query) {
      return;
    }
    const result = service.getMigrationSnapshotContent(query.fileName);
    if (!result) {
      return fail(res, 404, 'Migration snapshot not found', BIZ_CODE.NOT_FOUND);
    }
    recordAdminAudit(res, 'settings.ops.migrations.snapshot.read', query.fileName);
    return res.json(result);
  });

  router.get('/ops/admin-audit', adminOnly, (req, res) => {
    const query = parseQuery(adminAuditListQuerySchema, req.query, res, fail);
    if (!query) {
      return;
    }
    return res.json(adminAuditService?.list(query) ?? []);
  });

  router.get('/ops/admin-audit/export', adminOnly, (req, res) => {
    const query = parseQuery(adminAuditExportQuerySchema, req.query, res, fail);
    if (!query) {
      return;
    }
    const exported = adminAuditService?.export(query) ?? {
      filename: 'admin-audit-empty.json',
      contentType: 'application/json; charset=utf-8',
      body: '[]'
    };
    res.setHeader('Content-Type', exported.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`);
    return res.send(exported.body);
  });

  router.get('/task-center/presets', (req, res) => {
    const query = parseQuery(taskCenterPresetListQuerySchema, req.query, res, fail);
    if (!query) {
      return;
    }
    return res.json(service.listTaskCenterFilterPresetsPaged(getUserScope(res), query));
  });

  router.put('/task-center/presets/:name', (req, res) => {
    const nameQuery = parseQuery(taskCenterPresetNameSchema, req.params, res, fail);
    if (!nameQuery) {
      return;
    }
    const payload = parsePayload(taskCenterPresetPayloadSchema, req.body, res, fail);
    if (!payload) {
      return;
    }
    return res.json(service.upsertTaskCenterFilterPreset(getUserScope(res), nameQuery.name, payload));
  });

  router.post('/task-center/presets/:name/default', (req, res) => {
    const nameQuery = parseQuery(taskCenterPresetNameSchema, req.params, res, fail);
    if (!nameQuery) {
      return;
    }
    return res.json(service.setDefaultTaskCenterFilterPreset(getUserScope(res), nameQuery.name));
  });

  router.post('/task-center/presets/:name/use', (req, res) => {
    const nameQuery = parseQuery(taskCenterPresetNameSchema, req.params, res, fail);
    if (!nameQuery) {
      return;
    }
    return res.json(service.markTaskCenterFilterPresetUsed(getUserScope(res), nameQuery.name));
  });

  router.delete('/task-center/presets/:name', (req, res) => {
    const nameQuery = parseQuery(taskCenterPresetNameSchema, req.params, res, fail);
    if (!nameQuery) {
      return;
    }
    return res.json(service.deleteTaskCenterFilterPreset(getUserScope(res), nameQuery.name));
  });

  router.get('/workspace-layout/team-templates', (req, res) => {
    const query = parseQuery(teamWorkspaceLayoutTemplatesQuerySchema, req.query, res, fail);
    if (!query) {
      return;
    }
    const role = getUserRole(res);
    const readOnly = !canEditTeamTemplates(role);
    return res.json(
      service.listTeamWorkspaceLayoutTemplates(query.contextScope).map((item) => ({
        ...item,
        readOnly
      }))
    );
  });

  router.put('/workspace-layout/team-templates/:name', (req, res) => {
    const query = parseQuery(teamWorkspaceLayoutTemplatesQuerySchema, req.query, res, fail);
    if (!query) {
      return;
    }
    const nameQuery = parseQuery(teamWorkspaceLayoutTemplateNameSchema, req.params, res, fail);
    if (!nameQuery) {
      return;
    }
    const payload = parsePayload(teamWorkspaceLayoutTemplatePayloadSchema, req.body, res, fail);
    if (!payload) {
      return;
    }
    const role = getUserRole(res);
    if (!canEditTeamTemplates(role)) {
      return fail(res, 403, 'Forbidden: read-only team template role', BIZ_CODE.FORBIDDEN);
    }
    return res.json(service.upsertTeamWorkspaceLayoutTemplate(query.contextScope, nameQuery.name, payload, getUserScope(res), role));
  });

  router.delete('/workspace-layout/team-templates/:name', (req, res) => {
    const query = parseQuery(teamWorkspaceLayoutTemplatesQuerySchema, req.query, res, fail);
    if (!query) {
      return;
    }
    const nameQuery = parseQuery(teamWorkspaceLayoutTemplateNameSchema, req.params, res, fail);
    if (!nameQuery) {
      return;
    }
    const role = getUserRole(res);
    if (!canEditTeamTemplates(role)) {
      return fail(res, 403, 'Forbidden: read-only team template role', BIZ_CODE.FORBIDDEN);
    }
    return res.json(service.deleteTeamWorkspaceLayoutTemplate(query.contextScope, nameQuery.name));
  });

  return router;
};
