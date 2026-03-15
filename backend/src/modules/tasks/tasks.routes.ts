import { Response, Router } from 'express';
import { z } from 'zod';
import { BIZ_CODE } from '../../constants/bizCode.js';
import { requireRole } from '../../middleware/authorization.js';
import { parsePayload, parseQuery } from '../../utils/validation.js';
import { AdminAuditService } from '../settings/admin-audit.service.js';
import { TasksService } from './tasks.service.js';

const listQuerySchema = z.object({
  q: z.string().optional(),
  providerTaskId: z.string().optional(),
  providerErrorCode: z.string().optional(),
  status: z.enum(['queued', 'submitting', 'polling', 'running', 'done', 'failed', 'cancelled']).optional(),
  createdFrom: z.string().datetime().optional(),
  createdTo: z.string().datetime().optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'priority', 'status']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20)
});

const eventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

const exportEventsQuerySchema = z.object({
  format: z.enum(['json', 'csv']).default('json'),
  status: z.enum(['queued', 'submitting', 'polling', 'running', 'done', 'failed', 'cancelled']).optional(),
  q: z.string().max(200).optional(),
  createdFrom: z.string().datetime().optional(),
  createdTo: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(10000).default(1000)
});

const batchActionSchema = z.object({
  taskIds: z.array(z.string().min(1)).min(1).max(200)
});
const batchRepairByPolicyQuerySchema = z.object({
  q: z.string().optional(),
  providerTaskId: z.string().optional(),
  providerErrorCode: z.string().optional(),
  status: z.enum(['queued', 'submitting', 'polling', 'running', 'done', 'failed', 'cancelled']).optional(),
  createdFrom: z.string().datetime().optional(),
  createdTo: z.string().datetime().optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'priority', 'status']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
  maxCount: z.coerce.number().int().min(1).max(1000).default(300)
});

const updateQueueAlertSchema = z.object({
  warnQueuedThreshold: z.coerce.number().int().min(1).max(10_000).optional(),
  criticalQueuedThreshold: z.coerce.number().int().min(1).max(10_000).optional()
});
const updateTaskSloConfigSchema = z.object({
  p95QueueWaitWarnMs: z.coerce.number().int().min(1_000).max(30 * 60_000).optional(),
  p95QueueWaitCriticalMs: z.coerce.number().int().min(1_000).max(30 * 60_000).optional(),
  pumpErrorRateWarn: z.coerce.number().min(0).max(1).optional(),
  pumpErrorRateCritical: z.coerce.number().min(0).max(1).optional(),
  windowSamples: z.coerce.number().int().min(5).max(240).optional()
});
const updateTaskQuotaConfigSchema = z.object({
  dailyVideoTaskDefault: z.coerce.number().int().min(1).max(100_000).optional(),
  dailyVideoTaskOverrides: z.record(z.coerce.number().int().min(1).max(100_000)).optional(),
  dailyVideoTaskTierLimits: z
    .object({
      standard: z.coerce.number().int().min(1).max(100_000).optional(),
      pro: z.coerce.number().int().min(1).max(100_000).optional(),
      enterprise: z.coerce.number().int().min(1).max(100_000).optional()
    })
    .optional(),
  projectTierOverrides: z.record(z.enum(['standard', 'pro', 'enterprise'])).optional()
});
const taskQuotaUsageQuerySchema = z.object({
  projectId: z.string().min(1)
});
const taskQuotaRejectListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(50),
  projectId: z.string().min(1).optional()
});
const taskQuotaRejectExportQuerySchema = z.object({
  format: z.enum(['json', 'csv']).default('json'),
  limit: z.coerce.number().int().min(1).max(500).default(200),
  projectId: z.string().min(1).optional()
});
const taskQuotaUsageEventListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  projectId: z.string().min(1).optional()
});
const taskQuotaUsageEventExportQuerySchema = z.object({
  format: z.enum(['json', 'csv']).default('json'),
  limit: z.coerce.number().int().min(1).max(1000).default(500),
  projectId: z.string().min(1).optional()
});
const runtimeHealthQuerySchema = z.object({
  limit: z.coerce.number().int().min(5).max(240).default(30)
});
const runtimeReconcileQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(2000).default(200),
  staleAfterMinutes: z.coerce.number().int().min(5).max(24 * 60).default(45)
});
const runtimeAlertListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(20)
});
const catalogAlertListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(20)
});
const catalogAlertExportQuerySchema = z.object({
  format: z.enum(['json', 'csv']).default('json'),
  limit: z.coerce.number().int().min(1).max(500).default(200)
});
const unifiedAlertListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  windowMinutes: z.coerce.number().int().min(5).max(24 * 60).default(60)
});
const unifiedAlertExportQuerySchema = z.object({
  format: z.enum(['json', 'csv']).default('json'),
  limit: z.coerce.number().int().min(1).max(500).default(200),
  windowMinutes: z.coerce.number().int().min(5).max(24 * 60).default(60)
});
const unifiedAlertPolicyUpdateSchema = z.object({
  redTotalThreshold: z.coerce.number().int().min(1).max(1000).optional(),
  redQueueThreshold: z.coerce.number().int().min(1).max(1000).optional(),
  redContractThreshold: z.coerce.number().int().min(1).max(1000).optional(),
  cooldownMinutes: z.coerce.number().int().min(1).max(24 * 60).optional()
});
const unifiedAlertActionListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100)
});
const unifiedAlertActionExportQuerySchema = z.object({
  format: z.enum(['json', 'csv']).default('json'),
  limit: z.coerce.number().int().min(1).max(1000).default(500)
});
const unifiedIncidentListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(200),
  status: z.enum(['open', 'resolved']).optional()
});
const unifiedIncidentUpdateSchema = z.object({
  status: z.enum(['open', 'resolved']).optional(),
  assignee: z.string().max(120).optional(),
  note: z.string().max(1000).optional()
});
const unifiedIncidentExportQuerySchema = z.object({
  format: z.enum(['json', 'csv']).default('json'),
  limit: z.coerce.number().int().min(1).max(1000).default(500),
  status: z.enum(['open', 'resolved']).optional()
});
const unifiedIncidentSlaConfigUpdateSchema = z.object({
  warnAfterMinutes: z.coerce.number().int().min(1).max(7 * 24 * 60).optional(),
  criticalAfterMinutes: z.coerce.number().int().min(1).max(7 * 24 * 60).optional(),
  escalationAfterMinutes: z.coerce.number().int().min(1).max(14 * 24 * 60).optional()
});
const unifiedIncidentSlaSummaryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(10)
});
const unifiedIncidentEscalationTriggerSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  actor: z.string().max(120).optional()
});
const unifiedIncidentEscalationConfigUpdateSchema = z.object({
  autoEnabled: z.boolean().optional(),
  autoCooldownMinutes: z.coerce.number().int().min(1).max(24 * 60).optional()
});
const unifiedIncidentEscalationListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  incidentId: z.string().min(1).optional()
});
const unifiedIncidentEscalationExportQuerySchema = z.object({
  format: z.enum(['json', 'csv']).default('json'),
  limit: z.coerce.number().int().min(1).max(1000).default(500),
  incidentId: z.string().min(1).optional()
});
const unifiedIncidentEscalationNotificationUpdateSchema = z.object({
  notificationStatus: z.enum(['pending', 'sent', 'failed']),
  notificationMessage: z.string().max(1000).optional()
});
const unifiedIncidentNotificationConfigUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  endpoint: z.string().max(2000).optional(),
  authHeader: z.string().max(2000).optional(),
  timeoutMs: z.coerce.number().int().min(500).max(60_000).optional(),
  maxRetries: z.coerce.number().int().min(0).max(10).optional(),
  retryBaseDelaySeconds: z.coerce.number().int().min(1).max(3600).optional()
});
const unifiedIncidentNotificationProcessSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional()
});
const unifiedIncidentNotificationDeliveryListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(2000).default(200),
  escalationId: z.string().min(1).optional(),
  incidentId: z.string().min(1).optional(),
  status: z.enum(['sent', 'failed']).optional()
});
const unifiedIncidentNotificationDeliveryExportQuerySchema = z.object({
  format: z.enum(['json', 'csv']).default('json'),
  limit: z.coerce.number().int().min(1).max(2000).default(500),
  escalationId: z.string().min(1).optional(),
  incidentId: z.string().min(1).optional(),
  status: z.enum(['sent', 'failed']).optional()
});
const runtimeAlertExportQuerySchema = z.object({
  format: z.enum(['json', 'csv']).default('json'),
  limit: z.coerce.number().int().min(1).max(200).default(200)
});
const runtimeAlertAckSchema = z.object({
  eventId: z.string().min(1).optional(),
  actor: z.string().min(1).max(120).optional(),
  silenceMinutes: z.coerce.number().int().min(0).max(24 * 60).optional()
});
const failureInjectionReportQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100)
});
const failureInjectionConfigUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  ratio: z.coerce.number().min(0).max(1).optional(),
  taskTypes: z.array(z.enum(['video', 'audio', 'video_merge'])).max(3).optional(),
  errorCodes: z
    .array(z.enum(['CAPABILITY_MISMATCH', 'PROVIDER_AUTH_FAILED', 'PROVIDER_RATE_LIMITED', 'PROVIDER_TIMEOUT', 'PROVIDER_UNKNOWN']))
    .min(1)
    .max(5)
    .optional()
});
const failureInjectionExportQuerySchema = z.object({
  format: z.enum(['json', 'csv']).default('json'),
  limit: z.coerce.number().int().min(1).max(500).default(200),
  taskType: z.enum(['video', 'audio', 'video_merge']).optional(),
  errorCode: z.enum(['CAPABILITY_MISMATCH', 'PROVIDER_AUTH_FAILED', 'PROVIDER_RATE_LIMITED', 'PROVIDER_TIMEOUT', 'PROVIDER_UNKNOWN']).optional()
});

type TasksRouterDeps = {
  adminAuditService?: AdminAuditService;
};

export const buildTasksRouter = (service: TasksService, deps: TasksRouterDeps = {}): Router => {
  const router = Router();
  const adminAuditService = deps.adminAuditService;
  const adminOnly = requireRole('admin');
  const fail = (res: Response, status: number, message: string, bizCode: string) =>
    res.status(status).json({ message, bizCode });
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
      scope: 'tasks',
      action,
      actorId: typeof auth.uid === 'string' ? auth.uid : 'unknown',
      actorRole: typeof auth.role === 'string' ? auth.role : 'unknown',
      requestId: requestContext.requestId,
      targetId,
      details
    });
  };

  router.get('/video/metrics', (_req, res) => {
    return res.json(service.getVideoTaskMetrics());
  });

  router.get('/catalog', (_req, res) => {
    return res.json(service.getTaskTypeCatalog());
  });
  router.get('/catalog/contract-check', (_req, res) => {
    return res.json(service.getTaskTypeCatalogContractCheck());
  });
  router.get('/catalog/alerts', (req, res) => {
    const query = parseQuery(catalogAlertListQuerySchema, req.query, res, fail);
    if (!query) {
      return;
    }
    return res.json(service.getTaskCatalogAlertEvents({ limit: query.limit }));
  });
  router.get('/catalog/alerts/export', (req, res) => {
    const query = parseQuery(catalogAlertExportQuerySchema, req.query, res, fail);
    if (!query) {
      return;
    }
    const exported = service.exportTaskCatalogAlertEvents({
      format: query.format,
      limit: query.limit
    });
    res.setHeader('Content-Type', exported.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`);
    return res.send(exported.body);
  });
  router.get('/alerts/unified', (req, res) => {
    const query = parseQuery(unifiedAlertListQuerySchema, req.query, res, fail);
    if (!query) {
      return;
    }
    return res.json(service.getUnifiedAlertState(query));
  });
  router.get('/alerts/unified/export', (req, res) => {
    const query = parseQuery(unifiedAlertExportQuerySchema, req.query, res, fail);
    if (!query) {
      return;
    }
    const exported = service.exportUnifiedAlertState(query);
    res.setHeader('Content-Type', exported.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`);
    return res.send(exported.body);
  });
  router.get('/alerts/unified/policy', (_req, res) => {
    return res.json(service.getUnifiedAlertPolicyConfig());
  });
  router.patch('/alerts/unified/policy', adminOnly, (req, res) => {
    const payload = parsePayload(unifiedAlertPolicyUpdateSchema, req.body, res, fail);
    if (!payload) {
      return;
    }
    const result = service.updateUnifiedAlertPolicyConfig(payload);
    recordAdminAudit(res, 'tasks.unified-alert.policy.update', 'unified-alert-policy', payload);
    return res.json(result);
  });
  router.get('/alerts/unified/actions', (req, res) => {
    const query = parseQuery(unifiedAlertActionListQuerySchema, req.query, res, fail);
    if (!query) {
      return;
    }
    return res.json(service.getUnifiedAlertActionLogs(query));
  });
  router.get('/alerts/unified/actions/export', (req, res) => {
    const query = parseQuery(unifiedAlertActionExportQuerySchema, req.query, res, fail);
    if (!query) {
      return;
    }
    const exported = service.exportUnifiedAlertActionLogs(query);
    res.setHeader('Content-Type', exported.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`);
    return res.send(exported.body);
  });
  router.get('/alerts/unified/incidents', (req, res) => {
    const query = parseQuery(unifiedIncidentListQuerySchema, req.query, res, fail);
    if (!query) {
      return;
    }
    return res.json(service.getUnifiedAlertIncidents(query));
  });
  router.patch('/alerts/unified/incidents/:incidentId', adminOnly, (req, res) => {
    const payload = parsePayload(unifiedIncidentUpdateSchema, req.body, res, fail);
    if (!payload) {
      return;
    }
    const updated = service.updateUnifiedAlertIncident({
      incidentId: req.params.incidentId,
      status: payload.status,
      assignee: payload.assignee,
      note: payload.note
    });
    if (!updated) {
      return fail(res, 404, 'Unified alert incident not found', BIZ_CODE.NOT_FOUND);
    }
    recordAdminAudit(res, 'tasks.unified-alert.incident.update', req.params.incidentId, payload);
    return res.json(updated);
  });
  router.get('/alerts/unified/incidents/export', (req, res) => {
    const query = parseQuery(unifiedIncidentExportQuerySchema, req.query, res, fail);
    if (!query) {
      return;
    }
    const exported = service.exportUnifiedAlertIncidents(query);
    res.setHeader('Content-Type', exported.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`);
    return res.send(exported.body);
  });
  router.get('/alerts/unified/incidents/sla-config', (_req, res) => {
    return res.json(service.getUnifiedAlertIncidentSlaConfig());
  });
  router.patch('/alerts/unified/incidents/sla-config', adminOnly, (req, res) => {
    const payload = parsePayload(unifiedIncidentSlaConfigUpdateSchema, req.body, res, fail);
    if (!payload) {
      return;
    }
    const result = service.updateUnifiedAlertIncidentSlaConfig(payload);
    recordAdminAudit(res, 'tasks.unified-alert.sla.update', 'unified-alert-sla', payload);
    return res.json(result);
  });
  router.get('/alerts/unified/incidents/sla-summary', (req, res) => {
    const query = parseQuery(unifiedIncidentSlaSummaryQuerySchema, req.query, res, fail);
    if (!query) {
      return;
    }
    return res.json(service.getUnifiedAlertIncidentSlaSummary(query));
  });
  router.post('/alerts/unified/incidents/escalate', adminOnly, (req, res) => {
    const payload = parsePayload(unifiedIncidentEscalationTriggerSchema, req.body, res, fail);
    if (!payload) {
      return;
    }
    const result = service.triggerUnifiedAlertIncidentEscalations(payload);
    recordAdminAudit(res, 'tasks.unified-alert.escalate.trigger', 'unified-alert-escalations', {
      limit: payload.limit,
      created: result.created,
      skipped: result.skipped
    });
    return res.json(result);
  });
  router.get('/alerts/unified/incidents/escalate/config', (_req, res) => {
    return res.json(service.getUnifiedAlertIncidentEscalationConfig());
  });
  router.patch('/alerts/unified/incidents/escalate/config', adminOnly, (req, res) => {
    const payload = parsePayload(unifiedIncidentEscalationConfigUpdateSchema, req.body, res, fail);
    if (!payload) {
      return;
    }
    const result = service.updateUnifiedAlertIncidentEscalationConfig(payload);
    recordAdminAudit(res, 'tasks.unified-alert.escalation-config.update', 'unified-alert-escalation-config', payload);
    return res.json(result);
  });
  router.get('/alerts/unified/incidents/escalations', (req, res) => {
    const query = parseQuery(unifiedIncidentEscalationListQuerySchema, req.query, res, fail);
    if (!query) {
      return;
    }
    return res.json(service.getUnifiedAlertIncidentEscalationLogs(query));
  });
  router.get('/alerts/unified/incidents/escalations/export', (req, res) => {
    const query = parseQuery(unifiedIncidentEscalationExportQuerySchema, req.query, res, fail);
    if (!query) {
      return;
    }
    const exported = service.exportUnifiedAlertIncidentEscalationLogs(query);
    res.setHeader('Content-Type', exported.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`);
    return res.send(exported.body);
  });
  router.patch('/alerts/unified/incidents/escalations/:escalationId', adminOnly, (req, res) => {
    const payload = parsePayload(unifiedIncidentEscalationNotificationUpdateSchema, req.body, res, fail);
    if (!payload) {
      return;
    }
    const updated = service.updateUnifiedAlertIncidentEscalationNotification({
      escalationId: req.params.escalationId,
      notificationStatus: payload.notificationStatus,
      notificationMessage: payload.notificationMessage
    });
    if (!updated) {
      return fail(res, 404, 'Unified alert incident escalation not found', BIZ_CODE.NOT_FOUND);
    }
    recordAdminAudit(res, 'tasks.unified-alert.escalation.update', req.params.escalationId, payload);
    return res.json(updated);
  });
  router.get('/alerts/unified/incidents/notification/config', (_req, res) => {
    return res.json(service.getUnifiedAlertIncidentNotificationConfig());
  });
  router.patch('/alerts/unified/incidents/notification/config', adminOnly, (req, res) => {
    const payload = parsePayload(unifiedIncidentNotificationConfigUpdateSchema, req.body, res, fail);
    if (!payload) {
      return;
    }
    const result = service.updateUnifiedAlertIncidentNotificationConfig(payload);
    recordAdminAudit(res, 'tasks.unified-alert.notification-config.update', 'unified-alert-notification-config', {
      ...payload,
      authHeader: payload.authHeader ? '[redacted]' : undefined
    });
    return res.json(result);
  });
  router.post('/alerts/unified/incidents/notification/process', adminOnly, async (req, res) => {
    const payload = parsePayload(unifiedIncidentNotificationProcessSchema, req.body, res, fail);
    if (!payload) {
      return;
    }
    const result = await service.processUnifiedAlertIncidentEscalationNotifications(payload);
    recordAdminAudit(res, 'tasks.unified-alert.notification.process', 'unified-alert-notifications', {
      limit: payload.limit,
      ...result
    });
    return res.json(result);
  });
  router.get('/alerts/unified/incidents/notification/delivery-logs', (req, res) => {
    const query = parseQuery(unifiedIncidentNotificationDeliveryListQuerySchema, req.query, res, fail);
    if (!query) {
      return;
    }
    return res.json(service.getUnifiedAlertIncidentNotificationDeliveryLogs(query));
  });
  router.get('/alerts/unified/incidents/notification/delivery-logs/export', (req, res) => {
    const query = parseQuery(unifiedIncidentNotificationDeliveryExportQuerySchema, req.query, res, fail);
    if (!query) {
      return;
    }
    const exported = service.exportUnifiedAlertIncidentNotificationDeliveryLogs(query);
    res.setHeader('Content-Type', exported.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`);
    return res.send(exported.body);
  });

  router.get('/video/runtime', (_req, res) => {
    return res.json(service.getVideoTaskRuntimeSnapshot());
  });
  router.get('/video/runtime/health', (req, res) => {
    const query = parseQuery(runtimeHealthQuerySchema, req.query, res, fail);
    if (!query) {
      return;
    }
    return res.json(service.getVideoTaskRuntimeHealth({ limit: query.limit }));
  });
  router.get('/video/runtime/reconcile', adminOnly, (req, res) => {
    const query = parseQuery(runtimeReconcileQuerySchema, req.query, res, fail);
    if (!query) {
      return;
    }
    return res.json(
      service.getRuntimeReconcileSummary({
        limit: query.limit,
        staleAfterMinutes: query.staleAfterMinutes
      })
    );
  });

  router.get('/video/runtime-alert-config', (_req, res) => {
    return res.json(service.getQueueRuntimeAlertConfig());
  });

  router.patch('/video/runtime-alert-config', adminOnly, (req, res) => {
    const payload = parsePayload(updateQueueAlertSchema, req.body, res, fail);
    if (!payload) {
      return;
    }
    const result = service.updateQueueRuntimeAlertConfig(payload);
    recordAdminAudit(res, 'tasks.runtime-alert-config.update', 'queue-runtime-alert-config', payload);
    return res.json(result);
  });
  router.get('/video/runtime-alerts', (req, res) => {
    const query = parseQuery(runtimeAlertListQuerySchema, req.query, res, fail);
    if (!query) {
      return;
    }
    return res.json(service.getQueueRuntimeAlertState({ limit: query.limit }));
  });
  router.get('/video/runtime-alerts/export', (req, res) => {
    const query = parseQuery(runtimeAlertExportQuerySchema, req.query, res, fail);
    if (!query) {
      return;
    }
    const exported = service.exportQueueRuntimeAlerts({
      format: query.format,
      limit: query.limit
    });
    res.setHeader('Content-Type', exported.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`);
    return res.send(exported.body);
  });
  router.post('/video/runtime-alerts/ack', adminOnly, (req, res) => {
    const payload = parsePayload(runtimeAlertAckSchema, req.body, res, fail);
    if (!payload) {
      return;
    }
    const result = service.acknowledgeQueueRuntimeAlerts(payload);
    recordAdminAudit(res, 'tasks.runtime-alerts.ack', payload.eventId ?? 'all', {
      actor: payload.actor,
      silenceMinutes: payload.silenceMinutes
    });
    return res.json(result);
  });
  router.get('/video/failure-injection/report', (req, res) => {
    const query = parseQuery(failureInjectionReportQuerySchema, req.query, res, fail);
    if (!query) {
      return;
    }
    return res.json(service.getFailureInjectionReport({ limit: query.limit }));
  });
  router.get('/video/failure-injection/config', (_req, res) => {
    return res.json(service.getFailureInjectionConfig());
  });
  router.get('/video/slo-config', (_req, res) => {
    return res.json(service.getTaskSloConfig());
  });
  router.patch('/video/slo-config', adminOnly, (req, res) => {
    const payload = parsePayload(updateTaskSloConfigSchema, req.body, res, fail);
    if (!payload) {
      return;
    }
    const result = service.updateTaskSloConfig(payload);
    recordAdminAudit(res, 'tasks.slo-config.update', 'task-slo-config', payload);
    return res.json(result);
  });
  router.get('/video/slo-state', (_req, res) => {
    return res.json(service.getTaskSloState());
  });
  router.get('/video/quota-config', (_req, res) => {
    return res.json(service.getTaskQuotaConfig());
  });
  router.patch('/video/quota-config', adminOnly, (req, res) => {
    const payload = parsePayload(updateTaskQuotaConfigSchema, req.body, res, fail);
    if (!payload) {
      return;
    }
    const result = service.updateTaskQuotaConfig(payload);
    recordAdminAudit(res, 'tasks.quota-config.update', 'task-quota-config', {
      updatedKeys: Object.keys(payload)
    });
    return res.json(result);
  });
  router.get('/video/quota-usage', (req, res) => {
    const query = parseQuery(taskQuotaUsageQuerySchema, req.query, res, fail);
    if (!query) {
      return;
    }
    return res.json(service.getTaskQuotaUsage(query.projectId));
  });
  router.get('/video/quota-rejects', (req, res) => {
    const query = parseQuery(taskQuotaRejectListQuerySchema, req.query, res, fail);
    if (!query) {
      return;
    }
    return res.json(service.getTaskQuotaRejectEvents(query));
  });
  router.get('/video/quota-rejects/export', (req, res) => {
    const query = parseQuery(taskQuotaRejectExportQuerySchema, req.query, res, fail);
    if (!query) {
      return;
    }
    const exported = service.exportTaskQuotaRejectEvents(query);
    res.setHeader('Content-Type', exported.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`);
    return res.send(exported.body);
  });
  router.get('/video/quota-usage-events', (req, res) => {
    const query = parseQuery(taskQuotaUsageEventListQuerySchema, req.query, res, fail);
    if (!query) {
      return;
    }
    return res.json(service.getTaskQuotaUsageEvents(query));
  });
  router.get('/video/quota-usage-events/export', (req, res) => {
    const query = parseQuery(taskQuotaUsageEventExportQuerySchema, req.query, res, fail);
    if (!query) {
      return;
    }
    const exported = service.exportTaskQuotaUsageEvents(query);
    res.setHeader('Content-Type', exported.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`);
    return res.send(exported.body);
  });
  router.patch('/video/failure-injection/config', adminOnly, (req, res) => {
    const payload = parsePayload(failureInjectionConfigUpdateSchema, req.body, res, fail);
    if (!payload) {
      return;
    }
    const result = service.updateFailureInjectionConfig(payload);
    recordAdminAudit(res, 'tasks.failure-injection.update', 'failure-injection-config', payload);
    return res.json(result);
  });
  router.get('/video/failure-injection/export', (req, res) => {
    const query = parseQuery(failureInjectionExportQuerySchema, req.query, res, fail);
    if (!query) {
      return;
    }
    const exported = service.exportFailureInjectionEvents(query);
    res.setHeader('Content-Type', exported.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`);
    return res.send(exported.body);
  });
  router.post('/video/failure-injection/reset', adminOnly, (_req, res) => {
    const result = service.clearFailureInjectionEvents();
    recordAdminAudit(res, 'tasks.failure-injection.reset', 'failure-injection-events', result);
    return res.json(result);
  });

  router.get('/video', (req, res) => {
    const query = parseQuery(listQuerySchema, req.query, res, fail);
    if (!query) {
      return;
    }
    return res.json(service.listVideoTasks(query));
  });

  router.get('/video/:taskId/detail', (req, res) => {
    const query = parseQuery(eventsQuerySchema, req.query, res, fail);
    if (!query) {
      return;
    }
    const detail = service.getVideoTaskDetail(req.params.taskId, query.limit);
    if (!detail) {
      return fail(res, 404, 'Video task not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(detail);
  });

  router.post('/video/:taskId/retry', async (req, res) => {
    const task = await service.retryVideoTask(req.params.taskId);
    if (!task) {
      return fail(res, 404, 'Video task not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(task);
  });

  router.post('/video/:taskId/cancel', async (req, res) => {
    const task = await service.cancelVideoTask(req.params.taskId);
    if (!task) {
      return fail(res, 404, 'Video task not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(task);
  });

  router.post('/video/batch/retry', async (req, res) => {
    const payload = parsePayload(batchActionSchema, req.body, res, fail);
    if (!payload) {
      return;
    }

    const result = await service.batchRetryVideoTasks(payload.taskIds);
    return res.json(result);
  });

  router.post('/video/batch/cancel', async (req, res) => {
    const payload = parsePayload(batchActionSchema, req.body, res, fail);
    if (!payload) {
      return;
    }

    const result = await service.batchCancelVideoTasks(payload.taskIds);
    return res.json(result);
  });

  router.post('/video/batch/repair-by-policy', adminOnly, async (req, res) => {
    const payload = parsePayload(batchActionSchema, req.body, res, fail);
    if (!payload) {
      return;
    }
    const result = await service.batchRepairVideoTasksByPolicy(payload.taskIds);
    recordAdminAudit(res, 'tasks.batch-repair.run', 'video-task-batch-repair', {
      taskCount: payload.taskIds.length,
      retried: result.retried.length,
      recreated: result.recreated.length,
      manual: result.manualIds.length,
      unchanged: result.unchangedIds.length,
      notFound: result.notFoundIds.length
    });
    return res.json(result);
  });

  router.post('/video/batch/repair-by-policy/query', adminOnly, async (req, res) => {
    const payload = parsePayload(batchRepairByPolicyQuerySchema, req.body, res, fail);
    if (!payload) {
      return;
    }
    const result = await service.batchRepairVideoTasksByPolicyQuery(payload);
    recordAdminAudit(res, 'tasks.batch-repair.query-run', 'video-task-batch-repair-query', {
      maxCount: payload.maxCount,
      status: payload.status,
      providerErrorCode: payload.providerErrorCode,
      matchedCount: result.matchedCount ?? 0,
      retried: result.retried.length,
      recreated: result.recreated.length,
      manual: result.manualIds.length,
      unchanged: result.unchangedIds.length,
      notFound: result.notFoundIds.length
    });
    return res.json(result);
  });

  router.get('/video/:taskId/events', (req, res) => {
    const query = parseQuery(eventsQuerySchema, req.query, res, fail);
    if (!query) {
      return;
    }
    return res.json(service.listVideoTaskEvents(req.params.taskId, query.limit));
  });

  router.get('/video/:taskId/events/export', (req, res) => {
    const query = parseQuery(exportEventsQuerySchema, req.query, res, fail);
    if (!query) {
      return;
    }
    const exported = service.exportVideoTaskEvents(req.params.taskId, query);
    if (!exported) {
      return fail(res, 404, 'Video task not found', BIZ_CODE.NOT_FOUND);
    }
    res.setHeader('Content-Type', exported.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`);
    return res.send(exported.body);
  });

  router.get('/video/:taskId/events/export/count', (req, res) => {
    const query = parseQuery(exportEventsQuerySchema.omit({ format: true, limit: true }), req.query, res, fail);
    if (!query) {
      return;
    }
    const result = service.countVideoTaskEventsForExport(req.params.taskId, query);
    if (!result) {
      return fail(res, 404, 'Video task not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(result);
  });

  return router;
};
