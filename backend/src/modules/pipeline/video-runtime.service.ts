import { v4 as uuid } from 'uuid';
import type { ModelConfig, VideoTask, VideoTaskParams } from '../../core/types.js';
import { type SqliteStore } from '../../db/sqlite.js';
import { appendAutoRepairLog } from './auto-repair-logs.js';
import { type AiProvider, type ProviderModelConfig, type ProviderVideoImageWithRole } from './providers/types.js';
import { ProviderError } from './providers/errors.js';

const CANCELED_ERROR = 'Cancelled by user';
const ALLOWED_VIDEO_MODES = new Set(['text', 'singleImage', 'startEnd', 'multiImage', 'reference']);
const ACTIVE_VIDEO_TASK_STATUS = new Set<VideoTask['status']>(['queued', 'submitting', 'polling', 'running']);
const TASK_FAILURE_POLICIES_KEY = 'task_failure_policies';
const TASK_QUOTA_DAILY_VIDEO_DEFAULT_KEY = 'task_quota_daily_video_default';
const TASK_QUOTA_DAILY_VIDEO_OVERRIDES_KEY = 'task_quota_daily_video_overrides';
const TASK_QUOTA_DAILY_VIDEO_TIER_LIMITS_KEY = 'task_quota_daily_video_tier_limits';
const TASK_QUOTA_PROJECT_TIER_OVERRIDES_KEY = 'task_quota_project_tier_overrides';
const TASK_QUOTA_REJECT_EVENTS_KEY = 'task_quota_reject_events';
const TASK_QUOTA_USAGE_EVENTS_KEY = 'task_quota_usage_events';
const TASK_QUOTA_REJECT_EVENTS_MAX = 300;
const TASK_QUOTA_USAGE_EVENTS_MAX = 2000;

type TaskQuotaTier = 'standard' | 'pro' | 'enterprise';

type ResolveModelName = (
  type: 'text' | 'image' | 'video' | 'audio',
  modelId?: string,
  customModel?: string
) => string | undefined;

type PickModelConfig = (type: 'text' | 'image' | 'video' | 'audio', modelName?: string) => ModelConfig | null;

type VideoRuntimeServiceDeps = {
  resolveModelName: ResolveModelName;
  pickModelConfig: PickModelConfig;
  normalizeVideoTaskParams: (raw: VideoTask['params']) => VideoTaskParams;
  validateVideoTaskParams: (modelConfig: ModelConfig | null, params: VideoTaskParams) => void;
  toProviderModelConfig: (modelConfig: ModelConfig) => ProviderModelConfig;
  compileVideoPrompt: (projectId: string, storyboardId: string, fallbackPrompt: string) => string;
  dispatchQueuedTask: (taskId: string) => void | Promise<void>;
  maybeThrowInjectedFailure: (taskType: 'video', input: { projectId: string; taskId: string; stage: string }) => void;
};

type VideoTaskQuotaLimitSource = 'default' | 'tier_limit' | 'project_override';

export class VideoRuntimeService {
  private readonly autoPolicyTriggeredTaskIds = new Set<string>();

  constructor(
    private readonly store: SqliteStore,
    private readonly provider: AiProvider,
    private readonly deps: VideoRuntimeServiceDeps
  ) {}

  listVideoTasks(projectId: string): VideoTask[] | null {
    return this.store.listVideoTasks(projectId);
  }

  async createAndRunVideoTask(
    projectId: string,
    storyboardId: string,
    priority: 'low' | 'medium' | 'high' = 'medium',
    options: {
      modelId?: string;
      customModel?: string;
      mode?: VideoTaskParams['mode'];
      duration?: number;
      resolution?: string;
      aspectRatio?: string;
      audio?: boolean;
      imageInputs?: string[];
      imageWithRoles?: ProviderVideoImageWithRole[];
      endFrame?: string;
      providerOptions?: Record<string, unknown>;
      autoPolicyApplied?: number;
    } = {}
  ): Promise<VideoTask | null> {
    const storyboard = this.store.getStoryboard(projectId, storyboardId);
    if (!storyboard) {
      return null;
    }
    const quotaResolved = this.assertVideoTaskQuotaAvailable(projectId);

    const modelName = this.deps.resolveModelName('video', options.modelId, options.customModel) ?? null;
    const modelConfig = this.deps.pickModelConfig('video', modelName ?? undefined);
    const taskParams: VideoTaskParams = {
      mode: options.mode,
      duration: options.duration,
      resolution: options.resolution,
      aspectRatio: options.aspectRatio,
      audio: options.audio,
      imageInputs: options.imageInputs,
      imageWithRoles: options.imageWithRoles,
      endFrame: options.endFrame,
      providerOptions: options.providerOptions,
      autoPolicyApplied: options.autoPolicyApplied,
    };
    const normalizedTaskParams = this.deps.normalizeVideoTaskParams(taskParams as VideoTask['params']);
    const effectiveTaskParams = this.resolveEffectiveVideoTaskParams(projectId, storyboard, modelConfig, normalizedTaskParams);
    const duplicateTask = this.findDuplicateActiveVideoTask(projectId, storyboardId, modelName, effectiveTaskParams);
    if (duplicateTask) {
      return duplicateTask;
    }
    const compiledPrompt = this.deps.compileVideoPrompt(projectId, storyboard.id, storyboard.prompt);

    const created = this.store.createVideoTask({
      id: uuid(),
      projectId,
      storyboardId,
      prompt: compiledPrompt,
      modelName,
      params: effectiveTaskParams as Record<string, unknown>,
      priority,
    });
    if (!created) {
      return null;
    }
    this.appendTaskQuotaUsageEvent({
      projectId,
      taskId: created.id,
      storyboardId: created.storyboardId,
      date: new Date().toISOString().slice(0, 10),
      consumed: 1,
      usedAfter: quotaResolved.used + 1,
      dailyLimit: quotaResolved.dailyLimit,
      tier: quotaResolved.tier,
      limitSource: quotaResolved.limitSource,
    });

    void this.deps.dispatchQueuedTask(created.id);
    return created;
  }

  async retryVideoTask(projectId: string, taskId: string, source: 'manual' | 'auto' = 'manual'): Promise<VideoTask | null> {
    const existing = this.store.getVideoTask(projectId, taskId);
    if (!existing) {
      return null;
    }
    if (existing.status !== 'failed' && existing.status !== 'cancelled') {
      return existing;
    }

    const storyboard = this.store.getStoryboard(projectId, existing.storyboardId);
    if (!storyboard) {
      return this.store.updateVideoTask(projectId, taskId, {
        status: 'failed',
        progress: 100,
        resultUrl: null,
        error: 'Storyboard not found',
      });
    }

    this.store.updateVideoTask(projectId, taskId, {
      status: 'queued',
      progress: 0,
      resultUrl: null,
      error: null,
      providerTaskId: existing.providerTaskId,
      attempt: 0,
      nextRetryAt: null,
      providerErrorCode: null,
    });
    if (source === 'manual') {
      this.autoPolicyTriggeredTaskIds.delete(taskId);
    } else {
      this.autoPolicyTriggeredTaskIds.add(taskId);
    }
    const queuedTask = this.store.getVideoTask(projectId, taskId);
    if (queuedTask) {
      void this.deps.dispatchQueuedTask(queuedTask.id);
    }
    return queuedTask;
  }

  async createVideoTasksBatch(
    projectId: string,
    storyboardIds?: string[],
    priority: 'low' | 'medium' | 'high' = 'medium',
    options: {
      modelId?: string;
      customModel?: string;
      mode?: VideoTaskParams['mode'];
      duration?: number;
      resolution?: string;
      aspectRatio?: string;
      audio?: boolean;
      imageInputs?: string[];
      imageWithRoles?: ProviderVideoImageWithRole[];
      endFrame?: string;
      providerOptions?: Record<string, unknown>;
    } = {}
  ): Promise<{
    tasks: VideoTask[];
    createdStoryboardIds: string[];
    skippedStoryboardIds: string[];
  } | null> {
    const storyboards = this.store.listStoryboards(projectId);
    if (!storyboards) {
      return null;
    }

    const pickedStoryboardIds = new Set(
      Array.isArray(storyboardIds) && storyboardIds.length > 0 ? storyboardIds : storyboards.map((item) => item.id)
    );
    // Get storyboards in order for video continuity (by rowid - insertion order)
    const pickedStoryboards = storyboards
      .filter((item) => pickedStoryboardIds.has(item.id))
      .sort((a, b) => {
        // Sort by created_at to maintain sequence for video continuity
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return dateA - dateB;
      });
    const existingTasks = this.store.listVideoTasks(projectId) ?? [];

    const createdStoryboardIds: string[] = [];
    const skippedStoryboardIds: string[] = [];

    // For video continuity: track the previous storyboard's lastFrameUrl
    let previousLastFrameUrl: string | undefined = undefined;

    // If mode is startEnd, we need to get the lastFrameUrl from previously generated videos
    if (options.mode === 'startEnd') {
      // Get the first storyboard that has a completed video with lastFrameUrl
      for (const sb of pickedStoryboards) {
        const doneTask = existingTasks.find(
          (t) => t.storyboardId === sb.id && t.status === 'done' && t.lastFrameUrl
        );
        if (doneTask?.lastFrameUrl) {
          previousLastFrameUrl = doneTask.lastFrameUrl;
          break;
        }
      }
    }

    for (let i = 0; i < pickedStoryboards.length; i++) {
      const storyboard = pickedStoryboards[i];
      const hasActiveOrDone = existingTasks.some(
        (task) =>
          task.storyboardId === storyboard.id &&
          (task.status === 'queued' ||
            task.status === 'submitting' ||
            task.status === 'polling' ||
            task.status === 'running' ||
            task.status === 'done')
      );
      if (hasActiveOrDone) {
        skippedStoryboardIds.push(storyboard.id);
        // Update previousLastFrameUrl for continuity even if skipped
        const doneTask = existingTasks.find(
          (t) => t.storyboardId === storyboard.id && t.status === 'done' && t.lastFrameUrl
        );
        if (doneTask?.lastFrameUrl) {
          previousLastFrameUrl = doneTask.lastFrameUrl;
        }
        continue;
      }

      // For video continuity with startEnd mode, use previous storyboard's lastFrameUrl as endFrame
      const taskOptions = { ...options };
      if (options.mode === 'startEnd' && previousLastFrameUrl) {
        taskOptions.endFrame = previousLastFrameUrl;
      }

      try {
        const task = await this.createAndRunVideoTask(projectId, storyboard.id, priority, taskOptions);
        if (task) {
          createdStoryboardIds.push(storyboard.id);
          existingTasks.unshift(task);
          // After creating task, we can't get lastFrameUrl immediately since video isn't generated yet
          // The continuity will be applied on the next batch run or retry
        } else {
          skippedStoryboardIds.push(storyboard.id);
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes('queue is full')) {
          skippedStoryboardIds.push(storyboard.id);
          continue;
        }
        throw err;
      }
    }

    const latestTasks = this.store.listVideoTasks(projectId) ?? [];
    return {
      tasks: latestTasks,
      createdStoryboardIds,
      skippedStoryboardIds,
    };
  }

  async createEpisodeVideoTasksBatch(
    projectId: string,
    episodeId: string,
    priority: 'low' | 'medium' | 'high' = 'medium',
    options: {
      modelId?: string;
      customModel?: string;
      mode?: VideoTaskParams['mode'];
      duration?: number;
      resolution?: string;
      aspectRatio?: string;
      audio?: boolean;
      imageInputs?: string[];
      imageWithRoles?: ProviderVideoImageWithRole[];
      endFrame?: string;
      providerOptions?: Record<string, unknown>;
    } = {}
  ): Promise<{
    tasks: VideoTask[];
    createdStoryboardIds: string[];
    skippedStoryboardIds: string[];
  } | null> {
    const storyboards = this.store.listStoryboardsByEpisode(projectId, episodeId);
    if (!storyboards) {
      return null;
    }
    return this.createVideoTasksBatch(
      projectId,
      storyboards.map((item) => item.id),
      priority,
      options
    );
  }

  async createEpisodesVideoTasksBatch(
    projectId: string,
    input: {
      episodeIds?: string[];
      priority?: 'low' | 'medium' | 'high';
      modelId?: string;
      customModel?: string;
      mode?: VideoTaskParams['mode'];
      duration?: number;
      resolution?: string;
      aspectRatio?: string;
      audio?: boolean;
      imageInputs?: string[];
      imageWithRoles?: ProviderVideoImageWithRole[];
      endFrame?: string;
      providerOptions?: Record<string, unknown>;
    } = {}
  ): Promise<
    | {
        episodes: Array<{
          episodeId: string;
          createdStoryboardIds: string[];
          skippedStoryboardIds: string[];
          createdCount: number;
          skippedCount: number;
        }>;
        totalEpisodes: number;
      }
    | null
  > {
    const episodes = this.store.listEpisodes(projectId);
    if (!episodes) {
      return null;
    }
    const filterIds = input.episodeIds && input.episodeIds.length > 0 ? new Set(input.episodeIds) : null;
    const target = filterIds ? episodes.filter((item) => filterIds.has(item.id)) : episodes;
    const rows: Array<{
      episodeId: string;
      createdStoryboardIds: string[];
      skippedStoryboardIds: string[];
      createdCount: number;
      skippedCount: number;
    }> = [];
    for (const episode of target) {
      const item = await this.createEpisodeVideoTasksBatch(projectId, episode.id, input.priority ?? 'medium', {
        modelId: input.modelId,
        customModel: input.customModel,
        mode: input.mode,
        duration: input.duration,
        resolution: input.resolution,
        aspectRatio: input.aspectRatio,
        audio: input.audio,
        imageInputs: input.imageInputs,
        imageWithRoles: input.imageWithRoles,
        endFrame: input.endFrame,
        providerOptions: input.providerOptions,
      });
      rows.push({
        episodeId: episode.id,
        createdStoryboardIds: item?.createdStoryboardIds ?? [],
        skippedStoryboardIds: item?.skippedStoryboardIds ?? [],
        createdCount: item?.createdStoryboardIds.length ?? 0,
        skippedCount: item?.skippedStoryboardIds.length ?? 0,
      });
    }
    return {
      episodes: rows,
      totalEpisodes: rows.length,
    };
  }

  precheckEpisodesVideoTasksBatch(
    projectId: string,
    input: {
      episodeIds?: string[];
    } = {}
  ):
    | {
        episodes: Array<{
          episodeId: string;
          totalStoryboards: number;
          creatableStoryboardIds: string[];
          conflictStoryboardIds: string[];
          conflictReason: 'video_task_exists';
        }>;
        summary: {
          totalEpisodes: number;
          totalStoryboards: number;
          totalCreatable: number;
          totalConflicts: number;
        };
      }
    | null {
    const episodes = this.store.listEpisodes(projectId);
    if (!episodes) {
      return null;
    }
    const filterIds = input.episodeIds && input.episodeIds.length > 0 ? new Set(input.episodeIds) : null;
    const target = filterIds ? episodes.filter((item) => filterIds.has(item.id)) : episodes;
    const existingTasks = this.store.listVideoTasks(projectId) ?? [];
    const blockedStoryboardIdSet = new Set(
      existingTasks
        .filter((task) => ACTIVE_VIDEO_TASK_STATUS.has(task.status) || task.status === 'done')
        .map((task) => task.storyboardId)
    );
    const rows = target.map((episode) => {
      const storyboards = this.store.listStoryboardsByEpisode(projectId, episode.id) ?? [];
      const creatableStoryboardIds = storyboards.filter((item) => !blockedStoryboardIdSet.has(item.id)).map((item) => item.id);
      const conflictStoryboardIds = storyboards.filter((item) => blockedStoryboardIdSet.has(item.id)).map((item) => item.id);
      return {
        episodeId: episode.id,
        totalStoryboards: storyboards.length,
        creatableStoryboardIds,
        conflictStoryboardIds,
        conflictReason: 'video_task_exists' as const,
      };
    });
    return {
      episodes: rows,
      summary: {
        totalEpisodes: rows.length,
        totalStoryboards: rows.reduce((sum, item) => sum + item.totalStoryboards, 0),
        totalCreatable: rows.reduce((sum, item) => sum + item.creatableStoryboardIds.length, 0),
        totalConflicts: rows.reduce((sum, item) => sum + item.conflictStoryboardIds.length, 0),
      },
    };
  }

  async runQueuedVideoTask(task: VideoTask): Promise<void> {
    const storyboard = this.store.getStoryboard(task.projectId, task.storyboardId);
    if (!storyboard) {
      this.store.updateVideoTask(task.projectId, task.id, {
        status: 'failed',
        progress: 100,
        resultUrl: null,
        error: 'Storyboard not found',
      });
      return;
    }

    this.store.updateVideoTask(task.projectId, task.id, {
      status: 'submitting',
      progress: 10,
      resultUrl: null,
      error: null,
      nextRetryAt: null,
      providerErrorCode: null,
    });

    const videoModel = task.modelName ?? this.store.getDefaultModelConfig('video')?.name;
    const videoModelConfig = this.deps.pickModelConfig('video', videoModel);
    const params = this.resolveEffectiveVideoTaskParams(
      task.projectId,
      storyboard,
      videoModelConfig,
      this.deps.normalizeVideoTaskParams(task.params)
    );
    const runtime = this.store.getTaskRuntimeConfig();
    const compiledPrompt = this.deps.compileVideoPrompt(task.projectId, storyboard.id, task.prompt || storyboard.prompt);
    try {
      await this.sleep(120);
      const stageOneTask = this.store.getVideoTask(task.projectId, task.id);
      if (this.isCancelledTask(stageOneTask)) {
        return;
      }
      this.store.updateVideoTask(task.projectId, task.id, {
        status: 'polling',
        progress: 65,
        resultUrl: null,
        error: null,
      });
      const stageTwoTask = this.store.getVideoTask(task.projectId, task.id);
      if (this.isCancelledTask(stageTwoTask)) {
        return;
      }

      const result = await this.generateVideoWithTaskRetry(
        {
          prompt: compiledPrompt,
          projectId: task.projectId,
          storyboardId: storyboard.id,
          idempotencyKey: `video-task:${task.id}`,
          model: videoModelConfig?.model ?? videoModel,
          modelConfig: videoModelConfig ? this.deps.toProviderModelConfig(videoModelConfig) : undefined,
          mode: params.mode,
          duration: params.duration,
          resolution: params.resolution,
          aspectRatio: params.aspectRatio,
          audio: params.audio,
          imageInputs: params.imageInputs,
          imageWithRoles: params.imageWithRoles,
          endFrame: params.endFrame,
          providerOptions: params.providerOptions,
          providerTaskId: this.store.getVideoTask(task.projectId, task.id)?.providerTaskId ?? undefined,
          onProviderTaskAccepted: async (providerTaskId) => {
            const acceptedTask = this.store.getVideoTask(task.projectId, task.id);
            if (this.isCancelledTask(acceptedTask)) {
              return;
            }
            this.store.updateVideoTask(task.projectId, task.id, {
              status: 'polling',
              progress: Math.max(acceptedTask?.progress ?? 10, 65),
              resultUrl: null,
              error: null,
              providerTaskId,
              nextRetryAt: null,
              providerErrorCode: null,
            });
          },
        },
        task.projectId,
        task.id,
        runtime.videoTaskAutoRetry,
        runtime.videoTaskRetryDelayMs
      );
      if (!result) {
        return;
      }

      const latestTask = this.store.getVideoTask(task.projectId, task.id);
      if (this.isCancelledTask(latestTask)) {
        return;
      }

      // Update video task with result and frame URLs
      this.store.updateVideoTask(task.projectId, task.id, {
        status: 'done',
        progress: 100,
        resultUrl: result.url,
        firstFrameUrl: result.firstFrameUrl ?? null,
        lastFrameUrl: result.lastFrameUrl ?? null,
        error: null,
        providerTaskId: result.providerTaskId ?? null,
        nextRetryAt: null,
        providerErrorCode: null,
      });

      // Update storyboard with frame URLs for video continuity
      if (result.firstFrameUrl || result.lastFrameUrl) {
        this.store.updateStoryboard(task.projectId, task.storyboardId, {
          firstFrameUrl: result.firstFrameUrl ?? null,
          lastFrameUrl: result.lastFrameUrl ?? null,
        });
      }

      this.autoPolicyTriggeredTaskIds.delete(task.id);
    } catch (err) {
      const latestTask = this.store.getVideoTask(task.projectId, task.id);
      if (this.isCancelledTask(latestTask)) {
        return;
      }
      const providerErrorCode = this.mapProviderErrorCode(err);
      this.store.updateVideoTask(task.projectId, task.id, {
        status: 'failed',
        progress: 100,
        resultUrl: null,
        error: this.formatProviderError(err, 'Video generation failed'),
        nextRetryAt: null,
        providerErrorCode,
      });
      const failedTask = this.store.getVideoTask(task.projectId, task.id);
      if (failedTask) {
        await this.tryAutoRecoverFailedVideoTask(failedTask, providerErrorCode ?? 'PROVIDER_UNKNOWN');
      }
    }
  }

  async cancelVideoTask(projectId: string, taskId: string): Promise<VideoTask | null> {
    const existing = this.store.getVideoTask(projectId, taskId);
    if (!existing) {
      return null;
    }
    if (existing.status === 'done' || existing.status === 'failed' || existing.status === 'cancelled') {
      return existing;
    }
    return this.store.updateVideoTask(projectId, taskId, {
      status: 'cancelled',
      progress: existing.progress,
      resultUrl: null,
      error: CANCELED_ERROR,
    });
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private isCancelledTask(task: VideoTask | null): boolean {
    return Boolean(task && task.status === 'cancelled');
  }

  private async generateVideoWithTaskRetry(
    input: {
      prompt: string;
      projectId: string;
      storyboardId: string;
      idempotencyKey?: string;
      model?: string;
      modelConfig?: ProviderModelConfig;
      mode?: VideoTaskParams['mode'];
      duration?: number;
      resolution?: string;
      aspectRatio?: string;
      audio?: boolean;
      imageInputs?: string[];
      imageWithRoles?: ProviderVideoImageWithRole[];
      endFrame?: string;
      providerOptions?: Record<string, unknown>;
      providerTaskId?: string;
      onProviderTaskAccepted?: (providerTaskId: string) => void | Promise<void>;
    },
    projectId: string,
    taskId: string,
    maxRetries: number,
    retryDelayMs: number
  ): Promise<{ url: string; providerTaskId?: string; firstFrameUrl?: string; lastFrameUrl?: string } | null> {
    let lastError: unknown = null;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const latestTask = this.store.getVideoTask(projectId, taskId);
      if (this.isCancelledTask(latestTask)) {
        return null;
      }
      const currentAttempt = attempt + 1;
      const providerTaskId = latestTask?.providerTaskId ?? input.providerTaskId;
      this.store.updateVideoTask(projectId, taskId, {
        status: 'polling',
        progress: latestTask?.progress ?? 65,
        resultUrl: null,
        error: null,
        attempt: currentAttempt,
        nextRetryAt: null,
      });
      try {
        this.deps.maybeThrowInjectedFailure('video', {
          projectId,
          taskId,
          stage: `polling_attempt_${currentAttempt}`,
        });

        // Check if we should use I2V (image-to-video) mode
        const hasImageInputs = (input.imageInputs && input.imageInputs.length > 0) ||
                              (input.imageWithRoles && input.imageWithRoles.length > 0);
        const isStartEndMode = input.mode === 'startEnd';

        // Use generateVideoWithFrames for I2V modes to get first/last frames
        if (hasImageInputs && this.provider.generateVideoWithFrames) {
          const i2vMode: 'imageToVideo' | 'startEnd' = isStartEndMode ? 'startEnd' : 'imageToVideo';
          const result = await this.provider.generateVideoWithFrames({
            prompt: input.prompt,
            projectId: input.projectId,
            storyboardId: input.storyboardId,
            idempotencyKey: input.idempotencyKey,
            model: input.model,
            modelConfig: input.modelConfig,
            mode: i2vMode,
            duration: input.duration,
            resolution: input.resolution,
            aspectRatio: input.aspectRatio,
            imageInputs: input.imageInputs,
            imageWithRoles: input.imageWithRoles,
            endFrame: input.endFrame,
            providerOptions: input.providerOptions,
            providerTaskId,
            onProviderTaskAccepted: input.onProviderTaskAccepted,
          });
          return {
            url: result.videoUrl,
            providerTaskId: result.providerTaskId,
            firstFrameUrl: result.firstFrameUrl,
            lastFrameUrl: result.lastFrameUrl,
          };
        }

        // Fallback to regular generateVideo for text-only mode
        return await this.provider.generateVideo({
          ...input,
          providerTaskId,
        });
      } catch (err) {
        lastError = err;
        const canRetry = this.isRetryableProviderError(err);
        if (!canRetry || attempt >= maxRetries) {
          break;
        }
        const nextRetryAt = new Date(Date.now() + retryDelayMs).toISOString();
        this.store.updateVideoTask(projectId, taskId, {
          status: 'polling',
          progress: latestTask?.progress ?? 65,
          resultUrl: null,
          error: this.formatProviderError(err, 'Video generation failed'),
          nextRetryAt,
          providerErrorCode: this.mapProviderErrorCode(err),
        });
        await this.sleep(retryDelayMs);
      }
    }
    throw (lastError instanceof Error ? lastError : new Error('Video generation failed'));
  }

  private isRetryableProviderError(err: unknown): boolean {
    if (err instanceof ProviderError) {
      return err.kind === 'transient';
    }
    return false;
  }

  private mapProviderErrorCode(err: unknown): string | null {
    if (err instanceof ProviderError) {
      switch (err.kind) {
        case 'auth':
          return 'PROVIDER_AUTH_FAILED';
        case 'rate_limit':
          return 'PROVIDER_RATE_LIMITED';
        case 'transient':
          return 'PROVIDER_TIMEOUT';
        case 'validation':
          return 'CAPABILITY_MISMATCH';
        default:
          return 'PROVIDER_UNKNOWN';
      }
    }
    if (err instanceof Error && err.message.includes('does not support')) {
      return 'CAPABILITY_MISMATCH';
    }
    return null;
  }

  private formatProviderError(err: unknown, fallback: string): string {
    if (err instanceof ProviderError) {
      const code = this.mapProviderErrorCode(err) ?? 'PROVIDER_UNKNOWN';
      const statusPart = typeof err.statusCode === 'number' ? ` status=${err.statusCode}` : '';
      return `[${code}]${statusPart} ${err.message}`.trim();
    }
    return err instanceof Error ? err.message : fallback;
  }

  private async tryAutoRecoverFailedVideoTask(task: VideoTask, errorCode: string): Promise<void> {
    const config = this.readTaskFailurePolicyConfig();
    if (!config.autoApply) {
      return;
    }
    if (this.autoPolicyTriggeredTaskIds.has(task.id)) {
      return;
    }
    const applied = Number(task.params.autoPolicyApplied ?? 0);
    if (applied >= config.maxAutoApplyPerTask) {
      appendAutoRepairLog({
        projectId: task.projectId,
        taskId: task.id,
        storyboardId: task.storyboardId,
        errorCode,
        action: 'manual',
        success: false,
        detail: `max_auto_apply_reached:${config.maxAutoApplyPerTask}`,
      });
      return;
    }
    const policy = config.items.find((item) => item.errorCode === errorCode) ?? config.items.find((item) => item.errorCode === 'PROVIDER_UNKNOWN');
    if (!policy || policy.action === 'manual') {
      appendAutoRepairLog({
        projectId: task.projectId,
        taskId: task.id,
        storyboardId: task.storyboardId,
        errorCode,
        action: 'manual',
        success: false,
        detail: !policy ? 'policy_not_found' : 'policy_action_manual',
      });
      return;
    }

    this.autoPolicyTriggeredTaskIds.add(task.id);
    if (policy.action === 'retry') {
      try {
        const retried = await this.retryVideoTask(task.projectId, task.id, 'auto');
        appendAutoRepairLog({
          projectId: task.projectId,
          taskId: task.id,
          storyboardId: task.storyboardId,
          errorCode,
          action: 'retry',
          success: Boolean(retried),
          detail: retried ? 'retry_enqueued' : 'retry_failed',
          resultTaskId: retried?.id,
        });
        if (!retried) {
          this.autoPolicyTriggeredTaskIds.delete(task.id);
        }
      } catch (err) {
        this.autoPolicyTriggeredTaskIds.delete(task.id);
        appendAutoRepairLog({
          projectId: task.projectId,
          taskId: task.id,
          storyboardId: task.storyboardId,
          errorCode,
          action: 'retry',
          success: false,
          detail: this.formatProviderError(err, 'auto retry failed'),
        });
      }
      return;
    }

    const preferredMode = policy.preferredMode === 'keep' ? task.params.mode : policy.preferredMode;
    const canUsePreferredMode = preferredMode ? ALLOWED_VIDEO_MODES.has(preferredMode) : false;
    const mode = canUsePreferredMode ? preferredMode : 'text';
    const nextPriority: 'low' | 'medium' | 'high' =
      policy.priority === 'low' || policy.priority === 'medium' || policy.priority === 'high' ? policy.priority : task.priority;
    try {
      const recreated = await this.createAndRunVideoTask(task.projectId, task.storyboardId, nextPriority, {
        customModel: task.modelName ?? undefined,
        mode: mode ?? undefined,
        audio: policy.disableAudio ? false : task.params.audio,
        autoPolicyApplied: applied + 1,
      });
      appendAutoRepairLog({
        projectId: task.projectId,
        taskId: task.id,
        storyboardId: task.storyboardId,
        errorCode,
        action: 'recreate_conservative',
        success: Boolean(recreated),
        detail: recreated ? `recreate_enqueued:${mode}` : 'recreate_failed',
        resultTaskId: recreated?.id,
      });
      if (!recreated) {
        this.autoPolicyTriggeredTaskIds.delete(task.id);
      }
    } catch (err) {
      this.autoPolicyTriggeredTaskIds.delete(task.id);
      appendAutoRepairLog({
        projectId: task.projectId,
        taskId: task.id,
        storyboardId: task.storyboardId,
        errorCode,
        action: 'recreate_conservative',
        success: false,
        detail: this.formatProviderError(err, 'auto recreate failed'),
      });
    }
  }

  private readTaskFailurePolicyConfig(): {
    autoApply: boolean;
    maxAutoApplyPerTask: number;
    items: Array<{
      errorCode: 'CAPABILITY_MISMATCH' | 'PROVIDER_AUTH_FAILED' | 'PROVIDER_RATE_LIMITED' | 'PROVIDER_TIMEOUT' | 'PROVIDER_UNKNOWN';
      action: 'retry' | 'recreate_conservative' | 'manual';
      preferredMode: 'keep' | 'text' | 'singleImage' | 'startEnd' | 'multiImage' | 'reference';
      disableAudio: boolean;
      priority: 'keep' | 'low' | 'medium' | 'high';
    }>;
  } {
    type PolicyItem = {
      errorCode: 'CAPABILITY_MISMATCH' | 'PROVIDER_AUTH_FAILED' | 'PROVIDER_RATE_LIMITED' | 'PROVIDER_TIMEOUT' | 'PROVIDER_UNKNOWN';
      action: 'retry' | 'recreate_conservative' | 'manual';
      preferredMode: 'keep' | 'text' | 'singleImage' | 'startEnd' | 'multiImage' | 'reference';
      disableAudio: boolean;
      priority: 'keep' | 'low' | 'medium' | 'high';
    };
    const defaults = {
      autoApply: false,
      maxAutoApplyPerTask: 1,
      items: [
        { errorCode: 'CAPABILITY_MISMATCH', action: 'recreate_conservative', preferredMode: 'text', disableAudio: true, priority: 'medium' },
        { errorCode: 'PROVIDER_AUTH_FAILED', action: 'manual', preferredMode: 'keep', disableAudio: false, priority: 'keep' },
        { errorCode: 'PROVIDER_RATE_LIMITED', action: 'retry', preferredMode: 'keep', disableAudio: false, priority: 'low' },
        { errorCode: 'PROVIDER_TIMEOUT', action: 'retry', preferredMode: 'keep', disableAudio: false, priority: 'medium' },
        { errorCode: 'PROVIDER_UNKNOWN', action: 'retry', preferredMode: 'keep', disableAudio: false, priority: 'medium' },
      ] as PolicyItem[],
    };
    const raw = this.store.getSystemSetting(TASK_FAILURE_POLICIES_KEY);
    if (!raw) {
      return defaults;
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return defaults;
      }
      const node = parsed as Record<string, unknown>;
      const autoApply = typeof node.autoApply === 'boolean' ? node.autoApply : defaults.autoApply;
      const maxRaw = Number(node.maxAutoApplyPerTask);
      const maxAutoApplyPerTask = Number.isFinite(maxRaw) && maxRaw >= 0 ? Math.min(3, Math.floor(maxRaw)) : defaults.maxAutoApplyPerTask;
      const items = Array.isArray(node.items) ? node.items : defaults.items;
      return {
        autoApply,
        maxAutoApplyPerTask,
        items: items.filter((item): item is PolicyItem => Boolean(item)),
      };
    } catch {
      return defaults;
    }
  }

  private assertVideoTaskQuotaAvailable(projectId: string): {
    dailyLimit: number;
    used: number;
    tier?: TaskQuotaTier;
    limitSource: VideoTaskQuotaLimitSource;
  } {
    const quotaConfig = this.readVideoTaskQuotaConfig();
    const resolvedQuota = this.resolveVideoTaskQuotaLimit(projectId, quotaConfig);
    const dailyLimit = resolvedQuota.dailyLimit;
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const used = this.store.countVideoTasksCreatedBetween(projectId, start.toISOString(), end.toISOString());
    if (used >= dailyLimit) {
      this.appendTaskQuotaRejectEvent({
        projectId,
        date: start.toISOString().slice(0, 10),
        used,
        dailyLimit,
        reason: 'daily_video_task_limit',
        tier: resolvedQuota.tier,
        limitSource: resolvedQuota.limitSource,
      });
      throw new Error(`daily video task quota exceeded: used=${used}, limit=${dailyLimit}`);
    }
    return {
      dailyLimit,
      used,
      tier: resolvedQuota.tier,
      limitSource: resolvedQuota.limitSource,
    };
  }

  private readVideoTaskQuotaConfig(): {
    defaultDailyLimit: number;
    overrides: Record<string, number>;
    tierLimits: Partial<Record<TaskQuotaTier, number>>;
    projectTierOverrides: Record<string, TaskQuotaTier>;
  } {
    const defaultDailyLimit = this.readPositiveIntSetting(TASK_QUOTA_DAILY_VIDEO_DEFAULT_KEY, 200, 100_000);
    const rawOverrides = this.store.getSystemSetting(TASK_QUOTA_DAILY_VIDEO_OVERRIDES_KEY) ?? '';
    const overrides = this.parseVideoTaskQuotaOverrides(rawOverrides);
    const rawTierLimits = this.store.getSystemSetting(TASK_QUOTA_DAILY_VIDEO_TIER_LIMITS_KEY) ?? '';
    const tierLimits = this.parseVideoTaskQuotaTierLimits(rawTierLimits, defaultDailyLimit);
    const rawProjectTierOverrides = this.store.getSystemSetting(TASK_QUOTA_PROJECT_TIER_OVERRIDES_KEY) ?? '';
    const projectTierOverrides = this.parseVideoTaskProjectTierOverrides(rawProjectTierOverrides);
    return { defaultDailyLimit, overrides, tierLimits, projectTierOverrides };
  }

  private resolveVideoTaskQuotaLimit(
    projectId: string,
    config: {
      defaultDailyLimit: number;
      overrides: Record<string, number>;
      tierLimits: Partial<Record<TaskQuotaTier, number>>;
      projectTierOverrides: Record<string, TaskQuotaTier>;
    }
  ): { dailyLimit: number; tier?: TaskQuotaTier; limitSource: VideoTaskQuotaLimitSource } {
    const directOverride = config.overrides[projectId];
    if (typeof directOverride === 'number' && Number.isFinite(directOverride) && directOverride > 0) {
      return {
        dailyLimit: this.readBoundedPositiveInt(directOverride, config.defaultDailyLimit, 100_000),
        tier: config.projectTierOverrides[projectId],
        limitSource: 'project_override',
      };
    }
    const tier = config.projectTierOverrides[projectId];
    if (tier && typeof config.tierLimits[tier] === 'number') {
      return {
        dailyLimit: this.readBoundedPositiveInt(config.tierLimits[tier] as number, config.defaultDailyLimit, 100_000),
        tier,
        limitSource: 'tier_limit',
      };
    }
    return {
      dailyLimit: config.defaultDailyLimit,
      tier,
      limitSource: 'default',
    };
  }

  private readBoundedPositiveInt(raw: unknown, fallback: number, max: number): number {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.max(1, Math.min(max, Math.trunc(parsed)));
  }

  private readPositiveIntSetting(key: string, fallback: number, max: number): number {
    const raw = this.store.getSystemSetting(key);
    if (!raw) {
      return fallback;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.max(1, Math.min(max, Math.trunc(parsed)));
  }

  private parseVideoTaskQuotaOverrides(raw: string): Record<string, number> {
    if (!raw) {
      return {};
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {};
      }
      const output: Record<string, number> = {};
      for (const [projectId, value] of Object.entries(parsed as Record<string, unknown>)) {
        const normalizedId = projectId.trim();
        if (!normalizedId) {
          continue;
        }
        const parsedValue = Number(value);
        if (!Number.isFinite(parsedValue)) {
          continue;
        }
        output[normalizedId] = Math.max(1, Math.min(100_000, Math.trunc(parsedValue)));
      }
      return output;
    } catch {
      return {};
    }
  }

  private parseVideoTaskQuotaTierLimits(
    raw: string,
    dailyDefault: number
  ): Partial<Record<TaskQuotaTier, number>> {
    const fallbackPro = this.readBoundedPositiveInt(Math.max(dailyDefault * 2, 400), 400, 100_000);
    const fallbackEnterprise = this.readBoundedPositiveInt(Math.max(dailyDefault * 5, 1000), 1000, 100_000);
    const fallback: Partial<Record<TaskQuotaTier, number>> = {
      standard: dailyDefault,
      pro: fallbackPro,
      enterprise: fallbackEnterprise,
    };
    if (!raw) {
      return fallback;
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return fallback;
      }
      const map = parsed as Record<string, unknown>;
      return {
        standard: this.readBoundedPositiveInt(map.standard, fallback.standard as number, 100_000),
        pro: this.readBoundedPositiveInt(map.pro, fallback.pro as number, 100_000),
        enterprise: this.readBoundedPositiveInt(map.enterprise, fallback.enterprise as number, 100_000),
      };
    } catch {
      return fallback;
    }
  }

  private parseVideoTaskProjectTierOverrides(raw: string): Record<string, TaskQuotaTier> {
    if (!raw) {
      return {};
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {};
      }
      const output: Record<string, TaskQuotaTier> = {};
      for (const [projectId, value] of Object.entries(parsed as Record<string, unknown>)) {
        const normalizedId = projectId.trim();
        if (!normalizedId) {
          continue;
        }
        if (value === 'standard' || value === 'pro' || value === 'enterprise') {
          output[normalizedId] = value;
        }
      }
      return output;
    } catch {
      return {};
    }
  }

  private appendTaskQuotaRejectEvent(input: {
    projectId: string;
    date: string;
    used: number;
    dailyLimit: number;
    reason: string;
    tier?: TaskQuotaTier;
    limitSource?: VideoTaskQuotaLimitSource;
  }): void {
    const events = this.readTaskQuotaRejectEvents();
    const nowMs = Date.now();
    const event = {
      id: `tqr_${nowMs}_${Math.random().toString(36).slice(2, 8)}`,
      at: new Date(nowMs).toISOString(),
      projectId: input.projectId,
      date: input.date,
      used: input.used,
      dailyLimit: input.dailyLimit,
      reason: input.reason,
      tier: input.tier,
      limitSource: input.limitSource,
    };
    const next = [...events, event].slice(-TASK_QUOTA_REJECT_EVENTS_MAX);
    this.store.setSystemSetting(TASK_QUOTA_REJECT_EVENTS_KEY, JSON.stringify(next));
  }

  private appendTaskQuotaUsageEvent(input: {
    projectId: string;
    taskId: string;
    storyboardId: string;
    date: string;
    consumed: number;
    usedAfter: number;
    dailyLimit: number;
    tier?: TaskQuotaTier;
    limitSource?: VideoTaskQuotaLimitSource;
  }): void {
    const events = this.readTaskQuotaUsageEvents();
    const nowMs = Date.now();
    const event = {
      id: `tqu_${nowMs}_${Math.random().toString(36).slice(2, 8)}`,
      at: new Date(nowMs).toISOString(),
      projectId: input.projectId,
      taskId: input.taskId,
      storyboardId: input.storyboardId,
      date: input.date,
      consumed: input.consumed,
      usedAfter: input.usedAfter,
      dailyLimit: input.dailyLimit,
      tier: input.tier,
      limitSource: input.limitSource,
    };
    const next = [...events, event].slice(-TASK_QUOTA_USAGE_EVENTS_MAX);
    this.store.setSystemSetting(TASK_QUOTA_USAGE_EVENTS_KEY, JSON.stringify(next));
  }

  private readTaskQuotaUsageEvents(): Array<{
    id: string;
    at: string;
    projectId: string;
    taskId: string;
    storyboardId: string;
    date: string;
    consumed: number;
    usedAfter: number;
    dailyLimit: number;
    tier?: TaskQuotaTier;
    limitSource?: VideoTaskQuotaLimitSource;
  }> {
    const raw = this.store.getSystemSetting(TASK_QUOTA_USAGE_EVENTS_KEY) ?? '';
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
        .map((item) => {
          const tierRaw = item.tier;
          const tier: TaskQuotaTier | undefined =
            tierRaw === 'standard' || tierRaw === 'pro' || tierRaw === 'enterprise' ? tierRaw : undefined;
          const limitSourceRaw = item.limitSource;
          const limitSource: VideoTaskQuotaLimitSource | undefined =
            limitSourceRaw === 'default' || limitSourceRaw === 'tier_limit' || limitSourceRaw === 'project_override'
              ? limitSourceRaw
              : undefined;
          return {
            id: typeof item.id === 'string' ? item.id : '',
            at: typeof item.at === 'string' ? item.at : '',
            projectId: typeof item.projectId === 'string' ? item.projectId : '',
            taskId: typeof item.taskId === 'string' ? item.taskId : '',
            storyboardId: typeof item.storyboardId === 'string' ? item.storyboardId : '',
            date: typeof item.date === 'string' ? item.date : '',
            consumed: typeof item.consumed === 'number' ? item.consumed : 0,
            usedAfter: typeof item.usedAfter === 'number' ? item.usedAfter : 0,
            dailyLimit: typeof item.dailyLimit === 'number' ? item.dailyLimit : 0,
            tier,
            limitSource,
          };
        })
        .filter((item) => item.id && item.at && item.projectId && item.taskId);
    } catch {
      return [];
    }
  }

  private readTaskQuotaRejectEvents(): Array<{
    id: string;
    at: string;
    projectId: string;
    date: string;
    used: number;
    dailyLimit: number;
    reason: string;
    tier?: TaskQuotaTier;
    limitSource?: VideoTaskQuotaLimitSource;
  }> {
    const raw = this.store.getSystemSetting(TASK_QUOTA_REJECT_EVENTS_KEY) ?? '';
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
        .map((item) => {
          const tierRaw = item.tier;
          const tier: TaskQuotaTier | undefined =
            tierRaw === 'standard' || tierRaw === 'pro' || tierRaw === 'enterprise' ? tierRaw : undefined;
          const limitSourceRaw = item.limitSource;
          const limitSource: VideoTaskQuotaLimitSource | undefined =
            limitSourceRaw === 'default' || limitSourceRaw === 'tier_limit' || limitSourceRaw === 'project_override'
              ? limitSourceRaw
              : undefined;
          return {
            id: typeof item.id === 'string' ? item.id : '',
            at: typeof item.at === 'string' ? item.at : '',
            projectId: typeof item.projectId === 'string' ? item.projectId : '',
            date: typeof item.date === 'string' ? item.date : '',
            used: typeof item.used === 'number' ? item.used : 0,
            dailyLimit: typeof item.dailyLimit === 'number' ? item.dailyLimit : 0,
            reason: typeof item.reason === 'string' ? item.reason : '',
            tier,
            limitSource,
          };
        })
        .filter((item) => item.id && item.at && item.projectId);
    } catch {
      return [];
    }
  }

  private findDuplicateActiveVideoTask(
    projectId: string,
    storyboardId: string,
    modelName: string | null,
    params: VideoTaskParams
  ): VideoTask | null {
    const signature = this.buildVideoTaskSignature(modelName, params);
    const tasks = this.store.listVideoTasks(projectId) ?? [];
    const matched = tasks.find((task) => {
      if (task.storyboardId !== storyboardId || !ACTIVE_VIDEO_TASK_STATUS.has(task.status)) {
        return false;
      }
      return this.buildVideoTaskSignature(task.modelName, this.deps.normalizeVideoTaskParams(task.params)) === signature;
    });
    return matched ?? null;
  }

  private resolveEffectiveVideoTaskParams(
    projectId: string,
    storyboard: { id: string; imageUrl: string | null },
    modelConfig: ModelConfig | null,
    params: VideoTaskParams
  ): VideoTaskParams {
    const base = this.attachDerivedImageRoles(params, storyboard.imageUrl);
    const candidates = this.buildVideoTaskParamCandidates(projectId, storyboard, base);
    let lastError: unknown = null;
    for (const candidate of candidates) {
      try {
        this.deps.validateVideoTaskParams(modelConfig, candidate);
        return candidate;
      } catch (err) {
        lastError = err;
      }
    }
    throw (lastError instanceof Error ? lastError : new Error('Video task params are invalid'));
  }

  private buildVideoTaskParamCandidates(
    projectId: string,
    storyboard: { id: string; imageUrl: string | null },
    params: VideoTaskParams
  ): VideoTaskParams[] {
    if (params.mode === 'text') {
      return [params];
    }
    if (this.hasVisualReferenceParams(params)) {
      return [params];
    }

    const references = this.collectStoryboardReferenceInputs(projectId, storyboard.id, storyboard.imageUrl);
    if (references.urls.length === 0) {
      return [params];
    }

    const preferredMode = params.mode ?? (references.urls.length > 1 ? 'reference' : 'singleImage');
    const preferredCandidate = this.attachDerivedImageRoles(
      {
        ...params,
        mode: preferredMode,
        imageInputs: references.urls,
        imageWithRoles: references.roles
      },
      storyboard.imageUrl
    );

    const singleImageCandidate =
      references.primaryUrl
        ? this.attachDerivedImageRoles(
            {
              ...params,
              mode: 'singleImage',
              imageInputs: [references.primaryUrl]
            },
            storyboard.imageUrl
          )
        : null;

    const candidates = [preferredCandidate];
    if (singleImageCandidate && JSON.stringify(singleImageCandidate) !== JSON.stringify(preferredCandidate)) {
      candidates.push(singleImageCandidate);
    }
    candidates.push(params);
    return candidates;
  }

  private hasVisualReferenceParams(params: VideoTaskParams): boolean {
    return Boolean(
      (Array.isArray(params.imageInputs) && params.imageInputs.length > 0) ||
        (Array.isArray(params.imageWithRoles) && params.imageWithRoles.length > 0) ||
        params.endFrame
    );
  }

  private attachDerivedImageRoles(
    params: VideoTaskParams,
    storyboardImageUrl: string | null
  ): VideoTaskParams {
    if (params.imageWithRoles && params.imageWithRoles.length > 0) {
      return params;
    }
    const roleEntries: ProviderVideoImageWithRole[] = [];
    const imageInputs = Array.isArray(params.imageInputs) ? params.imageInputs.filter((item) => item.trim()) : [];
    if (params.mode === 'startEnd') {
      const firstFrame = imageInputs[0] || storyboardImageUrl?.trim() || '';
      if (firstFrame) {
        roleEntries.push({ url: firstFrame, role: 'first_frame' });
      }
      if (params.endFrame?.trim()) {
        roleEntries.push({ url: params.endFrame.trim(), role: 'last_frame' });
      }
    } else if (params.mode === 'singleImage') {
      const url = imageInputs[0] || storyboardImageUrl?.trim() || '';
      if (url) {
        roleEntries.push({ url, role: 'first_frame' });
      }
    } else if (params.mode === 'multiImage' || params.mode === 'reference') {
      imageInputs.forEach((url, index) => {
        roleEntries.push({
          url,
          role: index === 0 ? 'first_frame' : 'reference'
        });
      });
    }
    if (roleEntries.length === 0) {
      return params;
    }
    return {
      ...params,
      imageWithRoles: roleEntries
    };
  }

  private collectStoryboardReferenceInputs(
    projectId: string,
    storyboardId: string,
    storyboardImageUrl: string | null
  ): { primaryUrl: string | null; urls: string[]; roles: ProviderVideoImageWithRole[] } {
    const storyboard = this.store.getStoryboard(projectId, storyboardId);
    const storyboardUrl = storyboardImageUrl?.trim() || '';
    const continuityAnchorUrl = (() => {
      if (!storyboard?.episodeId || !storyboard.plan?.continuityGroupId) {
        return '';
      }
      const episodeStoryboards = this.store.listStoryboardsByEpisode(projectId, storyboard.episodeId) ?? [];
      const currentIndex = episodeStoryboards.findIndex((item) => item.id === storyboardId);
      if (currentIndex <= 0) {
        return '';
      }
      for (let index = currentIndex - 1; index >= 0; index -= 1) {
        const candidate = episodeStoryboards[index];
        if (candidate?.plan?.continuityGroupId !== storyboard.plan.continuityGroupId) {
          continue;
        }
        const candidateUrl = candidate.imageUrl?.trim() || '';
        if (candidateUrl) {
          return candidateUrl;
        }
      }
      return '';
    })();
    const orderedAssetIds = [
      storyboard?.plan?.baseSceneAssetId ?? null,
      ...(storyboard?.plan?.baseCharacterAssetIds ?? []),
      storyboard?.plan?.shotSceneStateId ?? null,
      ...(storyboard?.plan?.shotCharacterStateIds ?? []),
      ...(storyboard?.plan?.propAssetIds ?? []),
      ...(storyboard?.plan?.sceneAssetId ? [storyboard.plan.sceneAssetId] : []),
      ...(storyboard?.plan?.characterAssetIds ?? []),
    ]
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
    const orderedAssetUrls = [...new Set(orderedAssetIds)]
      .map((assetId) => this.store.getAsset(projectId, assetId))
      .filter((item): item is NonNullable<typeof item> => Boolean(item?.imageUrl))
      .sort((left, right) => {
        const order = (type: string, scope: string): number => {
          if (scope === 'base' && type === 'scene') return 0;
          if (scope === 'base' && type === 'character') return 1;
          if (scope === 'shot' && type === 'scene') return 2;
          if (scope === 'shot' && type === 'character') return 3;
          if (type === 'prop') return 4;
          return 5;
        };
        return order(left.type, left.scope) - order(right.type, right.scope);
      })
      .map((item) => item.imageUrl?.trim() || '')
      .filter(Boolean);
    const urls = [...new Set([continuityAnchorUrl, storyboardUrl, ...orderedAssetUrls].filter(Boolean))].slice(0, 6);
    const primaryUrl = urls[0] ?? null;
    const roles: ProviderVideoImageWithRole[] = urls.map((url, index) => ({
      url,
      role: index === 0 ? 'first_frame' : 'reference'
    }));
    return { primaryUrl, urls, roles };
  }

  private buildVideoTaskSignature(modelName: string | null, params: VideoTaskParams): string {
    const imageInputs = Array.isArray(params.imageInputs) ? [...params.imageInputs] : undefined;
    const imageWithRoles = Array.isArray(params.imageWithRoles)
      ? params.imageWithRoles.map((item) => ({ url: item.url, role: item.role }))
      : undefined;
    const providerOptions =
      params.providerOptions && typeof params.providerOptions === 'object' && !Array.isArray(params.providerOptions)
        ? params.providerOptions
        : null;
    return JSON.stringify({
      modelName: modelName?.trim() || null,
      mode: params.mode || null,
      duration: typeof params.duration === 'number' ? params.duration : null,
      resolution: params.resolution || null,
      aspectRatio: params.aspectRatio || null,
      audio: typeof params.audio === 'boolean' ? params.audio : null,
      imageInputs: imageInputs && imageInputs.length > 0 ? imageInputs : null,
      imageWithRoles: imageWithRoles && imageWithRoles.length > 0 ? imageWithRoles : null,
      endFrame: params.endFrame || null,
      providerOptions,
    });
  }
}
