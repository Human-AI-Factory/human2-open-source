import type { DatabaseSync } from 'node:sqlite';
import { nowIso } from '../../utils/time.js';
import type { SortOrder } from '../sqlite/row-types.js';

export abstract class BaseRepository {
  constructor(protected readonly db: DatabaseSync) {}

  protected timestamp(): string {
    return nowIso();
  }

  protected projectExists(projectId: string): boolean {
    return Boolean(this.db.prepare('SELECT id FROM projects WHERE id = ? LIMIT 1').get(projectId));
  }

  protected mapOrder(order?: SortOrder): string {
    return order === 'asc' ? 'ASC' : 'DESC';
  }
}
