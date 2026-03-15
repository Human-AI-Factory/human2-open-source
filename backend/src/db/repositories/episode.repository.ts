import type {
  EpisodeDomain,
  EpisodeWorkflowAudit,
  EpisodeWorkflowState,
  EpisodeWorkflowStatus,
} from '../../core/types.js';
import { mapEpisode, mapEpisodeWorkflowAudit, mapEpisodeWorkflowState } from '../sqlite/row-mappers.js';
import type { EpisodeRow, EpisodeWorkflowAuditRow, EpisodeWorkflowStateRow } from '../sqlite/row-types.js';
import { BaseRepository } from './base.repository.js';

export class EpisodeRepository extends BaseRepository {
  listEpisodes(projectId: string): EpisodeDomain[] | null {
    if (!this.projectExists(projectId)) {
      return null;
    }
    const rows = this.db
      .prepare(
        'SELECT id, project_id, drama_id, title, order_index, status, created_at, updated_at FROM episodes WHERE project_id = ? ORDER BY order_index ASC, created_at ASC'
      )
      .all(projectId) as EpisodeRow[];
    return rows.map((row) => mapEpisode(row));
  }

  listEpisodesByDrama(dramaId: string): EpisodeDomain[] | null {
    const drama = this.db
      .prepare('SELECT id, project_id, name, description, created_at, updated_at FROM dramas WHERE id = ? LIMIT 1')
      .get(dramaId) as { project_id: string } | undefined;
    if (!drama) {
      return null;
    }
    return this.listEpisodes(drama.project_id);
  }

  createEpisode(input: {
    id: string;
    projectId: string;
    dramaId: string;
    title: string;
    orderIndex: number;
    status?: EpisodeDomain['status'];
  }): EpisodeDomain | null {
    if (!this.projectExists(input.projectId)) {
      return null;
    }
    const drama = this.db
      .prepare('SELECT id FROM dramas WHERE project_id = ? LIMIT 1')
      .get(input.projectId) as { id: string } | undefined;
    if (!drama || drama.id !== input.dramaId) {
      return null;
    }
    const timestamp = this.timestamp();
    this.db
      .prepare(
        'INSERT INTO episodes (id, project_id, drama_id, title, order_index, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        input.id,
        input.projectId,
        input.dramaId,
        input.title,
        Math.max(1, Math.floor(input.orderIndex)),
        input.status ?? 'draft',
        timestamp,
        timestamp
      );
    return this.getEpisodeById(input.projectId, input.id);
  }

  getEpisodeById(projectId: string, episodeId: string): EpisodeDomain | null {
    const row = this.db
      .prepare(
        'SELECT id, project_id, drama_id, title, order_index, status, created_at, updated_at FROM episodes WHERE id = ? AND project_id = ? LIMIT 1'
      )
      .get(episodeId, projectId) as EpisodeRow | undefined;
    return row ? mapEpisode(row) : null;
  }

  updateEpisode(
    projectId: string,
    episodeId: string,
    input: { title?: string; orderIndex?: number; status?: EpisodeDomain['status'] }
  ): EpisodeDomain | null {
    const current = this.getEpisodeById(projectId, episodeId);
    if (!current) {
      return null;
    }
    this.db
      .prepare('UPDATE episodes SET title = ?, order_index = ?, status = ?, updated_at = ? WHERE id = ? AND project_id = ?')
      .run(
        input.title ?? current.title,
        input.orderIndex === undefined ? current.orderIndex : Math.max(1, Math.floor(input.orderIndex)),
        input.status ?? current.status,
        this.timestamp(),
        episodeId,
        projectId
      );
    return this.getEpisodeById(projectId, episodeId);
  }

  getEpisodeWorkflowState(projectId: string, episodeId: string): EpisodeWorkflowState | null {
    const episode = this.getEpisodeById(projectId, episodeId);
    if (!episode) {
      return null;
    }
    const row = this.db
      .prepare('SELECT project_id, episode_id, status, updated_at FROM episode_workflow_states WHERE project_id = ? AND episode_id = ? LIMIT 1')
      .get(projectId, episodeId) as EpisodeWorkflowStateRow | undefined;
    if (!row) {
      return {
        projectId,
        episodeId,
        status: 'draft',
        updatedAt: episode.updatedAt,
      };
    }
    return mapEpisodeWorkflowState(row);
  }

  transitionEpisodeWorkflow(
    projectId: string,
    episodeId: string,
    input: { toStatus: EpisodeWorkflowStatus; actor: string; comment?: string }
  ): EpisodeWorkflowState | null {
    const current = this.getEpisodeWorkflowState(projectId, episodeId);
    if (!current) {
      return null;
    }
    const allowedTransitions: Record<EpisodeWorkflowStatus, EpisodeWorkflowStatus[]> = {
      draft: ['in_review'],
      in_review: ['approved', 'rejected'],
      rejected: ['in_review'],
      approved: [],
    };
    if (!allowedTransitions[current.status].includes(input.toStatus)) {
      return null;
    }
    const timestamp = this.timestamp();
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      this.db
        .prepare(
          'INSERT INTO episode_workflow_states (project_id, episode_id, status, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(project_id, episode_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at'
        )
        .run(projectId, episodeId, input.toStatus, timestamp);
      this.db
        .prepare(
          'INSERT INTO episode_workflow_audits (project_id, episode_id, from_status, to_status, actor, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        )
        .run(projectId, episodeId, current.status, input.toStatus, input.actor.trim() || 'system', (input.comment ?? '').trim(), timestamp);
      this.db.exec('COMMIT;');
    } catch (error) {
      this.db.exec('ROLLBACK;');
      throw error;
    }
    return this.getEpisodeWorkflowState(projectId, episodeId);
  }

  setEpisodeWorkflowState(
    projectId: string,
    episodeId: string,
    input: { toStatus: EpisodeWorkflowStatus; actor: string; comment?: string }
  ): EpisodeWorkflowState | null {
    const current = this.getEpisodeWorkflowState(projectId, episodeId);
    if (!current) {
      return null;
    }
    if (current.status === input.toStatus) {
      return current;
    }
    const timestamp = this.timestamp();
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      this.db
        .prepare(
          'INSERT INTO episode_workflow_states (project_id, episode_id, status, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(project_id, episode_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at'
        )
        .run(projectId, episodeId, input.toStatus, timestamp);
      this.db
        .prepare(
          'INSERT INTO episode_workflow_audits (project_id, episode_id, from_status, to_status, actor, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        )
        .run(projectId, episodeId, current.status, input.toStatus, input.actor.trim() || 'system', (input.comment ?? '').trim(), timestamp);
      this.db.exec('COMMIT;');
    } catch (error) {
      this.db.exec('ROLLBACK;');
      throw error;
    }
    return this.getEpisodeWorkflowState(projectId, episodeId);
  }

  listEpisodeWorkflowAudits(projectId: string, episodeId: string, limit = 100): EpisodeWorkflowAudit[] | null {
    const episode = this.getEpisodeById(projectId, episodeId);
    if (!episode) {
      return null;
    }
    const rows = this.db
      .prepare(
        'SELECT id, project_id, episode_id, from_status, to_status, actor, comment, created_at FROM episode_workflow_audits WHERE project_id = ? AND episode_id = ? ORDER BY id DESC LIMIT ?'
      )
      .all(projectId, episodeId, Math.max(1, Math.min(500, Math.floor(limit)))) as EpisodeWorkflowAuditRow[];
    return rows.map((row) => mapEpisodeWorkflowAudit(row));
  }

  deleteEpisode(projectId: string, episodeId: string): boolean {
    this.db.prepare('UPDATE storyboards SET episode_id = NULL WHERE project_id = ? AND episode_id = ?').run(projectId, episodeId);
    this.db.prepare('UPDATE scripts SET episode_id = NULL WHERE project_id = ? AND episode_id = ?').run(projectId, episodeId);
    const result = this.db.prepare('DELETE FROM episodes WHERE id = ? AND project_id = ?').run(episodeId, projectId);
    return Number(result.changes) > 0;
  }
}
