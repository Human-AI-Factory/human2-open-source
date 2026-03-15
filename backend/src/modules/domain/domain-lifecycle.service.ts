import { v4 as uuid } from 'uuid';
import { DomainEntity, EpisodeWorkflowStatus } from '../../core/types.js';
import { SqliteStore } from '../../db/sqlite.js';

export type DomainEntityType = 'character' | 'scene' | 'prop';
export type DomainEntityLifecycleStatus = 'draft' | 'in_review' | 'approved' | 'archived';
export type DomainEntityDeleteCheckReason = 'not_found' | 'deleted' | 'entity_in_use' | 'protected_status' | 'ok';

export class DomainLifecycleService {
  constructor(private readonly store: SqliteStore) {}

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
    if (!this.store.getProjectById(projectId)) {
      return null;
    }
    const entity = this.store.getDomainEntity(projectId, entityId, { includeDeleted: true });
    if (!entity || entity.deletedAt) {
      return null;
    }
    const episodeIds = this.store.listDomainEntityRelatedEpisodeIds(projectId, entityId);
    const breakdown: Record<EpisodeWorkflowStatus, number> = {
      draft: 0,
      in_review: 0,
      approved: 0,
      rejected: 0
    };
    for (const episodeId of episodeIds) {
      const workflow = this.store.getEpisodeWorkflowState(projectId, episodeId);
      const status = workflow?.status ?? 'draft';
      breakdown[status] += 1;
    }

    if (episodeIds.length === 0) {
      return {
        entityId,
        currentStatus: entity.lifecycleStatus,
        recommendedStatus: 'draft',
        reason: 'no_relation',
        episodeStatusBreakdown: breakdown
      };
    }
    const total = episodeIds.length;
    if (breakdown.approved === total) {
      return {
        entityId,
        currentStatus: entity.lifecycleStatus,
        recommendedStatus: 'approved',
        reason: 'all_approved',
        episodeStatusBreakdown: breakdown
      };
    }
    if (breakdown.in_review > 0 || breakdown.approved > 0) {
      return {
        entityId,
        currentStatus: entity.lifecycleStatus,
        recommendedStatus: 'in_review',
        reason: 'has_in_review',
        episodeStatusBreakdown: breakdown
      };
    }
    if (breakdown.rejected > 0) {
      return {
        entityId,
        currentStatus: entity.lifecycleStatus,
        recommendedStatus: 'draft',
        reason: 'has_rejected',
        episodeStatusBreakdown: breakdown
      };
    }
    return {
      entityId,
      currentStatus: entity.lifecycleStatus,
      recommendedStatus: 'draft',
      reason: 'default_draft',
      episodeStatusBreakdown: breakdown
    };
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
    if (!this.store.getProjectById(projectId)) {
      return null;
    }
    const opId = uuid();
    const executedAt = new Date().toISOString();
    const actor = input.actor?.trim() || 'operator';
    const dedupedIds = [...new Set(input.entityIds.map((item) => item.trim()).filter((item) => item.length > 0))];
    const updated: Array<{ entityId: string; fromStatus: DomainEntityLifecycleStatus; toStatus: DomainEntityLifecycleStatus; autoRecommended: boolean }> = [];
    const rejected: Array<{
      entityId: string;
      toStatus: DomainEntityLifecycleStatus;
      reason: 'not_found' | 'deleted' | 'invalid_transition' | 'entity_in_use' | 'no_recommendation';
    }> = [];
    for (const entityId of dedupedIds) {
      const entity = this.store.getDomainEntity(projectId, entityId, { includeDeleted: true });
      const recommended = input.autoRecommend ? this.recommendDomainEntityLifecycleStatusByEpisode(projectId, entityId) : null;
      const groupedStatus = entity?.type ? input.toStatusByType?.[entity.type] : undefined;
      const toStatus = recommended?.recommendedStatus ?? groupedStatus ?? input.toStatus;
      if (!toStatus) {
        rejected.push({
          entityId,
          toStatus: 'draft',
          reason: 'no_recommendation'
        });
        continue;
      }
      const result = this.transitionDomainEntityLifecycle(projectId, entityId, {
        toStatus,
        actor: input.actor,
        note: input.note
      });
      if (!result || !result.check.allowed || !result.entity) {
        const reason =
          result?.check.reason === 'deleted' ||
          result?.check.reason === 'invalid_transition' ||
          result?.check.reason === 'entity_in_use' ||
          result?.check.reason === 'not_found'
            ? result.check.reason
            : 'not_found';
        rejected.push({
          entityId,
          toStatus,
          reason
        });
        continue;
      }
      updated.push({
        entityId,
        fromStatus: result.check.fromStatus,
        toStatus: result.check.toStatus,
        autoRecommended: Boolean(input.autoRecommend)
      });
    }
    this.store.appendDomainEntityAudit({
      projectId,
      actor,
      action: 'domain_entity.lifecycle_batch_transition',
      targetType: 'domain_entity',
      targetId: opId,
      details: {
        opId,
        executedAt,
        entityIds: dedupedIds,
        autoRecommend: Boolean(input.autoRecommend),
        toStatus: input.toStatus ?? null,
        toStatusByType: input.toStatusByType ?? null,
        updatedCount: updated.length,
        rejectedCount: rejected.length,
        note: input.note?.trim() || ''
      }
    });
    return { opId, executedAt, actor, updated, rejected };
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
    if (!this.store.getProjectById(projectId)) {
      return null;
    }
    const entity = this.store.getDomainEntity(projectId, entityId, { includeDeleted: true });
    if (!entity) {
      return {
        entityId,
        fromStatus: 'draft',
        allowed: false,
        reason: 'not_found',
        reference: {
          episodeRelationCount: 0,
          storyboardRelationCount: 0
        }
      };
    }
    const reference = this.store.countDomainEntityReferences(projectId, entityId);
    if (entity.deletedAt) {
      return {
        entityId,
        fromStatus: entity.lifecycleStatus,
        allowed: false,
        reason: 'deleted',
        reference
      };
    }
    if (entity.lifecycleStatus === 'in_review' || entity.lifecycleStatus === 'approved') {
      return {
        entityId,
        fromStatus: entity.lifecycleStatus,
        allowed: false,
        reason: 'protected_status',
        reference
      };
    }
    if (reference.episodeRelationCount > 0 || reference.storyboardRelationCount > 0) {
      return {
        entityId,
        fromStatus: entity.lifecycleStatus,
        allowed: false,
        reason: 'entity_in_use',
        reference
      };
    }
    return {
      entityId,
      fromStatus: entity.lifecycleStatus,
      allowed: true,
      reason: 'ok',
      reference
    };
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
    const check = this.previewDomainEntityDelete(projectId, entityId);
    if (!check) {
      return null;
    }
    if (!check.allowed) {
      return {
        deleted: false,
        check
      };
    }
    const ok = this.store.deleteDomainEntity(projectId, entityId);
    if (ok) {
      this.store.appendDomainEntityAudit({
        projectId,
        actor: 'operator',
        action: 'domain_entity.soft_delete',
        targetType: 'domain_entity',
        targetId: entityId
      });
    }
    return {
      deleted: ok,
      check
    };
  }

  restoreDomainEntity(projectId: string, entityId: string, input?: { actor?: string }): DomainEntity | null {
    const restored = this.store.restoreDomainEntity(projectId, entityId);
    if (restored) {
      this.store.appendDomainEntityAudit({
        projectId,
        actor: input?.actor?.trim() || 'operator',
        action: 'domain_entity.restore',
        targetType: 'domain_entity',
        targetId: entityId
      });
    }
    return restored;
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
    if (!this.store.getProjectById(projectId)) {
      return null;
    }
    const entity = this.store.getDomainEntity(projectId, entityId, { includeDeleted: true });
    if (!entity) {
      return {
        entityId,
        fromStatus: 'draft',
        toStatus: input.toStatus,
        allowed: false,
        reason: 'not_found',
        reference: {
          episodeRelationCount: 0,
          storyboardRelationCount: 0
        }
      };
    }
    const reference = this.store.countDomainEntityReferences(projectId, entityId);
    if (entity.deletedAt) {
      return {
        entityId,
        fromStatus: entity.lifecycleStatus,
        toStatus: input.toStatus,
        allowed: false,
        reason: 'deleted',
        reference
      };
    }
    const allowedMap: Record<DomainEntityLifecycleStatus, DomainEntityLifecycleStatus[]> = {
      draft: ['in_review', 'archived'],
      in_review: ['draft', 'approved', 'archived'],
      approved: ['archived'],
      archived: ['draft']
    };
    if (entity.lifecycleStatus !== input.toStatus && !allowedMap[entity.lifecycleStatus].includes(input.toStatus)) {
      return {
        entityId,
        fromStatus: entity.lifecycleStatus,
        toStatus: input.toStatus,
        allowed: false,
        reason: 'invalid_transition',
        reference
      };
    }
    if (input.toStatus === 'archived' && (reference.episodeRelationCount > 0 || reference.storyboardRelationCount > 0)) {
      return {
        entityId,
        fromStatus: entity.lifecycleStatus,
        toStatus: input.toStatus,
        allowed: false,
        reason: 'entity_in_use',
        reference
      };
    }
    return {
      entityId,
      fromStatus: entity.lifecycleStatus,
      toStatus: input.toStatus,
      allowed: true,
      reason: 'ok',
      reference
    };
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
    const check = this.previewDomainEntityLifecycleTransition(projectId, entityId, { toStatus: input.toStatus });
    if (!check) {
      return null;
    }
    if (!check.allowed) {
      return {
        entity: this.store.getDomainEntity(projectId, entityId, { includeDeleted: true }),
        check
      };
    }
    const entity = this.store.transitionDomainEntityLifecycle(projectId, entityId, input.toStatus);
    if (!entity) {
      return null;
    }
    this.store.appendDomainEntityAudit({
      projectId,
      actor: input.actor?.trim() || 'operator',
      action: 'domain_entity.lifecycle_transition',
      targetType: 'domain_entity',
      targetId: entityId,
      details: {
        fromStatus: check.fromStatus,
        toStatus: check.toStatus,
        reference: check.reference,
        note: input.note?.trim() || ''
      }
    });
    return { entity, check };
  }
}
