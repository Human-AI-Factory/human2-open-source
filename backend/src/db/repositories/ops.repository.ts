import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { toSqlInputValue } from '../sqlite/client.js';
import type { BusinessSummaryRow } from '../sqlite/row-types.js';
import { BaseRepository } from './base.repository.js';

const SCHEMA_VERSION_KEY = 'db_schema_version';
const BACKUP_VERSION = 'human2-backup-v1';

export class OpsRepository extends BaseRepository {
  constructor(db: DatabaseSync, private readonly dbFilePath: string) {
    super(db);
  }

  upsertQueueWorkerLease(input: { ownerId: string; ttlMs: number }): { acquired: boolean; ownerId: string | null; expiresAt: string | null } {
    const now = new Date();
    const heartbeatAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + Math.max(1000, Math.floor(input.ttlMs))).toISOString();
    this.db
      .prepare(
        `
        INSERT INTO queue_worker_leases (lock_key, owner_id, expires_at, heartbeat_at, updated_at)
        VALUES ('video_task_queue', ?, ?, ?, ?)
        ON CONFLICT(lock_key) DO UPDATE SET
          owner_id = excluded.owner_id,
          expires_at = excluded.expires_at,
          heartbeat_at = excluded.heartbeat_at,
          updated_at = excluded.updated_at
        WHERE queue_worker_leases.owner_id = excluded.owner_id OR queue_worker_leases.expires_at <= excluded.heartbeat_at
      `
      )
      .run(input.ownerId, expiresAt, heartbeatAt, heartbeatAt);
    const row = this.db
      .prepare('SELECT owner_id, expires_at FROM queue_worker_leases WHERE lock_key = ? LIMIT 1')
      .get('video_task_queue') as { owner_id: string; expires_at: string } | undefined;
    return {
      acquired: Boolean(row && row.owner_id === input.ownerId),
      ownerId: row?.owner_id ?? null,
      expiresAt: row?.expires_at ?? null,
    };
  }

  getQueueWorkerLease(): { ownerId: string | null; expiresAt: string | null; heartbeatAt: string | null } {
    const row = this.db
      .prepare('SELECT owner_id, expires_at, heartbeat_at FROM queue_worker_leases WHERE lock_key = ? LIMIT 1')
      .get('video_task_queue') as { owner_id: string; expires_at: string; heartbeat_at: string } | undefined;
    return {
      ownerId: row?.owner_id ?? null,
      expiresAt: row?.expires_at ?? null,
      heartbeatAt: row?.heartbeat_at ?? null,
    };
  }

  releaseQueueWorkerLease(ownerId: string): boolean {
    const result = this.db.prepare('DELETE FROM queue_worker_leases WHERE lock_key = ? AND owner_id = ?').run('video_task_queue', ownerId);
    return Number(result.changes) > 0;
  }

  getSchemaVersion(): number {
    return this.readSchemaVersion();
  }

  listMigrationSnapshots(limit = 20): Array<{ fileName: string; path: string; createdAt: string; size: number }> {
    const dir = this.getMigrationSnapshotDir();
    if (!fs.existsSync(dir)) {
      return [];
    }
    const files = fs
      .readdirSync(dir)
      .filter((name) => name.endsWith('.json'))
      .map((fileName) => {
        const filePath = path.join(dir, fileName);
        const stat = fs.statSync(filePath);
        return {
          fileName,
          path: filePath,
          createdAt: stat.mtime.toISOString(),
          size: stat.size,
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return files.slice(0, Math.max(1, Math.min(200, Math.floor(limit))));
  }

  restoreLatestMigrationSnapshot(): { restoredFrom: string; inserted: Record<string, number> } | null {
    const latest = this.listMigrationSnapshots(1)[0];
    if (!latest) {
      return null;
    }
    const payload = this.readMigrationSnapshot(latest.path);
    const result = this.importBusinessBackup(payload.backup);
    if (Number.isFinite(payload.fromVersion)) {
      this.writeSchemaVersion(payload.fromVersion);
    }
    return {
      restoredFrom: latest.fileName,
      inserted: result.inserted,
    };
  }

  restoreMigrationSnapshotByFile(fileName: string): { restoredFrom: string; inserted: Record<string, number> } | null {
    const filePath = this.resolveMigrationSnapshotPath(fileName);
    if (!filePath) {
      return null;
    }
    const payload = this.readMigrationSnapshot(filePath);
    const result = this.importBusinessBackup(payload.backup);
    if (Number.isFinite(payload.fromVersion)) {
      this.writeSchemaVersion(payload.fromVersion);
    }
    return {
      restoredFrom: path.basename(filePath),
      inserted: result.inserted,
    };
  }

  getMigrationSnapshotContent(fileName: string): { fileName: string; payload: Record<string, unknown> } | null {
    const filePath = this.resolveMigrationSnapshotPath(fileName);
    if (!filePath) {
      return null;
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return {
      fileName: path.basename(filePath),
      payload: parsed as Record<string, unknown>,
    };
  }

  getBusinessDataSummary(): {
    projectCount: number;
    taskCount: number;
    novelCount: number;
    outlineCount: number;
    scriptCount: number;
    storyboardCount: number;
    assetCount: number;
    videoTaskCount: number;
    audioTaskCount: number;
    videoMergeCount: number;
  } {
    const row = this.db
      .prepare(
        `
        SELECT
          (SELECT COUNT(*) FROM projects) AS project_count,
          (SELECT COUNT(*) FROM tasks) AS task_count,
          (SELECT COUNT(*) FROM novels) AS novel_count,
          (SELECT COUNT(*) FROM outlines) AS outline_count,
          (SELECT COUNT(*) FROM scripts) AS script_count,
          (SELECT COUNT(*) FROM storyboards) AS storyboard_count,
          (SELECT COUNT(*) FROM assets) AS asset_count,
          (SELECT COUNT(*) FROM video_tasks) AS video_task_count,
          (SELECT COUNT(*) FROM audio_tasks) AS audio_task_count,
          (SELECT COUNT(*) FROM video_merges) AS video_merge_count
      `
      )
      .get() as BusinessSummaryRow;

    return {
      projectCount: row.project_count,
      taskCount: row.task_count,
      novelCount: row.novel_count,
      outlineCount: row.outline_count,
      scriptCount: row.script_count,
      storyboardCount: row.storyboard_count,
      assetCount: row.asset_count,
      videoTaskCount: row.video_task_count,
      audioTaskCount: row.audio_task_count,
      videoMergeCount: row.video_merge_count,
    };
  }

  listVideoMergeErrorStats(input: { limit: number; projectId?: string }): Array<{ errorCode: string; count: number; latestAt: string }> {
    const limit = Math.max(1, Math.min(100, Math.floor(input.limit)));
    const rows = input.projectId?.trim()
      ? (this.db
          .prepare(
            `
            SELECT
              error_code AS error_code,
              COUNT(*) AS count,
              MAX(updated_at) AS latest_at
            FROM video_merges
            WHERE error_code IS NOT NULL AND error_code <> '' AND project_id = ?
            GROUP BY error_code
            ORDER BY count DESC, latest_at DESC
            LIMIT ?
            `
          )
          .all(input.projectId.trim(), limit) as Array<{ error_code: string; count: number; latest_at: string }>)
      : (this.db
          .prepare(
            `
            SELECT
              error_code AS error_code,
              COUNT(*) AS count,
              MAX(updated_at) AS latest_at
            FROM video_merges
            WHERE error_code IS NOT NULL AND error_code <> ''
            GROUP BY error_code
            ORDER BY count DESC, latest_at DESC
            LIMIT ?
            `
          )
          .all(limit) as Array<{ error_code: string; count: number; latest_at: string }>);

    return rows.map((row) => ({
      errorCode: row.error_code,
      count: Number(row.count || 0),
      latestAt: row.latest_at,
    }));
  }

  resetBusinessData(): {
    projects: number;
    tasks: number;
    dramas: number;
    episodes: number;
    episodeAssetLinks: number;
    timelinePlans: number;
    novels: number;
    outlines: number;
    scripts: number;
    storyboards: number;
    assets: number;
    videoTasks: number;
    videoTaskEvents: number;
    audioTasks: number;
    videoMerges: number;
    scenes: number;
  } {
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      const audioTasks = Number(this.db.prepare('DELETE FROM audio_tasks').run().changes);
      const videoMerges = Number(this.db.prepare('DELETE FROM video_merges').run().changes);
      const timelinePlans = Number(this.db.prepare('DELETE FROM timeline_plans').run().changes);
      const episodeAssetLinks = Number(this.db.prepare('DELETE FROM episode_asset_links').run().changes);
      this.db.prepare('DELETE FROM episode_domain_entity_links').run();
      this.db.prepare('DELETE FROM storyboard_domain_entity_links').run();
      this.db.prepare('DELETE FROM domain_entity_audits').run();
      const videoTaskEvents = Number(this.db.prepare('DELETE FROM video_task_events').run().changes);
      const videoTasks = Number(this.db.prepare('DELETE FROM video_tasks').run().changes);
      this.db.prepare('DELETE FROM storyboard_asset_links').run();
      this.db.prepare('DELETE FROM domain_entities').run();
      const assets = Number(this.db.prepare('DELETE FROM assets').run().changes);
      const scenes = Number(this.db.prepare('DELETE FROM scenes').run().changes);
      const storyboards = Number(this.db.prepare('DELETE FROM storyboards').run().changes);
      const scripts = Number(this.db.prepare('DELETE FROM scripts').run().changes);
      const episodes = Number(this.db.prepare('DELETE FROM episodes').run().changes);
      const dramas = Number(this.db.prepare('DELETE FROM dramas').run().changes);
      const outlines = Number(this.db.prepare('DELETE FROM outlines').run().changes);
      const novels = Number(this.db.prepare('DELETE FROM novels').run().changes);
      const tasks = Number(this.db.prepare('DELETE FROM tasks').run().changes);
      const projects = Number(this.db.prepare('DELETE FROM projects').run().changes);
      this.db.exec('COMMIT;');
      return {
        projects,
        tasks,
        dramas,
        episodes,
        episodeAssetLinks,
        timelinePlans,
        novels,
        outlines,
        scripts,
        storyboards,
        assets,
        videoTasks,
        videoTaskEvents,
        audioTasks,
        videoMerges,
        scenes,
      };
    } catch (error) {
      this.db.exec('ROLLBACK;');
      throw error;
    }
  }

  exportBusinessBackup(): {
    version: string;
    exportedAt: string;
    tables: Record<string, Array<Record<string, unknown>>>;
  } {
    const tableNames = [
      'projects',
      'tasks',
      'novels',
      'outlines',
      'dramas',
      'episodes',
      'scripts',
      'scenes',
      'storyboards',
      'timeline_plans',
      'assets',
      'episode_asset_links',
      'storyboard_asset_links',
      'domain_entities',
      'episode_domain_entity_links',
      'storyboard_domain_entity_links',
      'domain_entity_audits',
      'video_tasks',
      'video_task_events',
      'audio_tasks',
      'video_merges',
      'model_configs',
      'prompt_templates',
      'prompt_template_versions',
      'system_settings',
    ] as const;
    const tables: Record<string, Array<Record<string, unknown>>> = {};
    for (const table of tableNames) {
      const rows = this.db.prepare(`SELECT * FROM ${table}`).all() as Array<Record<string, unknown>>;
      tables[table] = rows;
    }
    return {
      version: BACKUP_VERSION,
      exportedAt: this.timestamp(),
      tables,
    };
  }

  importBusinessBackup(input: {
    version: string;
    tables: Record<string, Array<Record<string, unknown>>>;
  }): {
    inserted: Record<string, number>;
  } {
    const orderedTables = [
      'projects',
      'tasks',
      'novels',
      'outlines',
      'dramas',
      'episodes',
      'scripts',
      'scenes',
      'storyboards',
      'timeline_plans',
      'assets',
      'episode_asset_links',
      'storyboard_asset_links',
      'domain_entities',
      'episode_domain_entity_links',
      'storyboard_domain_entity_links',
      'domain_entity_audits',
      'video_tasks',
      'video_task_events',
      'audio_tasks',
      'video_merges',
      'model_configs',
      'prompt_templates',
      'prompt_template_versions',
      'system_settings',
    ] as const;
    const clearOrder = [...orderedTables].reverse();
    const inserted: Record<string, number> = {};
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      for (const table of clearOrder) {
        this.db.prepare(`DELETE FROM ${table}`).run();
      }
      for (const table of orderedTables) {
        const rows = Array.isArray(input.tables[table]) ? input.tables[table] : [];
        let count = 0;
        for (const row of rows) {
          if (!row || typeof row !== 'object' || Array.isArray(row)) {
            continue;
          }
          const keys = Object.keys(row);
          if (keys.length === 0) {
            continue;
          }
          const placeholders = keys.map(() => '?').join(', ');
          const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
          const values = keys.map((key) => toSqlInputValue((row as Record<string, unknown>)[key]));
          this.db.prepare(sql).run(...values);
          count += 1;
        }
        inserted[table] = count;
      }
      this.db.exec('COMMIT;');
      return { inserted };
    } catch (error) {
      this.db.exec('ROLLBACK;');
      throw error;
    }
  }

  private readSchemaVersion(): number {
    const raw = this.getSystemSetting(SCHEMA_VERSION_KEY);
    if (!raw) {
      return 0;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      return 0;
    }
    return Math.max(0, Math.floor(parsed));
  }

  private writeSchemaVersion(version: number): void {
    this.setSystemSetting(SCHEMA_VERSION_KEY, String(Math.max(0, Math.floor(version))));
  }

  private getMigrationSnapshotDir(): string {
    return path.join(path.dirname(this.dbFilePath), 'migrations');
  }

  private resolveMigrationSnapshotPath(fileName: string): string | null {
    const normalized = fileName.trim();
    if (!normalized || normalized.includes('/') || normalized.includes('\\') || !normalized.endsWith('.json')) {
      return null;
    }
    const dir = this.getMigrationSnapshotDir();
    const resolved = path.resolve(dir, normalized);
    const expectedPrefix = `${path.resolve(dir)}${path.sep}`;
    if (!resolved.startsWith(expectedPrefix)) {
      return null;
    }
    if (!fs.existsSync(resolved)) {
      return null;
    }
    return resolved;
  }

  private readMigrationSnapshot(filePath: string): {
    fromVersion: number;
    toVersion: number;
    backup: { version: string; tables: Record<string, Array<Record<string, unknown>>> };
  } {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as {
      fromVersion?: unknown;
      toVersion?: unknown;
      backup?: unknown;
    };
    const backup = parsed.backup as { version?: unknown; tables?: unknown } | undefined;
    if (
      !backup ||
      typeof backup.version !== 'string' ||
      !backup.tables ||
      typeof backup.tables !== 'object' ||
      Array.isArray(backup.tables)
    ) {
      throw new Error('Invalid migration snapshot backup');
    }
    return {
      fromVersion: Number.isFinite(Number(parsed.fromVersion)) ? Math.max(0, Math.floor(Number(parsed.fromVersion))) : 0,
      toVersion: Number.isFinite(Number(parsed.toVersion)) ? Math.max(0, Math.floor(Number(parsed.toVersion))) : 0,
      backup: {
        version: backup.version,
        tables: backup.tables as Record<string, Array<Record<string, unknown>>>,
      },
    };
  }

  private getSystemSetting(key: string): string | null {
    const row = this.db
      .prepare('SELECT value FROM system_settings WHERE key = ? LIMIT 1')
      .get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  private setSystemSetting(key: string, value: string): void {
    this.db.prepare('INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES (?, ?, ?)').run(key, value, this.timestamp());
  }
}
