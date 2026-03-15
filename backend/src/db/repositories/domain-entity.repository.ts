import type {
  DomainEntity,
  DomainEntityAudit,
  DomainEntityAuditStats,
  EpisodeDomainEntityRelation,
  StoryboardDomainEntityRelation,
} from '../../core/types.js';
import {
  mapDomainEntity,
  mapDomainEntityAudit,
  mapEpisodeDomainEntityRelation,
  mapStoryboardDomainEntityRelation,
} from '../sqlite/row-mappers.js';
import type {
  DomainEntityAuditRow,
  DomainEntityRow,
  EpisodeDomainEntityLinkRow,
  StoryboardDomainEntityLinkRow,
} from '../sqlite/row-types.js';
import { BaseRepository } from './base.repository.js';

type EntityType = 'character' | 'scene' | 'prop';
type LifecycleStatus = 'draft' | 'in_review' | 'approved' | 'archived';
type AuditTargetType = 'domain_entity' | 'episode_relation' | 'storyboard_relation' | 'apply';

export class DomainEntityRepository extends BaseRepository {
  listDomainEntities(projectId: string, input?: { type?: EntityType; includeDeleted?: boolean }): DomainEntity[] | null {
    if (!this.projectExists(projectId)) {
      return null;
    }
    const includeDeleted = Boolean(input?.includeDeleted);
    if (input?.type) {
      const rows = this.db
        .prepare(
          `SELECT id, project_id, type, lifecycle_status, name, prompt, image_url, deleted_at, merged_into_entity_id, created_at, updated_at
           FROM domain_entities
           WHERE project_id = ? AND type = ? ${includeDeleted ? '' : 'AND deleted_at IS NULL'}
           ORDER BY created_at DESC`
        )
        .all(projectId, input.type) as DomainEntityRow[];
      return rows.map((row) => mapDomainEntity(row));
    }
    const rows = this.db
      .prepare(
        `SELECT id, project_id, type, lifecycle_status, name, prompt, image_url, deleted_at, merged_into_entity_id, created_at, updated_at
         FROM domain_entities
         WHERE project_id = ? ${includeDeleted ? '' : 'AND deleted_at IS NULL'}
         ORDER BY created_at DESC`
      )
      .all(projectId) as DomainEntityRow[];
    return rows.map((row) => mapDomainEntity(row));
  }

  getDomainEntity(projectId: string, entityId: string, input?: { includeDeleted?: boolean }): DomainEntity | null {
    const includeDeleted = Boolean(input?.includeDeleted);
    const row = this.db
      .prepare(
        `SELECT id, project_id, type, lifecycle_status, name, prompt, image_url, deleted_at, merged_into_entity_id, created_at, updated_at
         FROM domain_entities
         WHERE id = ? AND project_id = ? ${includeDeleted ? '' : 'AND deleted_at IS NULL'}
         LIMIT 1`
      )
      .get(entityId, projectId) as DomainEntityRow | undefined;
    return row ? mapDomainEntity(row) : null;
  }

  createDomainEntity(input: {
    id: string;
    projectId: string;
    type: EntityType;
    name: string;
    prompt: string;
    imageUrl?: string | null;
  }): DomainEntity | null {
    if (!this.projectExists(input.projectId)) {
      return null;
    }
    const timestamp = this.timestamp();
    this.db
      .prepare(
        'INSERT INTO domain_entities (id, project_id, type, lifecycle_status, name, prompt, image_url, deleted_at, merged_into_entity_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)'
      )
      .run(input.id, input.projectId, input.type, 'draft', input.name, input.prompt, input.imageUrl ?? null, timestamp, timestamp);
    return this.getDomainEntity(input.projectId, input.id);
  }

  updateDomainEntity(
    projectId: string,
    entityId: string,
    input: { type?: EntityType; name?: string; prompt?: string; imageUrl?: string | null }
  ): DomainEntity | null {
    const current = this.getDomainEntity(projectId, entityId, { includeDeleted: true });
    if (!current || current.deletedAt || current.lifecycleStatus === 'archived') {
      return null;
    }
    this.db
      .prepare('UPDATE domain_entities SET type = ?, name = ?, prompt = ?, image_url = ?, updated_at = ? WHERE id = ? AND project_id = ?')
      .run(
        input.type ?? current.type,
        input.name ?? current.name,
        input.prompt ?? current.prompt,
        input.imageUrl === undefined ? current.imageUrl : input.imageUrl,
        this.timestamp(),
        entityId,
        projectId
      );
    return this.getDomainEntity(projectId, entityId);
  }

  deleteDomainEntity(projectId: string, entityId: string): boolean {
    const now = this.timestamp();
    const result = this.db
      .prepare('UPDATE domain_entities SET deleted_at = ?, merged_into_entity_id = NULL, updated_at = ? WHERE id = ? AND project_id = ? AND deleted_at IS NULL')
      .run(now, now, entityId, projectId);
    return Number(result.changes) > 0;
  }

  restoreDomainEntity(projectId: string, entityId: string): DomainEntity | null {
    const current = this.getDomainEntity(projectId, entityId, { includeDeleted: true });
    if (!current || !current.deletedAt) {
      return null;
    }
    const now = this.timestamp();
    this.db
      .prepare('UPDATE domain_entities SET deleted_at = NULL, merged_into_entity_id = NULL, updated_at = ? WHERE id = ? AND project_id = ?')
      .run(now, entityId, projectId);
    return this.getDomainEntity(projectId, entityId);
  }

  mergeDomainEntity(projectId: string, sourceEntityId: string, targetEntityId: string): DomainEntity | null {
    if (sourceEntityId === targetEntityId) {
      return null;
    }
    const source = this.getDomainEntity(projectId, sourceEntityId);
    const target = this.getDomainEntity(projectId, targetEntityId);
    if (!source || !target || source.type !== target.type) {
      return null;
    }
    if (source.lifecycleStatus === 'archived' || target.lifecycleStatus === 'archived') {
      return null;
    }
    const now = this.timestamp();
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      this.db
        .prepare(
          `INSERT OR IGNORE INTO episode_domain_entity_links (project_id, episode_id, entity_id, role, created_at)
           SELECT project_id, episode_id, ?, role, created_at
           FROM episode_domain_entity_links
           WHERE project_id = ? AND entity_id = ?`
        )
        .run(targetEntityId, projectId, sourceEntityId);
      this.db
        .prepare('DELETE FROM episode_domain_entity_links WHERE project_id = ? AND entity_id = ?')
        .run(projectId, sourceEntityId);
      this.db
        .prepare(
          `INSERT OR IGNORE INTO storyboard_domain_entity_links (project_id, storyboard_id, entity_id, role, created_at)
           SELECT project_id, storyboard_id, ?, role, created_at
           FROM storyboard_domain_entity_links
           WHERE project_id = ? AND entity_id = ?`
        )
        .run(targetEntityId, projectId, sourceEntityId);
      this.db
        .prepare('DELETE FROM storyboard_domain_entity_links WHERE project_id = ? AND entity_id = ?')
        .run(projectId, sourceEntityId);
      this.db
        .prepare('UPDATE domain_entities SET deleted_at = ?, merged_into_entity_id = ?, updated_at = ? WHERE id = ? AND project_id = ?')
        .run(now, targetEntityId, now, sourceEntityId, projectId);
      this.db.exec('COMMIT;');
    } catch (error) {
      this.db.exec('ROLLBACK;');
      throw error;
    }
    return this.getDomainEntity(projectId, sourceEntityId, { includeDeleted: true });
  }

  transitionDomainEntityLifecycle(projectId: string, entityId: string, toStatus: LifecycleStatus): DomainEntity | null {
    const current = this.getDomainEntity(projectId, entityId, { includeDeleted: true });
    if (!current || current.deletedAt) {
      return null;
    }
    const allowedMap: Record<LifecycleStatus, LifecycleStatus[]> = {
      draft: ['in_review', 'archived'],
      in_review: ['draft', 'approved', 'archived'],
      approved: ['archived'],
      archived: ['draft'],
    };
    if (current.lifecycleStatus !== toStatus && !allowedMap[current.lifecycleStatus].includes(toStatus)) {
      return null;
    }
    if (current.lifecycleStatus === toStatus) {
      return current;
    }
    this.db
      .prepare('UPDATE domain_entities SET lifecycle_status = ?, updated_at = ? WHERE id = ? AND project_id = ?')
      .run(toStatus, this.timestamp(), entityId, projectId);
    return this.getDomainEntity(projectId, entityId, { includeDeleted: true });
  }

  countDomainEntityReferences(projectId: string, entityId: string): { episodeRelationCount: number; storyboardRelationCount: number } {
    const episodeRelationCount = this.db
      .prepare('SELECT COUNT(*) AS count FROM episode_domain_entity_links WHERE project_id = ? AND entity_id = ?')
      .get(projectId, entityId) as { count: number };
    const storyboardRelationCount = this.db
      .prepare('SELECT COUNT(*) AS count FROM storyboard_domain_entity_links WHERE project_id = ? AND entity_id = ?')
      .get(projectId, entityId) as { count: number };
    return {
      episodeRelationCount: Number(episodeRelationCount.count || 0),
      storyboardRelationCount: Number(storyboardRelationCount.count || 0),
    };
  }

  listDomainEntityRelatedEpisodeIds(projectId: string, entityId: string): string[] {
    const rows = this.db
      .prepare('SELECT DISTINCT episode_id FROM episode_domain_entity_links WHERE project_id = ? AND entity_id = ? ORDER BY episode_id ASC')
      .all(projectId, entityId) as Array<{ episode_id: string }>;
    return rows.map((row) => row.episode_id);
  }

  listEpisodeDomainEntityRelations(projectId: string, episodeId: string): EpisodeDomainEntityRelation[] | null {
    const episode = this.db.prepare('SELECT id FROM episodes WHERE id = ? AND project_id = ? LIMIT 1').get(episodeId, projectId);
    if (!episode) {
      return null;
    }
    const rows = this.db
      .prepare(
        'SELECT project_id, episode_id, entity_id, role, created_at FROM episode_domain_entity_links WHERE project_id = ? AND episode_id = ? ORDER BY role ASC, created_at ASC'
      )
      .all(projectId, episodeId) as EpisodeDomainEntityLinkRow[];
    return rows.map((row) => mapEpisodeDomainEntityRelation(row));
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
    const episode = this.db.prepare('SELECT id FROM episodes WHERE id = ? AND project_id = ? LIMIT 1').get(episodeId, projectId);
    if (!episode) {
      return null;
    }
    const sceneEntityIds = this.normalizeIds(input.sceneEntityIds);
    const characterEntityIds = this.normalizeIds(input.characterEntityIds);
    const propEntityIds = this.normalizeIds(input.propEntityIds);
    if (!sceneEntityIds.every((id) => this.hasEntityType(projectId, id, 'scene'))) {
      return null;
    }
    if (!characterEntityIds.every((id) => this.hasEntityType(projectId, id, 'character'))) {
      return null;
    }
    if (!propEntityIds.every((id) => this.hasEntityType(projectId, id, 'prop'))) {
      return null;
    }
    this.db.prepare('DELETE FROM episode_domain_entity_links WHERE project_id = ? AND episode_id = ?').run(projectId, episodeId);
    const now = this.timestamp();
    for (const entityId of sceneEntityIds) {
      this.db
        .prepare('INSERT INTO episode_domain_entity_links (project_id, episode_id, entity_id, role, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(projectId, episodeId, entityId, 'scene', now);
    }
    for (const entityId of characterEntityIds) {
      this.db
        .prepare('INSERT INTO episode_domain_entity_links (project_id, episode_id, entity_id, role, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(projectId, episodeId, entityId, 'character', now);
    }
    for (const entityId of propEntityIds) {
      this.db
        .prepare('INSERT INTO episode_domain_entity_links (project_id, episode_id, entity_id, role, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(projectId, episodeId, entityId, 'prop', now);
    }
    return this.listEpisodeDomainEntityRelations(projectId, episodeId);
  }

  listStoryboardDomainEntityRelations(projectId: string, storyboardId: string): StoryboardDomainEntityRelation[] | null {
    const storyboard = this.db.prepare('SELECT id FROM storyboards WHERE id = ? AND project_id = ? LIMIT 1').get(storyboardId, projectId);
    if (!storyboard) {
      return null;
    }
    const rows = this.db
      .prepare(
        'SELECT project_id, storyboard_id, entity_id, role, created_at FROM storyboard_domain_entity_links WHERE project_id = ? AND storyboard_id = ? ORDER BY role ASC, created_at ASC'
      )
      .all(projectId, storyboardId) as StoryboardDomainEntityLinkRow[];
    return rows.map((row) => mapStoryboardDomainEntityRelation(row));
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
    const storyboard = this.db.prepare('SELECT id FROM storyboards WHERE id = ? AND project_id = ? LIMIT 1').get(storyboardId, projectId);
    if (!storyboard) {
      return null;
    }
    const sceneEntityId = input.sceneEntityId?.trim();
    const characterEntityIds = this.normalizeIds(input.characterEntityIds);
    const propEntityIds = this.normalizeIds(input.propEntityIds);
    if (sceneEntityId && !this.hasEntityType(projectId, sceneEntityId, 'scene')) {
      return null;
    }
    if (!characterEntityIds.every((id) => this.hasEntityType(projectId, id, 'character'))) {
      return null;
    }
    if (!propEntityIds.every((id) => this.hasEntityType(projectId, id, 'prop'))) {
      return null;
    }

    this.db.prepare('DELETE FROM storyboard_domain_entity_links WHERE project_id = ? AND storyboard_id = ?').run(projectId, storyboardId);
    const now = this.timestamp();
    if (sceneEntityId) {
      this.db
        .prepare('INSERT INTO storyboard_domain_entity_links (project_id, storyboard_id, entity_id, role, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(projectId, storyboardId, sceneEntityId, 'scene', now);
    }
    for (const entityId of characterEntityIds) {
      this.db
        .prepare('INSERT INTO storyboard_domain_entity_links (project_id, storyboard_id, entity_id, role, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(projectId, storyboardId, entityId, 'character', now);
    }
    for (const entityId of propEntityIds) {
      this.db
        .prepare('INSERT INTO storyboard_domain_entity_links (project_id, storyboard_id, entity_id, role, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(projectId, storyboardId, entityId, 'prop', now);
    }
    return this.listStoryboardDomainEntityRelations(projectId, storyboardId);
  }

  appendDomainEntityAudit(input: {
    projectId: string;
    actor: string;
    action: string;
    targetType: AuditTargetType;
    targetId: string;
    details?: Record<string, unknown>;
  }): DomainEntityAudit {
    const createdAt = this.timestamp();
    this.db
      .prepare(
        'INSERT INTO domain_entity_audits (project_id, actor, action, target_type, target_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        input.projectId,
        input.actor.trim() || 'operator',
        input.action.trim(),
        input.targetType,
        input.targetId.trim(),
        JSON.stringify(input.details ?? {}),
        createdAt
      );
    const row = this.db
      .prepare(
        'SELECT id, project_id, actor, action, target_type, target_id, details, created_at FROM domain_entity_audits WHERE project_id = ? ORDER BY id DESC LIMIT 1'
      )
      .get(input.projectId) as DomainEntityAuditRow | undefined;
    if (!row) {
      return {
        id: 0,
        projectId: input.projectId,
        actor: input.actor.trim() || 'operator',
        action: input.action.trim(),
        targetType: input.targetType,
        targetId: input.targetId.trim(),
        details: input.details ?? {},
        createdAt,
      };
    }
    return mapDomainEntityAudit(row);
  }

  listDomainEntityAudits(
    projectId: string,
    input: {
      actor?: string;
      action?: string;
      targetType?: AuditTargetType;
      startAt?: string;
      endAt?: string;
      page: number;
      pageSize: number;
    }
  ): { items: DomainEntityAudit[]; total: number; page: number; pageSize: number } | null {
    if (!this.projectExists(projectId)) {
      return null;
    }
    const clauses = ['project_id = ?'];
    const args: Array<string | number> = [projectId];
    if (input.actor?.trim()) {
      clauses.push('actor LIKE ?');
      args.push(`%${input.actor.trim()}%`);
    }
    if (input.action?.trim()) {
      clauses.push('action = ?');
      args.push(input.action.trim());
    }
    if (input.targetType) {
      clauses.push('target_type = ?');
      args.push(input.targetType);
    }
    if (input.startAt?.trim()) {
      clauses.push('created_at >= ?');
      args.push(input.startAt.trim());
    }
    if (input.endAt?.trim()) {
      clauses.push('created_at <= ?');
      args.push(input.endAt.trim());
    }
    const page = Math.max(1, Math.floor(input.page));
    const pageSize = Math.max(1, Math.min(500, Math.floor(input.pageSize)));
    const offset = (page - 1) * pageSize;
    const totalRow = this.db
      .prepare(`SELECT COUNT(*) as count FROM domain_entity_audits WHERE ${clauses.join(' AND ')}`)
      .get(...args) as { count: number };
    const rows = this.db
      .prepare(
        `SELECT id, project_id, actor, action, target_type, target_id, details, created_at
         FROM domain_entity_audits
         WHERE ${clauses.join(' AND ')}
         ORDER BY id DESC
         LIMIT ? OFFSET ?`
      )
      .all(...args, pageSize, offset) as DomainEntityAuditRow[];
    return {
      items: rows.map((row) => mapDomainEntityAudit(row)),
      total: Number(totalRow.count || 0),
      page,
      pageSize,
    };
  }

  getDomainEntityAuditStats(projectId: string, input: { actor?: string; startAt?: string; endAt?: string }): DomainEntityAuditStats | null {
    if (!this.projectExists(projectId)) {
      return null;
    }
    const clauses = ['project_id = ?'];
    const args: Array<string | number> = [projectId];
    if (input.actor?.trim()) {
      clauses.push('actor LIKE ?');
      args.push(`%${input.actor.trim()}%`);
    }
    if (input.startAt?.trim()) {
      clauses.push('created_at >= ?');
      args.push(input.startAt.trim());
    }
    if (input.endAt?.trim()) {
      clauses.push('created_at <= ?');
      args.push(input.endAt.trim());
    }
    const where = clauses.join(' AND ');
    const totalRow = this.db.prepare(`SELECT COUNT(*) AS count FROM domain_entity_audits WHERE ${where}`).get(...args) as { count: number };
    const recentCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const recentRow = this.db
      .prepare(`SELECT COUNT(*) AS count FROM domain_entity_audits WHERE ${where} AND created_at >= ?`)
      .get(...args, recentCutoff) as { count: number };
    const byAction = this.db
      .prepare(
        `SELECT action, COUNT(*) AS count
         FROM domain_entity_audits
         WHERE ${where}
         GROUP BY action
         ORDER BY count DESC, action ASC`
      )
      .all(...args) as Array<{ action: string; count: number }>;
    const byActor = this.db
      .prepare(
        `SELECT actor, COUNT(*) AS count
         FROM domain_entity_audits
         WHERE ${where}
         GROUP BY actor
         ORDER BY count DESC, actor ASC
         LIMIT 5`
      )
      .all(...args) as Array<{ actor: string; count: number }>;
    const byTargetType = this.db
      .prepare(
        `SELECT target_type, COUNT(*) AS count
         FROM domain_entity_audits
         WHERE ${where}
         GROUP BY target_type
         ORDER BY count DESC, target_type ASC`
      )
      .all(...args) as Array<{ target_type: AuditTargetType; count: number }>;

    return {
      total: Number(totalRow.count || 0),
      recent24h: Number(recentRow.count || 0),
      byAction: byAction.map((row) => ({ action: row.action, count: Number(row.count || 0) })),
      byActor: byActor.map((row) => ({ actor: row.actor, count: Number(row.count || 0) })),
      byTargetType: byTargetType.map((row) => ({ targetType: row.target_type, count: Number(row.count || 0) })),
    };
  }

  private normalizeIds(ids?: string[]): string[] {
    return [...new Set((ids ?? []).map((item) => item.trim()).filter((item) => item.length > 0))];
  }

  private hasEntityType(projectId: string, entityId: string, type: EntityType): boolean {
    const row = this.db
      .prepare('SELECT type FROM domain_entities WHERE id = ? AND project_id = ? AND deleted_at IS NULL LIMIT 1')
      .get(entityId, projectId) as { type: EntityType } | undefined;
    return row?.type === type;
  }
}
