import type { VideoTask } from '../../core/types.js';
import { SqliteStore } from '../../db/sqlite.js';
import { PipelineService } from '../pipeline/pipeline.service.js';

export type BatchActionResult = {
  updated: VideoTask[];
  unchangedIds: string[];
  notFoundIds: string[];
};

type TaskFailurePolicyCode =
  | 'CAPABILITY_MISMATCH'
  | 'PROVIDER_AUTH_FAILED'
  | 'PROVIDER_RATE_LIMITED'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_UNKNOWN';
type TaskFailurePolicyAction = 'retry' | 'recreate_conservative' | 'manual';
type TaskFailurePolicyItem = {
  errorCode: TaskFailurePolicyCode;
  action: TaskFailurePolicyAction;
  preferredMode: 'keep' | 'text' | 'singleImage' | 'startEnd' | 'multiImage' | 'reference';
  disableAudio: boolean;
  priority: 'keep' | 'low' | 'medium' | 'high';
};
export type BatchRepairByPolicyResult = {
  matchedCount?: number;
  retried: VideoTask[];
  recreated: VideoTask[];
  manualIds: string[];
  unchangedIds: string[];
  notFoundIds: string[];
};

const TASK_FAILURE_POLICIES_KEY = 'task_failure_policies';
const ALLOWED_VIDEO_MODES = new Set(['text', 'singleImage', 'startEnd', 'multiImage', 'reference']);

export class TaskRepairService {
  constructor(
    private readonly store: SqliteStore,
    private readonly pipelineService: PipelineService
  ) {}

  async batchRetryVideoTasks(taskIds: string[]): Promise<BatchActionResult> {
    const dedupIds = [...new Set(taskIds.map((item) => item.trim()).filter((item) => item.length > 0))];
    const updated: VideoTask[] = [];
    const unchangedIds: string[] = [];
    const notFoundIds: string[] = [];

    for (const taskId of dedupIds) {
      const task = this.store.getVideoTaskById(taskId);
      if (!task) {
        notFoundIds.push(taskId);
        continue;
      }

      if (task.status !== 'failed' && task.status !== 'cancelled') {
        unchangedIds.push(taskId);
        continue;
      }

      const result = await this.pipelineService.retryVideoTask(task.projectId, taskId);
      if (!result) {
        notFoundIds.push(taskId);
        continue;
      }
      updated.push(result);
    }

    return { updated, unchangedIds, notFoundIds };
  }

  async batchCancelVideoTasks(taskIds: string[]): Promise<BatchActionResult> {
    const dedupIds = [...new Set(taskIds.map((item) => item.trim()).filter((item) => item.length > 0))];
    const updated: VideoTask[] = [];
    const unchangedIds: string[] = [];
    const notFoundIds: string[] = [];

    for (const taskId of dedupIds) {
      const task = this.store.getVideoTaskById(taskId);
      if (!task) {
        notFoundIds.push(taskId);
        continue;
      }

      if (task.status === 'done' || task.status === 'failed' || task.status === 'cancelled') {
        unchangedIds.push(taskId);
        continue;
      }

      const result = await this.pipelineService.cancelVideoTask(task.projectId, taskId);
      if (!result) {
        notFoundIds.push(taskId);
        continue;
      }
      updated.push(result);
    }

    return { updated, unchangedIds, notFoundIds };
  }

  async batchRepairVideoTasksByPolicy(taskIds: string[]): Promise<BatchRepairByPolicyResult> {
    const dedupIds = [...new Set(taskIds.map((item) => item.trim()).filter((item) => item.length > 0))];
    const retried: VideoTask[] = [];
    const recreated: VideoTask[] = [];
    const manualIds: string[] = [];
    const unchangedIds: string[] = [];
    const notFoundIds: string[] = [];
    const policyConfig = this.readTaskFailurePolicyConfig();

    for (const taskId of dedupIds) {
      const task = this.store.getVideoTaskById(taskId);
      if (!task) {
        notFoundIds.push(taskId);
        continue;
      }
      if (task.status !== 'failed' && task.status !== 'cancelled') {
        unchangedIds.push(taskId);
        continue;
      }

      const errorCode = ((task.providerErrorCode ?? 'PROVIDER_UNKNOWN').trim() || 'PROVIDER_UNKNOWN') as TaskFailurePolicyCode;
      const policy =
        policyConfig.items.find((item) => item.errorCode === errorCode) ??
        policyConfig.items.find((item) => item.errorCode === 'PROVIDER_UNKNOWN');
      if (!policy || policy.action === 'manual') {
        manualIds.push(taskId);
        continue;
      }

      if (policy.action === 'retry') {
        const retriedTask = await this.pipelineService.retryVideoTask(task.projectId, taskId);
        if (retriedTask) {
          retried.push(retriedTask);
        } else {
          notFoundIds.push(taskId);
        }
        continue;
      }

      const preferredMode = policy.preferredMode === 'keep' ? task.params.mode : policy.preferredMode;
      const canUsePreferredMode = preferredMode ? ALLOWED_VIDEO_MODES.has(preferredMode) : false;
      const mode = canUsePreferredMode ? preferredMode : 'text';
      const preserveVisualReferences = mode !== 'text';
      const priority: 'low' | 'medium' | 'high' =
        policy.priority === 'low' || policy.priority === 'medium' || policy.priority === 'high' ? policy.priority : task.priority;
      const recreatedTask = await this.pipelineService.createAndRunVideoTask(task.projectId, task.storyboardId, priority, {
        customModel: task.modelName ?? undefined,
        mode: mode ?? undefined,
        duration: task.params.duration,
        resolution: task.params.resolution,
        aspectRatio: task.params.aspectRatio,
        audio: policy.disableAudio ? false : task.params.audio,
        imageInputs: preserveVisualReferences ? task.params.imageInputs : undefined,
        imageWithRoles: preserveVisualReferences ? task.params.imageWithRoles : undefined,
        endFrame: preserveVisualReferences ? task.params.endFrame : undefined,
        autoPolicyApplied: Number(task.params.autoPolicyApplied ?? 0) + 1
      });
      if (recreatedTask) {
        recreated.push(recreatedTask);
      } else {
        notFoundIds.push(taskId);
      }
    }

    return { retried, recreated, manualIds, unchangedIds, notFoundIds };
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
    const maxCount = Math.max(1, Math.min(1000, Math.floor(input.maxCount)));
    const page = this.store.listAllVideoTasks({
      q: input.q,
      providerTaskId: input.providerTaskId,
      providerErrorCode: input.providerErrorCode,
      status: input.status,
      createdFrom: input.createdFrom,
      createdTo: input.createdTo,
      sortBy: input.sortBy,
      order: input.order,
      page: 1,
      pageSize: maxCount
    });
    const pickedIds = page.items.map((item) => item.id);
    const result = await this.batchRepairVideoTasksByPolicy(pickedIds);
    return {
      matchedCount: pickedIds.length,
      ...result
    };
  }

  private readTaskFailurePolicyConfig(): { items: TaskFailurePolicyItem[] } {
    const defaults: TaskFailurePolicyItem[] = [
      { errorCode: 'CAPABILITY_MISMATCH', action: 'recreate_conservative', preferredMode: 'text', disableAudio: true, priority: 'medium' },
      { errorCode: 'PROVIDER_AUTH_FAILED', action: 'manual', preferredMode: 'keep', disableAudio: false, priority: 'keep' },
      { errorCode: 'PROVIDER_RATE_LIMITED', action: 'retry', preferredMode: 'keep', disableAudio: false, priority: 'low' },
      { errorCode: 'PROVIDER_TIMEOUT', action: 'retry', preferredMode: 'keep', disableAudio: false, priority: 'medium' },
      { errorCode: 'PROVIDER_UNKNOWN', action: 'retry', preferredMode: 'keep', disableAudio: false, priority: 'medium' }
    ];
    const raw = this.store.getSystemSetting(TASK_FAILURE_POLICIES_KEY);
    if (!raw) {
      return { items: defaults };
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { items: defaults };
      }
      const node = parsed as Record<string, unknown>;
      const items = Array.isArray(node.items) ? node.items : defaults;
      const normalized = items.filter((item): item is TaskFailurePolicyItem => Boolean(item));
      return { items: normalized.length > 0 ? normalized : defaults };
    } catch {
      return { items: defaults };
    }
  }
}
