import { request, requestText } from '@/api/client';
import { buildQuery } from '@/api/utils';
import type {
  Asset,
  CanonicalDomainEntity,
  DomainApplyPolicy,
  DomainEntityApplyPreviewResult,
  DomainEntityApplyResult,
  DomainEntityAudit,
  DomainEntityAuditStats,
  DomainEntityConflictSummary,
  DomainEntityItem,
  DomainEntityLifecycleBatchTransitionResult,
  DomainEntityLifecycleCheckResult,
  DomainEntityLifecycleRecommendation,
  DomainEntityWorkbenchItem,
  PageResult
} from '@/types/models';

export const getCanonicalDomainEntities = (
  projectId: string,
  input: { type?: 'character' | 'scene' | 'prop'; includeDeleted?: boolean } = {}
): Promise<CanonicalDomainEntity[]> =>
  request(`/api/domain/projects/${projectId}/domain-entities?${buildQuery(input)}`);

export const getDomainEntities = (
  projectId: string,
  input: { type?: 'character' | 'scene' | 'prop'; episodeId?: string } = {}
): Promise<DomainEntityItem[]> =>
  request(`/api/domain/projects/${projectId}/entities?${buildQuery(input)}`);

export const getCanonicalDomainEntityWorkbench = (
  projectId: string,
  input: { type?: 'character' | 'scene' | 'prop'; q?: string; episodeId?: string } = {}
): Promise<DomainEntityWorkbenchItem[]> =>
  request(`/api/domain/projects/${projectId}/domain-entities/workbench?${buildQuery(input)}`);

export const getCanonicalDomainEntityLifecycleCheck = (
  projectId: string,
  entityId: string,
  input: { toStatus: 'draft' | 'in_review' | 'approved' | 'archived' }
): Promise<DomainEntityLifecycleCheckResult> =>
  request(`/api/domain/projects/${projectId}/domain-entities/${entityId}/lifecycle-check?${buildQuery(input)}`);

export const getCanonicalDomainEntityLifecycleRecommendations = (
  projectId: string,
  input: { entityIds: string[] }
): Promise<{ items: DomainEntityLifecycleRecommendation[]; total: number }> =>
  request(`/api/domain/projects/${projectId}/domain-entities/lifecycle-recommendations?${buildQuery({ entityIds: input.entityIds.join(',') })}`);

export const batchTransitionCanonicalDomainEntityLifecycle = (
  projectId: string,
  payload: {
    entityIds: string[];
    toStatus?: 'draft' | 'in_review' | 'approved' | 'archived';
    toStatusByType?: Partial<Record<'character' | 'scene' | 'prop', 'draft' | 'in_review' | 'approved' | 'archived'>>;
    autoRecommend?: boolean;
    actor?: string;
    note?: string;
  }
): Promise<DomainEntityLifecycleBatchTransitionResult> =>
  request(`/api/domain/projects/${projectId}/domain-entities/lifecycle-batch-transition`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const transitionCanonicalDomainEntityLifecycle = (
  projectId: string,
  entityId: string,
  payload: { toStatus: 'draft' | 'in_review' | 'approved' | 'archived'; actor?: string; note?: string }
): Promise<{ entity: CanonicalDomainEntity; check: DomainEntityLifecycleCheckResult }> =>
  request(`/api/domain/projects/${projectId}/domain-entities/${entityId}/lifecycle-transition`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const getDomainEntityConflicts = (
  projectId: string,
  input: { type?: 'character' | 'scene' | 'prop' } = {}
): Promise<DomainEntityConflictSummary> =>
  request(`/api/domain/projects/${projectId}/domain-entities/conflicts?${buildQuery(input)}`);

export const createDomainEntity = (
  projectId: string,
  payload: {
    storyboardId?: string;
    episodeId?: string;
    type: 'character' | 'scene' | 'prop';
    name: string;
    prompt: string;
    imageUrl?: string | null;
  }
): Promise<Asset> =>
  request(`/api/domain/projects/${projectId}/entities`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const createCanonicalDomainEntity = (
  projectId: string,
  payload: {
    type: 'character' | 'scene' | 'prop';
    name: string;
    prompt: string;
    imageUrl?: string | null;
  }
): Promise<CanonicalDomainEntity> =>
  request(`/api/domain/projects/${projectId}/domain-entities`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const updateDomainEntity = (
  projectId: string,
  assetId: string,
  payload: {
    type?: 'character' | 'scene' | 'prop';
    name?: string;
    prompt?: string;
    imageUrl?: string | null;
  }
): Promise<Asset> =>
  request(`/api/domain/projects/${projectId}/entities/${assetId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });

export const updateCanonicalDomainEntity = (
  projectId: string,
  entityId: string,
  payload: {
    type?: 'character' | 'scene' | 'prop';
    name?: string;
    prompt?: string;
    imageUrl?: string | null;
  }
): Promise<CanonicalDomainEntity> =>
  request(`/api/domain/projects/${projectId}/domain-entities/${entityId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });

export const deleteDomainEntity = (projectId: string, assetId: string): Promise<void> =>
  request(`/api/domain/projects/${projectId}/entities/${assetId}`, {
    method: 'DELETE'
  });

export const deleteCanonicalDomainEntity = (projectId: string, entityId: string): Promise<void> =>
  request(`/api/domain/projects/${projectId}/domain-entities/${entityId}`, {
    method: 'DELETE'
  });

export const getDomainApplyPolicy = (projectId: string): Promise<DomainApplyPolicy> =>
  request(`/api/domain/projects/${projectId}/domain-apply-policy`);

export const updateDomainApplyPolicy = (
  projectId: string,
  payload: {
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
        'draft' | 'in_review' | 'approved' | 'rejected',
        Partial<
          Record<
            'character' | 'scene' | 'prop',
            Partial<{
              conflictStrategy: 'skip' | 'overwrite_prompt' | 'overwrite_all' | 'rename';
              priority: 'entity_first' | 'existing_first';
              renameSuffix: string;
            }>
          >
        >
      >
    >;
    actor?: string;
  }
): Promise<DomainApplyPolicy> =>
  request(`/api/domain/projects/${projectId}/domain-apply-policy`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });

export const previewCanonicalDomainEntityApply = (
  projectId: string,
  entityId: string,
  payload: {
    episodeId: string;
    mode?: 'missing_only' | 'all';
    conflictStrategy?: 'skip' | 'overwrite_prompt' | 'overwrite_all' | 'rename';
    priority?: 'entity_first' | 'existing_first';
    renameSuffix?: string;
  }
): Promise<DomainEntityApplyPreviewResult> =>
  request(`/api/domain/projects/${projectId}/domain-entities/${entityId}/apply-preview`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const applyCanonicalDomainEntityToEpisode = (
  projectId: string,
  entityId: string,
  payload: {
    episodeId: string;
    mode?: 'missing_only' | 'all';
    conflictStrategy?: 'skip' | 'overwrite_prompt' | 'overwrite_all' | 'rename';
    priority?: 'entity_first' | 'existing_first';
    renameSuffix?: string;
    actor?: string;
    note?: string;
  }
): Promise<DomainEntityApplyResult> =>
  request(`/api/domain/projects/${projectId}/domain-entities/${entityId}/apply-to-episode`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const getDomainEntityAudits = (
  projectId: string,
  input: {
    actor?: string;
    action?: string;
    targetType?: 'domain_entity' | 'episode_relation' | 'storyboard_relation' | 'apply';
    startAt?: string;
    endAt?: string;
    page?: number;
    pageSize?: number;
  } = {}
): Promise<PageResult<DomainEntityAudit>> =>
  request(`/api/domain/projects/${projectId}/domain-entity-audits?${buildQuery(input)}`);

export const getDomainEntityAuditStats = (
  projectId: string,
  input: { actor?: string; startAt?: string; endAt?: string } = {}
): Promise<DomainEntityAuditStats> =>
  request(`/api/domain/projects/${projectId}/domain-entity-audits/stats?${buildQuery(input)}`);

export const exportDomainEntityAuditsCsv = (
  projectId: string,
  input: {
    actor?: string;
    action?: string;
    targetType?: 'domain_entity' | 'episode_relation' | 'storyboard_relation' | 'apply';
    startAt?: string;
    endAt?: string;
  } = {}
): Promise<string> =>
  requestText(`/api/domain/projects/${projectId}/domain-entity-audits/export.csv?${buildQuery(input)}`);

export const getDomainEntityWorkbench = (
  projectId: string,
  input: { type?: 'character' | 'scene' | 'prop'; q?: string; episodeId?: string } = {}
): Promise<DomainEntityWorkbenchItem[]> =>
  request(`/api/domain/projects/${projectId}/entity-workbench?${buildQuery(input)}`);

export const applyDomainEntityToEpisode = (
  projectId: string,
  entityId: string,
  payload: {
    episodeId: string;
    mode?: 'missing_only' | 'all';
    overrideName?: string;
    overridePrompt?: string;
    overrideImageUrl?: string | null;
  }
): Promise<{ created: Asset[]; skippedStoryboardIds: string[]; totalStoryboards: number }> =>
  request(`/api/domain/projects/${projectId}/entity-workbench/${entityId}/apply-to-episode`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const restoreCanonicalDomainEntity = (
  projectId: string,
  entityId: string,
  payload: { actor?: string } = {}
): Promise<CanonicalDomainEntity> =>
  request(`/api/domain/projects/${projectId}/domain-entities/${entityId}/restore`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const mergeCanonicalDomainEntity = (
  projectId: string,
  entityId: string,
  payload: { targetEntityId: string; actor?: string; note?: string }
): Promise<CanonicalDomainEntity> =>
  request(`/api/domain/projects/${projectId}/domain-entities/${entityId}/merge`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
