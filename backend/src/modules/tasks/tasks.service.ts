import {
  FailureInjectionConfig,
  FailureInjectionReport,
  PageResult,
  TaskQuotaConfig,
  TaskQuotaRejectEvent,
  TaskQuotaUsageEvent,
  TaskQuotaUsage,
  TaskSloConfig,
  TaskSloState,
  QueueRuntimeAlertConfig,
  QueueRuntimeAlertState,
  RuntimeTaskReconcileSummary,
  TaskCatalogAlertEvent,
  TaskUnifiedAlertActionLog,
  TaskUnifiedAlertIncident,
  TaskUnifiedAlertIncidentEscalationConfig,
  TaskUnifiedAlertIncidentEscalationLog,
  TaskUnifiedAlertIncidentNotificationDeliveryLog,
  TaskUnifiedAlertIncidentNotificationConfig,
  TaskUnifiedAlertIncidentSlaConfig,
  TaskUnifiedAlertIncidentSlaSummary,
  TaskUnifiedAlertPolicyConfig,
  TaskUnifiedAlertState,
  VideoTask,
  VideoTaskEvent,
  VideoTaskListItem,
  VideoTaskMetrics,
  VideoTaskRuntimeHealth,
  VideoTaskRuntimeSnapshot
} from '../../core/types.js';
import { SqliteStore } from '../../db/sqlite.js';
import { PipelineService } from '../pipeline/pipeline.service.js';
import { TaskEventService } from '../runtime/task-event.service.js';
import { TaskQueryService, type VideoTaskDetail } from '../runtime/task-query.service.js';
import { QueueRuntimeAlertService } from '../runtime/queue-runtime-alert.service.js';
import { TaskQuotaService } from '../runtime/task-quota.service.js';
import { TaskReconcileService } from '../runtime/task-reconcile.service.js';
import { BatchActionResult, BatchRepairByPolicyResult, TaskRepairService } from '../runtime/task-repair.service.js';
import { TaskRuntimeService } from '../runtime/task-runtime.service.js';
import { TaskSloService } from '../runtime/task-slo.service.js';
import { UnifiedAlertIncidentService } from '../runtime/unified-alert-incident.service.js';
import { UnifiedAlertStateService } from '../runtime/unified-alert-state.service.js';
import { createRuntimeModule, type RuntimeModule } from '../runtime/runtime.module.js';
import { TaskCatalogAlertService } from './task-catalog-alert.service.js';
import { TASK_TYPE_CATALOG, TaskCatalogItem } from './task-type-catalog.js';
import { TaskCatalogContractCheckResult } from './task-catalog-contract.js';

export class TasksService {
  private readonly taskQueryService: TaskQueryService;
  private readonly taskEventService: TaskEventService;
  private readonly taskRuntimeService: TaskRuntimeService;
  private readonly queueRuntimeAlertService: QueueRuntimeAlertService;
  private readonly taskSloService: TaskSloService;
  private readonly taskQuotaService: TaskQuotaService;
  private readonly taskReconcileService: TaskReconcileService;
  private readonly taskRepairService: TaskRepairService;
  private readonly taskCatalogAlertService: TaskCatalogAlertService;
  private readonly unifiedAlertStateService: UnifiedAlertStateService;
  private readonly unifiedAlertIncidentService: UnifiedAlertIncidentService;

  constructor(
    private readonly store: SqliteStore,
    private readonly pipelineService: PipelineService,
    runtimeModule: RuntimeModule = createRuntimeModule({ store, pipelineService })
  ) {
    this.taskQueryService = runtimeModule.taskQueryService;
    this.taskEventService = runtimeModule.taskEventService;
    this.taskRuntimeService = runtimeModule.taskRuntimeService;
    this.queueRuntimeAlertService = runtimeModule.queueRuntimeAlertService;
    this.taskSloService = runtimeModule.taskSloService;
    this.taskQuotaService = runtimeModule.taskQuotaService;
    this.taskReconcileService = runtimeModule.taskReconcileService;
    this.taskRepairService = runtimeModule.taskRepairService;
    this.taskCatalogAlertService = runtimeModule.taskCatalogAlertService;
    this.unifiedAlertStateService = runtimeModule.unifiedAlertStateService;
    this.unifiedAlertIncidentService = runtimeModule.unifiedAlertIncidentService;
  }

  listVideoTasks(input: {
    q?: string;
    providerTaskId?: string;
    providerErrorCode?: string;
    status?: 'queued' | 'submitting' | 'polling' | 'running' | 'done' | 'failed' | 'cancelled';
    createdFrom?: string;
    createdTo?: string;
    sortBy?: 'createdAt' | 'updatedAt' | 'priority' | 'status';
    order?: 'asc' | 'desc';
    page: number;
    pageSize: number;
  }): PageResult<VideoTaskListItem> {
    return this.taskQueryService.listVideoTasks(input);
  }

  async retryVideoTask(taskId: string): Promise<VideoTask | null> {
    const task = this.store.getVideoTaskById(taskId);
    if (!task) {
      return null;
    }
    return this.pipelineService.retryVideoTask(task.projectId, taskId);
  }

  async cancelVideoTask(taskId: string): Promise<VideoTask | null> {
    const task = this.store.getVideoTaskById(taskId);
    if (!task) {
      return null;
    }
    return this.pipelineService.cancelVideoTask(task.projectId, taskId);
  }

  listVideoTaskEvents(taskId: string, limit = 50): VideoTaskEvent[] {
    return this.taskEventService.listVideoTaskEvents(taskId, limit);
  }

  exportVideoTaskEvents(
    taskId: string,
    input: {
      format: 'json' | 'csv';
      status?: 'queued' | 'submitting' | 'polling' | 'running' | 'done' | 'failed' | 'cancelled';
      q?: string;
      createdFrom?: string;
      createdTo?: string;
      limit: number;
    }
  ): { filename: string; contentType: string; body: string } | null {
    return this.taskEventService.exportVideoTaskEvents(taskId, input);
  }

  countVideoTaskEventsForExport(
    taskId: string,
    input: {
      status?: 'queued' | 'submitting' | 'polling' | 'running' | 'done' | 'failed' | 'cancelled';
      q?: string;
      createdFrom?: string;
      createdTo?: string;
    }
  ): { count: number } | null {
    return this.taskEventService.countVideoTaskEventsForExport(taskId, input);
  }

  getVideoTaskMetrics(): VideoTaskMetrics {
    return this.taskQueryService.getVideoTaskMetrics();
  }

  getVideoTaskRuntimeSnapshot(): VideoTaskRuntimeSnapshot {
    return this.taskRuntimeService.getVideoTaskRuntimeSnapshot();
  }

  getFailureInjectionReport(input?: { limit?: number }): FailureInjectionReport {
    return this.pipelineService.getFailureInjectionReport(input?.limit ?? 100);
  }

  clearFailureInjectionEvents(): { cleared: number } {
    return this.pipelineService.clearFailureInjectionEvents();
  }

  getFailureInjectionConfig(): FailureInjectionConfig {
    return this.pipelineService.getFailureInjectionConfig();
  }

  updateFailureInjectionConfig(input: {
    enabled?: boolean;
    ratio?: number;
    taskTypes?: Array<'video' | 'audio' | 'video_merge'>;
    errorCodes?: Array<'CAPABILITY_MISMATCH' | 'PROVIDER_AUTH_FAILED' | 'PROVIDER_RATE_LIMITED' | 'PROVIDER_TIMEOUT' | 'PROVIDER_UNKNOWN'>;
  }): FailureInjectionConfig {
    return this.pipelineService.updateFailureInjectionConfig(input);
  }

  exportFailureInjectionEvents(input: {
    format: 'json' | 'csv';
    limit?: number;
    taskType?: 'video' | 'audio' | 'video_merge';
    errorCode?: 'CAPABILITY_MISMATCH' | 'PROVIDER_AUTH_FAILED' | 'PROVIDER_RATE_LIMITED' | 'PROVIDER_TIMEOUT' | 'PROVIDER_UNKNOWN';
  }): { filename: string; contentType: string; body: string } {
    return this.pipelineService.exportFailureInjectionEvents(input);
  }

  getVideoTaskRuntimeHealth(input?: { limit?: number }): VideoTaskRuntimeHealth {
    const alertConfig = this.queueRuntimeAlertService.getQueueRuntimeAlertConfig();
    const health = this.taskRuntimeService.getVideoTaskRuntimeHealth({
      limit: input?.limit ?? 30,
      alertConfig
    });
    this.queueRuntimeAlertService.recordQueueRuntimeAlertEvent({
      level: health.congestionLevel,
      reason: health.congestionReason,
      snapshot: health.snapshot,
      config: alertConfig
    });
    return health;
  }

  getRuntimeReconcileSummary(input?: { limit?: number; staleAfterMinutes?: number }): RuntimeTaskReconcileSummary {
    return this.taskReconcileService.getRuntimeReconcileSummary(input);
  }

  getQueueRuntimeAlertState(input?: { limit?: number }): QueueRuntimeAlertState {
    return this.queueRuntimeAlertService.getQueueRuntimeAlertState(input);
  }

  exportQueueRuntimeAlerts(input: { format: 'json' | 'csv'; limit: number }): { filename: string; contentType: string; body: string } {
    return this.queueRuntimeAlertService.exportQueueRuntimeAlerts(input);
  }

  acknowledgeQueueRuntimeAlerts(input?: {
    eventId?: string;
    actor?: string;
    silenceMinutes?: number;
  }): QueueRuntimeAlertState {
    return this.queueRuntimeAlertService.acknowledgeQueueRuntimeAlerts(input);
  }

  getTaskTypeCatalog(): TaskCatalogItem[] {
    return TASK_TYPE_CATALOG;
  }

  getTaskTypeCatalogContractCheck(): TaskCatalogContractCheckResult {
    return this.taskCatalogAlertService.getTaskTypeCatalogContractCheck();
  }

  getTaskCatalogAlertEvents(input?: { limit?: number }): TaskCatalogAlertEvent[] {
    return this.taskCatalogAlertService.getTaskCatalogAlertEvents(input);
  }

  exportTaskCatalogAlertEvents(input: { format: 'json' | 'csv'; limit: number }): { filename: string; contentType: string; body: string } {
    return this.taskCatalogAlertService.exportTaskCatalogAlertEvents(input);
  }

  getUnifiedAlertState(input?: { limit?: number; windowMinutes?: number }): TaskUnifiedAlertState {
    return this.unifiedAlertStateService.getUnifiedAlertState(input);
  }

  exportUnifiedAlertState(input: { format: 'json' | 'csv'; limit: number; windowMinutes: number }): {
    filename: string;
    contentType: string;
    body: string;
  } {
    return this.unifiedAlertStateService.exportUnifiedAlertState(input);
  }

  getUnifiedAlertPolicyConfig(): TaskUnifiedAlertPolicyConfig {
    return this.unifiedAlertStateService.getUnifiedAlertPolicyConfig();
  }

  updateUnifiedAlertPolicyConfig(input: {
    redTotalThreshold?: number;
    redQueueThreshold?: number;
    redContractThreshold?: number;
    cooldownMinutes?: number;
  }): TaskUnifiedAlertPolicyConfig {
    return this.unifiedAlertStateService.updateUnifiedAlertPolicyConfig(input);
  }

  getUnifiedAlertActionLogs(input?: { limit?: number }): TaskUnifiedAlertActionLog[] {
    return this.unifiedAlertStateService.getUnifiedAlertActionLogs(input);
  }

  exportUnifiedAlertActionLogs(input: { format: 'json' | 'csv'; limit: number }): {
    filename: string;
    contentType: string;
    body: string;
  } {
    return this.unifiedAlertStateService.exportUnifiedAlertActionLogs(input);
  }

  getUnifiedAlertIncidents(input?: { limit?: number; status?: 'open' | 'resolved' }): TaskUnifiedAlertIncident[] {
    return this.unifiedAlertIncidentService.getUnifiedAlertIncidents(input);
  }

  updateUnifiedAlertIncident(input: {
    incidentId: string;
    status?: 'open' | 'resolved';
    assignee?: string;
    note?: string;
  }): TaskUnifiedAlertIncident | null {
    return this.unifiedAlertIncidentService.updateUnifiedAlertIncident(input);
  }

  exportUnifiedAlertIncidents(input: { format: 'json' | 'csv'; limit: number; status?: 'open' | 'resolved' }): {
    filename: string;
    contentType: string;
    body: string;
  } {
    return this.unifiedAlertIncidentService.exportUnifiedAlertIncidents(input);
  }

  getUnifiedAlertIncidentSlaConfig(): TaskUnifiedAlertIncidentSlaConfig {
    return this.unifiedAlertIncidentService.getUnifiedAlertIncidentSlaConfig();
  }

  updateUnifiedAlertIncidentSlaConfig(input: {
    warnAfterMinutes?: number;
    criticalAfterMinutes?: number;
    escalationAfterMinutes?: number;
  }): TaskUnifiedAlertIncidentSlaConfig {
    return this.unifiedAlertIncidentService.updateUnifiedAlertIncidentSlaConfig(input);
  }

  getUnifiedAlertIncidentEscalationConfig(): TaskUnifiedAlertIncidentEscalationConfig {
    return this.unifiedAlertIncidentService.getUnifiedAlertIncidentEscalationConfig();
  }

  updateUnifiedAlertIncidentEscalationConfig(input: {
    autoEnabled?: boolean;
    autoCooldownMinutes?: number;
  }): TaskUnifiedAlertIncidentEscalationConfig {
    return this.unifiedAlertIncidentService.updateUnifiedAlertIncidentEscalationConfig(input);
  }

  getUnifiedAlertIncidentNotificationConfig(): TaskUnifiedAlertIncidentNotificationConfig {
    return this.unifiedAlertIncidentService.getUnifiedAlertIncidentNotificationConfig();
  }

  updateUnifiedAlertIncidentNotificationConfig(input: {
    enabled?: boolean;
    endpoint?: string;
    authHeader?: string;
    timeoutMs?: number;
    maxRetries?: number;
    retryBaseDelaySeconds?: number;
  }): TaskUnifiedAlertIncidentNotificationConfig {
    return this.unifiedAlertIncidentService.updateUnifiedAlertIncidentNotificationConfig(input);
  }

  getUnifiedAlertIncidentSlaSummary(input?: { limit?: number; nowIso?: string }): TaskUnifiedAlertIncidentSlaSummary {
    return this.unifiedAlertIncidentService.getUnifiedAlertIncidentSlaSummary(input);
  }

  triggerUnifiedAlertIncidentEscalations(input?: { limit?: number; actor?: string }): {
    created: number;
    skipped: number;
    logs: TaskUnifiedAlertIncidentEscalationLog[];
  } {
    return this.unifiedAlertIncidentService.triggerUnifiedAlertIncidentEscalations(input);
  }

  getUnifiedAlertIncidentEscalationLogs(input?: { limit?: number; incidentId?: string }): TaskUnifiedAlertIncidentEscalationLog[] {
    return this.unifiedAlertIncidentService.getUnifiedAlertIncidentEscalationLogs(input);
  }

  exportUnifiedAlertIncidentEscalationLogs(input: { format: 'json' | 'csv'; limit: number; incidentId?: string }): {
    filename: string;
    contentType: string;
    body: string;
  } {
    return this.unifiedAlertIncidentService.exportUnifiedAlertIncidentEscalationLogs(input);
  }

  updateUnifiedAlertIncidentEscalationNotification(input: {
    escalationId: string;
    notificationStatus: 'pending' | 'sent' | 'failed';
    notificationMessage?: string;
  }): TaskUnifiedAlertIncidentEscalationLog | null {
    return this.unifiedAlertIncidentService.updateUnifiedAlertIncidentEscalationNotification(input);
  }

  async processUnifiedAlertIncidentEscalationNotifications(input?: {
    limit?: number;
  }): Promise<{ processed: number; sent: number; failed: number; skipped: number }> {
    return this.unifiedAlertIncidentService.processUnifiedAlertIncidentEscalationNotifications(input);
  }

  getUnifiedAlertIncidentNotificationDeliveryLogs(input?: {
    limit?: number;
    escalationId?: string;
    incidentId?: string;
    status?: 'sent' | 'failed';
  }): TaskUnifiedAlertIncidentNotificationDeliveryLog[] {
    return this.unifiedAlertIncidentService.getUnifiedAlertIncidentNotificationDeliveryLogs(input);
  }

  exportUnifiedAlertIncidentNotificationDeliveryLogs(input: {
    format: 'json' | 'csv';
    limit: number;
    escalationId?: string;
    incidentId?: string;
    status?: 'sent' | 'failed';
  }): {
    filename: string;
    contentType: string;
    body: string;
  } {
    return this.unifiedAlertIncidentService.exportUnifiedAlertIncidentNotificationDeliveryLogs(input);
  }

  getQueueRuntimeAlertConfig(): QueueRuntimeAlertConfig {
    return this.queueRuntimeAlertService.getQueueRuntimeAlertConfig();
  }

  updateQueueRuntimeAlertConfig(input: { warnQueuedThreshold?: number; criticalQueuedThreshold?: number }): QueueRuntimeAlertConfig {
    return this.queueRuntimeAlertService.updateQueueRuntimeAlertConfig(input);
  }

  getTaskSloConfig(): TaskSloConfig {
    return this.taskSloService.getTaskSloConfig();
  }

  updateTaskSloConfig(input: {
    p95QueueWaitWarnMs?: number;
    p95QueueWaitCriticalMs?: number;
    pumpErrorRateWarn?: number;
    pumpErrorRateCritical?: number;
    windowSamples?: number;
  }): TaskSloConfig {
    return this.taskSloService.updateTaskSloConfig(input);
  }

  getTaskSloState(): TaskSloState {
    return this.taskSloService.getTaskSloState();
  }

  getTaskQuotaConfig(): TaskQuotaConfig {
    return this.taskQuotaService.getTaskQuotaConfig();
  }

  updateTaskQuotaConfig(input: {
    dailyVideoTaskDefault?: number;
    dailyVideoTaskOverrides?: Record<string, number>;
    dailyVideoTaskTierLimits?: Partial<Record<'standard' | 'pro' | 'enterprise', number>>;
    projectTierOverrides?: Record<string, 'standard' | 'pro' | 'enterprise'>;
  }): TaskQuotaConfig {
    return this.taskQuotaService.updateTaskQuotaConfig(input);
  }

  getTaskQuotaUsage(projectId: string): TaskQuotaUsage {
    return this.taskQuotaService.getTaskQuotaUsage(projectId);
  }

  getTaskQuotaRejectEvents(input?: { limit?: number; projectId?: string }): TaskQuotaRejectEvent[] {
    return this.taskQuotaService.getTaskQuotaRejectEvents(input);
  }

  exportTaskQuotaRejectEvents(input: {
    format: 'json' | 'csv';
    limit?: number;
    projectId?: string;
  }): { filename: string; contentType: string; body: string } {
    return this.taskQuotaService.exportTaskQuotaRejectEvents(input);
  }

  getTaskQuotaUsageEvents(input?: { limit?: number; projectId?: string }): TaskQuotaUsageEvent[] {
    return this.taskQuotaService.getTaskQuotaUsageEvents(input);
  }

  exportTaskQuotaUsageEvents(input: {
    format: 'json' | 'csv';
    limit?: number;
    projectId?: string;
  }): { filename: string; contentType: string; body: string } {
    return this.taskQuotaService.exportTaskQuotaUsageEvents(input);
  }

  getVideoTaskDetail(taskId: string, eventLimit = 50): VideoTaskDetail | null {
    return this.taskQueryService.getVideoTaskDetail(taskId, eventLimit);
  }

  async batchRetryVideoTasks(taskIds: string[]): Promise<BatchActionResult> {
    return this.taskRepairService.batchRetryVideoTasks(taskIds);
  }

  async batchCancelVideoTasks(taskIds: string[]): Promise<BatchActionResult> {
    return this.taskRepairService.batchCancelVideoTasks(taskIds);
  }

  async batchRepairVideoTasksByPolicy(taskIds: string[]): Promise<BatchRepairByPolicyResult> {
    return this.taskRepairService.batchRepairVideoTasksByPolicy(taskIds);
  }

  async batchRepairVideoTasksByPolicyQuery(input: {
    q?: string;
    providerTaskId?: string;
    providerErrorCode?: string;
    status?: 'queued' | 'submitting' | 'polling' | 'running' | 'done' | 'failed' | 'cancelled';
    createdFrom?: string;
    createdTo?: string;
    sortBy?: 'createdAt' | 'updatedAt' | 'priority' | 'status';
    order?: 'asc' | 'desc';
    maxCount: number;
  }): Promise<BatchRepairByPolicyResult> {
    return this.taskRepairService.batchRepairVideoTasksByPolicyQuery(input);
  }

}
