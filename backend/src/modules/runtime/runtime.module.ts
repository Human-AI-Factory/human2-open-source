import { SqliteStore } from '../../db/sqlite.js';
import { PipelineService } from '../pipeline/pipeline.service.js';
import { TaskCatalogAlertService } from '../tasks/task-catalog-alert.service.js';
import { QueueRuntimeAlertService } from './queue-runtime-alert.service.js';
import { TaskEventService } from './task-event.service.js';
import { TaskQueryService } from './task-query.service.js';
import { TaskQuotaService } from './task-quota.service.js';
import { TaskReconcileService } from './task-reconcile.service.js';
import { TaskRepairService } from './task-repair.service.js';
import { TaskRuntimeService } from './task-runtime.service.js';
import { TaskSloService } from './task-slo.service.js';
import { UnifiedAlertIncidentService } from './unified-alert-incident.service.js';
import { UnifiedAlertStateService } from './unified-alert-state.service.js';

export type RuntimeModule = {
  taskQueryService: TaskQueryService;
  taskEventService: TaskEventService;
  taskRuntimeService: TaskRuntimeService;
  queueRuntimeAlertService: QueueRuntimeAlertService;
  taskSloService: TaskSloService;
  taskQuotaService: TaskQuotaService;
  taskReconcileService: TaskReconcileService;
  taskRepairService: TaskRepairService;
  taskCatalogAlertService: TaskCatalogAlertService;
  unifiedAlertStateService: UnifiedAlertStateService;
  unifiedAlertIncidentService: UnifiedAlertIncidentService;
};

export type RuntimeModuleDeps = {
  store: SqliteStore;
  pipelineService: PipelineService;
  taskQueryService?: TaskQueryService;
  taskEventService?: TaskEventService;
  taskRuntimeService?: TaskRuntimeService;
  queueRuntimeAlertService?: QueueRuntimeAlertService;
  taskSloService?: TaskSloService;
  taskQuotaService?: TaskQuotaService;
  taskReconcileService?: TaskReconcileService;
  taskRepairService?: TaskRepairService;
  taskCatalogAlertService?: TaskCatalogAlertService;
  unifiedAlertStateService?: UnifiedAlertStateService;
  unifiedAlertIncidentService?: UnifiedAlertIncidentService;
};

export const createRuntimeModule = (deps: RuntimeModuleDeps): RuntimeModule => {
  const taskQueryService = deps.taskQueryService ?? new TaskQueryService(deps.store);
  const taskEventService = deps.taskEventService ?? new TaskEventService(deps.store);
  const taskRuntimeService = deps.taskRuntimeService ?? new TaskRuntimeService(deps.pipelineService);
  const queueRuntimeAlertService = deps.queueRuntimeAlertService ?? new QueueRuntimeAlertService(deps.store);
  const taskSloService = deps.taskSloService ?? new TaskSloService(deps.store, taskRuntimeService);
  const taskQuotaService = deps.taskQuotaService ?? new TaskQuotaService(deps.store);
  const taskReconcileService = deps.taskReconcileService ?? new TaskReconcileService(deps.store, taskRuntimeService);
  const taskRepairService = deps.taskRepairService ?? new TaskRepairService(deps.store, deps.pipelineService);
  const taskCatalogAlertService = deps.taskCatalogAlertService ?? new TaskCatalogAlertService(deps.store);
  const unifiedAlertIncidentService = deps.unifiedAlertIncidentService ?? new UnifiedAlertIncidentService(deps.store);
  const unifiedAlertStateService =
    deps.unifiedAlertStateService ??
    new UnifiedAlertStateService(deps.store, queueRuntimeAlertService, taskCatalogAlertService, unifiedAlertIncidentService);

  return {
    taskQueryService,
    taskEventService,
    taskRuntimeService,
    queueRuntimeAlertService,
    taskSloService,
    taskQuotaService,
    taskReconcileService,
    taskRepairService,
    taskCatalogAlertService,
    unifiedAlertStateService,
    unifiedAlertIncidentService
  };
};
