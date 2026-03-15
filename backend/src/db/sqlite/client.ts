import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

export type SqliteClient = {
  db: DatabaseSync;
  dbFilePath: string;
};

export const toSqlInputValue = (value: unknown): SQLInputValue => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
    return value;
  }
  if (value instanceof Uint8Array) {
    return value;
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  return JSON.stringify(value);
};

export const createSqliteClient = (filePath: string): SqliteClient => {
  const resolved = path.resolve(process.cwd(), filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const db = new DatabaseSync(resolved);
  db.exec('PRAGMA foreign_keys = ON;');
  // Reduce lock contention when multiple local dev processes briefly overlap on the same DB.
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA busy_timeout = 5000;');
  return { db, dbFilePath: resolved };
};
