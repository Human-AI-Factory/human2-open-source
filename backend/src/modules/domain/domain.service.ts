import { Asset, EpisodeWorkflowStatus } from '../../core/types.js';
import { SqliteStore } from '../../db/sqlite.js';
import { DomainEntityService } from './domain-entity.service.js';
import { DramaProductionChainService } from './drama-production-chain.service.js';
import { DramaWorkflowService } from './drama-workflow.service.js';
import { createDomainModule } from './domain.module.js';

export class DomainService {
  private readonly store: SqliteStore;
  private readonly dramaWorkflowService: DramaWorkflowService;
  private readonly dramaProductionChainService: DramaProductionChainService;
  private readonly domainEntityService: DomainEntityService;

  constructor(store: SqliteStore, domainModule = createDomainModule({ store })) {
    this.store = store;
    this.dramaWorkflowService = domainModule.dramaWorkflowService;
    this.dramaProductionChainService = domainModule.dramaProductionChainService;
    this.domainEntityService = domainModule.domainEntityService;
  }

  recommendDomainEntityLifecycleStatusByEpisode(projectId: string, entityId: string) {
    return this.domainEntityService.recommendDomainEntityLifecycleStatusByEpisode(projectId, entityId);
  }

  batchTransitionDomainEntityLifecycle(
    projectId: string,
    input: {
      entityIds: string[];
      toStatus?: 'draft' | 'in_review' | 'approved' | 'archived';
      toStatusByType?: Partial<Record<'character' | 'scene' | 'prop', 'draft' | 'in_review' | 'approved' | 'archived'>>;
      autoRecommend?: boolean;
      actor?: string;
      note?: string;
    }
  ) {
    return this.domainEntityService.batchTransitionDomainEntityLifecycle(projectId, input);
  }

  getDomainApplyPolicy(projectId: string) {
    return this.domainEntityService.getDomainApplyPolicy(projectId);
  }

  updateDomainApplyPolicy(
    projectId: string,
    input: {
      defaultMode?: 'missing_only' | 'all';
      byType?: Partial<
        Record<
          'character' | 'scene' | 'prop',
          Partial<{
            conflictStrategy: 'skip' | 'overwrite_prompt' | 'overwrite_all' | 'rename';
            priority: 'entity_first' | 'existing_first';
            renameSuffix: string;
          }>
        >
      >;
      byStatus?: Partial<
        Record<
          EpisodeWorkflowStatus,
          | Partial<
              Record<
                'character' | 'scene' | 'prop',
                Partial<{
                  conflictStrategy: 'skip' | 'overwrite_prompt' | 'overwrite_all' | 'rename';
                  priority: 'entity_first' | 'existing_first';
                  renameSuffix: string;
                }>
              >
            >
          | Partial<{
              conflictStrategy: 'skip' | 'overwrite_prompt' | 'overwrite_all' | 'rename';
              priority: 'entity_first' | 'existing_first';
              renameSuffix: string;
            }>
        >
      >;
      actor?: string;
    }
  ) {
    return this.domainEntityService.updateDomainApplyPolicy(projectId, input);
  }

  listDomainEntities(projectId: string, input: { type?: 'character' | 'scene' | 'prop'; includeDeleted?: boolean }) {
    return this.domainEntityService.listDomainEntities(projectId, input);
  }

  createDomainEntity(
    projectId: string,
    input: { type: 'character' | 'scene' | 'prop'; name: string; prompt: string; imageUrl?: string | null }
  ) {
    return this.domainEntityService.createDomainEntity(projectId, input);
  }

  updateDomainEntity(
    projectId: string,
    entityId: string,
    input: { type?: 'character' | 'scene' | 'prop'; name?: string; prompt?: string; imageUrl?: string | null }
  ) {
    return this.domainEntityService.updateDomainEntity(projectId, entityId, input);
  }

  previewDomainEntityDelete(projectId: string, entityId: string) {
    return this.domainEntityService.previewDomainEntityDelete(projectId, entityId);
  }

  deleteDomainEntity(projectId: string, entityId: string) {
    return this.domainEntityService.deleteDomainEntity(projectId, entityId);
  }

  restoreDomainEntity(projectId: string, entityId: string, input?: { actor?: string }) {
    return this.domainEntityService.restoreDomainEntity(projectId, entityId, input);
  }

  mergeDomainEntity(projectId: string, sourceEntityId: string, input: { targetEntityId: string; actor?: string; note?: string }) {
    return this.domainEntityService.mergeDomainEntity(projectId, sourceEntityId, input);
  }

  previewDomainEntityLifecycleTransition(
    projectId: string,
    entityId: string,
    input: { toStatus: 'draft' | 'in_review' | 'approved' | 'archived' }
  ) {
    return this.domainEntityService.previewDomainEntityLifecycleTransition(projectId, entityId, input);
  }

  transitionDomainEntityLifecycle(
    projectId: string,
    entityId: string,
    input: { toStatus: 'draft' | 'in_review' | 'approved' | 'archived'; actor?: string; note?: string }
  ) {
    return this.domainEntityService.transitionDomainEntityLifecycle(projectId, entityId, input);
  }

  listEpisodeDomainEntityRelations(projectId: string, episodeId: string) {
    return this.domainEntityService.listEpisodeDomainEntityRelations(projectId, episodeId);
  }

  replaceEpisodeDomainEntityRelations(
    projectId: string,
    episodeId: string,
    input: { sceneEntityIds?: string[]; characterEntityIds?: string[]; propEntityIds?: string[] }
  ) {
    return this.domainEntityService.replaceEpisodeDomainEntityRelations(projectId, episodeId, input);
  }

  listStoryboardDomainEntityRelations(projectId: string, storyboardId: string) {
    return this.domainEntityService.listStoryboardDomainEntityRelations(projectId, storyboardId);
  }

  replaceStoryboardDomainEntityRelations(
    projectId: string,
    storyboardId: string,
    input: { sceneEntityId?: string | null; characterEntityIds?: string[]; propEntityIds?: string[] }
  ) {
    return this.domainEntityService.replaceStoryboardDomainEntityRelations(projectId, storyboardId, input);
  }

  listCanonicalEntityWorkbench(projectId: string, input: { type?: 'character' | 'scene' | 'prop'; q?: string; episodeId?: string }) {
    return this.domainEntityService.listCanonicalEntityWorkbench(projectId, input);
  }

  listDomainEntityConflicts(projectId: string, input: { type?: 'character' | 'scene' | 'prop' }) {
    return this.domainEntityService.listDomainEntityConflicts(projectId, input);
  }

  previewDomainEntityApplyToEpisode(
    projectId: string,
    entityId: string,
    input: {
      episodeId: string;
      mode?: 'missing_only' | 'all';
      conflictStrategy?: 'skip' | 'overwrite_prompt' | 'overwrite_all' | 'rename';
      priority?: 'entity_first' | 'existing_first';
      renameSuffix?: string;
    }
  ) {
    return this.domainEntityService.previewDomainEntityApplyToEpisode(projectId, entityId, input);
  }

  applyDomainEntityToEpisodeByStrategy(
    projectId: string,
    entityId: string,
    input: {
      episodeId: string;
      mode?: 'missing_only' | 'all';
      conflictStrategy?: 'skip' | 'overwrite_prompt' | 'overwrite_all' | 'rename';
      priority?: 'entity_first' | 'existing_first';
      renameSuffix?: string;
      actor?: string;
      note?: string;
    }
  ) {
    return this.domainEntityService.applyDomainEntityToEpisodeByStrategy(projectId, entityId, input);
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
  ) {
    return this.domainEntityService.listDomainEntityAudits(projectId, input);
  }

  exportDomainEntityAuditsCsv(
    projectId: string,
    input: {
      actor?: string;
      action?: string;
      targetType?: 'domain_entity' | 'episode_relation' | 'storyboard_relation' | 'apply';
      startAt?: string;
      endAt?: string;
    }
  ) {
    return this.domainEntityService.exportDomainEntityAuditsCsv(projectId, input);
  }

  getDomainEntityAuditStats(projectId: string, input: { actor?: string; startAt?: string; endAt?: string }) {
    return this.domainEntityService.getDomainEntityAuditStats(projectId, input);
  }

  listEntities(projectId: string, input: { type?: 'character' | 'scene' | 'prop'; episodeId?: string }) {
    return this.domainEntityService.listEntities(projectId, input);
  }

  createEntity(
    projectId: string,
    input: {
      storyboardId?: string;
      episodeId?: string;
      type: 'character' | 'scene' | 'prop';
      name: string;
      prompt: string;
      imageUrl?: string | null;
    }
  ) {
    return this.domainEntityService.createEntity(projectId, input);
  }

  updateEntity(
    projectId: string,
    assetId: string,
    input: {
      name?: string;
      prompt?: string;
      imageUrl?: string | null;
      type?: 'character' | 'scene' | 'prop';
      voiceProfile?: Asset['voiceProfile'];
    }
  ) {
    return this.domainEntityService.updateEntity(projectId, assetId, input);
  }

  deleteEntity(projectId: string, assetId: string) {
    return this.domainEntityService.deleteEntity(projectId, assetId);
  }

  listEntityWorkbench(projectId: string, input: { type?: 'character' | 'scene' | 'prop'; q?: string; episodeId?: string }) {
    return this.domainEntityService.listEntityWorkbench(projectId, input);
  }

  applyEntityToEpisode(
    projectId: string,
    entityId: string,
    input: {
      episodeId: string;
      mode?: 'missing_only' | 'all';
      overrideName?: string;
      overridePrompt?: string;
      overrideImageUrl?: string | null;
    }
  ) {
    return this.domainEntityService.applyEntityToEpisode(projectId, entityId, input);
  }

  listEpisodeAssetRelations(projectId: string, episodeId: string) {
    return this.domainEntityService.listEpisodeAssetRelations(projectId, episodeId);
  }

  replaceEpisodeAssetRelations(
    projectId: string,
    episodeId: string,
    input: { sceneAssetIds?: string[]; characterAssetIds?: string[]; propAssetIds?: string[] }
  ) {
    return this.domainEntityService.replaceEpisodeAssetRelations(projectId, episodeId, input);
  }

  getDrama(projectId: string) {
    return this.dramaWorkflowService.getDrama(projectId);
  }

  getDramaById(dramaId: string) {
    return this.dramaWorkflowService.getDramaById(dramaId);
  }

  updateDramaStyle(dramaId: string, style: string) {
    return this.store.updateDramaStyle(dramaId, style);
  }

  getProjectWorkflowSummary(projectId: string) {
    return this.dramaWorkflowService.getProjectWorkflowSummary(projectId);
  }

  getDramaWorkflowSummary(dramaId: string) {
    return this.dramaWorkflowService.getDramaWorkflowSummary(dramaId);
  }

  getDramaProductionChain(dramaId: string) {
    return this.dramaProductionChainService.getDramaProductionChain(dramaId);
  }

  listDramas() {
    return this.dramaWorkflowService.listDramas();
  }

  upsertDrama(projectId: string, input: { name: string; description?: string }) {
    return this.dramaWorkflowService.upsertDrama(projectId, input);
  }

  listEpisodes(projectId: string) {
    return this.dramaWorkflowService.listEpisodes(projectId);
  }

  listEpisodesByDrama(dramaId: string) {
    return this.dramaWorkflowService.listEpisodesByDrama(dramaId);
  }

  getDomainModel(projectId: string) {
    return this.dramaWorkflowService.getDomainModel(projectId);
  }

  createEpisode(projectId: string, input: { dramaId: string; title: string; orderIndex?: number }) {
    return this.dramaWorkflowService.createEpisode(projectId, input);
  }

  createEpisodeByDrama(dramaId: string, input: { title: string; orderIndex?: number }) {
    return this.dramaWorkflowService.createEpisodeByDrama(dramaId, input);
  }

  importEpisodesFromScriptsByDrama(dramaId: string) {
    return this.dramaWorkflowService.importEpisodesFromScriptsByDrama(dramaId);
  }

  updateEpisode(
    projectId: string,
    episodeId: string,
    input: { title?: string; orderIndex?: number; status?: 'draft' | 'ready' | 'published' }
  ) {
    return this.dramaWorkflowService.updateEpisode(projectId, episodeId, input);
  }

  updateEpisodeByDrama(
    dramaId: string,
    episodeId: string,
    input: { title?: string; orderIndex?: number; status?: 'draft' | 'ready' | 'published' }
  ) {
    return this.dramaWorkflowService.updateEpisodeByDrama(dramaId, episodeId, input);
  }

  deleteEpisode(projectId: string, episodeId: string) {
    return this.dramaWorkflowService.deleteEpisode(projectId, episodeId);
  }

  assignStoryboardToEpisode(projectId: string, storyboardId: string, episodeId: string | null) {
    return this.dramaWorkflowService.assignStoryboardToEpisode(projectId, storyboardId, episodeId);
  }

  listEpisodeStoryboards(projectId: string, episodeId: string) {
    return this.dramaWorkflowService.listEpisodeStoryboards(projectId, episodeId);
  }

  getEpisodeWorkflowState(projectId: string, episodeId: string) {
    return this.dramaWorkflowService.getEpisodeWorkflowState(projectId, episodeId);
  }

  transitionEpisodeWorkflow(
    projectId: string,
    episodeId: string,
    input: { toStatus: EpisodeWorkflowStatus; actor: string; comment?: string }
  ) {
    return this.dramaWorkflowService.transitionEpisodeWorkflow(projectId, episodeId, input);
  }

  listEpisodeWorkflowAudits(projectId: string, episodeId: string, limit?: number) {
    return this.dramaWorkflowService.listEpisodeWorkflowAudits(projectId, episodeId, limit);
  }

  listProjectWorkflowEpisodes(
    projectId: string,
    input: { status?: EpisodeWorkflowStatus; q?: string; page: number; pageSize: number }
  ) {
    return this.dramaWorkflowService.listProjectWorkflowEpisodes(projectId, input);
  }

  transitionProjectWorkflowEpisodesBatch(
    projectId: string,
    input: { episodeIds: string[]; toStatus: EpisodeWorkflowStatus; actor: string; comment?: string }
  ) {
    return this.dramaWorkflowService.transitionProjectWorkflowEpisodesBatch(projectId, input);
  }

  overrideProjectWorkflowEpisodesBatch(
    projectId: string,
    input: { episodeIds: string[]; toStatus: EpisodeWorkflowStatus; actor: string; comment?: string }
  ) {
    return this.dramaWorkflowService.overrideProjectWorkflowEpisodesBatch(projectId, input);
  }

  listProjectWorkflowAudits(
    projectId: string,
    input: { episodeId?: string; actor?: string; toStatus?: EpisodeWorkflowStatus; page: number; pageSize: number }
  ) {
    return this.dramaWorkflowService.listProjectWorkflowAudits(projectId, input);
  }

  listWorkflowTransitionUndoStack(projectId: string) {
    return this.dramaWorkflowService.listWorkflowTransitionUndoStack(projectId);
  }

  undoWorkflowTransitionBatch(projectId: string, input: { entryId?: string; actor: string; comment?: string }) {
    return this.dramaWorkflowService.undoWorkflowTransitionBatch(projectId, input);
  }

  listWorkflowOpLogs(projectId: string) {
    return this.dramaWorkflowService.listWorkflowOpLogs(projectId);
  }

  appendWorkflowOpLog(
    projectId: string,
    input: { action: string; estimated: string; actual: string; note?: string; time?: string }
  ) {
    return this.dramaWorkflowService.appendWorkflowOpLog(projectId, input);
  }

  clearWorkflowOpLogs(projectId: string) {
    return this.dramaWorkflowService.clearWorkflowOpLogs(projectId);
  }
}
