import { DatabaseSync } from 'node:sqlite';
import {
  AudioTask,
  DomainEntityAudit,
  DomainEntityAuditStats,
  DomainEntity,
  DramaDomain,
  EpisodeDomain,
  EpisodeDomainEntityRelation,
  EpisodeWorkflowAudit,
  EpisodeWorkflowState,
  EpisodeWorkflowStatus,
  Asset,
  Novel,
  Outline,
  PageResult,
  Project,
  Scene,
  Script,
  Storyboard,
  StoryboardAssetRelation,
  EpisodeAssetRelation,
  Task,
  TaskPriority,
  TaskStatus,
  User,
  VideoMerge,
  VideoMergeClip,
  StoryboardDomainEntityRelation,
  VideoTask,
  VideoTaskMetrics,
  VideoTaskEvent,
  VideoTaskListItem,
  TimelinePlan,
  TimelineTrack,
} from '../core/types.js';
import { createSqliteBootstrap } from './sqlite/bootstrap.js';
import { createSqliteClient } from './sqlite/client.js';
import { AssetRepository } from './repositories/asset.repository.js';
import { AuthRepository } from './repositories/auth.repository.js';
import { DramaRepository } from './repositories/drama.repository.js';
import { DomainEntityRepository } from './repositories/domain-entity.repository.js';
import { EpisodeRepository } from './repositories/episode.repository.js';
import { OpsRepository } from './repositories/ops.repository.js';
import { ProjectRepository } from './repositories/project.repository.js';
import { RuntimeTaskRepository } from './repositories/runtime-task.repository.js';
import { SceneRepository } from './repositories/scene.repository.js';
import { SettingsRepository } from './repositories/settings.repository.js';
import { StoryboardRepository } from './repositories/storyboard.repository.js';
import { StudioRepository } from './repositories/studio.repository.js';
import { TimelineRepository } from './repositories/timeline.repository.js';
import {
  mapAsset,
  mapDomainEntity,
  mapDomainEntityAudit,
  mapDrama,
  mapEpisode,
  mapEpisodeAssetRelation,
  mapEpisodeDomainEntityRelation,
  mapEpisodeWorkflowAudit,
  mapEpisodeWorkflowState,
  mapScene,
  mapStoryboard,
  mapStoryboardAssetRelation,
  mapStoryboardDomainEntityRelation,
  mapTimelinePlan,
} from './sqlite/row-mappers.js';
import type {
  AssetRow,
  DomainEntityAuditRow,
  DomainEntityRow,
  DramaRow,
  EpisodeAssetLinkRow,
  EpisodeDomainEntityLinkRow,
  EpisodeRow,
  EpisodeWorkflowAuditRow,
  EpisodeWorkflowStateRow,
  SceneRow,
  SortOrder,
  StoryboardAssetLinkRow,
  StoryboardDomainEntityLinkRow,
  StoryboardRow,
  TimelinePlanRow,
} from './sqlite/row-types.js';

export class SqliteStore {
  private readonly db: DatabaseSync;
  private readonly dbFilePath: string;
  private readonly assetRepository: AssetRepository;
  private readonly authRepository: AuthRepository;
  private readonly dramaRepository: DramaRepository;
  private readonly domainEntityRepository: DomainEntityRepository;
  private readonly episodeRepository: EpisodeRepository;
  private readonly opsRepository: OpsRepository;
  private readonly projectRepository: ProjectRepository;
  private readonly runtimeTaskRepository: RuntimeTaskRepository;
  private readonly sceneRepository: SceneRepository;
  private readonly settingsRepository: SettingsRepository;
  private readonly storyboardRepository: StoryboardRepository;
  private readonly studioRepository: StudioRepository;
  private readonly timelineRepository: TimelineRepository;

  constructor(filePath: string) {
    const { db, dbFilePath } = createSqliteClient(filePath);
    this.db = db;
    this.dbFilePath = dbFilePath;
    this.assetRepository = new AssetRepository(this.db);
    this.authRepository = new AuthRepository(this.db);
    this.dramaRepository = new DramaRepository(this.db);
    this.domainEntityRepository = new DomainEntityRepository(this.db);
    this.episodeRepository = new EpisodeRepository(this.db);
    this.opsRepository = new OpsRepository(this.db, this.dbFilePath);
    this.projectRepository = new ProjectRepository(this.db);
    this.runtimeTaskRepository = new RuntimeTaskRepository(this.db);
    this.sceneRepository = new SceneRepository(this.db);
    this.settingsRepository = new SettingsRepository(this.db);
    this.storyboardRepository = new StoryboardRepository(this.db);
    this.studioRepository = new StudioRepository(this.db);
    this.timelineRepository = new TimelineRepository(this.db);

    const bootstrap = createSqliteBootstrap({
      db: this.db,
      dbFilePath: this.dbFilePath,
      exportBusinessBackup: () => this.exportBusinessBackup(),
      importBusinessBackup: (input) => this.importBusinessBackup(input),
      getSystemSetting: (key) => this.getSystemSetting(key),
      setSystemSetting: (key, value) => this.setSystemSetting(key, value),
    });

    bootstrap.ensurePreInitLegacyColumns();
    bootstrap.initSchema();
    bootstrap.ensureCanonicalDomainEntityTables();
    bootstrap.runSchemaMigrations();
    bootstrap.seedAdmin();
    bootstrap.seedPromptTemplates();
    bootstrap.seedSystemSettings();
  }

  findUserByCredentials(username: string, password: string): User | null {
    return this.authRepository.findUserByCredentials(username, password);
  }

  listProjects(): Project[] {
    return this.projectRepository.listProjects();
  }

  listProjectsPaged(input: {
    q?: string;
    page: number;
    pageSize: number;
    sortBy?: 'createdAt' | 'updatedAt' | 'name';
    order?: SortOrder;
  }): PageResult<Project> {
    return this.projectRepository.listProjectsPaged(input);
  }

  getProjectById(projectId: string): Project | null {
    return this.projectRepository.getProjectById(projectId);
  }

  getNovel(projectId: string): Novel | null {
    return this.studioRepository.getNovel(projectId);
  }

  upsertNovel(projectId: string, title: string, content: string): Novel | null {
    return this.studioRepository.upsertNovel(projectId, title, content);
  }

  listOutlines(projectId: string): Outline[] | null {
    return this.studioRepository.listOutlines(projectId);
  }

  replaceOutlines(projectId: string, outlines: Array<{ id: string; title: string; summary: string; orderIndex: number }>): Outline[] | null {
    return this.studioRepository.replaceOutlines(projectId, outlines);
  }

  getOutline(projectId: string, outlineId: string): Outline | null {
    return this.studioRepository.getOutline(projectId, outlineId);
  }

  createScript(input: {
    id: string;
    projectId: string;
    outlineId: string;
    episodeId?: string | null;
    title: string;
    content: string;
  }): Script | null {
    return this.studioRepository.createScript(input);
  }

  listScripts(projectId: string): Script[] | null {
    return this.studioRepository.listScripts(projectId);
  }

  updateScriptEpisode(projectId: string, scriptId: string, episodeId: string | null): Script | null {
    return this.studioRepository.updateScriptEpisode(projectId, scriptId, episodeId);
  }

  listStoryboards(projectId: string): Storyboard[] | null {
    return this.storyboardRepository.listStoryboards(projectId);
  }

  listStoryboardsByScript(projectId: string, scriptId: string): Storyboard[] | null {
    return this.storyboardRepository.listStoryboardsByScript(projectId, scriptId);
  }

  replaceStoryboards(
    projectId: string,
    scriptId: string,
    items: Array<{ id: string; title: string; prompt: string; plan?: Storyboard['plan']; imageUrl?: string | null; status?: Storyboard['status'] }>
  ): Storyboard[] | null {
    return this.storyboardRepository.replaceStoryboards(projectId, scriptId, items);
  }

  getStoryboard(projectId: string, storyboardId: string): Storyboard | null {
    return this.storyboardRepository.getStoryboard(projectId, storyboardId);
  }

  updateStoryboard(
    projectId: string,
    storyboardId: string,
    input: { title?: string; prompt?: string; plan?: Storyboard['plan'] | null; imageUrl?: string | null; firstFrameUrl?: string | null; lastFrameUrl?: string | null; sceneId?: string | null; episodeId?: string | null }
  ): Storyboard | null {
    return this.storyboardRepository.updateStoryboard(projectId, storyboardId, input);
  }

  listScenes(projectId: string): Scene[] | null {
    return this.sceneRepository.listScenes(projectId);
  }

  createScene(input: { id: string; projectId: string; name: string; description: string; prompt: string }): Scene | null {
    return this.sceneRepository.createScene(input);
  }

  getSceneById(projectId: string, sceneId: string): Scene | null {
    return this.sceneRepository.getSceneById(projectId, sceneId);
  }

  updateScene(projectId: string, sceneId: string, input: { name?: string; description?: string; prompt?: string }): Scene | null {
    return this.sceneRepository.updateScene(projectId, sceneId, input);
  }

  deleteScene(projectId: string, sceneId: string): boolean {
    return this.sceneRepository.deleteScene(projectId, sceneId);
  }

  getDramaByProject(projectId: string): DramaDomain | null {
    return this.dramaRepository.getDramaByProject(projectId);
  }

  getDramaById(dramaId: string): DramaDomain | null {
    return this.dramaRepository.getDramaById(dramaId);
  }

  listDramas(): DramaDomain[] {
    return this.dramaRepository.listDramas();
  }

  upsertDrama(input: { id: string; projectId: string; name: string; description: string }): DramaDomain | null {
    return this.dramaRepository.upsertDrama(input);
  }

  updateDramaStyle(dramaId: string, style: string): DramaDomain | null {
    return this.dramaRepository.updateDramaStyle(dramaId, style);
  }

  listEpisodes(projectId: string): EpisodeDomain[] | null {
    return this.episodeRepository.listEpisodes(projectId);
  }

  listEpisodesByDrama(dramaId: string): EpisodeDomain[] | null {
    return this.episodeRepository.listEpisodesByDrama(dramaId);
  }

  createEpisode(input: {
    id: string;
    projectId: string;
    dramaId: string;
    title: string;
    orderIndex: number;
    status?: EpisodeDomain['status'];
  }): EpisodeDomain | null {
    return this.episodeRepository.createEpisode(input);
  }

  getEpisodeById(projectId: string, episodeId: string): EpisodeDomain | null {
    return this.episodeRepository.getEpisodeById(projectId, episodeId);
  }

  updateEpisode(
    projectId: string,
    episodeId: string,
    input: { title?: string; orderIndex?: number; status?: EpisodeDomain['status'] }
  ): EpisodeDomain | null {
    return this.episodeRepository.updateEpisode(projectId, episodeId, input);
  }

  getEpisodeWorkflowState(projectId: string, episodeId: string): EpisodeWorkflowState | null {
    return this.episodeRepository.getEpisodeWorkflowState(projectId, episodeId);
  }

  transitionEpisodeWorkflow(
    projectId: string,
    episodeId: string,
    input: { toStatus: EpisodeWorkflowStatus; actor: string; comment?: string }
  ): EpisodeWorkflowState | null {
    return this.episodeRepository.transitionEpisodeWorkflow(projectId, episodeId, input);
  }

  setEpisodeWorkflowState(
    projectId: string,
    episodeId: string,
    input: { toStatus: EpisodeWorkflowStatus; actor: string; comment?: string }
  ): EpisodeWorkflowState | null {
    return this.episodeRepository.setEpisodeWorkflowState(projectId, episodeId, input);
  }

  listEpisodeWorkflowAudits(projectId: string, episodeId: string, limit = 100): EpisodeWorkflowAudit[] | null {
    return this.episodeRepository.listEpisodeWorkflowAudits(projectId, episodeId, limit);
  }

  deleteEpisode(projectId: string, episodeId: string): boolean {
    return this.episodeRepository.deleteEpisode(projectId, episodeId);
  }

  listStoryboardsByEpisode(projectId: string, episodeId: string): Storyboard[] | null {
    return this.storyboardRepository.listStoryboardsByEpisode(projectId, episodeId);
  }

  upsertTimelinePlan(input: {
    id: string;
    projectId: string;
    episodeId: string | null;
    title: string;
    tracks?: TimelineTrack[];
    clips: VideoMergeClip[];
  }): TimelinePlan | null {
    return this.timelineRepository.upsertTimelinePlan(input);
  }

  getTimelinePlan(projectId: string, episodeId: string | null): TimelinePlan | null {
    return this.timelineRepository.getTimelinePlan(projectId, episodeId);
  }

  listEpisodeAssetRelations(projectId: string, episodeId: string): EpisodeAssetRelation[] | null {
    return this.assetRepository.listEpisodeAssetRelations(projectId, episodeId);
  }

  replaceEpisodeAssetRelations(
    projectId: string,
    episodeId: string,
    input: {
      sceneAssetIds?: string[];
      characterAssetIds?: string[];
      propAssetIds?: string[];
    }
  ): EpisodeAssetRelation[] | null {
    return this.assetRepository.replaceEpisodeAssetRelations(projectId, episodeId, input);
  }

  listDomainEntities(projectId: string, input?: { type?: 'character' | 'scene' | 'prop'; includeDeleted?: boolean }): DomainEntity[] | null {
    return this.domainEntityRepository.listDomainEntities(projectId, input);
  }

  getDomainEntity(projectId: string, entityId: string, input?: { includeDeleted?: boolean }): DomainEntity | null {
    return this.domainEntityRepository.getDomainEntity(projectId, entityId, input);
  }

  createDomainEntity(input: {
    id: string;
    projectId: string;
    type: 'character' | 'scene' | 'prop';
    name: string;
    prompt: string;
    imageUrl?: string | null;
  }): DomainEntity | null {
    return this.domainEntityRepository.createDomainEntity(input);
  }

  updateDomainEntity(
    projectId: string,
    entityId: string,
    input: { type?: 'character' | 'scene' | 'prop'; name?: string; prompt?: string; imageUrl?: string | null }
  ): DomainEntity | null {
    return this.domainEntityRepository.updateDomainEntity(projectId, entityId, input);
  }

  deleteDomainEntity(projectId: string, entityId: string): boolean {
    return this.domainEntityRepository.deleteDomainEntity(projectId, entityId);
  }

  restoreDomainEntity(projectId: string, entityId: string): DomainEntity | null {
    return this.domainEntityRepository.restoreDomainEntity(projectId, entityId);
  }

  mergeDomainEntity(projectId: string, sourceEntityId: string, targetEntityId: string): DomainEntity | null {
    return this.domainEntityRepository.mergeDomainEntity(projectId, sourceEntityId, targetEntityId);
  }

  transitionDomainEntityLifecycle(
    projectId: string,
    entityId: string,
    toStatus: 'draft' | 'in_review' | 'approved' | 'archived'
  ): DomainEntity | null {
    return this.domainEntityRepository.transitionDomainEntityLifecycle(projectId, entityId, toStatus);
  }

  countDomainEntityReferences(
    projectId: string,
    entityId: string
  ): { episodeRelationCount: number; storyboardRelationCount: number } {
    return this.domainEntityRepository.countDomainEntityReferences(projectId, entityId);
  }

  listDomainEntityRelatedEpisodeIds(projectId: string, entityId: string): string[] {
    return this.domainEntityRepository.listDomainEntityRelatedEpisodeIds(projectId, entityId);
  }

  listEpisodeDomainEntityRelations(projectId: string, episodeId: string): EpisodeDomainEntityRelation[] | null {
    return this.domainEntityRepository.listEpisodeDomainEntityRelations(projectId, episodeId);
  }

  replaceEpisodeDomainEntityRelations(
    projectId: string,
    episodeId: string,
    input: {
      sceneEntityIds?: string[];
      characterEntityIds?: string[];
      propEntityIds?: string[];
    }
  ): EpisodeDomainEntityRelation[] | null {
    return this.domainEntityRepository.replaceEpisodeDomainEntityRelations(projectId, episodeId, input);
  }

  listStoryboardDomainEntityRelations(projectId: string, storyboardId: string): StoryboardDomainEntityRelation[] | null {
    return this.domainEntityRepository.listStoryboardDomainEntityRelations(projectId, storyboardId);
  }

  replaceStoryboardDomainEntityRelations(
    projectId: string,
    storyboardId: string,
    input: {
      sceneEntityId?: string | null;
      characterEntityIds?: string[];
      propEntityIds?: string[];
    }
  ): StoryboardDomainEntityRelation[] | null {
    return this.domainEntityRepository.replaceStoryboardDomainEntityRelations(projectId, storyboardId, input);
  }

  appendDomainEntityAudit(input: {
    projectId: string;
    actor: string;
    action: string;
    targetType: 'domain_entity' | 'episode_relation' | 'storyboard_relation' | 'apply';
    targetId: string;
    details?: Record<string, unknown>;
  }): DomainEntityAudit {
    return this.domainEntityRepository.appendDomainEntityAudit(input);
  }

  listDomainEntityAudits(
    projectId: string,
    input: {
      actor?: string;
      action?: string;
      targetType?: 'domain_entity' | 'episode_relation' | 'storyboard_relation' | 'apply';
      startAt?: string;
      endAt?: string;
      page: number;
      pageSize: number;
    }
  ): { items: DomainEntityAudit[]; total: number; page: number; pageSize: number } | null {
    return this.domainEntityRepository.listDomainEntityAudits(projectId, input);
  }

  getDomainEntityAuditStats(projectId: string, input: { actor?: string; startAt?: string; endAt?: string }): DomainEntityAuditStats | null {
    return this.domainEntityRepository.getDomainEntityAuditStats(projectId, input);
  }

  listStoryboardAssetRelations(projectId: string, storyboardId: string): StoryboardAssetRelation[] | null {
    return this.assetRepository.listStoryboardAssetRelations(projectId, storyboardId);
  }

  replaceStoryboardAssetRelations(
    projectId: string,
    storyboardId: string,
    input: {
      sceneAssetId?: string | null;
      characterAssetIds?: string[];
      propAssetIds?: string[];
    }
  ): StoryboardAssetRelation[] | null {
    return this.assetRepository.replaceStoryboardAssetRelations(projectId, storyboardId, input);
  }

  listAssets(projectId: string): Asset[] | null {
    return this.assetRepository.listAssets(projectId);
  }

  listAssetsByEpisode(projectId: string, episodeId: string): Asset[] | null {
    return this.assetRepository.listAssetsByEpisode(projectId, episodeId);
  }

  createAssets(
    projectId: string,
    storyboardId: string,
    items: Array<{
      id: string;
      name: string;
      type: 'character' | 'scene' | 'prop';
      scope?: Asset['scope'];
      shareScope?: Asset['shareScope'];
      baseAssetId?: string | null;
      prompt: string;
      statePrompt?: string | null;
      state?: Asset['state'];
      imageUrl: string | null;
      voiceProfile?: Asset['voiceProfile'];
    }>
  ): Asset[] | null {
    return this.assetRepository.createAssets(projectId, storyboardId, items);
  }

  getAsset(projectId: string, assetId: string): Asset | null {
    return this.assetRepository.getAsset(projectId, assetId);
  }

  createAsset(input: {
    id: string;
    projectId: string;
    storyboardId: string;
    name: string;
    type: 'character' | 'scene' | 'prop';
    scope?: Asset['scope'];
    shareScope?: Asset['shareScope'];
    baseAssetId?: string | null;
    prompt: string;
    statePrompt?: string | null;
    state?: Asset['state'];
    imageUrl?: string | null;
    videoUrl?: string | null;
    firstFrameUrl?: string | null;
    lastFrameUrl?: string | null;
    voiceProfile?: Asset['voiceProfile'];
  }): Asset | null {
    return this.assetRepository.createAsset(input);
  }

  updateAsset(
    projectId: string,
    assetId: string,
    input: {
      name?: string;
      type?: 'character' | 'scene' | 'prop';
      scope?: Asset['scope'];
      shareScope?: Asset['shareScope'];
      baseAssetId?: string | null;
      prompt?: string;
      statePrompt?: string | null;
      state?: Asset['state'];
      imageUrl?: string | null;
      videoUrl?: string | null;
      firstFrameUrl?: string | null;
      lastFrameUrl?: string | null;
      voiceProfile?: Asset['voiceProfile'];
    }
  ): Asset | null {
    return this.assetRepository.updateAsset(projectId, assetId, input);
  }

  deleteAsset(projectId: string, assetId: string): boolean {
    return this.assetRepository.deleteAsset(projectId, assetId);
  }

  listVideoTasks(projectId: string): VideoTask[] | null {
    return this.runtimeTaskRepository.listVideoTasks(projectId);
  }

  listAllVideoTasks(input: {
    q?: string;
    providerTaskId?: string;
    providerErrorCode?: string;
    status?: 'queued' | 'submitting' | 'polling' | 'running' | 'done' | 'failed' | 'cancelled';
    createdFrom?: string;
    createdTo?: string;
    sortBy?: 'createdAt' | 'updatedAt' | 'priority' | 'status';
    order?: SortOrder;
    page: number;
    pageSize: number;
  }): PageResult<VideoTaskListItem> {
    return this.runtimeTaskRepository.listAllVideoTasks(input);
  }

  getVideoTaskById(taskId: string): VideoTask | null {
    return this.runtimeTaskRepository.getVideoTaskById(taskId);
  }

  listVideoTaskEvents(taskId: string, limit = 50): VideoTaskEvent[] {
    return this.runtimeTaskRepository.listVideoTaskEvents(taskId, limit);
  }

  listVideoTaskEventsForExport(
    taskId: string,
    input: {
      status?: 'queued' | 'submitting' | 'polling' | 'running' | 'done' | 'failed' | 'cancelled';
      q?: string;
      createdFrom?: string;
      createdTo?: string;
      limit: number;
    }
  ): VideoTaskEvent[] {
    return this.runtimeTaskRepository.listVideoTaskEventsForExport(taskId, input);
  }

  countVideoTaskEventsForExport(
    taskId: string,
    input: {
      status?: 'queued' | 'submitting' | 'polling' | 'running' | 'done' | 'failed' | 'cancelled';
      q?: string;
      createdFrom?: string;
      createdTo?: string;
    }
  ): number {
    return this.runtimeTaskRepository.countVideoTaskEventsForExport(taskId, input);
  }

  listQueuedVideoTaskProjectIds(): string[] {
    return this.runtimeTaskRepository.listQueuedVideoTaskProjectIds();
  }

  getVideoTaskMetrics(): VideoTaskMetrics {
    return this.runtimeTaskRepository.getVideoTaskMetrics();
  }

  getVideoTaskQueueWaitPercentiles(limitTasks = 1000): { p50Ms: number; p95Ms: number; sampleSize: number } {
    return this.runtimeTaskRepository.getVideoTaskQueueWaitPercentiles(limitTasks);
  }

  countVideoTasksCreatedBetween(projectId: string, createdFrom: string, createdTo: string): number {
    return this.runtimeTaskRepository.countVideoTasksCreatedBetween(projectId, createdFrom, createdTo);
  }

  getNextQueuedVideoTask(projectId: string): VideoTask | null {
    return this.runtimeTaskRepository.getNextQueuedVideoTask(projectId);
  }

  countRunningVideoTasks(projectId: string): number {
    return this.runtimeTaskRepository.countRunningVideoTasks(projectId);
  }

  listVideoTaskRuntimeProjectStats(): Array<{ projectId: string; queued: number; running: number; active: number }> {
    return this.runtimeTaskRepository.listVideoTaskRuntimeProjectStats();
  }

  createVideoTask(input: {
    id: string;
    projectId: string;
    storyboardId: string;
    prompt: string;
    modelName: string | null;
    params: Record<string, unknown>;
    priority: 'low' | 'medium' | 'high';
  }): VideoTask | null {
    return this.runtimeTaskRepository.createVideoTask(input);
  }

  getVideoTask(projectId: string, taskId: string): VideoTask | null {
    return this.runtimeTaskRepository.getVideoTask(projectId, taskId);
  }

  updateVideoTask(
    projectId: string,
    taskId: string,
    input: {
      status: 'queued' | 'submitting' | 'polling' | 'running' | 'done' | 'failed' | 'cancelled';
      progress: number;
      resultUrl?: string | null;
      firstFrameUrl?: string | null;
      lastFrameUrl?: string | null;
      error?: string | null;
      providerTaskId?: string | null;
      attempt?: number;
      nextRetryAt?: string | null;
      providerErrorCode?: string | null;
    }
  ): VideoTask | null {
    return this.runtimeTaskRepository.updateVideoTask(projectId, taskId, input);
  }

  listAudioTasks(projectId: string): AudioTask[] | null {
    return this.runtimeTaskRepository.listAudioTasks(projectId);
  }

  createAudioTask(input: {
    id: string;
    projectId: string;
    storyboardId: string;
    prompt: string;
    modelName: string | null;
    params: Record<string, unknown>;
    priority: 'low' | 'medium' | 'high';
  }): AudioTask | null {
    return this.runtimeTaskRepository.createAudioTask(input);
  }

  getAudioTask(projectId: string, taskId: string): AudioTask | null {
    return this.runtimeTaskRepository.getAudioTask(projectId, taskId);
  }

  updateAudioTask(
    projectId: string,
    taskId: string,
    input: { status: 'queued' | 'running' | 'done' | 'failed'; progress: number; resultUrl?: string | null; error?: string | null }
  ): AudioTask | null {
    return this.runtimeTaskRepository.updateAudioTask(projectId, taskId, input);
  }

  listVideoMerges(projectId: string): VideoMerge[] | null {
    return this.runtimeTaskRepository.listVideoMerges(projectId);
  }

  createVideoMerge(input: {
    id: string;
    projectId: string;
    title: string;
    status: 'queued' | 'processing' | 'done' | 'failed';
    clips: Array<{
      storyboardId: string;
      videoTaskId?: string;
      sourceUrl?: string;
      durationSec?: number;
      transition?: VideoMergeClip['transition'];
      keyframe?: VideoMergeClip['keyframe'];
    }>;
    params?: VideoMerge['params'];
  }): VideoMerge | null {
    return this.runtimeTaskRepository.createVideoMerge(input);
  }

  getVideoMerge(projectId: string, mergeId: string): VideoMerge | null {
    return this.runtimeTaskRepository.getVideoMerge(projectId, mergeId);
  }

  updateVideoMerge(
    projectId: string,
    mergeId: string,
    input: {
      status: 'queued' | 'processing' | 'done' | 'failed';
      resultUrl?: string | null;
      outputPath?: string | null;
      errorCode?: string | null;
      error?: string | null;
      completedAt?: string | null;
    }
  ): VideoMerge | null {
    return this.runtimeTaskRepository.updateVideoMerge(projectId, mergeId, input);
  }

  listModelConfigs(type?: 'text' | 'image' | 'video' | 'audio') {
    return this.settingsRepository.listModelConfigs(type);
  }

  getDefaultModelConfig(type: 'text' | 'image' | 'video' | 'audio') {
    return this.settingsRepository.getDefaultModelConfig(type);
  }

  createModelConfig(input: {
    id: string;
    type: 'text' | 'image' | 'video' | 'audio';
    name: string;
    provider: string;
    manufacturer: string;
    model: string;
    authType: 'bearer' | 'api_key' | 'none';
    endpoint: string;
    endpoints: Record<string, string>;
    apiKey: string;
    capabilities: Record<string, unknown>;
    priority: number;
    rateLimit: number;
    isDefault: boolean;
    enabled: boolean;
  }) {
    return this.settingsRepository.createModelConfig(input);
  }

  updateModelConfig(
    id: string,
    input: {
      name?: string;
      provider?: string;
      manufacturer?: string;
      model?: string;
      authType?: 'bearer' | 'api_key' | 'none';
      endpoint?: string;
      endpoints?: Record<string, string>;
      apiKey?: string;
      capabilities?: Record<string, unknown>;
      priority?: number;
      rateLimit?: number;
      isDefault?: boolean;
      enabled?: boolean;
    }
  ) {
    return this.settingsRepository.updateModelConfig(id, input);
  }

  getModelConfigById(id: string) {
    return this.settingsRepository.getModelConfigById(id);
  }

  findEnabledModelConfigByName(type: 'text' | 'image' | 'video' | 'audio', nameOrModel: string) {
    return this.settingsRepository.findEnabledModelConfigByName(type, nameOrModel);
  }

  deleteModelConfig(id: string): boolean {
    return this.settingsRepository.deleteModelConfig(id);
  }

  listPromptTemplates() {
    return this.settingsRepository.listPromptTemplates();
  }

  listPromptTemplateVersions(promptId: string) {
    return this.settingsRepository.listPromptTemplateVersions(promptId);
  }

  updatePromptTemplate(id: string, input: { title?: string; content?: string }) {
    return this.settingsRepository.updatePromptTemplate(id, input);
  }

  getTaskRuntimeConfig() {
    return this.settingsRepository.getTaskRuntimeConfig();
  }

  updateTaskRuntimeConfig(input: {
    videoTaskAutoRetry?: number;
    videoTaskRetryDelayMs?: number;
    videoTaskPollIntervalMs?: number;
  }) {
    return this.settingsRepository.updateTaskRuntimeConfig(input);
  }

  getSystemSetting(key: string): string | null {
    return this.settingsRepository.getSystemSetting(key);
  }

  setSystemSetting(key: string, value: string): void {
    this.settingsRepository.setSystemSetting(key, value);
  }

  upsertQueueWorkerLease(input: { ownerId: string; ttlMs: number }): { acquired: boolean; ownerId: string | null; expiresAt: string | null } {
    return this.opsRepository.upsertQueueWorkerLease(input);
  }

  getQueueWorkerLease(): { ownerId: string | null; expiresAt: string | null; heartbeatAt: string | null } {
    return this.opsRepository.getQueueWorkerLease();
  }

  releaseQueueWorkerLease(ownerId: string): boolean {
    return this.opsRepository.releaseQueueWorkerLease(ownerId);
  }

  getSchemaVersion(): number {
    return this.opsRepository.getSchemaVersion();
  }

  listMigrationSnapshots(limit = 20): Array<{ fileName: string; path: string; createdAt: string; size: number }> {
    return this.opsRepository.listMigrationSnapshots(limit);
  }

  restoreLatestMigrationSnapshot(): { restoredFrom: string; inserted: Record<string, number> } | null {
    return this.opsRepository.restoreLatestMigrationSnapshot();
  }

  restoreMigrationSnapshotByFile(fileName: string): { restoredFrom: string; inserted: Record<string, number> } | null {
    return this.opsRepository.restoreMigrationSnapshotByFile(fileName);
  }

  getMigrationSnapshotContent(fileName: string): { fileName: string; payload: Record<string, unknown> } | null {
    return this.opsRepository.getMigrationSnapshotContent(fileName);
  }

  listProjectTasks(
    projectId: string,
    input: {
      q?: string;
      status?: TaskStatus;
      priority?: TaskPriority;
      page: number;
      pageSize: number;
      sortBy?: 'createdAt' | 'updatedAt' | 'title' | 'status' | 'priority' | 'dueAt';
      order?: SortOrder;
    }
  ): PageResult<Task> | null {
    return this.projectRepository.listProjectTasks(projectId, input);
  }

  createProject(input: { id: string; name: string; description: string; createdAt: string; updatedAt: string }): void {
    this.projectRepository.createProject(input);
  }

  updateProject(projectId: string, input: { name?: string; description?: string }): boolean {
    return this.projectRepository.updateProject(projectId, input);
  }

  deleteProject(projectId: string): boolean {
    return this.projectRepository.deleteProject(projectId);
  }

  createTask(input: {
    id: string;
    projectId: string;
    title: string;
    status: TaskStatus;
    priority: TaskPriority;
    dueAt: string | null;
    createdAt: string;
    updatedAt: string;
  }): boolean {
    return this.projectRepository.createTask(input);
  }

  updateTask(
    projectId: string,
    taskId: string,
    input: { title?: string; status?: TaskStatus; priority?: TaskPriority; dueAt?: string | null }
  ): boolean {
    return this.projectRepository.updateTask(projectId, taskId, input);
  }

  deleteTask(projectId: string, taskId: string): boolean {
    return this.projectRepository.deleteTask(projectId, taskId);
  }

  getSummary(): { projectCount: number; taskCount: number; doneCount: number; doingCount: number } {
    return this.projectRepository.getSummary();
  }

  getBusinessDataSummary(): {
    projectCount: number;
    taskCount: number;
    novelCount: number;
    outlineCount: number;
    scriptCount: number;
    storyboardCount: number;
    assetCount: number;
    videoTaskCount: number;
    audioTaskCount: number;
    videoMergeCount: number;
  } {
    return this.opsRepository.getBusinessDataSummary();
  }

  listVideoMergeErrorStats(input: { limit: number; projectId?: string }): Array<{ errorCode: string; count: number; latestAt: string }> {
    return this.opsRepository.listVideoMergeErrorStats(input);
  }

  resetBusinessData(): {
    projects: number;
    tasks: number;
    dramas: number;
    episodes: number;
    episodeAssetLinks: number;
    timelinePlans: number;
    novels: number;
    outlines: number;
    scripts: number;
    storyboards: number;
    assets: number;
    videoTasks: number;
    videoTaskEvents: number;
    audioTasks: number;
    videoMerges: number;
    scenes: number;
  } {
    return this.opsRepository.resetBusinessData();
  }

  exportBusinessBackup(): {
    version: string;
    exportedAt: string;
    tables: Record<string, Array<Record<string, unknown>>>;
  } {
    return this.opsRepository.exportBusinessBackup();
  }

  importBusinessBackup(input: {
    version: string;
    tables: Record<string, Array<Record<string, unknown>>>;
  }): {
    inserted: Record<string, number>;
  } {
    return this.opsRepository.importBusinessBackup(input);
  }

  private projectExists(projectId: string): boolean {
    return Boolean(this.db.prepare('SELECT id FROM projects WHERE id = ? LIMIT 1').get(projectId));
  }

}
