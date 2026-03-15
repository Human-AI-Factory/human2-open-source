import type { User } from '../../core/types.js';
import { BaseRepository } from './base.repository.js';

export class AuthRepository extends BaseRepository {
  findUserByCredentials(username: string, password: string): User | null {
    const row = this.db
      .prepare('SELECT id, username, password, role FROM users WHERE username = ? AND password = ? LIMIT 1')
      .get(username, password) as User | undefined;

    return row ?? null;
  }
}
