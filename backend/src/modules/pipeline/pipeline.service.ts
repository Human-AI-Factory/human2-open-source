import path from 'node:path';
import {
  Asset,
  AudioTask,
  DomainEntity,
  EpisodeWorkflowStatus,
  FailureInjectionConfig,
  FailureInjectionEvent,
  FailureInjectionReport,
  ModelConfig,
  Scene,
  Storyboard,
  StoryboardAssetRelation,
  TimelineTrack,
  TimelinePlan,
  VideoMerge,
  VideoMergeClip,
  VideoMergeParams,
  VideoTaskRuntimeSnapshot,
  VideoTask,
  VideoTaskParams
} from '../../core/types.js';
import { SqliteStore } from '../../db/sqlite.js';
import { env } from '../../config/env.js';
import { AiProvider } from './providers/types.js';
import { ProviderAuthError, ProviderError, ProviderRateLimitError, ProviderTransientError, ProviderValidationError } from './providers/errors.js';
import {
  EpisodeDeliveryService,
  type EpisodeDeliveryVersionEntry,
} from './episode-delivery.service.js';
import {
  StoryboardPromptService,
  type FramePromptHistoryEntry,
  type FramePromptRollbackAuditEntry,
} from './storyboard-prompt.service.js';
import { StoryboardAssetService } from './storyboard-asset.service.js';
import { VideoRuntimeService } from './video-runtime.service.js';
import { AudioRuntimeService, type AudioExtractItem } from './audio-runtime.service.js';
import { MergeTimelineService } from './merge-timeline.service.js';
import { MediaModelPolicyService } from '../ai/media-model-policy.service.js';
import { VideoPromptCompilerService } from './video-prompt-compiler.service.js';
import { AudioPromptCompilerService } from './audio-prompt-compiler.service.js';
import { DialogueTrackPlannerService } from './dialogue-track-planner.service.js';
import {
  TimelinePostProductionService,
  type TimelineAudioTrackSyncResult,
  type TimelineSubtitleTrackGenerationResult,
} from './timeline-postproduction.service.js';

const FAILURE_INJECTION_EVENT_MAX = 500;
const FAILURE_INJECTION_TASK_TYPES = new Set(['video', 'audio', 'video_merge']);
const FAILURE_INJECTION_ERROR_CODES = new Set([
  'CAPABILITY_MISMATCH',
  'PROVIDER_AUTH_FAILED',
  'PROVIDER_RATE_LIMITED',
  'PROVIDER_TIMEOUT',
  'PROVIDER_UNKNOWN'
]);

type PipelineServiceOptions = {
  videoMergeEngine?: 'ffmpeg' | 'placeholder';
  ffmpegBin?: string;
  videoMergeOutputDir?: string;
  audioExtractOutputDir?: string;
  uploadOutputDir?: string;
  queueDriver?: 'internal' | 'external';
  queueBackend?: 'lease' | 'bullmq';
  queueRedisUrl?: string;
  queueName?: string;
  queueLoopEnabled?: boolean;
  queueLeaseOwnerId?: string;
  queueLeaseTtlMs?: number;
  failureInjectionEnabled?: boolean;
  failureInjectionTaskTypes?: string;
  failureInjectionErrorCodes?: string;
  failureInjectionRatio?: number;
};

type BullmqQueueLike = {
  add: (name: string, data: Record<string, unknown>, opts?: Record<string, unknown>) => Promise<unknown>;
  close: () => Promise<void>;
};

type DialogueVoiceBinding = {
  voice?: string;
  speed?: number;
  providerOptions?: Record<string, unknown>;
  assetId?: string;
  /** Provider/manufacturer name (e.g., elevenlabs, minimax, dashscope-cosyvoice) */
  provider?: string;
};

type BullmqWorkerLike = {
  close: () => Promise<void>;
};

export class PipelineService {
  private readonly processingTaskIds = new Set<string>();
  private isPumpRunning = false;
  private pumpCycleCount = 0;
  private pumpErrorCount = 0;
  private lastPumpStartedAt: string | null = null;
  private lastPumpFinishedAt: string | null = null;
  private lastPumpDurationMs: number | null = null;
  private lastPumpError: string | null = null;
  private readonly queueTimer: NodeJS.Timeout | null;
  private readonly queueDriver: 'internal' | 'external';
  private readonly queueBackend: 'lease' | 'bullmq';
  private readonly queueRedisUrl: string;
  private readonly queueName: string;
  private readonly queueLoopEnabled: boolean;
  private readonly queueLeaseOwnerId: string;
  private readonly queueLeaseTtlMs: number;
  private bullmqReady = false;
  private bullmqWorkerEnabled = false;
  private bullmqQueue: BullmqQueueLike | null = null;
  private bullmqWorker: BullmqWorkerLike | null = null;
  private readonly videoMergeEngine: 'ffmpeg' | 'placeholder';
  private readonly ffmpegBin: string;
  private readonly videoMergeOutputDir: string;
  private readonly uploadOutputDir: string;
  private readonly mediaModelPolicyService: MediaModelPolicyService;
  private readonly videoPromptCompilerService: VideoPromptCompilerService;
  private readonly audioPromptCompilerService: AudioPromptCompilerService;
  private readonly dialogueTrackPlannerService: DialogueTrackPlannerService;
  private readonly videoRuntimeService: VideoRuntimeService;
  private readonly audioRuntimeService: AudioRuntimeService;
  private readonly mergeTimelineService: MergeTimelineService;
  private readonly timelinePostProductionService: TimelinePostProductionService;
  private readonly storyboardAssetService: StoryboardAssetService;
  private readonly storyboardPromptService: StoryboardPromptService;
  private readonly episodeDeliveryService: EpisodeDeliveryService;
  private failureInjectionEnabled: boolean;
  private failureInjectionTaskTypes: Set<'video' | 'audio' | 'video_merge'>;
  private failureInjectionErrorCodes: Array<'CAPABILITY_MISMATCH' | 'PROVIDER_AUTH_FAILED' | 'PROVIDER_RATE_LIMITED' | 'PROVIDER_TIMEOUT' | 'PROVIDER_UNKNOWN'>;
  private failureInjectionRatio: number;
  private readonly failureInjectionEvents: FailureInjectionEvent[] = [];

  constructor(
    private readonly store: SqliteStore,
    private readonly provider: AiProvider,
    private readonly maxConcurrent: number,
    options: PipelineServiceOptions = {}
  ) {
    this.videoMergeEngine = options.videoMergeEngine ?? 'ffmpeg';
    this.ffmpegBin = options.ffmpegBin ?? process.env.FFMPEG_BIN ?? 'ffmpeg';
    this.videoMergeOutputDir = options.videoMergeOutputDir ?? path.resolve(process.cwd(), 'data/video-merges');
    const audioExtractOutputDir = options.audioExtractOutputDir ?? path.resolve(process.cwd(), 'data/audio-extracts');
    this.uploadOutputDir = options.uploadOutputDir ?? path.resolve(process.cwd(), 'data/uploads');
    this.mediaModelPolicyService = new MediaModelPolicyService(this.store);
    this.videoPromptCompilerService = new VideoPromptCompilerService(this.store);
    this.audioPromptCompilerService = new AudioPromptCompilerService(this.store);
    this.videoRuntimeService = new VideoRuntimeService(this.store, this.provider, {
      resolveModelName: (type, modelId, customModel) => this.mediaModelPolicyService.resolveModelName(type, modelId, customModel),
      pickModelConfig: (type, modelName) => this.mediaModelPolicyService.pickModelConfig(type, modelName),
      normalizeVideoTaskParams: (raw) => this.mediaModelPolicyService.normalizeVideoTaskParams(raw),
      validateVideoTaskParams: (modelConfig, params) => this.mediaModelPolicyService.validateVideoTaskParams(modelConfig, params),
      toProviderModelConfig: (modelConfig) => this.mediaModelPolicyService.toProviderModelConfig(modelConfig),
      compileVideoPrompt: (projectId, storyboardId, fallbackPrompt) =>
        this.videoPromptCompilerService.compile(projectId, storyboardId) ?? fallbackPrompt,
      dispatchQueuedTask: (taskId) => this.dispatchQueuedTask(taskId),
      maybeThrowInjectedFailure: (taskType, input) => this.maybeThrowInjectedFailure(taskType, input),
    });
    this.audioRuntimeService = new AudioRuntimeService(this.store, this.provider, {
      ffmpegBin: this.ffmpegBin,
      ffprobeBin: process.env.FFPROBE_BIN ?? 'ffprobe',
      audioExtractOutputDir,
    }, {
      resolveModelName: (type, modelId, customModel) => this.mediaModelPolicyService.resolveModelName(type, modelId, customModel),
      pickModelConfig: (type, modelName) => this.mediaModelPolicyService.pickModelConfig(type, modelName),
      normalizeAudioTaskParams: (raw) => this.mediaModelPolicyService.normalizeAudioTaskParams(raw),
      validateAudioTaskParams: (modelConfig, params) => this.mediaModelPolicyService.validateAudioTaskParams(modelConfig, params),
      toProviderModelConfig: (modelConfig) => this.mediaModelPolicyService.toProviderModelConfig(modelConfig),
      compileAudioPrompt: (projectId, storyboardId, fallbackPrompt) =>
        this.audioPromptCompilerService.compile(projectId, storyboardId) ?? fallbackPrompt,
      maybeThrowInjectedFailure: (taskType, input) => this.maybeThrowInjectedFailure(taskType, input),
    });
    this.dialogueTrackPlannerService = new DialogueTrackPlannerService(this.store, this.provider, {
      resolveTextModelName: (modelId, customModel) => this.mediaModelPolicyService.resolveModelName('text', modelId, customModel),
      pickModelConfig: (type, modelName) => this.mediaModelPolicyService.pickModelConfig(type, modelName),
      toProviderModelConfig: (modelConfig) => this.mediaModelPolicyService.toProviderModelConfig(modelConfig),
    });
    this.mergeTimelineService = new MergeTimelineService(this.store, {
      ffmpegBin: this.ffmpegBin,
      videoMergeEngine: this.videoMergeEngine,
      videoMergeOutputDir: this.videoMergeOutputDir,
      uploadOutputDir: this.uploadOutputDir,
    }, {
      maybeThrowInjectedFailure: (taskType, input) => this.maybeThrowInjectedFailure(taskType, input),
    });
    this.timelinePostProductionService = new TimelinePostProductionService(this.store, this.provider, {
      getTimelinePlan: (projectId, episodeId) => this.mergeTimelineService.getTimelinePlan(projectId, episodeId),
      saveTimelinePlan: (projectId, input) => this.mergeTimelineService.saveTimelinePlan(projectId, input),
      resolveAudioTaskSourceUrl: (projectId, taskId) => this.audioRuntimeService.resolveAudioTaskSourceUrl(projectId, taskId),
      resolveAudioTaskTiming: (projectId, taskId) => this.audioRuntimeService.resolveAudioTaskTiming(projectId, taskId),
      resolveTextModelName: (modelId, customModel) => this.mediaModelPolicyService.resolveModelName('text', modelId, customModel),
      pickModelConfig: (type, modelName) => this.mediaModelPolicyService.pickModelConfig(type, modelName),
      toProviderModelConfig: (modelConfig) => this.mediaModelPolicyService.toProviderModelConfig(modelConfig),
    });
    this.storyboardAssetService = new StoryboardAssetService(this.store, this.provider, {
      resolveModelName: (type, modelId, customModel) => this.mediaModelPolicyService.resolveModelName(type, modelId, customModel),
      resolveImageModelByMode: (mode, modelId, customModel) => this.mediaModelPolicyService.resolveImageModelByMode(mode, modelId, customModel),
      pickModelConfig: (type, modelName) => this.mediaModelPolicyService.pickModelConfig(type, modelName),
      toProviderModelConfig: (modelConfig) => this.mediaModelPolicyService.toProviderModelConfig(modelConfig),
      validateImageGenerationParams: (modelConfig, kind, input) => this.mediaModelPolicyService.validateImageGenerationParams(modelConfig, kind, input),
    });
    this.storyboardPromptService = new StoryboardPromptService(this.store, this.provider, {
      resolveTextModelName: (modelId, customModel) => this.mediaModelPolicyService.resolveModelName('text', modelId, customModel),
      pickModelConfig: (type, modelName) => this.mediaModelPolicyService.pickModelConfig(type, modelName),
      toProviderModelConfig: (modelConfig) => this.mediaModelPolicyService.toProviderModelConfig(modelConfig),
    });
    this.episodeDeliveryService = new EpisodeDeliveryService(this.store, this.uploadOutputDir, env.jwtSecret);
    this.queueDriver = options.queueDriver ?? 'internal';
    this.queueBackend = options.queueBackend ?? 'lease';
    this.queueRedisUrl = options.queueRedisUrl ?? process.env.QUEUE_REDIS_URL ?? 'redis://127.0.0.1:6379';
    this.queueName = options.queueName ?? process.env.QUEUE_NAME ?? 'human2-video-tasks';
    this.queueLoopEnabled = options.queueLoopEnabled ?? true;
    this.queueLeaseOwnerId = options.queueLeaseOwnerId ?? `worker-${process.pid}`;
    this.queueLeaseTtlMs = Math.max(1000, options.queueLeaseTtlMs ?? 6000);
    this.failureInjectionEnabled = options.failureInjectionEnabled ?? env.failureInjectionEnabled;
    this.failureInjectionTaskTypes = this.parseFailureInjectionTaskTypes(options.failureInjectionTaskTypes ?? env.failureInjectionTaskTypes);
    this.failureInjectionErrorCodes = this.parseFailureInjectionErrorCodes(options.failureInjectionErrorCodes ?? env.failureInjectionErrorCodes);
    this.failureInjectionRatio = this.clampFailureInjectionRatio(options.failureInjectionRatio ?? env.failureInjectionRatio);
    this.queueTimer = this.queueLoopEnabled && this.queueBackend === 'lease'
      ? setInterval(() => {
          void this.pumpQueuesByMode();
        }, 180)
      : null;
    this.queueTimer?.unref();
    if (this.queueBackend === 'bullmq') {
      void this.initBullmq();
    }
  }

  async shutdown(): Promise<void> {
    if (this.queueTimer) {
      clearInterval(this.queueTimer);
    }
    if (this.queueDriver === 'external') {
      this.store.releaseQueueWorkerLease(this.queueLeaseOwnerId);
    }
    if (this.bullmqWorker) {
      await this.bullmqWorker.close();
      this.bullmqWorker = null;
      this.bullmqWorkerEnabled = false;
    }
    if (this.bullmqQueue) {
      await this.bullmqQueue.close();
      this.bullmqQueue = null;
      this.bullmqReady = false;
    }
    const start = Date.now();
    while ((this.isPumpRunning || this.processingTaskIds.size > 0) && Date.now() - start < 5000) {
      await this.sleep(20);
    }
  }

  resolveProjectIdByDrama(dramaId: string): string | null {
    const drama = this.store.getDramaById(dramaId);
    return drama ? drama.projectId : null;
  }

  getVideoTaskRuntimeSnapshot(): VideoTaskRuntimeSnapshot {
    const metrics = this.store.getVideoTaskMetrics();
    const lock = this.store.getQueueWorkerLease();
    return {
      heartbeatAt: new Date().toISOString(),
      isPumpRunning: this.isPumpRunning,
      maxConcurrent: this.maxConcurrent,
      activeWorkerCount: this.processingTaskIds.size,
      activeTaskIds: [...this.processingTaskIds].sort(),
      queueDriver: this.queueDriver,
      queueBackend: this.queueBackend,
      bullmqReady: this.bullmqReady,
      bullmqWorkerEnabled: this.bullmqWorkerEnabled,
      queueLoopEnabled: this.queueLoopEnabled,
      queueLeaseOwnerId: this.queueLeaseOwnerId,
      lockOwnerId: lock.ownerId,
      lockExpiresAt: lock.expiresAt,
      lockHeartbeatAt: lock.heartbeatAt,
      queuedProjects: this.store.listQueuedVideoTaskProjectIds().length,
      queuedTotal: metrics.queued,
      runningTotal: metrics.running,
      pumpCycleCount: this.pumpCycleCount,
      pumpErrorCount: this.pumpErrorCount,
      lastPumpStartedAt: this.lastPumpStartedAt,
      lastPumpFinishedAt: this.lastPumpFinishedAt,
      lastPumpDurationMs: this.lastPumpDurationMs,
      lastPumpError: this.lastPumpError,
      projects: this.store.listVideoTaskRuntimeProjectStats()
    };
  }

  getFailureInjectionReport(limit = 100): FailureInjectionReport {
    const safeLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
    return {
      enabled: this.failureInjectionEnabled,
      ratio: this.failureInjectionRatio,
      taskTypes: [...this.failureInjectionTaskTypes],
      errorCodes: [...this.failureInjectionErrorCodes],
      generatedAt: new Date().toISOString(),
      totalEvents: this.failureInjectionEvents.length,
      events: this.failureInjectionEvents.slice(-safeLimit).reverse()
    };
  }

  getFailureInjectionConfig(): FailureInjectionConfig {
    return {
      enabled: this.failureInjectionEnabled,
      ratio: this.failureInjectionRatio,
      taskTypes: [...this.failureInjectionTaskTypes],
      errorCodes: [...this.failureInjectionErrorCodes]
    };
  }

  updateFailureInjectionConfig(input: {
    enabled?: boolean;
    ratio?: number;
    taskTypes?: Array<'video' | 'audio' | 'video_merge'>;
    errorCodes?: Array<'CAPABILITY_MISMATCH' | 'PROVIDER_AUTH_FAILED' | 'PROVIDER_RATE_LIMITED' | 'PROVIDER_TIMEOUT' | 'PROVIDER_UNKNOWN'>;
  }): FailureInjectionConfig {
    if (typeof input.enabled === 'boolean') {
      this.failureInjectionEnabled = input.enabled;
    }
    if (typeof input.ratio === 'number') {
      this.failureInjectionRatio = this.clampFailureInjectionRatio(input.ratio);
    }
    if (Array.isArray(input.taskTypes)) {
      this.failureInjectionTaskTypes = new Set(
        input.taskTypes.filter((item): item is 'video' | 'audio' | 'video_merge' => FAILURE_INJECTION_TASK_TYPES.has(item))
      );
    }
    if (Array.isArray(input.errorCodes)) {
      const filtered = input.errorCodes.filter(
        (item): item is 'CAPABILITY_MISMATCH' | 'PROVIDER_AUTH_FAILED' | 'PROVIDER_RATE_LIMITED' | 'PROVIDER_TIMEOUT' | 'PROVIDER_UNKNOWN' =>
          FAILURE_INJECTION_ERROR_CODES.has(item)
      );
      if (filtered.length > 0) {
        this.failureInjectionErrorCodes = filtered;
      }
    }
    return this.getFailureInjectionConfig();
  }

  exportFailureInjectionEvents(input: {
    format: 'json' | 'csv';
    limit?: number;
    taskType?: 'video' | 'audio' | 'video_merge';
    errorCode?: 'CAPABILITY_MISMATCH' | 'PROVIDER_AUTH_FAILED' | 'PROVIDER_RATE_LIMITED' | 'PROVIDER_TIMEOUT' | 'PROVIDER_UNKNOWN';
  }): { filename: string; contentType: string; body: string } {
    const report = this.getFailureInjectionReport(Math.max(1, Math.min(500, Math.trunc(input.limit ?? 200))));
    const filtered = report.events.filter((item) => {
      if (input.taskType && item.taskType !== input.taskType) {
        return false;
      }
      if (input.errorCode && item.errorCode !== input.errorCode) {
        return false;
      }
      return true;
    });
    if (input.format === 'json') {
      return {
        filename: `failure-injection-events-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify(filtered, null, 2)
      };
    }
    const csvEscape = (raw: string): string => `"${raw.replaceAll('"', '""')}"`;
    const rows = filtered.map((item) =>
      [item.id, item.at, item.taskType, item.projectId, item.taskId, item.stage, item.errorCode, item.message].map(csvEscape).join(',')
    );
    return {
      filename: `failure-injection-events-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`,
      contentType: 'text/csv; charset=utf-8',
      body: ['"id","at","taskType","projectId","taskId","stage","errorCode","message"', ...rows].join('\n')
    };
  }

  clearFailureInjectionEvents(): { cleared: number } {
    const cleared = this.failureInjectionEvents.length;
    this.failureInjectionEvents.length = 0;
    return { cleared };
  }

  async pumpQueuesByMode(): Promise<void> {
    if (!this.queueLoopEnabled) {
      return;
    }
    if (this.queueBackend === 'bullmq') {
      return;
    }
    if (this.queueDriver === 'external') {
      const lease = this.store.upsertQueueWorkerLease({
        ownerId: this.queueLeaseOwnerId,
        ttlMs: this.queueLeaseTtlMs
      });
      if (!lease.acquired) {
        return;
      }
    }
    await this.pumpQueues();
  }

  private async dispatchQueuedTask(taskId: string): Promise<void> {
    if (this.queueBackend === 'bullmq') {
      if (!this.bullmqReady || !this.bullmqQueue) {
        void this.pumpQueuesByMode();
        return;
      }
      try {
        await this.bullmqQueue.add(
          'video_task',
          { taskId },
          {
            jobId: taskId,
            removeOnComplete: 2000,
            removeOnFail: 2000
          }
        );
        return;
      } catch (error) {
        this.lastPumpError = error instanceof Error ? `bullmq enqueue failed: ${error.message}` : 'bullmq enqueue failed';
      }
    }
    void this.pumpQueuesByMode();
  }

  private async initBullmq(): Promise<void> {
    try {
      const dynamicImporter = new Function('name', 'return import(name)') as (name: string) => Promise<any>;
      const loaded = await dynamicImporter('bullmq');
      const QueueCtor = loaded.Queue as new (name: string, options: Record<string, unknown>) => BullmqQueueLike;
      const WorkerCtor = loaded.Worker as
        | (new (
            name: string,
            processor: (job: { data?: Record<string, unknown> }) => Promise<void>,
            options: Record<string, unknown>
          ) => BullmqWorkerLike)
        | undefined;

      if (!QueueCtor) {
        this.lastPumpError = 'bullmq module loaded without Queue constructor';
        return;
      }

      this.bullmqQueue = new QueueCtor(this.queueName, {
        connection: { url: this.queueRedisUrl }
      });
      this.bullmqReady = true;

      if (this.queueLoopEnabled && WorkerCtor) {
        this.bullmqWorker = new WorkerCtor(
          this.queueName,
          async (job) => {
            const taskId = typeof job?.data?.taskId === 'string' ? job.data.taskId : '';
            if (!taskId) {
              return;
            }
            await this.runQueuedVideoTaskById(taskId);
          },
          {
            connection: { url: this.queueRedisUrl },
            concurrency: Math.max(1, this.maxConcurrent)
          }
        );
        this.bullmqWorkerEnabled = true;
      }
    } catch (error) {
      this.lastPumpError = error instanceof Error ? `bullmq disabled: ${error.message}` : 'bullmq disabled';
      this.bullmqReady = false;
      this.bullmqWorkerEnabled = false;
      this.bullmqQueue = null;
      this.bullmqWorker = null;
    }
  }

  listStoryboards(projectId: string): Storyboard[] | null {
    return this.storyboardAssetService.listStoryboards(projectId);
  }

  listAssets(projectId: string): Asset[] | null {
    return this.storyboardAssetService.listAssets(projectId);
  }

  listAssetsByEpisode(projectId: string, episodeId: string): Asset[] | null {
    return this.store.listAssetsByEpisode(projectId, episodeId);
  }

  listDomainEntitiesByEpisode(projectId: string, episodeId: string): { characters: DomainEntity[]; scenes: DomainEntity[]; props: DomainEntity[] } | null {
    // Get domain entities linked to this episode
    const episodeEntityRelations = this.store.listEpisodeDomainEntityRelations(projectId, episodeId) ?? [];

    const characterEntityIds = episodeEntityRelations.filter((r) => r.role === 'character').map((r) => r.entityId);
    const sceneEntityIds = episodeEntityRelations.filter((r) => r.role === 'scene').map((r) => r.entityId);
    const propEntityIds = episodeEntityRelations.filter((r) => r.role === 'prop').map((r) => r.entityId);

    const allDomainEntities = this.store.listDomainEntities(projectId, {}) ?? [];

    const characters = allDomainEntities.filter((e) => characterEntityIds.includes(e.id));
    const scenes = allDomainEntities.filter((e) => sceneEntityIds.includes(e.id));
    const props = allDomainEntities.filter((e) => propEntityIds.includes(e.id));

    return {
      characters,
      scenes,
      props
    };
  }

  listScenes(projectId: string): Scene[] | null {
    return this.storyboardAssetService.listScenes(projectId);
  }

  listVideoTasks(projectId: string): VideoTask[] | null {
    return this.store.listVideoTasks(projectId);
  }

  listAudioTasks(projectId: string): AudioTask[] | null {
    return this.audioRuntimeService.listAudioTasks(projectId);
  }

  listAudioExtracts(projectId: string): AudioExtractItem[] | null {
    return this.audioRuntimeService.listAudioExtracts(projectId);
  }

  resolveAudioExtractDownload(projectId: string, extractId: string): { path: string } | { reason: 'not_found' | 'forbidden' } {
    return this.audioRuntimeService.resolveAudioExtractDownload(projectId, extractId);
  }

  resolveAudioTaskDownload(projectId: string, taskId: string): { path: string } | { reason: 'not_found' | 'not_ready' | 'forbidden' } {
    return this.audioRuntimeService.resolveAudioTaskDownload(projectId, taskId);
  }

  async generateStoryboards(
    projectId: string,
    scriptId: string,
    options: {
      modelId?: string;
      customModel?: string;
      resolution?: string;
      aspectRatio?: string;
      providerOptions?: Record<string, unknown>;
    } = {}
  ): Promise<Storyboard[] | null> {
    return this.storyboardAssetService.generateStoryboards(projectId, scriptId, options);
  }

  async planStoryboards(
    projectId: string,
    scriptId: string,
    options: {
      modelId?: string;
      customModel?: string;
      autoExtractEntities?: boolean;
    } = {}
  ): Promise<Storyboard[] | null> {
    return this.storyboardAssetService.planStoryboards(projectId, scriptId, {
      modelId: options.modelId,
      customModel: options.customModel,
      autoExtractEntities: options.autoExtractEntities ?? true // 默认启用自动提取实体
    });
  }

  async renderStoryboardImages(
    projectId: string,
    input: {
      scriptId?: string;
      storyboardIds?: string[];
      modelId?: string;
      customModel?: string;
      resolution?: string;
      aspectRatio?: string;
      providerOptions?: Record<string, unknown>;
    } = {}
  ): Promise<Storyboard[] | null> {
    return this.storyboardAssetService.renderStoryboardImages(projectId, input);
  }

  async generateAssets(
    projectId: string,
    storyboardId: string,
    options: {
      modelId?: string;
      customModel?: string;
      resolution?: string;
      aspectRatio?: string;
      providerOptions?: Record<string, unknown>;
    } = {}
  ): Promise<Asset[] | null> {
    return this.storyboardAssetService.generateAssets(projectId, storyboardId, options);
  }

  async rewriteStoryboardPrompt(
    projectId: string,
    storyboardId: string,
    input: { instruction: string; modelId?: string; customModel?: string }
  ): Promise<Storyboard | null> {
    return this.storyboardPromptService.rewriteStoryboardPrompt(projectId, storyboardId, input);
  }

  async generateVideoPrompt(
    projectId: string,
    storyboardId: string,
    input: { style?: string; modelId?: string; customModel?: string }
  ): Promise<{ prompt: string } | null> {
    return this.storyboardPromptService.generateVideoPrompt(projectId, storyboardId, input);
  }

  async generateFramePrompt(
    projectId: string,
    storyboardId: string,
    input: {
      frameType: 'opening' | 'middle' | 'ending' | 'action' | 'emotion';
      style?: string;
      shotSize?: 'ecu' | 'cu' | 'mcu' | 'ms' | 'mls' | 'ls' | 'els';
      cameraMove?: 'static' | 'pan' | 'tilt' | 'dolly' | 'truck' | 'handheld';
      lighting?: string;
      mood?: string;
      instruction?: string;
      modelId?: string;
      customModel?: string;
    }
  ): Promise<
    | {
        prompt: string;
        frameType: 'opening' | 'middle' | 'ending' | 'action' | 'emotion';
        style: string;
        shotSize: string;
        cameraMove: string;
        lighting: string;
        mood: string;
      }
    | null
  > {
    return this.storyboardPromptService.generateFramePrompt(projectId, storyboardId, input);
  }

  async generateEpisodeFramePromptsBatch(
    projectId: string,
    episodeId: string,
    input: {
      frameType: 'opening' | 'middle' | 'ending' | 'action' | 'emotion';
      style?: string;
      shotSize?: 'ecu' | 'cu' | 'mcu' | 'ms' | 'mls' | 'ls' | 'els';
      cameraMove?: 'static' | 'pan' | 'tilt' | 'dolly' | 'truck' | 'handheld';
      lighting?: string;
      mood?: string;
      instruction?: string;
      modelId?: string;
      customModel?: string;
      saveAs?: 'none' | 'replace_storyboard_prompt';
      limit?: number;
    }
  ): Promise<
    | {
        episodeId: string;
        total: number;
        generated: number;
        updatedStoryboardPrompts: number;
        items: Array<{
          storyboardId: string;
          storyboardTitle: string;
          prompt: string;
          updated: boolean;
        }>;
      }
    | null
  > {
    return this.storyboardPromptService.generateEpisodeFramePromptsBatch(projectId, episodeId, input);
  }

  listStoryboardFramePromptHistory(
    projectId: string,
    storyboardId: string,
    input: {
      limit?: number;
      frameType?: 'opening' | 'middle' | 'ending' | 'action' | 'emotion';
      source?: 'single' | 'episode_batch' | 'workflow_batch' | 'rollback';
      startAt?: string;
      endAt?: string;
    } = {}
  ): FramePromptHistoryEntry[] | null {
    return this.storyboardPromptService.listStoryboardFramePromptHistory(projectId, storyboardId, input);
  }

  rollbackStoryboardFramePrompt(
    projectId: string,
    storyboardId: string,
    historyId: string,
    input: { actor?: string; comment?: string } = {}
  ): { storyboard: Storyboard; restored: FramePromptHistoryEntry } | null {
    return this.storyboardPromptService.rollbackStoryboardFramePrompt(projectId, storyboardId, historyId, input);
  }

  listStoryboardFramePromptRollbackAudits(
    projectId: string,
    storyboardId: string,
    input: { limit?: number; actor?: string; startAt?: string; endAt?: string } = {}
  ): FramePromptRollbackAuditEntry[] | null {
    return this.storyboardPromptService.listStoryboardFramePromptRollbackAudits(projectId, storyboardId, input);
  }

  finalizeEpisodeDelivery(
    projectId: string,
    episodeId: string,
    input: { actor?: string; comment?: string } = {}
  ): {
    episode: { id: string; status: 'published' };
    latestMergeId: string | null;
    downloadUrl: string | null;
    actor: string;
    comment: string;
  } | null {
    return this.episodeDeliveryService.finalizeEpisodeDelivery(projectId, episodeId, input);
  }

  getEpisodeDeliveryDownload(projectId: string, episodeId: string): { mergeId: string; url: string } | null {
    return this.episodeDeliveryService.getEpisodeDeliveryDownload(projectId, episodeId);
  }

  listEpisodeDeliveryVersions(projectId: string, episodeId: string, limit = 50): EpisodeDeliveryVersionEntry[] | null {
    return this.episodeDeliveryService.listEpisodeDeliveryVersions(projectId, episodeId, limit);
  }

  compareEpisodeDeliveryVersions(
    projectId: string,
    episodeId: string,
    currentVersionId: string,
    previousVersionId?: string
  ):
    | {
        current: EpisodeDeliveryVersionEntry;
        previous: EpisodeDeliveryVersionEntry;
        changed: {
          mergeId: boolean;
          downloadUrl: boolean;
          actor: boolean;
          comment: boolean;
        };
        metrics: {
          currentClipCount: number;
          previousClipCount: number;
          currentDurationSec: number;
          previousDurationSec: number;
        };
      }
    | null {
    return this.episodeDeliveryService.compareEpisodeDeliveryVersions(projectId, episodeId, currentVersionId, previousVersionId);
  }

  buildEpisodeDeliveryCompareReport(
    projectId: string,
    episodeId: string,
    currentVersionId: string,
    previousVersionId?: string
  ):
    | {
        exportedAt: string;
        projectId: string;
        episodeId: string;
        compare: NonNullable<ReturnType<PipelineService['compareEpisodeDeliveryVersions']>>;
      }
    | null {
    return this.episodeDeliveryService.buildEpisodeDeliveryCompareReport(projectId, episodeId, currentVersionId, previousVersionId);
  }

  buildEpisodeDeliveryCompareReportCsv(
    projectId: string,
    episodeId: string,
    currentVersionId: string,
    previousVersionId?: string
  ): string | null {
    return this.episodeDeliveryService.buildEpisodeDeliveryCompareReportCsv(projectId, episodeId, currentVersionId, previousVersionId);
  }

  buildEpisodeDeliveryPackage(
    projectId: string,
    episodeId: string,
    versionId?: string
  ):
    | {
        manifestVersion: string;
        exportedAt: string;
        project: { id: string; name: string; description: string };
        episode: { id: string; title: string; orderIndex: number; status: 'draft' | 'ready' | 'published' };
        version: EpisodeDeliveryVersionEntry;
        merge: {
          id: string;
          title: string;
          status: string;
          resultUrl: string | null;
          outputPath: string | null;
          params: VideoMerge['params'];
          clips: VideoMerge['clips'];
          updatedAt: string;
          createdAt: string;
        } | null;
        assetsSnapshot: Array<{
          id: string;
          storyboardId: string;
          name: string;
          type: 'character' | 'scene' | 'prop';
          prompt: string;
          imageUrl: string | null;
        }>;
        reproducibility: {
          paramsHash: string;
          clipsHash: string;
          assetsHash: string;
          contentHash: string;
        };
        artifact: {
          exists: boolean;
          path: string | null;
          sizeBytes: number | null;
          updatedAt: string | null;
          resultUrl: string | null;
        };
        lineage: {
          versionCount: number;
          previousVersionId: string | null;
          compareChanged: { mergeId: boolean; downloadUrl: boolean; actor: boolean; comment: boolean } | null;
        };
      }
    | null {
    return this.episodeDeliveryService.buildEpisodeDeliveryPackage(projectId, episodeId, versionId);
  }

  async buildEpisodeDeliveryPackageArchive(
    projectId: string,
    episodeId: string,
    input: { versionId?: string; includeMedia?: boolean } = {}
  ): Promise<{ path: string; fileName: string } | null> {
    return this.episodeDeliveryService.buildEpisodeDeliveryPackageArchive(projectId, episodeId, input);
  }

  async verifyDeliveryPackageArchive(
    zipFile: Buffer
  ): Promise<{
    ok: boolean;
    signatureValid: boolean;
    checksumsValid: boolean;
    checkedFiles: number;
    missingFiles: string[];
    mismatchedFiles: Array<{ path: string; expected: string; actual: string | null }>;
    message: string;
  }> {
    return this.episodeDeliveryService.verifyDeliveryPackageArchive(zipFile);
  }

  async generateProjectFramePromptsByWorkflow(
    projectId: string,
    input: {
      statuses?: EpisodeWorkflowStatus[];
      frameType: 'opening' | 'middle' | 'ending' | 'action' | 'emotion';
      style?: string;
      shotSize?: 'ecu' | 'cu' | 'mcu' | 'ms' | 'mls' | 'ls' | 'els';
      cameraMove?: 'static' | 'pan' | 'tilt' | 'dolly' | 'truck' | 'handheld';
      lighting?: string;
      mood?: string;
      instruction?: string;
      modelId?: string;
      customModel?: string;
      saveAs?: 'none' | 'replace_storyboard_prompt';
      limitPerEpisode?: number;
      autoTransitionToInReview?: boolean;
      actor?: string;
      comment?: string;
    }
  ): Promise<
    | {
        statuses: EpisodeWorkflowStatus[];
        episodesMatched: number;
        episodesProcessed: number;
        generatedTotal: number;
        updatedStoryboardPrompts: number;
        transitionedEpisodeIds: string[];
        skippedTransitionEpisodeIds: string[];
        episodes: Array<{
          episodeId: string;
          generated: number;
          updatedStoryboardPrompts: number;
        }>;
      }
    | null
  > {
    return this.storyboardPromptService.generateProjectFramePromptsByWorkflow(projectId, input);
  }

  async generateShotImage(
    projectId: string,
    storyboardId: string,
    options: {
      modelId?: string;
      customModel?: string;
      resolution?: string;
      aspectRatio?: string;
      instruction?: string;
      providerOptions?: Record<string, unknown>;
    } = {}
  ): Promise<Storyboard | null> {
    return this.storyboardAssetService.generateShotImage(projectId, storyboardId, options);
  }

  async batchSuperResStoryboards(
    projectId: string,
    input: {
      storyboardIds?: string[];
      scale?: number;
      modelId?: string;
      customModel?: string;
      resolution?: string;
      aspectRatio?: string;
    } = {}
  ): Promise<{
    updated: Storyboard[];
    skippedIds: string[];
    notFoundIds: string[];
  } | null> {
    return this.storyboardAssetService.batchSuperResStoryboards(projectId, input);
  }

  uploadStoryboardImage(projectId: string, storyboardId: string, imageUrl: string): Storyboard | null {
    return this.storyboardAssetService.uploadStoryboardImage(projectId, storyboardId, imageUrl);
  }

  updateStoryboard(
    projectId: string,
    storyboardId: string,
    input: { title?: string; prompt?: string; imageUrl?: string | null; sceneId?: string | null; episodeId?: string | null }
  ): Storyboard | null {
    return this.storyboardAssetService.updateStoryboard(projectId, storyboardId, input);
  }

  createScene(projectId: string, input: { name: string; description?: string; prompt?: string }): Scene | null {
    return this.storyboardAssetService.createScene(projectId, input);
  }

  updateScene(projectId: string, sceneId: string, input: { name?: string; description?: string; prompt?: string }): Scene | null {
    return this.storyboardAssetService.updateScene(projectId, sceneId, input);
  }

  deleteScene(projectId: string, sceneId: string): boolean {
    return this.storyboardAssetService.deleteScene(projectId, sceneId);
  }

  listStoryboardAssetRelations(projectId: string, storyboardId: string): StoryboardAssetRelation[] | null {
    return this.storyboardAssetService.listStoryboardAssetRelations(projectId, storyboardId);
  }

  replaceStoryboardAssetRelations(
    projectId: string,
    storyboardId: string,
    input: { sceneAssetId?: string | null; characterAssetIds?: string[]; propAssetIds?: string[] }
  ): StoryboardAssetRelation[] | null {
    return this.storyboardAssetService.replaceStoryboardAssetRelations(projectId, storyboardId, input);
  }

  createAsset(
    projectId: string,
    input: {
      storyboardId: string;
      name: string;
      type: 'character' | 'scene' | 'prop';
      prompt: string;
      imageUrl?: string | null;
      voiceProfile?: Asset['voiceProfile'];
    }
  ): Asset | null {
    return this.storyboardAssetService.createAsset(projectId, input);
  }

  updateAsset(
    projectId: string,
    assetId: string,
    input: {
      name?: string;
      type?: 'character' | 'scene' | 'prop';
      prompt?: string;
      imageUrl?: string | null;
      voiceProfile?: Asset['voiceProfile'];
    }
  ): Asset | null {
    return this.storyboardAssetService.updateAsset(projectId, assetId, input);
  }

  deleteAsset(projectId: string, assetId: string): boolean {
    return this.storyboardAssetService.deleteAsset(projectId, assetId);
  }

  async polishAssetPrompt(
    projectId: string,
    assetId: string,
    input: { instruction?: string; modelId?: string; customModel?: string }
  ): Promise<Asset | null> {
    return this.storyboardAssetService.polishAssetPrompt(projectId, assetId, input);
  }

  async redrawAssetImage(
    projectId: string,
    assetId: string,
    input: {
      instruction?: string;
      modelId?: string;
      customModel?: string;
      resolution?: string;
      aspectRatio?: string;
      providerOptions?: Record<string, unknown>;
    }
  ): Promise<Asset | null> {
    return this.storyboardAssetService.redrawAssetImage(projectId, assetId, input);
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
      imageWithRoles?: Array<{ url: string; role: 'first_frame' | 'last_frame' | 'reference' }>;
      endFrame?: string;
      providerOptions?: Record<string, unknown>;
      autoPolicyApplied?: number;
    } = {}
  ): Promise<VideoTask | null> {
    return this.videoRuntimeService.createAndRunVideoTask(projectId, storyboardId, priority, options);
  }

  async retryVideoTask(projectId: string, taskId: string, source: 'manual' | 'auto' = 'manual'): Promise<VideoTask | null> {
    return this.videoRuntimeService.retryVideoTask(projectId, taskId, source);
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
      imageWithRoles?: Array<{ url: string; role: 'first_frame' | 'last_frame' | 'reference' }>;
      endFrame?: string;
      providerOptions?: Record<string, unknown>;
    } = {}
  ): Promise<{
    tasks: VideoTask[];
    createdStoryboardIds: string[];
    skippedStoryboardIds: string[];
  } | null> {
    return this.videoRuntimeService.createVideoTasksBatch(projectId, storyboardIds, priority, options);
  }

  async generateEpisodeAssetsBatch(
    projectId: string,
    episodeId: string,
    options: {
      modelId?: string;
      customModel?: string;
      resolution?: string;
      aspectRatio?: string;
      providerOptions?: Record<string, unknown>;
    } = {}
  ): Promise<{ assets: Asset[]; createdStoryboardIds: string[]; skippedStoryboardIds: string[] } | null> {
    return this.storyboardAssetService.generateEpisodeAssetsBatch(projectId, episodeId, options);
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
      imageWithRoles?: Array<{ url: string; role: 'first_frame' | 'last_frame' | 'reference' }>;
      endFrame?: string;
      providerOptions?: Record<string, unknown>;
    } = {}
  ): Promise<{
    tasks: VideoTask[];
    createdStoryboardIds: string[];
    skippedStoryboardIds: string[];
  } | null> {
    return this.videoRuntimeService.createEpisodeVideoTasksBatch(projectId, episodeId, priority, options);
  }

  async generateEpisodesAssetsBatch(
    projectId: string,
    input: {
      episodeIds?: string[];
      modelId?: string;
      customModel?: string;
      resolution?: string;
      aspectRatio?: string;
      providerOptions?: Record<string, unknown>;
      scope?: 'base' | 'shot';
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
    return this.storyboardAssetService.generateEpisodesAssetsBatch(projectId, input);
  }

  precheckEpisodesAssetsBatch(
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
          conflictReason: 'asset_exists';
        }>;
        summary: {
          totalEpisodes: number;
          totalStoryboards: number;
          totalCreatable: number;
          totalConflicts: number;
        };
      }
    | null {
    return this.storyboardAssetService.precheckEpisodesAssetsBatch(projectId, input);
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
      imageWithRoles?: Array<{ url: string; role: 'first_frame' | 'last_frame' | 'reference' }>;
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
    return this.videoRuntimeService.createEpisodesVideoTasksBatch(projectId, input);
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
    return this.videoRuntimeService.precheckEpisodesVideoTasksBatch(projectId, input);
  }

  approveEpisodeWorkflow(projectId: string, episodeId: string): { episode: { id: string; status: 'ready' }; storyboards: number } | null {
    const episode = this.store.updateEpisode(projectId, episodeId, { status: 'ready' });
    const storyboards = this.store.listStoryboardsByEpisode(projectId, episodeId);
    if (!episode || !storyboards) {
      return null;
    }
    return {
      episode: { id: episode.id, status: 'ready' },
      storyboards: storyboards.length
    };
  }

  async runFullChainFromScript(projectId: string, scriptId: string): Promise<{
    storyboards: Storyboard[];
    assets: Asset[];
    videoTasks: VideoTask[];
    createdAssetStoryboardIds: string[];
    skippedAssetStoryboardIds: string[];
    createdVideoStoryboardIds: string[];
    skippedVideoStoryboardIds: string[];
  } | null> {
    const generatedStoryboards = await this.generateStoryboards(projectId, scriptId);
    if (!generatedStoryboards) {
      return null;
    }

    const existingAssets = this.store.listAssets(projectId) ?? [];
    const assetStoryboardIds = new Set(existingAssets.map((item) => item.storyboardId));
    const createdAssetStoryboardIds: string[] = [];
    const skippedAssetStoryboardIds: string[] = [];

    for (const storyboard of generatedStoryboards) {
      if (assetStoryboardIds.has(storyboard.id)) {
        skippedAssetStoryboardIds.push(storyboard.id);
        continue;
      }

      const assets = await this.generateAssets(projectId, storyboard.id);
      if (assets) {
        createdAssetStoryboardIds.push(storyboard.id);
        assetStoryboardIds.add(storyboard.id);
      } else {
        skippedAssetStoryboardIds.push(storyboard.id);
      }
    }

    const batch = await this.createVideoTasksBatch(
      projectId,
      generatedStoryboards.map((item) => item.id)
    );
    if (!batch) {
      return null;
    }

    return {
      storyboards: this.store.listStoryboards(projectId) ?? [],
      assets: this.store.listAssets(projectId) ?? [],
      videoTasks: batch.tasks,
      createdAssetStoryboardIds,
      skippedAssetStoryboardIds,
      createdVideoStoryboardIds: batch.createdStoryboardIds,
      skippedVideoStoryboardIds: batch.skippedStoryboardIds
    };
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async pumpQueues(): Promise<void> {
    if (this.isPumpRunning) {
      return;
    }
    this.pumpCycleCount += 1;
    this.isPumpRunning = true;
    const startedAtMs = Date.now();
    this.lastPumpStartedAt = new Date(startedAtMs).toISOString();
    try {
      const projectIds = this.store.listQueuedVideoTaskProjectIds();
      for (const projectId of projectIds) {
        await this.pumpProjectQueue(projectId);
      }
      this.lastPumpError = null;
    } catch (error) {
      this.pumpErrorCount += 1;
      this.lastPumpError = error instanceof Error ? error.message : 'Unknown queue pump error';
    } finally {
      this.isPumpRunning = false;
      const finishedAtMs = Date.now();
      this.lastPumpFinishedAt = new Date(finishedAtMs).toISOString();
      this.lastPumpDurationMs = Math.max(0, finishedAtMs - startedAtMs);
    }
  }

  private async pumpProjectQueue(projectId: string): Promise<void> {
    while (this.store.countRunningVideoTasks(projectId) < this.maxConcurrent) {
      const nextTask = this.store.getNextQueuedVideoTask(projectId);
      if (!nextTask) {
        return;
      }
      if (this.processingTaskIds.has(nextTask.id)) {
        return;
      }
      this.processingTaskIds.add(nextTask.id);
      void this.videoRuntimeService.runQueuedVideoTask(nextTask).finally(() => {
        this.processingTaskIds.delete(nextTask.id);
        void this.pumpQueuesByMode();
      });
    }
  }

  private async runQueuedVideoTaskById(taskId: string): Promise<void> {
    const task = this.store.getVideoTaskById(taskId);
    if (!task || task.status !== 'queued') {
      return;
    }
    if (this.processingTaskIds.has(task.id)) {
      return;
    }
    this.processingTaskIds.add(task.id);
    try {
      await this.videoRuntimeService.runQueuedVideoTask(task);
    } finally {
      this.processingTaskIds.delete(task.id);
    }
  }

  async cancelVideoTask(projectId: string, taskId: string): Promise<VideoTask | null> {
    return this.videoRuntimeService.cancelVideoTask(projectId, taskId);
  }

  async createAndRunAudioTask(
    projectId: string,
    storyboardId: string,
    priority: 'low' | 'medium' | 'high' = 'medium',
    options: {
      modelId?: string;
      customModel?: string;
      voice?: string;
      speed?: number;
      emotion?: string;
      format?: string;
      providerOptions?: Record<string, unknown>;
    } = {}
  ): Promise<AudioTask | null> {
    return this.audioRuntimeService.createAndRunAudioTask(projectId, storyboardId, priority, options);
  }

  async retryAudioTask(projectId: string, taskId: string): Promise<AudioTask | null> {
    return this.audioRuntimeService.retryAudioTask(projectId, taskId);
  }

  async createTimelineAudioTasksBatch(
    projectId: string,
    episodeId: string | null,
    priority: 'low' | 'medium' | 'high' = 'medium',
    options: {
      modelId?: string;
      customModel?: string;
      voice?: string;
      speed?: number;
      emotion?: string;
      format?: string;
      providerOptions?: Record<string, unknown>;
    } = {}
  ): Promise<
    | {
        tasks: AudioTask[];
        createdStoryboardIds: string[];
        skippedStoryboardIds: string[];
        createdTaskCount: number;
        speakerCount: number;
        usedConfiguredTextModel: boolean;
        fallback: boolean;
        modelLabel: string | null;
      }
    | null
  > {
    const plan = this.mergeTimelineService.getTimelinePlan(projectId, episodeId);
    if (!plan) {
      return null;
    }
    const storyboardIds = [
      ...new Set(
        (plan.tracks ?? [])
          .filter((item) => item.type === 'video')
          .flatMap((item) => item.clips.map((clip) => clip.storyboardId))
      ),
    ];
    const createdStoryboardIds: string[] = [];
    const skippedStoryboardIds: string[] = [];
    let createdTaskCount = 0;
    let usedConfiguredTextModel = false;
    let fallback = false;
    let modelLabel: string | null = null;
    const createdSpeakers = new Set<string>();
    const existingTasks = this.audioRuntimeService.listAudioTasks(projectId) ?? [];
    const audioModelName =
      this.mediaModelPolicyService.resolveModelName('audio', options.modelId, options.customModel) ?? null;
    const audioModelConfig = this.mediaModelPolicyService.pickModelConfig('audio', audioModelName ?? undefined);
    const dialogueVoices = this.pickDialogueVoices(audioModelConfig, options.voice);
    const clipWindows = new Map(
      (plan.tracks ?? [])
        .filter((item) => item.type === 'video')
        .flatMap((item) => item.clips)
        .map((clip, index) => {
          const startMs = typeof clip.startMs === 'number' && Number.isFinite(clip.startMs) ? Math.max(0, Math.floor(clip.startMs)) : index * 5000;
          const endMs =
            typeof clip.endMs === 'number' && Number.isFinite(clip.endMs) && clip.endMs > startMs
              ? Math.floor(clip.endMs)
              : startMs +
                Math.max(
                  1200,
                  Math.floor(
                    (typeof clip.durationSec === 'number' && Number.isFinite(clip.durationSec) && clip.durationSec > 0 ? clip.durationSec : 5) * 1000
                  )
                );
          return [clip.storyboardId, { startMs, endMs }] as const;
        })
    );

    for (const storyboardId of storyboardIds) {
      const dialoguePlan = await this.dialogueTrackPlannerService.planStoryboardDialogue(projectId, storyboardId);
      usedConfiguredTextModel = usedConfiguredTextModel || dialoguePlan.usedConfiguredModel;
      fallback = fallback || dialoguePlan.fallback;
      modelLabel = modelLabel || dialoguePlan.modelLabel;
      const existingStoryboardTasks = existingTasks.filter(
        (task) => task.storyboardId === storyboardId && task.params.trackKind === 'dialogue'
      );
      const doneDialogueSignatures = new Set(
        existingStoryboardTasks
          .filter((task) => task.status === 'done' && task.resultUrl)
          .map((task) => this.buildDialogueTaskSignature(task.params.speaker, task.params.segmentIndex))
      );
      const activeDialogueSignatures = new Set(
        existingStoryboardTasks
          .filter((task) => task.status === 'queued' || task.status === 'running')
          .map((task) => this.buildDialogueTaskSignature(task.params.speaker, task.params.segmentIndex))
      );
      const storyboardWindow = clipWindows.get(storyboardId) ?? { startMs: 0, endMs: 5000 };
      const timingPlan = this.buildDialogueSegmentTimingPlan(dialoguePlan.segments, Math.max(1200, storyboardWindow.endMs - storyboardWindow.startMs));
      const voiceAssignments = this.assignVoicesToDialogueSegments(dialoguePlan.segments, dialogueVoices, options.voice);
      const boundVoiceAssignments = this.resolveDialogueVoiceBindings(projectId, storyboardId, dialoguePlan.segments);
      const createdTasksForStoryboard: AudioTask[] = [];
      for (const [segmentIndex, segment] of dialoguePlan.segments.entries()) {
        const segmentSignature = this.buildDialogueTaskSignature(segment.speaker, segmentIndex);
        if (doneDialogueSignatures.has(segmentSignature) || activeDialogueSignatures.has(segmentSignature)) {
          continue;
        }
        const timing = timingPlan[segmentIndex] ?? { startMs: 0, endMs: storyboardWindow.endMs - storyboardWindow.startMs };
        const binding = boundVoiceAssignments.get(segment.speaker);
        const task = await this.audioRuntimeService.createAndRunAudioTask(projectId, storyboardId, priority, {
          modelId: options.modelId,
          customModel: options.customModel,
          promptOverride: segment.text,
          trackKind: 'dialogue',
          speaker: segment.speaker,
          sourceText: segment.text,
          segmentIndex,
          segmentStartMs: timing.startMs,
          segmentEndMs: timing.endMs,
          voice: options.voice ?? binding?.voice ?? voiceAssignments.get(segment.speaker),
          speed: options.speed ?? binding?.speed,
          // Only forward explicitly selected emotion until dialogue moods are
          // normalized against the active audio model capability catalog.
          emotion: options.emotion,
          format: options.format,
          providerOptions: this.mergeDialogueProviderOptions(options.providerOptions, binding?.providerOptions),
        });
        if (task) {
          createdTasksForStoryboard.push(task);
          createdTaskCount += 1;
          createdSpeakers.add(segment.speaker);
          existingTasks.unshift(task);
          activeDialogueSignatures.add(segmentSignature);
        }
      }
      if (createdTasksForStoryboard.length > 0) {
        createdStoryboardIds.push(storyboardId);
      } else {
        skippedStoryboardIds.push(storyboardId);
      }
    }

    return {
      tasks: this.audioRuntimeService.listAudioTasks(projectId) ?? [],
      createdStoryboardIds,
      skippedStoryboardIds,
      createdTaskCount,
      speakerCount: createdSpeakers.size,
      usedConfiguredTextModel,
      fallback,
      modelLabel,
    };
  }

  private buildDialogueSegmentTimingPlan(
    segments: Array<{ share: number }>,
    clipDurationMs: number
  ): Array<{ startMs: number; endMs: number }> {
    if (segments.length === 0) {
      return [];
    }
    const durationMs = Math.max(1200, clipDurationMs);
    const totalShare = segments.reduce((sum, item) => sum + Math.max(0.2, item.share), 0);
    let cursorMs = 0;
    return segments.map((segment, index) => {
      const remainingMs = durationMs - cursorMs;
      const remainingSegmentCount = segments.length - index;
      const isLast = index === segments.length - 1;
      const reservedForTail = Math.max(0, (remainingSegmentCount - 1) * 400);
      const targetDurationMs = Math.round((durationMs * Math.max(0.2, segment.share)) / totalShare);
      const segmentDurationMs = isLast
        ? Math.max(400, remainingMs)
        : Math.max(400, Math.min(Math.max(400, remainingMs - reservedForTail), targetDurationMs));
      const startMs = cursorMs;
      const endMs = Math.max(startMs + 400, Math.min(durationMs, startMs + segmentDurationMs));
      cursorMs = endMs;
      return { startMs, endMs };
    });
  }

  private pickDialogueVoices(modelConfig: ModelConfig | null, fallbackVoice?: string): string[] {
    const directVoices = this.extractStringArray((modelConfig?.capabilities as Record<string, unknown> | undefined)?.voices);
    if (directVoices.length > 0) {
      return directVoices;
    }
    const nestedAudio = modelConfig?.capabilities && typeof modelConfig.capabilities === 'object'
      ? (modelConfig.capabilities as Record<string, unknown>).audio
      : null;
    const nestedVoices = this.extractStringArray((nestedAudio as Record<string, unknown> | null)?.voices);
    if (nestedVoices.length > 0) {
      return nestedVoices;
    }
    return fallbackVoice ? [fallbackVoice] : [];
  }

  private assignVoicesToDialogueSegments(
    segments: Array<{ speaker: string }>,
    availableVoices: string[],
    fallbackVoice?: string
  ): Map<string, string> {
    const speakers = [...new Set(segments.map((item) => item.speaker).filter(Boolean))];
    const voices = availableVoices.length > 0 ? availableVoices : fallbackVoice ? [fallbackVoice] : [];
    const assignments = new Map<string, string>();
    for (const [index, speaker] of speakers.entries()) {
      if (voices.length > 0) {
        assignments.set(speaker, voices[index % voices.length] ?? voices[0]!);
      }
    }
    return assignments;
  }

  private resolveDialogueVoiceBindings(
    projectId: string,
    storyboardId: string,
    segments: Array<{ speaker: string }>
  ): Map<string, DialogueVoiceBinding> {
    const storyboard = this.store.getStoryboard(projectId, storyboardId);
    if (!storyboard) {
      return new Map();
    }
    const allCharacterAssets = (this.store.listAssets(projectId) ?? []).filter((item) => item.type === 'character');
    if (allCharacterAssets.length === 0) {
      return new Map();
    }
    const relatedAssetIds = new Set<string>([
      ...(storyboard.plan?.characterAssetIds ?? []),
      ...(this.store.listStoryboardAssetRelations(projectId, storyboardId) ?? [])
        .filter((item) => item.role === 'character')
        .map((item) => item.assetId),
    ]);
    const bindings = new Map<string, DialogueVoiceBinding>();
    for (const speaker of [...new Set(segments.map((item) => item.speaker).filter(Boolean))]) {
      const matched = this.matchDialogueCharacterAsset(allCharacterAssets, speaker, relatedAssetIds);
      if (!matched?.voiceProfile?.voice) {
        continue;
      }
      bindings.set(speaker, {
        voice: matched.voiceProfile.voice,
        speed: matched.voiceProfile.speed,
        providerOptions: matched.voiceProfile.providerOptions,
        assetId: matched.id,
        provider: matched.voiceProfile.provider,
      });
    }
    return bindings;
  }

  private matchDialogueCharacterAsset(assets: Asset[], speaker: string, relatedAssetIds: Set<string>): Asset | null {
    const normalizedSpeaker = this.normalizeDialogueSpeakerLabel(speaker);
    if (!normalizedSpeaker) {
      return null;
    }
    let best: { asset: Asset; score: number } | null = null;
    for (const asset of assets) {
      const score = this.scoreDialogueSpeakerAssetMatch(asset, normalizedSpeaker, relatedAssetIds);
      if (score < 0) {
        continue;
      }
      if (!best || score > best.score) {
        best = { asset, score };
      }
    }
    return best?.asset ?? null;
  }

  private scoreDialogueSpeakerAssetMatch(asset: Asset, normalizedSpeaker: string, relatedAssetIds: Set<string>): number {
    const normalizedAssetName = this.normalizeDialogueSpeakerLabel(asset.name);
    if (!normalizedAssetName) {
      return -1;
    }
    let score = -1;
    if (normalizedAssetName === normalizedSpeaker) {
      score = 100;
    } else if (
      normalizedAssetName.endsWith(normalizedSpeaker) ||
      normalizedSpeaker.endsWith(normalizedAssetName) ||
      normalizedAssetName.includes(normalizedSpeaker) ||
      normalizedSpeaker.includes(normalizedAssetName)
    ) {
      score = 70;
    }
    if (score < 0) {
      return -1;
    }
    if (relatedAssetIds.has(asset.id)) {
      score += 20;
    }
    if (asset.voiceProfile?.voice) {
      score += 10;
    }
    return score;
  }

  private normalizeDialogueSpeakerLabel(value: string): string {
    return String(value ?? '')
      .replace(/[（(][^）)]*[）)]/gu, ' ')
      .replace(/[-_ ]?角色资产$/u, '')
      .replace(/\s+/g, '')
      .trim()
      .toLowerCase();
  }

  private buildDialogueTaskSignature(speaker: string | undefined, segmentIndex: number | undefined): string {
    const normalizedSpeaker = String(speaker ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    return [normalizedSpeaker, typeof segmentIndex === 'number' ? String(segmentIndex) : '-1'].join(':');
  }

  private extractStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
  }

  private mergeDialogueProviderOptions(
    providerOptions?: Record<string, unknown>,
    boundProviderOptions?: Record<string, unknown>
  ): Record<string, unknown> | undefined {
    const next = {
      ...(boundProviderOptions && typeof boundProviderOptions === 'object' ? boundProviderOptions : {}),
      ...(providerOptions && typeof providerOptions === 'object' ? providerOptions : {}),
    };
    const apimart = next.apimart && typeof next.apimart === 'object' && !Array.isArray(next.apimart) ? { ...(next.apimart as Record<string, unknown>) } : {};
    if (!('style' in apimart)) {
      apimart.style = 'conversational';
    }
    next.apimart = apimart;
    return Object.keys(next).length > 0 ? next : undefined;
  }

  async createAndRunAudioExtract(
    projectId: string,
    input: {
      videoTaskId?: string;
      sourceUrl?: string;
      format?: 'mp3' | 'wav' | 'aac' | 'flac' | 'ogg';
      sampleRate?: number;
      channels?: number;
      bitrateKbps?: number;
    }
  ): Promise<AudioExtractItem | null> {
    return this.audioRuntimeService.createAndRunAudioExtract(projectId, input);
  }

  listVideoMerges(projectId: string): VideoMerge[] | null {
    return this.mergeTimelineService.listVideoMerges(projectId);
  }

  getVideoMerge(projectId: string, mergeId: string): VideoMerge | null {
    return this.mergeTimelineService.getVideoMerge(projectId, mergeId);
  }

  resolveVideoMergeDownload(projectId: string, mergeId: string): { path: string } | { reason: 'not_found' | 'not_ready' | 'forbidden' } {
    return this.mergeTimelineService.resolveVideoMergeDownload(projectId, mergeId);
  }

  getTimelinePlan(projectId: string, episodeId: string | null): TimelinePlan | null {
    return this.mergeTimelineService.getTimelinePlan(projectId, episodeId);
  }

  saveTimelinePlan(
    projectId: string,
    input: { id?: string; episodeId?: string | null; title?: string; tracks?: TimelineTrack[]; clips: VideoMergeClip[] }
  ): TimelinePlan | null {
    return this.mergeTimelineService.saveTimelinePlan(projectId, input);
  }

  async createVideoMergeFromTimeline(projectId: string, episodeId: string | null, title?: string): Promise<VideoMerge | null> {
    return this.mergeTimelineService.createVideoMergeFromTimeline(projectId, episodeId, title);
  }

  syncTimelineAudioTrack(projectId: string, episodeId: string | null): TimelineAudioTrackSyncResult | null {
    return this.timelinePostProductionService.syncTimelineAudioTrack(projectId, episodeId);
  }

  async generateTimelineSubtitleTrack(
    projectId: string,
    episodeId: string | null,
    input: { modelId?: string; customModel?: string } = {}
  ): Promise<TimelineSubtitleTrackGenerationResult | null> {
    return this.timelinePostProductionService.generateSubtitleTrack(projectId, episodeId, input);
  }

  async saveUploadedImage(
    projectId: string,
    input: {
      originalName: string;
      buffer: Buffer;
      purpose: 'storyboard' | 'asset';
      storyboardId: string;
      assetId?: string;
      assetType?: 'character' | 'scene' | 'prop';
      assetName?: string;
      prompt?: string;
    }
  ): Promise<{ fileUrl: string; storyboard?: Storyboard; asset?: Asset }> {
    return this.mergeTimelineService.saveUploadedImage(projectId, input);
  }

  async saveUploadedImageForAssetObject(
    projectId: string,
    input: {
      objectType: 'character' | 'scene' | 'prop';
      assetId: string;
      originalName: string;
      buffer: Buffer;
    }
  ): Promise<{ fileUrl: string; asset: Asset }> {
    return this.mergeTimelineService.saveUploadedImageForAssetObject(projectId, input);
  }

  resolveUploadedImage(projectId: string, fileName: string): { path: string } | { reason: 'forbidden' | 'not_found' } {
    return this.mergeTimelineService.resolveUploadedImage(projectId, fileName);
  }

  async createAndRunVideoMerge(
    projectId: string,
    input: {
      title?: string;
      clips: Array<{
        storyboardId: string;
        videoTaskId?: string;
        sourceUrl?: string;
        durationSec?: number;
        startMs?: number;
        endMs?: number;
        trimStartMs?: number;
        trimEndMs?: number;
        speed?: number;
        volume?: number;
        muted?: boolean;
        fadeInMs?: number;
        fadeOutMs?: number;
        transition?: VideoMergeClip['transition'];
        keyframe?: VideoMergeClip['keyframe'];
      }>;
      params?: VideoMergeParams;
    }
  ): Promise<VideoMerge | null> {
    return this.mergeTimelineService.createAndRunVideoMerge(projectId, input);
  }

  async retryVideoMerge(projectId: string, mergeId: string): Promise<VideoMerge | null> {
    return this.mergeTimelineService.retryVideoMerge(projectId, mergeId);
  }

  private parseFailureInjectionTaskTypes(raw: string): Set<'video' | 'audio' | 'video_merge'> {
    const values = raw
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((item): item is 'video' | 'audio' | 'video_merge' => FAILURE_INJECTION_TASK_TYPES.has(item));
    return new Set(values);
  }

  private parseFailureInjectionErrorCodes(
    raw: string
  ): Array<'CAPABILITY_MISMATCH' | 'PROVIDER_AUTH_FAILED' | 'PROVIDER_RATE_LIMITED' | 'PROVIDER_TIMEOUT' | 'PROVIDER_UNKNOWN'> {
    const values = raw
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .filter(
        (item): item is 'CAPABILITY_MISMATCH' | 'PROVIDER_AUTH_FAILED' | 'PROVIDER_RATE_LIMITED' | 'PROVIDER_TIMEOUT' | 'PROVIDER_UNKNOWN' =>
          FAILURE_INJECTION_ERROR_CODES.has(item)
      );
    if (values.length > 0) {
      return values;
    }
    return ['PROVIDER_TIMEOUT'];
  }

  private clampFailureInjectionRatio(raw: number): number {
    if (!Number.isFinite(raw)) {
      return 0;
    }
    return Math.max(0, Math.min(1, raw));
  }

  private maybeThrowInjectedFailure(
    taskType: 'video' | 'audio' | 'video_merge',
    input: { projectId: string; taskId: string; stage: string }
  ): void {
    if (!this.failureInjectionEnabled) {
      return;
    }
    if (!this.failureInjectionTaskTypes.has(taskType)) {
      return;
    }
    if (Math.random() > this.failureInjectionRatio) {
      return;
    }
    const errorCode = this.failureInjectionErrorCodes[Math.floor(Math.random() * this.failureInjectionErrorCodes.length)] ?? 'PROVIDER_TIMEOUT';
    const message = `injected_failure:${errorCode}:${taskType}:${input.stage}`;
    this.failureInjectionEvents.push({
      id: `fi_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      at: new Date().toISOString(),
      taskType,
      projectId: input.projectId,
      taskId: input.taskId,
      stage: input.stage,
      errorCode,
      message
    });
    if (this.failureInjectionEvents.length > FAILURE_INJECTION_EVENT_MAX) {
      this.failureInjectionEvents.splice(0, this.failureInjectionEvents.length - FAILURE_INJECTION_EVENT_MAX);
    }
    switch (errorCode) {
      case 'CAPABILITY_MISMATCH':
        throw new ProviderValidationError(message);
      case 'PROVIDER_AUTH_FAILED':
        throw new ProviderAuthError(message);
      case 'PROVIDER_RATE_LIMITED':
        throw new ProviderRateLimitError(message);
      case 'PROVIDER_TIMEOUT':
        throw new ProviderTransientError(message, 504);
      default:
        throw new ProviderError(message, 'unknown');
    }
  }

}
