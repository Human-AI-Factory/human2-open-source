import { v4 as uuid } from 'uuid';
import {
  Asset,
  DomainEntity,
  EpisodeDomainEntityRelation,
  StoryboardDomainEntityRelation
} from '../../core/types.js';
import { SqliteStore } from '../../db/sqlite.js';
import {
  DomainApplyMode,
  DomainApplyPolicyService,
  DomainConflictStrategy,
  DomainEntityType,
  DomainPriority
} from './domain-apply-policy.service.js';

export class DomainWorkbenchService {
  private readonly domainApplyPolicyService: DomainApplyPolicyService;

  constructor(private readonly store: SqliteStore) {
    this.domainApplyPolicyService = new DomainApplyPolicyService(store);
  }

  listEpisodeDomainEntityRelations(projectId: string, episodeId: string): EpisodeDomainEntityRelation[] | null {
    return this.store.listEpisodeDomainEntityRelations(projectId, episodeId);
  }

  replaceEpisodeDomainEntityRelations(
    projectId: string,
    episodeId: string,
    input: { sceneEntityIds?: string[]; characterEntityIds?: string[]; propEntityIds?: string[] }
  ): EpisodeDomainEntityRelation[] | null {
    const result = this.store.replaceEpisodeDomainEntityRelations(projectId, episodeId, input);
    if (result) {
      this.store.appendDomainEntityAudit({
        projectId,
        actor: 'operator',
        action: 'episode_relation.replace',
        targetType: 'episode_relation',
        targetId: episodeId,
        details: {
          sceneEntityIds: input.sceneEntityIds ?? [],
          characterEntityIds: input.characterEntityIds ?? [],
          propEntityIds: input.propEntityIds ?? []
        }
      });
    }
    return result;
  }

  listStoryboardDomainEntityRelations(projectId: string, storyboardId: string): StoryboardDomainEntityRelation[] | null {
    return this.store.listStoryboardDomainEntityRelations(projectId, storyboardId);
  }

  replaceStoryboardDomainEntityRelations(
    projectId: string,
    storyboardId: string,
    input: { sceneEntityId?: string | null; characterEntityIds?: string[]; propEntityIds?: string[] }
  ): StoryboardDomainEntityRelation[] | null {
    const result = this.store.replaceStoryboardDomainEntityRelations(projectId, storyboardId, input);
    if (result) {
      this.store.appendDomainEntityAudit({
        projectId,
        actor: 'operator',
        action: 'storyboard_relation.replace',
        targetType: 'storyboard_relation',
        targetId: storyboardId,
        details: {
          sceneEntityId: input.sceneEntityId ?? null,
          characterEntityIds: input.characterEntityIds ?? [],
          propEntityIds: input.propEntityIds ?? []
        }
      });
    }
    return result;
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
    const entities = this.store.listDomainEntities(projectId, { type: input.type });
    const storyboards = this.store.listStoryboards(projectId);
    if (!entities || !storyboards) {
      return null;
    }
    const q = input.q?.trim().toLowerCase();
    const filteredEntities = entities.filter((entity) => {
      if (!q) {
        return true;
      }
      const haystack = `${entity.name} ${entity.prompt}`.toLowerCase();
      return haystack.includes(q);
    });
    const rows = filteredEntities.map((entity) => {
      const storyboardIds = new Set<string>();
      const episodeIds = new Set<string>();

      // 1. 检查集数直接关联的实体（剧本资产）
      if (input.episodeId) {
        const episodeRelations = this.store.listEpisodeDomainEntityRelations(projectId, input.episodeId) ?? [];
        const episodeHit = episodeRelations.some((relation) => relation.entityId === entity.id);
        if (episodeHit) {
          episodeIds.add(input.episodeId);
        }
      } else {
        // 如果没有指定集数，收集所有集数关联
        const allEpisodeRelations = this.store.listEpisodeDomainEntityRelations(projectId, '') ?? [];
        for (const relation of allEpisodeRelations) {
          if (relation.entityId === entity.id) {
            episodeIds.add(relation.episodeId);
          }
        }
      }

      // 2. 检查分镜关联的实体（分镜资产）
      for (const storyboard of storyboards) {
        if (input.episodeId && storyboard.episodeId !== input.episodeId) {
          continue;
        }
        const relations = this.store.listStoryboardDomainEntityRelations(projectId, storyboard.id) ?? [];
        const hit = relations.some((relation) => relation.entityId === entity.id);
        if (!hit) {
          continue;
        }
        storyboardIds.add(storyboard.id);
        if (storyboard.episodeId) {
          episodeIds.add(storyboard.episodeId);
        }
      }

      // 如果指定了集数筛选，只返回该集数有关联的项目
      if (input.episodeId && !episodeIds.has(input.episodeId) && storyboardIds.size === 0) {
        return null;
      }

      return {
        entityId: entity.id,
        type: entity.type,
        name: entity.name,
        prompt: entity.prompt,
        imageUrl: entity.imageUrl,
        usageCount: storyboardIds.size + (episodeIds.size > 0 ? 1 : 0),
        appearances: storyboardIds.size,
        episodeIds: Array.from(episodeIds),
        storyboardIds: Array.from(storyboardIds)
      };
    }).filter((row): row is NonNullable<typeof row> => row !== null);
    return rows.sort((a, b) => b.appearances - a.appearances || a.name.localeCompare(b.name));
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
    const entities = this.store.listDomainEntities(projectId, { type: input.type });
    if (!entities) {
      return null;
    }
    const normalizeNameKey = (value: string): string =>
      value
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
    const promptFingerprint = (value: string): string =>
      value
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .slice(0, 180);

    const byNameMap = new Map<string, DomainEntity[]>();
    const byPromptMap = new Map<string, DomainEntity[]>();
    for (const entity of entities) {
      const nameKey = `${entity.type}:${normalizeNameKey(entity.name)}`;
      const promptKey = `${entity.type}:${promptFingerprint(entity.prompt)}`;
      byNameMap.set(nameKey, [...(byNameMap.get(nameKey) ?? []), entity]);
      if (promptFingerprint(entity.prompt)) {
        byPromptMap.set(promptKey, [...(byPromptMap.get(promptKey) ?? []), entity]);
      }
    }

    const byName = Array.from(byNameMap.entries())
      .filter(([, items]) => items.length > 1)
      .map(([key, items]) => ({
        type: items[0].type,
        key,
        count: items.length,
        entityIds: items.map((item) => item.id),
        entityNames: items.map((item) => item.name)
      }))
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));

    const byPromptFingerprint = Array.from(byPromptMap.entries())
      .filter(([, items]) => items.length > 1)
      .map(([fingerprint, items]) => ({
        type: items[0].type,
        fingerprint,
        count: items.length,
        entityIds: items.map((item) => item.id),
        entityNames: items.map((item) => item.name)
      }))
      .sort((a, b) => b.count - a.count || a.fingerprint.localeCompare(b.fingerprint));

    return {
      byName,
      byPromptFingerprint
    };
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
    const entity = this.store.getDomainEntity(projectId, entityId);
    const storyboards = this.store.listStoryboardsByEpisode(projectId, input.episodeId);
    if (!entity || entity.lifecycleStatus === 'archived' || !storyboards) {
      return null;
    }
    const defaults = this.domainApplyPolicyService.resolveDomainApplyDefaults(projectId, entity.type);
    const mode = input.mode ?? defaults.mode;
    const strategy = input.conflictStrategy ?? defaults.conflictStrategy;
    const priority = input.priority ?? defaults.priority;
    const rows = storyboards.map((storyboard) => {
      const assets = (this.store.listAssets(projectId) ?? []).filter((asset) => asset.storyboardId === storyboard.id);
      const conflict = assets.find(
        (item: Asset) => item.type === entity.type && item.name.trim().toLowerCase() === entity.name.trim().toLowerCase()
      );
      if (!conflict) {
        return {
          storyboardId: storyboard.id,
          storyboardTitle: storyboard.title,
          action: 'create' as const,
          reason: 'no_conflict'
        };
      }
      if (mode === 'missing_only') {
        return {
          storyboardId: storyboard.id,
          storyboardTitle: storyboard.title,
          action: 'skip' as const,
          reason: 'exists_missing_only',
          existingAssetId: conflict.id
        };
      }
      if (strategy === 'skip') {
        return {
          storyboardId: storyboard.id,
          storyboardTitle: storyboard.title,
          action: 'skip' as const,
          reason: 'strategy_skip',
          existingAssetId: conflict.id
        };
      }
      if (strategy === 'rename') {
        return {
          storyboardId: storyboard.id,
          storyboardTitle: storyboard.title,
          action: 'create' as const,
          reason: 'strategy_rename',
          existingAssetId: conflict.id
        };
      }
      if (priority === 'existing_first') {
        return {
          storyboardId: storyboard.id,
          storyboardTitle: storyboard.title,
          action: 'skip' as const,
          reason: 'existing_first',
          existingAssetId: conflict.id
        };
      }
      return {
        storyboardId: storyboard.id,
        storyboardTitle: storyboard.title,
        action: 'update' as const,
        reason: strategy,
        existingAssetId: conflict.id
      };
    });
    return {
      entityId,
      episodeId: input.episodeId,
      totalStoryboards: rows.length,
      createCount: rows.filter((item) => item.action === 'create').length,
      updateCount: rows.filter((item) => item.action === 'update').length,
      skipCount: rows.filter((item) => item.action === 'skip').length,
      items: rows
    };
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
    const entity = this.store.getDomainEntity(projectId, entityId);
    const defaults = entity ? this.domainApplyPolicyService.resolveDomainApplyDefaults(projectId, entity.type, input.episodeId) : null;
    const effectiveInput = {
      ...input,
      mode: input.mode ?? (defaults?.mode ?? 'missing_only'),
      conflictStrategy: input.conflictStrategy ?? (defaults?.conflictStrategy ?? 'skip'),
      priority: input.priority ?? (defaults?.priority ?? 'entity_first'),
      renameSuffix: input.renameSuffix ?? (defaults?.renameSuffix || undefined)
    };
    const preview = this.previewDomainEntityApplyToEpisode(projectId, entityId, effectiveInput);
    if (!entity || entity.lifecycleStatus === 'archived' || !preview) {
      return null;
    }
    const created: Asset[] = [];
    const updated: Asset[] = [];
    const skippedStoryboardIds: string[] = [];
    const suffix = effectiveInput.renameSuffix?.trim();
    for (const item of preview.items) {
      if (item.action === 'skip') {
        skippedStoryboardIds.push(item.storyboardId);
        continue;
      }
      if (item.action === 'update' && item.existingAssetId) {
        const changed = this.store.updateAsset(projectId, item.existingAssetId, {
          prompt: entity.prompt,
          imageUrl: entity.imageUrl
        });
        if (changed) {
          updated.push(changed);
        }
      } else {
        const targetName =
          item.reason === 'strategy_rename' ? `${entity.name}${suffix ? ` ${suffix}` : ' (copy)'}` : entity.name;
        const inserted = this.store.createAsset({
          id: uuid(),
          projectId,
          storyboardId: item.storyboardId,
          type: entity.type,
          name: targetName,
          prompt: entity.prompt,
          imageUrl: entity.imageUrl
        });
        if (inserted) {
          created.push(inserted);
        }
      }
      const storyboardRelations = this.store.listStoryboardDomainEntityRelations(projectId, item.storyboardId) ?? [];
      const nextScene = storyboardRelations.find((row) => row.role === 'scene')?.entityId ?? null;
      const nextCharacters = storyboardRelations.filter((row) => row.role === 'character').map((row) => row.entityId);
      const nextProps = storyboardRelations.filter((row) => row.role === 'prop').map((row) => row.entityId);
      if (entity.type === 'scene') {
        if (nextScene !== entity.id) {
          this.store.replaceStoryboardDomainEntityRelations(projectId, item.storyboardId, {
            sceneEntityId: entity.id,
            characterEntityIds: nextCharacters,
            propEntityIds: nextProps
          });
        }
      } else if (entity.type === 'character') {
        if (!nextCharacters.includes(entity.id)) {
          this.store.replaceStoryboardDomainEntityRelations(projectId, item.storyboardId, {
            sceneEntityId: nextScene,
            characterEntityIds: [...nextCharacters, entity.id],
            propEntityIds: nextProps
          });
        }
      } else if (!nextProps.includes(entity.id)) {
        this.store.replaceStoryboardDomainEntityRelations(projectId, item.storyboardId, {
          sceneEntityId: nextScene,
          characterEntityIds: nextCharacters,
          propEntityIds: [...nextProps, entity.id]
        });
      }
    }
    const episodeRelations = this.store.listEpisodeDomainEntityRelations(projectId, input.episodeId) ?? [];
    const sceneIds = episodeRelations.filter((row) => row.role === 'scene').map((row) => row.entityId);
    const characterIds = episodeRelations.filter((row) => row.role === 'character').map((row) => row.entityId);
    const propIds = episodeRelations.filter((row) => row.role === 'prop').map((row) => row.entityId);
    if (entity.type === 'scene' && !sceneIds.includes(entity.id)) {
      this.store.replaceEpisodeDomainEntityRelations(projectId, input.episodeId, {
        sceneEntityIds: [...sceneIds, entity.id],
        characterEntityIds: characterIds,
        propEntityIds: propIds
      });
    }
    if (entity.type === 'character' && !characterIds.includes(entity.id)) {
      this.store.replaceEpisodeDomainEntityRelations(projectId, input.episodeId, {
        sceneEntityIds: sceneIds,
        characterEntityIds: [...characterIds, entity.id],
        propEntityIds: propIds
      });
    }
    if (entity.type === 'prop' && !propIds.includes(entity.id)) {
      this.store.replaceEpisodeDomainEntityRelations(projectId, input.episodeId, {
        sceneEntityIds: sceneIds,
        characterEntityIds: characterIds,
        propEntityIds: [...propIds, entity.id]
      });
    }
    this.store.appendDomainEntityAudit({
      projectId,
      actor: input.actor?.trim() || 'operator',
      action: 'domain_entity.apply',
      targetType: 'apply',
      targetId: `${entityId}:${input.episodeId}`,
      details: {
        mode: input.mode ?? 'missing_only',
        conflictStrategy: effectiveInput.conflictStrategy ?? 'skip',
        priority: effectiveInput.priority ?? 'entity_first',
        createdCount: created.length,
        updatedCount: updated.length,
        skippedCount: skippedStoryboardIds.length,
        note: input.note?.trim() || ''
      }
    });
    return {
      entityId,
      episodeId: input.episodeId,
      created,
      updated,
      skippedStoryboardIds,
      totalStoryboards: preview.totalStoryboards
    };
  }
}
