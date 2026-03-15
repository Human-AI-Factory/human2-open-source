import { EpisodeWorkflowStatus } from '../../core/types.js';
import { SqliteStore } from '../../db/sqlite.js';

const DOMAIN_APPLY_POLICY_KEY_PREFIX = 'domain_apply_policy_v1:';

export type DomainApplyMode = 'missing_only' | 'all';
export type DomainConflictStrategy = 'skip' | 'overwrite_prompt' | 'overwrite_all' | 'rename';
export type DomainPriority = 'entity_first' | 'existing_first';
export type DomainEntityType = 'character' | 'scene' | 'prop';

export type DomainApplyPolicyTypeRule = {
  conflictStrategy: DomainConflictStrategy;
  priority: DomainPriority;
  renameSuffix: string;
};

export type DomainApplyPolicy = {
  projectId: string;
  updatedAt: string;
  updatedBy: string;
  defaultMode: DomainApplyMode;
  byType: Record<DomainEntityType, DomainApplyPolicyTypeRule>;
  byStatus: Partial<Record<EpisodeWorkflowStatus, Partial<Record<DomainEntityType, Partial<DomainApplyPolicyTypeRule>>>>>;
};

export class DomainApplyPolicyService {
  constructor(private readonly store: SqliteStore) {}

  getDomainApplyPolicy(projectId: string): DomainApplyPolicy | null {
    const project = this.store.getProjectById(projectId);
    if (!project) {
      return null;
    }
    return this.readDomainApplyPolicy(projectId);
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
    const project = this.store.getProjectById(projectId);
    if (!project) {
      return null;
    }
    const current = this.readDomainApplyPolicy(projectId);
    const normalizedByStatusInput = this.normalizeDomainApplyPolicyByStatusInput(input.byStatus);
    const mergeStatusTypeRule = (
      status: EpisodeWorkflowStatus,
      type: DomainEntityType
    ): Partial<DomainApplyPolicyTypeRule> => ({
      ...(current.byStatus[status]?.[type] ?? {}),
      ...(normalizedByStatusInput[status]?.[type] ?? {})
    });
    const next: DomainApplyPolicy = {
      ...current,
      updatedAt: new Date().toISOString(),
      updatedBy: input.actor?.trim() || 'operator',
      defaultMode: input.defaultMode ?? current.defaultMode,
      byType: {
        character: {
          ...current.byType.character,
          ...(input.byType?.character ?? {})
        },
        scene: {
          ...current.byType.scene,
          ...(input.byType?.scene ?? {})
        },
        prop: {
          ...current.byType.prop,
          ...(input.byType?.prop ?? {})
        }
      },
      byStatus: {
        draft: {
          character: mergeStatusTypeRule('draft', 'character'),
          scene: mergeStatusTypeRule('draft', 'scene'),
          prop: mergeStatusTypeRule('draft', 'prop')
        },
        in_review: {
          character: mergeStatusTypeRule('in_review', 'character'),
          scene: mergeStatusTypeRule('in_review', 'scene'),
          prop: mergeStatusTypeRule('in_review', 'prop')
        },
        approved: {
          character: mergeStatusTypeRule('approved', 'character'),
          scene: mergeStatusTypeRule('approved', 'scene'),
          prop: mergeStatusTypeRule('approved', 'prop')
        },
        rejected: {
          character: mergeStatusTypeRule('rejected', 'character'),
          scene: mergeStatusTypeRule('rejected', 'scene'),
          prop: mergeStatusTypeRule('rejected', 'prop')
        }
      }
    };
    this.store.setSystemSetting(this.getDomainApplyPolicyKey(projectId), JSON.stringify(next));
    this.store.appendDomainEntityAudit({
      projectId,
      actor: next.updatedBy,
      action: 'domain_policy.update',
      targetType: 'apply',
      targetId: 'domain_apply_policy',
      details: {
        defaultMode: next.defaultMode,
        byType: next.byType,
        byStatus: next.byStatus
      }
    });
    return next;
  }

  resolveDomainApplyDefaults(
    projectId: string,
    type: DomainEntityType,
    episodeId?: string
  ): { mode: DomainApplyMode; conflictStrategy: DomainConflictStrategy; priority: DomainPriority; renameSuffix: string } {
    const policy = this.readDomainApplyPolicy(projectId);
    const workflowState = episodeId ? this.store.getEpisodeWorkflowState(projectId, episodeId) : null;
    const workflowStatus = workflowState?.status;
    const statusRule = workflowStatus ? policy.byStatus[workflowStatus]?.[type] ?? {} : {};
    const base = policy.byType[type];
    return {
      mode: policy.defaultMode,
      conflictStrategy: (statusRule.conflictStrategy ?? base.conflictStrategy) as DomainConflictStrategy,
      priority: (statusRule.priority ?? base.priority) as DomainPriority,
      renameSuffix: (statusRule.renameSuffix ?? base.renameSuffix) as string
    };
  }

  private getDomainApplyPolicyKey(projectId: string): string {
    return `${DOMAIN_APPLY_POLICY_KEY_PREFIX}${projectId}`;
  }

  private defaultDomainApplyPolicy(projectId: string): DomainApplyPolicy {
    const baseRule = (renameSuffix: string): DomainApplyPolicyTypeRule => ({
      conflictStrategy: 'skip',
      priority: 'entity_first',
      renameSuffix
    });
    return {
      projectId,
      updatedAt: new Date(0).toISOString(),
      updatedBy: 'system',
      defaultMode: 'missing_only',
      byType: {
        character: baseRule('(char copy)'),
        scene: baseRule('(scene copy)'),
        prop: baseRule('(prop copy)')
      },
      byStatus: {
        draft: {
          character: {},
          scene: {},
          prop: {}
        },
        in_review: {
          character: { conflictStrategy: 'overwrite_prompt' },
          scene: { conflictStrategy: 'overwrite_prompt' },
          prop: { conflictStrategy: 'overwrite_prompt' }
        },
        approved: {
          character: { conflictStrategy: 'rename', renameSuffix: '(approved copy)' },
          scene: { conflictStrategy: 'rename', renameSuffix: '(approved copy)' },
          prop: { conflictStrategy: 'rename', renameSuffix: '(approved copy)' }
        },
        rejected: {
          character: {},
          scene: {},
          prop: {}
        }
      }
    };
  }

  private readDomainApplyPolicy(projectId: string): DomainApplyPolicy {
    const fallback = this.defaultDomainApplyPolicy(projectId);
    const raw = this.store.getSystemSetting(this.getDomainApplyPolicyKey(projectId));
    if (!raw) {
      return fallback;
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return fallback;
      }
      const row = parsed as Record<string, unknown>;
      const toRule = (value: unknown, type: DomainEntityType): DomainApplyPolicyTypeRule => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          return fallback.byType[type];
        }
        const r = value as Record<string, unknown>;
        const conflictStrategy =
          r.conflictStrategy === 'skip' || r.conflictStrategy === 'overwrite_prompt' || r.conflictStrategy === 'overwrite_all' || r.conflictStrategy === 'rename'
            ? r.conflictStrategy
            : fallback.byType[type].conflictStrategy;
        const priority =
          r.priority === 'entity_first' || r.priority === 'existing_first' ? r.priority : fallback.byType[type].priority;
        const renameSuffix = typeof r.renameSuffix === 'string' ? r.renameSuffix.slice(0, 80) : fallback.byType[type].renameSuffix;
        return { conflictStrategy, priority, renameSuffix };
      };
      const byTypeRaw = row.byType && typeof row.byType === 'object' && !Array.isArray(row.byType) ? (row.byType as Record<string, unknown>) : {};
      const byStatusRaw =
        row.byStatus && typeof row.byStatus === 'object' && !Array.isArray(row.byStatus) ? (row.byStatus as Record<string, unknown>) : {};
      const toPartialRule = (value: unknown): Partial<DomainApplyPolicyTypeRule> => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          return {};
        }
        const r = value as Record<string, unknown>;
        const next: Partial<DomainApplyPolicyTypeRule> = {};
        if (
          r.conflictStrategy === 'skip' ||
          r.conflictStrategy === 'overwrite_prompt' ||
          r.conflictStrategy === 'overwrite_all' ||
          r.conflictStrategy === 'rename'
        ) {
          next.conflictStrategy = r.conflictStrategy;
        }
        if (r.priority === 'entity_first' || r.priority === 'existing_first') {
          next.priority = r.priority;
        }
        if (typeof r.renameSuffix === 'string') {
          next.renameSuffix = r.renameSuffix.slice(0, 80);
        }
        return next;
      };
      const toStatusTypeMap = (
        statusValue: unknown
      ): Partial<Record<DomainEntityType, Partial<DomainApplyPolicyTypeRule>>> => {
        if (!statusValue || typeof statusValue !== 'object' || Array.isArray(statusValue)) {
          return {};
        }
        const node = statusValue as Record<string, unknown>;
        const hasTypedChildren = ['character', 'scene', 'prop'].some((key) => node[key] && typeof node[key] === 'object' && !Array.isArray(node[key]));
        if (hasTypedChildren) {
          return {
            character: toPartialRule(node.character),
            scene: toPartialRule(node.scene),
            prop: toPartialRule(node.prop)
          };
        }
        const legacyRule = toPartialRule(node);
        return {
          character: { ...legacyRule },
          scene: { ...legacyRule },
          prop: { ...legacyRule }
        };
      };
      return {
        projectId,
        updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : fallback.updatedAt,
        updatedBy: typeof row.updatedBy === 'string' && row.updatedBy.trim() ? row.updatedBy : fallback.updatedBy,
        defaultMode: row.defaultMode === 'all' ? 'all' : 'missing_only',
        byType: {
          character: toRule(byTypeRaw.character, 'character'),
          scene: toRule(byTypeRaw.scene, 'scene'),
          prop: toRule(byTypeRaw.prop, 'prop')
        },
        byStatus: {
          draft: toStatusTypeMap(byStatusRaw.draft),
          in_review: toStatusTypeMap(byStatusRaw.in_review),
          approved: toStatusTypeMap(byStatusRaw.approved),
          rejected: toStatusTypeMap(byStatusRaw.rejected)
        }
      };
    } catch {
      return fallback;
    }
  }

  private normalizeDomainApplyPolicyByStatusInput(
    byStatus:
      | Partial<
          Record<
            EpisodeWorkflowStatus,
            Partial<Record<DomainEntityType, Partial<DomainApplyPolicyTypeRule>>> | Partial<DomainApplyPolicyTypeRule>
          >
        >
      | undefined
  ): Partial<Record<EpisodeWorkflowStatus, Partial<Record<DomainEntityType, Partial<DomainApplyPolicyTypeRule>>>>> {
    if (!byStatus) {
      return {};
    }
    const normalizeStatus = (
      value: Partial<Record<DomainEntityType, Partial<DomainApplyPolicyTypeRule>>> | Partial<DomainApplyPolicyTypeRule> | undefined
    ): Partial<Record<DomainEntityType, Partial<DomainApplyPolicyTypeRule>>> => {
      if (!value) {
        return {};
      }
      const node = value as Record<string, unknown>;
      const hasTypedChildren = ['character', 'scene', 'prop'].some((key) => node[key] && typeof node[key] === 'object' && !Array.isArray(node[key]));
      if (hasTypedChildren) {
        return value as Partial<Record<DomainEntityType, Partial<DomainApplyPolicyTypeRule>>>;
      }
      const legacy = value as Partial<DomainApplyPolicyTypeRule>;
      return {
        character: { ...legacy },
        scene: { ...legacy },
        prop: { ...legacy }
      };
    };
    return {
      draft: normalizeStatus(byStatus.draft),
      in_review: normalizeStatus(byStatus.in_review),
      approved: normalizeStatus(byStatus.approved),
      rejected: normalizeStatus(byStatus.rejected)
    };
  }
}
