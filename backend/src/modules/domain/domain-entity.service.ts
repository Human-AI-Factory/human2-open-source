import { v4 as uuid } from 'uuid';
import {
  Asset,
  DomainEntity,
  DomainEntityAudit,
  DomainEntityAuditStats,
  EpisodeAssetRelation,
  EpisodeDomainEntityRelation,
  EpisodeWorkflowStatus,
  StoryboardDomainEntityRelation
} from '../../core/types.js';
import { SqliteStore } from '../../db/sqlite.js';
import {
  DomainApplyMode,
  DomainApplyPolicy,
  DomainApplyPolicyService,
  DomainApplyPolicyTypeRule,
  DomainConflictStrategy,
  DomainEntityType,
  DomainPriority
} from './domain-apply-policy.service.js';
import {
  DomainEntityDeleteCheckReason,
  DomainEntityLifecycleStatus,
  DomainLifecycleService
} from './domain-lifecycle.service.js';
import { DomainWorkbenchService } from './domain-workbench.service.js';
import { AssetEntityService } from './asset-entity.service.js';
import { DomainAuditService } from './domain-audit.service.js';

export class DomainEntityService {
  private readonly domainApplyPolicyService: DomainApplyPolicyService;
  private readonly domainLifecycleService: DomainLifecycleService;
  private readonly domainWorkbenchService: DomainWorkbenchService;
  private readonly assetEntityService: AssetEntityService;
  private readonly domainAuditService: DomainAuditService;

  constructor(private readonly store: SqliteStore) {
    this.domainApplyPolicyService = new DomainApplyPolicyService(store);
    this.domainLifecycleService = new DomainLifecycleService(store);
    this.domainWorkbenchService = new DomainWorkbenchService(store);
    this.assetEntityService = new AssetEntityService(store);
    this.domainAuditService = new DomainAuditService(store);
  }

  recommendDomainEntityLifecycleStatusByEpisode(
    projectId: string,
    entityId: string
  ):
    | {
        entityId: string;
        currentStatus: DomainEntityLifecycleStatus;
        recommendedStatus: DomainEntityLifecycleStatus;
        reason: 'no_relation' | 'all_approved' | 'has_in_review' | 'has_rejected' | 'default_draft';
        episodeStatusBreakdown: Record<EpisodeWorkflowStatus, number>;
      }
    | null {
    return this.domainLifecycleService.recommendDomainEntityLifecycleStatusByEpisode(projectId, entityId);
  }

  batchTransitionDomainEntityLifecycle(
    projectId: string,
    input: {
      entityIds: string[];
      toStatus?: DomainEntityLifecycleStatus;
      toStatusByType?: Partial<Record<DomainEntityType, DomainEntityLifecycleStatus>>;
      autoRecommend?: boolean;
      actor?: string;
      note?: string;
    }
  ):
    | {
        opId: string;
        executedAt: string;
        actor: string;
        updated: Array<{
          entityId: string;
          fromStatus: DomainEntityLifecycleStatus;
          toStatus: DomainEntityLifecycleStatus;
          autoRecommended: boolean;
        }>;
        rejected: Array<{
          entityId: string;
          toStatus: DomainEntityLifecycleStatus;
          reason: 'not_found' | 'deleted' | 'invalid_transition' | 'entity_in_use' | 'no_recommendation';
        }>;
      }
    | null {
    return this.domainLifecycleService.batchTransitionDomainEntityLifecycle(projectId, input);
  }

  getDomainApplyPolicy(projectId: string): DomainApplyPolicy | null {
    return this.domainApplyPolicyService.getDomainApplyPolicy(projectId);
  }

  updateDomainApplyPolicy(
    projectId: string,
    input: {
      defaultMode?: DomainApplyMode;
      byType?: Partial<Record<DomainEntityType, Partial<DomainApplyPolicyTypeRule>>>;
      byStatus?: Partial<
        Record<
          EpisodeWorkflowStatus,
          Partial<Record<DomainEntityType, Partial<DomainApplyPolicyTypeRule>>> | Partial<DomainApplyPolicyTypeRule>
        >
      >;
      actor?: string;
    }
  ): DomainApplyPolicy | null {
    return this.domainApplyPolicyService.updateDomainApplyPolicy(projectId, input);
  }

  listDomainEntities(
    projectId: string,
    input: { type?: 'character' | 'scene' | 'prop'; includeDeleted?: boolean }
  ): DomainEntity[] | null {
    return this.store.listDomainEntities(projectId, input);
  }

  createDomainEntity(
    projectId: string,
    input: {
      type: 'character' | 'scene' | 'prop';
      name: string;
      prompt: string;
      imageUrl?: string | null;
    }
  ): DomainEntity | null {
    const created = this.store.createDomainEntity({
      id: uuid(),
      projectId,
      type: input.type,
      name: input.name.trim(),
      prompt: input.prompt.trim(),
      imageUrl: input.imageUrl ?? null
    });
    if (created) {
      this.store.appendDomainEntityAudit({
        projectId,
        actor: 'operator',
        action: 'domain_entity.create',
        targetType: 'domain_entity',
        targetId: created.id,
        details: {
          type: created.type,
          name: created.name
        }
      });
    }
    return created;
  }

  updateDomainEntity(
    projectId: string,
    entityId: string,
    input: { type?: 'character' | 'scene' | 'prop'; name?: string; prompt?: string; imageUrl?: string | null }
  ): DomainEntity | null {
    const updated = this.store.updateDomainEntity(projectId, entityId, {
      type: input.type,
      name: input.name?.trim(),
      prompt: input.prompt?.trim(),
      imageUrl: input.imageUrl
    });
    if (updated) {
      this.store.appendDomainEntityAudit({
        projectId,
        actor: 'operator',
        action: 'domain_entity.update',
        targetType: 'domain_entity',
        targetId: entityId,
        details: {
          type: updated.type,
          name: updated.name
        }
      });
    }
    return updated;
  }

  previewDomainEntityDelete(
    projectId: string,
    entityId: string
  ):
    | {
        entityId: string;
        fromStatus: DomainEntityLifecycleStatus;
        allowed: boolean;
        reason: DomainEntityDeleteCheckReason;
        reference: {
          episodeRelationCount: number;
          storyboardRelationCount: number;
        };
      }
    | null {
    return this.domainLifecycleService.previewDomainEntityDelete(projectId, entityId);
  }

  deleteDomainEntity(
    projectId: string,
    entityId: string
  ):
    | {
        deleted: boolean;
        check: {
          entityId: string;
          fromStatus: DomainEntityLifecycleStatus;
          allowed: boolean;
          reason: DomainEntityDeleteCheckReason;
          reference: {
            episodeRelationCount: number;
            storyboardRelationCount: number;
          };
        };
      }
    | null {
    return this.domainLifecycleService.deleteDomainEntity(projectId, entityId);
  }

  restoreDomainEntity(projectId: string, entityId: string, input?: { actor?: string }): DomainEntity | null {
    return this.domainLifecycleService.restoreDomainEntity(projectId, entityId, input);
  }

  mergeDomainEntity(
    projectId: string,
    sourceEntityId: string,
    input: { targetEntityId: string; actor?: string; note?: string }
  ): DomainEntity | null {
    const merged = this.store.mergeDomainEntity(projectId, sourceEntityId, input.targetEntityId);
    if (merged) {
      this.store.appendDomainEntityAudit({
        projectId,
        actor: input.actor?.trim() || 'operator',
        action: 'domain_entity.merge',
        targetType: 'domain_entity',
        targetId: sourceEntityId,
        details: {
          targetEntityId: input.targetEntityId,
          note: input.note?.trim() || ''
        }
      });
    }
    return merged;
  }

  previewDomainEntityLifecycleTransition(
    projectId: string,
    entityId: string,
    input: { toStatus: DomainEntityLifecycleStatus }
  ):
    | {
        entityId: string;
        fromStatus: DomainEntityLifecycleStatus;
        toStatus: DomainEntityLifecycleStatus;
        allowed: boolean;
        reason: 'not_found' | 'deleted' | 'invalid_transition' | 'entity_in_use' | 'ok';
        reference: {
          episodeRelationCount: number;
          storyboardRelationCount: number;
        };
      }
    | null {
    return this.domainLifecycleService.previewDomainEntityLifecycleTransition(projectId, entityId, input);
  }

  transitionDomainEntityLifecycle(
    projectId: string,
    entityId: string,
    input: { toStatus: DomainEntityLifecycleStatus; actor?: string; note?: string }
  ):
    | {
        entity: DomainEntity | null;
        check: {
          entityId: string;
          fromStatus: DomainEntityLifecycleStatus;
          toStatus: DomainEntityLifecycleStatus;
          allowed: boolean;
          reason: 'not_found' | 'deleted' | 'invalid_transition' | 'entity_in_use' | 'ok';
          reference: {
            episodeRelationCount: number;
            storyboardRelationCount: number;
          };
        };
      }
    | null {
    return this.domainLifecycleService.transitionDomainEntityLifecycle(projectId, entityId, input);
  }

  listEpisodeDomainEntityRelations(projectId: string, episodeId: string): EpisodeDomainEntityRelation[] | null {
    return this.domainWorkbenchService.listEpisodeDomainEntityRelations(projectId, episodeId);
  }

  replaceEpisodeDomainEntityRelations(
    projectId: string,
    episodeId: string,
    input: { sceneEntityIds?: string[]; characterEntityIds?: string[]; propEntityIds?: string[] }
  ): EpisodeDomainEntityRelation[] | null {
    return this.domainWorkbenchService.replaceEpisodeDomainEntityRelations(projectId, episodeId, input);
  }

  listStoryboardDomainEntityRelations(projectId: string, storyboardId: string): StoryboardDomainEntityRelation[] | null {
    return this.domainWorkbenchService.listStoryboardDomainEntityRelations(projectId, storyboardId);
  }

  replaceStoryboardDomainEntityRelations(
    projectId: string,
    storyboardId: string,
    input: { sceneEntityId?: string | null; characterEntityIds?: string[]; propEntityIds?: string[] }
  ): StoryboardDomainEntityRelation[] | null {
    return this.domainWorkbenchService.replaceStoryboardDomainEntityRelations(projectId, storyboardId, input);
  }

  listCanonicalEntityWorkbench(
    projectId: string,
    input: { type?: 'character' | 'scene' | 'prop'; q?: string; episodeId?: string }
  ):
    | Array<{
        entityId: string;
        type: 'character' | 'scene' | 'prop';
        name: string;
        prompt: string;
        imageUrl: string | null;
        usageCount: number;
        appearances: number;
        episodeIds: string[];
        storyboardIds: string[];
      }>
    | null {
    return this.domainWorkbenchService.listCanonicalEntityWorkbench(projectId, input);
  }

  listDomainEntityConflicts(
    projectId: string,
    input: { type?: DomainEntityType }
  ):
    | {
        byName: Array<{
          type: DomainEntityType;
          key: string;
          count: number;
          entityIds: string[];
          entityNames: string[];
        }>;
        byPromptFingerprint: Array<{
          type: DomainEntityType;
          fingerprint: string;
          count: number;
          entityIds: string[];
          entityNames: string[];
        }>;
      }
    | null {
    return this.domainWorkbenchService.listDomainEntityConflicts(projectId, input);
  }

  previewDomainEntityApplyToEpisode(
    projectId: string,
    entityId: string,
    input: {
      episodeId: string;
      mode?: DomainApplyMode;
      conflictStrategy?: DomainConflictStrategy;
      priority?: DomainPriority;
      renameSuffix?: string;
    }
  ):
    | {
        entityId: string;
        episodeId: string;
        totalStoryboards: number;
        createCount: number;
        updateCount: number;
        skipCount: number;
        items: Array<{
          storyboardId: string;
          storyboardTitle: string;
          action: 'create' | 'update' | 'skip';
          reason: string;
          existingAssetId?: string;
        }>;
      }
    | null {
    return this.domainWorkbenchService.previewDomainEntityApplyToEpisode(projectId, entityId, input);
  }

  applyDomainEntityToEpisodeByStrategy(
    projectId: string,
    entityId: string,
    input: {
      episodeId: string;
      mode?: DomainApplyMode;
      conflictStrategy?: DomainConflictStrategy;
      priority?: DomainPriority;
      renameSuffix?: string;
      actor?: string;
      note?: string;
    }
  ):
    | {
        entityId: string;
        episodeId: string;
        created: Asset[];
        updated: Asset[];
        skippedStoryboardIds: string[];
        totalStoryboards: number;
      }
    | null {
    return this.domainWorkbenchService.applyDomainEntityToEpisodeByStrategy(projectId, entityId, input);
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
    return this.domainAuditService.listDomainEntityAudits(projectId, input);
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
  ): string | null {
    return this.domainAuditService.exportDomainEntityAuditsCsv(projectId, input);
  }

  getDomainEntityAuditStats(
    projectId: string,
    input: { actor?: string; startAt?: string; endAt?: string }
  ): DomainEntityAuditStats | null {
    return this.domainAuditService.getDomainEntityAuditStats(projectId, input);
  }

  listEntities(
    projectId: string,
    input: { type?: 'character' | 'scene' | 'prop'; episodeId?: string }
  ): Array<
    {
      id: string;
      type: 'character' | 'scene' | 'prop';
      name: string;
      prompt: string;
      imageUrl: string | null;
      storyboardId: string;
      storyboardTitle: string | null;
      episodeId: string | null;
      episodeTitle: string | null;
      usageCount: number;
    }
  > | null {
    return this.assetEntityService.listEntities(projectId, input);
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
      voiceProfile?: Asset['voiceProfile'];
    }
  ) {
    return this.assetEntityService.createEntity(projectId, input);
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
    return this.assetEntityService.updateEntity(projectId, assetId, input);
  }

  deleteEntity(projectId: string, assetId: string): boolean {
    return this.assetEntityService.deleteEntity(projectId, assetId);
  }

  listEntityWorkbench(
    projectId: string,
    input: { type?: 'character' | 'scene' | 'prop'; q?: string; episodeId?: string }
  ): Array<{
    entityId: string;
    type: 'character' | 'scene' | 'prop';
    name: string;
    prompt: string;
    imageUrl: string | null;
    usageCount: number;
    appearances: number;
    episodeIds: string[];
    storyboardIds: string[];
    sourceStoryboardId: string;
  }> | null {
    return this.assetEntityService.listEntityWorkbench(projectId, input);
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
  ):
    | {
        created: Asset[];
        skippedStoryboardIds: string[];
        totalStoryboards: number;
      }
    | null {
    return this.assetEntityService.applyEntityToEpisode(projectId, entityId, input);
  }

  listEpisodeAssetRelations(projectId: string, episodeId: string): EpisodeAssetRelation[] | null {
    return this.assetEntityService.listEpisodeAssetRelations(projectId, episodeId);
  }

  replaceEpisodeAssetRelations(
    projectId: string,
    episodeId: string,
    input: { sceneAssetIds?: string[]; characterAssetIds?: string[]; propAssetIds?: string[] }
  ): EpisodeAssetRelation[] | null {
    return this.assetEntityService.replaceEpisodeAssetRelations(projectId, episodeId, input);
  }
}
