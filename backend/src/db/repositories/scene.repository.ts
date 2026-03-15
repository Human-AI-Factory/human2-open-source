import type { Scene } from '../../core/types.js';
import { mapScene } from '../sqlite/row-mappers.js';
import type { SceneRow } from '../sqlite/row-types.js';
import { BaseRepository } from './base.repository.js';

export class SceneRepository extends BaseRepository {
  listScenes(projectId: string): Scene[] | null {
    if (!this.projectExists(projectId)) {
      return null;
    }
    const rows = this.db
      .prepare(
        `
          SELECT
            s.id, s.project_id, s.name, s.description, s.prompt,
            (
              SELECT COUNT(*)
              FROM storyboards sb
              WHERE sb.project_id = s.project_id AND sb.scene_id = s.id
            ) AS storyboard_count,
            s.created_at, s.updated_at
          FROM scenes s
          WHERE s.project_id = ?
          ORDER BY s.created_at DESC
        `
      )
      .all(projectId) as SceneRow[];
    return rows.map((row) => mapScene(row));
  }

  createScene(input: { id: string; projectId: string; name: string; description: string; prompt: string }): Scene | null {
    if (!this.projectExists(input.projectId)) {
      return null;
    }
    const timestamp = this.timestamp();
    this.db
      .prepare(
        'INSERT INTO scenes (id, project_id, name, description, prompt, storyboard_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)'
      )
      .run(input.id, input.projectId, input.name, input.description, input.prompt, timestamp, timestamp);
    return this.getSceneById(input.projectId, input.id);
  }

  getSceneById(projectId: string, sceneId: string): Scene | null {
    const row = this.db
      .prepare(
        `
          SELECT
            s.id, s.project_id, s.name, s.description, s.prompt,
            (
              SELECT COUNT(*)
              FROM storyboards sb
              WHERE sb.project_id = s.project_id AND sb.scene_id = s.id
            ) AS storyboard_count,
            s.created_at, s.updated_at
          FROM scenes s
          WHERE s.project_id = ? AND s.id = ?
          LIMIT 1
        `
      )
      .get(projectId, sceneId) as SceneRow | undefined;
    return row ? mapScene(row) : null;
  }

  updateScene(projectId: string, sceneId: string, input: { name?: string; description?: string; prompt?: string }): Scene | null {
    const current = this.getSceneById(projectId, sceneId);
    if (!current) {
      return null;
    }
    const name = input.name ?? current.name;
    const description = input.description ?? current.description;
    const prompt = input.prompt ?? current.prompt;
    this.db
      .prepare('UPDATE scenes SET name = ?, description = ?, prompt = ?, updated_at = ? WHERE id = ? AND project_id = ?')
      .run(name, description, prompt, this.timestamp(), sceneId, projectId);
    return this.getSceneById(projectId, sceneId);
  }

  deleteScene(projectId: string, sceneId: string): boolean {
    this.db.prepare('UPDATE storyboards SET scene_id = NULL WHERE project_id = ? AND scene_id = ?').run(projectId, sceneId);
    const result = this.db.prepare('DELETE FROM scenes WHERE id = ? AND project_id = ?').run(sceneId, projectId);
    return Number(result.changes) > 0;
  }
}
