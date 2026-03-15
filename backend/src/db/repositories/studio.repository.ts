import type { Novel, Outline, Script } from '../../core/types.js';
import { mapNovel, mapOutline, mapScript } from '../sqlite/row-mappers.js';
import type { NovelRow, OutlineRow, ScriptRow } from '../sqlite/row-types.js';
import { BaseRepository } from './base.repository.js';

export class StudioRepository extends BaseRepository {
  getNovel(projectId: string): Novel | null {
    const row = this.db
      .prepare('SELECT id, project_id, title, content, created_at, updated_at FROM novels WHERE project_id = ? LIMIT 1')
      .get(projectId) as NovelRow | undefined;

    if (!row) {
      return null;
    }

    return mapNovel(row);
  }

  upsertNovel(projectId: string, title: string, content: string): Novel | null {
    if (!this.projectExists(projectId)) {
      return null;
    }

    const current = this.db
      .prepare('SELECT id, project_id, title, content, created_at, updated_at FROM novels WHERE project_id = ? LIMIT 1')
      .get(projectId) as NovelRow | undefined;

    const timestamp = this.timestamp();
    if (!current) {
      const id = `novel_${projectId}`;
      this.db
        .prepare('INSERT INTO novels (id, project_id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, projectId, title, content, timestamp, timestamp);
    } else {
      this.db.prepare('UPDATE novels SET title = ?, content = ?, updated_at = ? WHERE project_id = ?').run(title, content, timestamp, projectId);
    }

    return this.getNovel(projectId);
  }

  listOutlines(projectId: string): Outline[] | null {
    if (!this.projectExists(projectId)) {
      return null;
    }

    const rows = this.db
      .prepare(
        'SELECT id, project_id, title, summary, order_index, created_at, updated_at FROM outlines WHERE project_id = ? ORDER BY order_index ASC, created_at ASC'
      )
      .all(projectId) as OutlineRow[];

    return rows.map((row) => mapOutline(row));
  }

  replaceOutlines(projectId: string, outlines: Array<{ id: string; title: string; summary: string; orderIndex: number }>): Outline[] | null {
    if (!this.projectExists(projectId)) {
      return null;
    }

    const timestamp = this.timestamp();
    this.db.prepare('DELETE FROM outlines WHERE project_id = ?').run(projectId);
    for (const item of outlines) {
      this.db
        .prepare(
          'INSERT INTO outlines (id, project_id, title, summary, order_index, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        )
        .run(item.id, projectId, item.title, item.summary, item.orderIndex, timestamp, timestamp);
    }

    return this.listOutlines(projectId);
  }

  getOutline(projectId: string, outlineId: string): Outline | null {
    const row = this.db
      .prepare(
        'SELECT id, project_id, title, summary, order_index, created_at, updated_at FROM outlines WHERE id = ? AND project_id = ? LIMIT 1'
      )
      .get(outlineId, projectId) as OutlineRow | undefined;

    if (!row) {
      return null;
    }
    return mapOutline(row);
  }

  createScript(input: {
    id: string;
    projectId: string;
    outlineId: string;
    episodeId?: string | null;
    title: string;
    content: string;
  }): Script | null {
    if (!this.projectExists(input.projectId)) {
      return null;
    }

    const outlineExists = this.db
      .prepare('SELECT id FROM outlines WHERE id = ? AND project_id = ? LIMIT 1')
      .get(input.outlineId, input.projectId);
    if (!outlineExists) {
      return null;
    }
    if (input.episodeId) {
      const episodeExists = this.db
        .prepare('SELECT id FROM episodes WHERE id = ? AND project_id = ? LIMIT 1')
        .get(input.episodeId, input.projectId);
      if (!episodeExists) {
        return null;
      }
    }

    const timestamp = this.timestamp();
    this.db
      .prepare(
        'INSERT INTO scripts (id, project_id, outline_id, episode_id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(input.id, input.projectId, input.outlineId, input.episodeId ?? null, input.title, input.content, timestamp, timestamp);

    const row = this.db
      .prepare('SELECT id, project_id, outline_id, episode_id, title, content, created_at, updated_at FROM scripts WHERE id = ? LIMIT 1')
      .get(input.id) as ScriptRow | undefined;

    return row ? mapScript(row) : null;
  }

  listScripts(projectId: string): Script[] | null {
    if (!this.projectExists(projectId)) {
      return null;
    }

    const rows = this.db
      .prepare('SELECT id, project_id, outline_id, episode_id, title, content, created_at, updated_at FROM scripts WHERE project_id = ? ORDER BY created_at DESC')
      .all(projectId) as ScriptRow[];

    return rows.map((row) => mapScript(row));
  }

  updateScriptEpisode(projectId: string, scriptId: string, episodeId: string | null): Script | null {
    const current = this.db
      .prepare('SELECT id, project_id, outline_id, episode_id, title, content, created_at, updated_at FROM scripts WHERE id = ? AND project_id = ? LIMIT 1')
      .get(scriptId, projectId) as ScriptRow | undefined;
    if (!current) {
      return null;
    }
    if (episodeId) {
      const episodeExists = this.db
        .prepare('SELECT id FROM episodes WHERE id = ? AND project_id = ? LIMIT 1')
        .get(episodeId, projectId);
      if (!episodeExists) {
        return null;
      }
    }
    this.db.prepare('UPDATE scripts SET episode_id = ?, updated_at = ? WHERE id = ? AND project_id = ?').run(
      episodeId,
      this.timestamp(),
      scriptId,
      projectId
    );
    const row = this.db
      .prepare('SELECT id, project_id, outline_id, episode_id, title, content, created_at, updated_at FROM scripts WHERE id = ? LIMIT 1')
      .get(scriptId) as ScriptRow | undefined;
    return row ? mapScript(row) : null;
  }
}
