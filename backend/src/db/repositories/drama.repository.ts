import type { DramaDomain } from '../../core/types.js';
import { mapDrama } from '../sqlite/row-mappers.js';
import type { DramaRow } from '../sqlite/row-types.js';
import { BaseRepository } from './base.repository.js';

export class DramaRepository extends BaseRepository {
  getDramaByProject(projectId: string): DramaDomain | null {
    if (!this.projectExists(projectId)) {
      return null;
    }
    const row = this.db
      .prepare('SELECT id, project_id, name, description, created_at, updated_at, style FROM dramas WHERE project_id = ? LIMIT 1')
      .get(projectId) as DramaRow | undefined;
    return row ? mapDrama(row) : null;
  }

  getDramaById(dramaId: string): DramaDomain | null {
    const row = this.db
      .prepare('SELECT id, project_id, name, description, created_at, updated_at, style FROM dramas WHERE id = ? LIMIT 1')
      .get(dramaId) as DramaRow | undefined;
    return row ? mapDrama(row) : null;
  }

  listDramas(): DramaDomain[] {
    const rows = this.db
      .prepare('SELECT id, project_id, name, description, created_at, updated_at, style FROM dramas ORDER BY updated_at DESC, created_at DESC')
      .all() as DramaRow[];
    return rows.map((row) => mapDrama(row));
  }

  upsertDrama(input: { id: string; projectId: string; name: string; description: string }): DramaDomain | null {
    if (!this.projectExists(input.projectId)) {
      return null;
    }
    const current = this.getDramaByProject(input.projectId);
    const timestamp = this.timestamp();
    if (!current) {
      this.db
        .prepare('INSERT INTO dramas (id, project_id, name, description, created_at, updated_at, style) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(input.id, input.projectId, input.name, input.description, timestamp, timestamp, '');
    } else {
      this.db
        .prepare('UPDATE dramas SET name = ?, description = ?, updated_at = ? WHERE project_id = ?')
        .run(input.name, input.description, timestamp, input.projectId);
    }
    return this.getDramaByProject(input.projectId);
  }

  updateDramaStyle(dramaId: string, style: string): DramaDomain | null {
    const timestamp = this.timestamp();
    this.db
      .prepare('UPDATE dramas SET style = ?, updated_at = ? WHERE id = ?')
      .run(style, timestamp, dramaId);
    return this.getDramaById(dramaId);
  }
}
