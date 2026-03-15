import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { env } from '../../config/env.js';
import type { TaskRuntimeConfig } from '../../core/types.js';
import { encryptSecret, isEncryptedSecret } from '../../utils/secret.js';
import { nowIso } from '../../utils/time.js';

const TASK_RUNTIME_DEFAULTS: TaskRuntimeConfig = {
  videoTaskAutoRetry: 1,
  videoTaskRetryDelayMs: 800,
  videoTaskPollIntervalMs: 2000,
};

const SCHEMA_VERSION_KEY = 'db_schema_version';
const TARGET_SCHEMA_VERSION = 10;

type BackupPayload = {
  version: string;
  tables: Record<string, Array<Record<string, unknown>>>;
};

export type SqliteBootstrapDeps = {
  db: DatabaseSync;
  dbFilePath: string;
  exportBusinessBackup: () => BackupPayload;
  importBusinessBackup: (input: BackupPayload) => { inserted: Record<string, number> };
  getSystemSetting: (key: string) => string | null;
  setSystemSetting: (key: string, value: string) => void;
};

export const createSqliteBootstrap = (deps: SqliteBootstrapDeps) => {
  const ensurePreInitLegacyColumns = (): void => {
    const hasTable = (name: string): boolean => {
      const row = deps.db
        .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
        .get(name) as { ok?: number } | undefined;
      return Boolean(row?.ok);
    };
    const hasColumn = (table: string, column: string): boolean => {
      const rows = deps.db.prepare(`PRAGMA table_info('${table.replace(/'/g, "''")}')`).all() as Array<{ name: string }>;
      return rows.some((item) => item.name === column);
    };

    if (hasTable('scripts') && !hasColumn('scripts', 'episode_id')) {
      deps.db.exec('ALTER TABLE scripts ADD COLUMN episode_id TEXT');
    }
    if (hasTable('storyboards') && !hasColumn('storyboards', 'episode_id')) {
      deps.db.exec('ALTER TABLE storyboards ADD COLUMN episode_id TEXT');
    }
    if (hasTable('storyboards') && !hasColumn('storyboards', 'scene_id')) {
      deps.db.exec('ALTER TABLE storyboards ADD COLUMN scene_id TEXT');
    }
    if (hasTable('storyboards') && !hasColumn('storyboards', 'plan_json')) {
      deps.db.exec('ALTER TABLE storyboards ADD COLUMN plan_json TEXT');
    }
    if (hasTable('timeline_plans') && !hasColumn('timeline_plans', 'episode_id')) {
      deps.db.exec("ALTER TABLE timeline_plans ADD COLUMN episode_id TEXT NOT NULL DEFAULT ''");
    }
    if (hasTable('timeline_plans') && !hasColumn('timeline_plans', 'tracks')) {
      deps.db.exec("ALTER TABLE timeline_plans ADD COLUMN tracks TEXT NOT NULL DEFAULT '[]'");
    }
    if (hasTable('assets') && !hasColumn('assets', 'voice_profile')) {
      deps.db.exec('ALTER TABLE assets ADD COLUMN voice_profile TEXT');
    }
    if (hasTable('assets') && !hasColumn('assets', 'scope')) {
      deps.db.exec("ALTER TABLE assets ADD COLUMN scope TEXT NOT NULL DEFAULT 'shot'");
    }
    if (hasTable('assets') && !hasColumn('assets', 'share_scope')) {
      deps.db.exec("ALTER TABLE assets ADD COLUMN share_scope TEXT NOT NULL DEFAULT 'project'");
    }
    if (hasTable('assets') && !hasColumn('assets', 'base_asset_id')) {
      deps.db.exec('ALTER TABLE assets ADD COLUMN base_asset_id TEXT');
    }
    if (hasTable('assets') && !hasColumn('assets', 'state_prompt')) {
      deps.db.exec('ALTER TABLE assets ADD COLUMN state_prompt TEXT');
    }
    if (hasTable('assets') && !hasColumn('assets', 'state_json')) {
      deps.db.exec('ALTER TABLE assets ADD COLUMN state_json TEXT');
    }
  };

  const initSchema = (): void => {
    deps.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        role TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('todo', 'doing', 'done')),
        priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
        due_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);

      CREATE TABLE IF NOT EXISTS novels (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS dramas (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        style TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS episodes (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        drama_id TEXT NOT NULL,
        title TEXT NOT NULL,
        order_index INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('draft', 'ready', 'published')) DEFAULT 'draft',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY(drama_id) REFERENCES dramas(id) ON DELETE CASCADE
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_episodes_project_order ON episodes(project_id, order_index);
      CREATE INDEX IF NOT EXISTS idx_episodes_project_id ON episodes(project_id);
      CREATE INDEX IF NOT EXISTS idx_episodes_drama_id ON episodes(drama_id);

      CREATE TABLE IF NOT EXISTS outlines (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        order_index INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_outlines_project_id ON outlines(project_id);

      CREATE TABLE IF NOT EXISTS scripts (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        outline_id TEXT NOT NULL,
        episode_id TEXT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY(outline_id) REFERENCES outlines(id) ON DELETE CASCADE,
        FOREIGN KEY(episode_id) REFERENCES episodes(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_scripts_project_id ON scripts(project_id);

      CREATE TABLE IF NOT EXISTS storyboards (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        script_id TEXT NOT NULL,
        episode_id TEXT,
        scene_id TEXT,
        title TEXT NOT NULL,
        prompt TEXT NOT NULL,
        plan_json TEXT,
        image_url TEXT,
        first_frame_url TEXT,
        last_frame_url TEXT,
        status TEXT NOT NULL CHECK (status IN ('draft', 'generated')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY(script_id) REFERENCES scripts(id) ON DELETE CASCADE,
        FOREIGN KEY(episode_id) REFERENCES episodes(id) ON DELETE SET NULL,
        FOREIGN KEY(scene_id) REFERENCES scenes(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_storyboards_project_id ON storyboards(project_id);
      CREATE INDEX IF NOT EXISTS idx_storyboards_script_id ON storyboards(script_id);

      CREATE TABLE IF NOT EXISTS scenes (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        prompt TEXT NOT NULL,
        storyboard_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_scenes_project_id ON scenes(project_id);

      CREATE TABLE IF NOT EXISTS assets (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        storyboard_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('character', 'scene', 'prop')),
        scope TEXT NOT NULL DEFAULT 'shot' CHECK (scope IN ('base', 'shot')),
        share_scope TEXT NOT NULL DEFAULT 'project' CHECK (share_scope IN ('project', 'shared')),
        base_asset_id TEXT,
        prompt TEXT NOT NULL,
        state_prompt TEXT,
        state_json TEXT,
        image_url TEXT,
        video_url TEXT,
        first_frame_url TEXT,
        last_frame_url TEXT,
        voice_profile TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY(storyboard_id) REFERENCES storyboards(id) ON DELETE CASCADE,
        FOREIGN KEY(base_asset_id) REFERENCES assets(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_assets_project_id ON assets(project_id);
      CREATE INDEX IF NOT EXISTS idx_assets_storyboard_id ON assets(storyboard_id);
      CREATE INDEX IF NOT EXISTS idx_assets_scope ON assets(project_id, scope, type);
      CREATE INDEX IF NOT EXISTS idx_assets_base_asset_id ON assets(base_asset_id);

      CREATE TABLE IF NOT EXISTS storyboard_asset_links (
        storyboard_id TEXT NOT NULL,
        asset_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('scene', 'character', 'prop')),
        created_at TEXT NOT NULL,
        PRIMARY KEY(storyboard_id, asset_id, role),
        FOREIGN KEY(storyboard_id) REFERENCES storyboards(id) ON DELETE CASCADE,
        FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_storyboard_asset_links_storyboard_role ON storyboard_asset_links(storyboard_id, role);

      CREATE TABLE IF NOT EXISTS video_tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        storyboard_id TEXT NOT NULL,
        prompt TEXT NOT NULL,
        model_name TEXT,
        params TEXT NOT NULL DEFAULT '{}',
        priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
        status TEXT NOT NULL CHECK (status IN ('queued', 'submitting', 'polling', 'running', 'done', 'failed', 'cancelled')),
        progress INTEGER NOT NULL,
        result_url TEXT,
        first_frame_url TEXT,
        last_frame_url TEXT,
        error TEXT,
        provider_task_id TEXT,
        attempt INTEGER NOT NULL DEFAULT 0,
        next_retry_at TEXT,
        provider_error_code TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY(storyboard_id) REFERENCES storyboards(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_video_tasks_project_id ON video_tasks(project_id);

      CREATE TABLE IF NOT EXISTS video_task_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        status TEXT NOT NULL,
        progress INTEGER NOT NULL,
        error TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(task_id) REFERENCES video_tasks(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS audio_tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        storyboard_id TEXT NOT NULL,
        prompt TEXT NOT NULL,
        model_name TEXT,
        params TEXT NOT NULL DEFAULT '{}',
        priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
        status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'done', 'failed')),
        progress INTEGER NOT NULL,
        result_url TEXT,
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY(storyboard_id) REFERENCES storyboards(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_audio_tasks_project_id ON audio_tasks(project_id);

      CREATE TABLE IF NOT EXISTS video_merges (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('queued', 'processing', 'done', 'failed')),
        clips TEXT NOT NULL DEFAULT '[]',
        params TEXT NOT NULL DEFAULT '{}',
        result_url TEXT,
        output_path TEXT,
        error_code TEXT,
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_video_merges_project_id ON video_merges(project_id);
      CREATE INDEX IF NOT EXISTS idx_video_merges_status ON video_merges(status);

      CREATE TABLE IF NOT EXISTS timeline_plans (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        episode_id TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL,
        tracks TEXT NOT NULL DEFAULT '[]',
        clips TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS episode_asset_links (
        project_id TEXT NOT NULL,
        episode_id TEXT NOT NULL,
        asset_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('scene', 'character', 'prop')),
        created_at TEXT NOT NULL,
        PRIMARY KEY (project_id, episode_id, asset_id, role),
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY(episode_id) REFERENCES episodes(id) ON DELETE CASCADE,
        FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS domain_entities (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('character', 'scene', 'prop')),
        lifecycle_status TEXT NOT NULL DEFAULT 'draft' CHECK (lifecycle_status IN ('draft', 'in_review', 'approved', 'archived')),
        name TEXT NOT NULL,
        prompt TEXT NOT NULL,
        image_url TEXT,
        deleted_at TEXT,
        merged_into_entity_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_domain_entities_project_type ON domain_entities(project_id, type);
      CREATE INDEX IF NOT EXISTS idx_domain_entities_project_name ON domain_entities(project_id, name);

      CREATE TABLE IF NOT EXISTS episode_domain_entity_links (
        project_id TEXT NOT NULL,
        episode_id TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('scene', 'character', 'prop')),
        created_at TEXT NOT NULL,
        PRIMARY KEY (project_id, episode_id, entity_id, role),
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY(episode_id) REFERENCES episodes(id) ON DELETE CASCADE,
        FOREIGN KEY(entity_id) REFERENCES domain_entities(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS storyboard_domain_entity_links (
        project_id TEXT NOT NULL,
        storyboard_id TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('scene', 'character', 'prop')),
        created_at TEXT NOT NULL,
        PRIMARY KEY (project_id, storyboard_id, entity_id, role),
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY(storyboard_id) REFERENCES storyboards(id) ON DELETE CASCADE,
        FOREIGN KEY(entity_id) REFERENCES domain_entities(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_episode_domain_entity_links_project_episode_role ON episode_domain_entity_links(project_id, episode_id, role);
      CREATE INDEX IF NOT EXISTS idx_storyboard_domain_entity_links_project_storyboard_role ON storyboard_domain_entity_links(project_id, storyboard_id, role);

      CREATE TABLE IF NOT EXISTS domain_entity_audits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL,
        actor TEXT NOT NULL,
        action TEXT NOT NULL,
        target_type TEXT NOT NULL CHECK (target_type IN ('domain_entity', 'episode_relation', 'storyboard_relation', 'apply')),
        target_id TEXT NOT NULL,
        details TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_domain_entity_audits_project_created ON domain_entity_audits(project_id, id DESC);
      CREATE INDEX IF NOT EXISTS idx_domain_entity_audits_project_actor ON domain_entity_audits(project_id, actor);
      CREATE TABLE IF NOT EXISTS episode_workflow_states (
        project_id TEXT NOT NULL,
        episode_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('draft', 'in_review', 'approved', 'rejected')),
        updated_at TEXT NOT NULL,
        PRIMARY KEY (project_id, episode_id),
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY(episode_id) REFERENCES episodes(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS episode_workflow_audits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL,
        episode_id TEXT NOT NULL,
        from_status TEXT NOT NULL CHECK (from_status IN ('draft', 'in_review', 'approved', 'rejected')),
        to_status TEXT NOT NULL CHECK (to_status IN ('draft', 'in_review', 'approved', 'rejected')),
        actor TEXT NOT NULL,
        comment TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY(episode_id) REFERENCES episodes(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_episode_asset_links_project_episode_role ON episode_asset_links(project_id, episode_id, role);

      CREATE TABLE IF NOT EXISTS episode_workflow_states (
        project_id TEXT NOT NULL,
        episode_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('draft', 'in_review', 'approved', 'rejected')),
        updated_at TEXT NOT NULL,
        PRIMARY KEY (project_id, episode_id),
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY(episode_id) REFERENCES episodes(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS episode_workflow_audits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL,
        episode_id TEXT NOT NULL,
        from_status TEXT NOT NULL CHECK (from_status IN ('draft', 'in_review', 'approved', 'rejected')),
        to_status TEXT NOT NULL CHECK (to_status IN ('draft', 'in_review', 'approved', 'rejected')),
        actor TEXT NOT NULL,
        comment TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY(episode_id) REFERENCES episodes(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_episode_workflow_audits_project_episode ON episode_workflow_audits(project_id, episode_id, id DESC);

      CREATE TABLE IF NOT EXISTS model_configs (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK (type IN ('text', 'image', 'video', 'audio')),
        name TEXT NOT NULL,
        provider TEXT NOT NULL,
        manufacturer TEXT NOT NULL DEFAULT '',
        model TEXT NOT NULL DEFAULT '',
        auth_type TEXT NOT NULL DEFAULT 'bearer',
        endpoint TEXT NOT NULL,
        endpoints TEXT NOT NULL DEFAULT '{}',
        api_key TEXT NOT NULL,
        capabilities TEXT NOT NULL DEFAULT '{}',
        priority INTEGER NOT NULL DEFAULT 100,
        rate_limit INTEGER NOT NULL DEFAULT 0,
        is_default INTEGER NOT NULL DEFAULT 0,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_model_configs_type ON model_configs(type);

      CREATE TABLE IF NOT EXISTS prompt_templates (
        id TEXT PRIMARY KEY,
        key TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS prompt_template_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        prompt_id TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(prompt_id) REFERENCES prompt_templates(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_prompt_template_versions_prompt_id ON prompt_template_versions(prompt_id);

      CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS queue_worker_leases (
        lock_key TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        heartbeat_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  };

  const seedAdmin = (): void => {
    const countRow = deps.db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number };
    if (countRow.count > 0) {
      return;
    }

    deps.db
      .prepare('INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)')
      .run('u-admin', 'admin', 'admin123', 'admin');
  };

  const seedPromptTemplates = (): void => {
    const countRow = deps.db.prepare('SELECT COUNT(*) AS count FROM prompt_templates').get() as { count: number };
    if (countRow.count > 0) {
      return;
    }
    const timestamp = nowIso();
    const templates: Array<{ id: string; key: string; title: string; content: string }> = [
      {
        id: 'prompt_outline_default',
        key: 'outline.default',
        title: '大纲生成提示词',
        content: '请根据小说内容生成结构化章节大纲，突出冲突与转折。',
      },
      {
        id: 'prompt_script_default',
        key: 'script.default',
        title: '剧本生成提示词',
        content: '请根据大纲生成影视剧本，包括场景、对白、动作和情绪。',
      },
      {
        id: 'prompt_storyboard_default',
        key: 'storyboard.default',
        title: '分镜生成提示词',
        content: '请根据剧本生成分镜描述，包含镜头运动、景别、角色动作与光线。',
      },
    ];
    for (const item of templates) {
      deps.db
        .prepare('INSERT INTO prompt_templates (id, key, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(item.id, item.key, item.title, item.content, timestamp, timestamp);
    }
  };

  const readSchemaVersion = (): number => {
    const raw = deps.getSystemSetting(SCHEMA_VERSION_KEY);
    if (!raw) {
      return 0;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      return 0;
    }
    return Math.max(0, Math.floor(parsed));
  };

  const writeSchemaVersion = (version: number): void => {
    deps.setSystemSetting(SCHEMA_VERSION_KEY, String(Math.max(0, Math.floor(version))));
  };

  const getMigrationSnapshotDir = (): string => path.join(path.dirname(deps.dbFilePath), 'migrations');

  const writeMigrationSnapshot = (fromVersion: number, toVersion: number): string => {
    const dir = getMigrationSnapshotDir();
    fs.mkdirSync(dir, { recursive: true });
    const backup = deps.exportBusinessBackup();
    const payload = {
      type: 'schema_migration_snapshot',
      fromVersion,
      toVersion,
      createdAt: nowIso(),
      dbFile: deps.dbFilePath,
      backup,
    };
    const dbBaseName = path.basename(deps.dbFilePath).replace(/[^a-zA-Z0-9._-]+/g, '_');
    const filename = `${Date.now()}-${dbBaseName}-v${fromVersion}-to-v${toVersion}.json`;
    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');
    return filePath;
  };

  const readMigrationSnapshot = (filePath: string): {
    fromVersion: number;
    toVersion: number;
    backup: BackupPayload;
  } => {
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
  };

  const ensureTaskColumns = (): void => {
    const taskColumns = deps.db.prepare("PRAGMA table_info('tasks')").all() as Array<{ name: string }>;
    const taskNames = new Set(taskColumns.map((item) => item.name));

    if (!taskNames.has('priority')) {
      deps.db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'medium'");
      deps.db.exec("UPDATE tasks SET priority = 'medium' WHERE priority IS NULL OR priority = ''");
    }

    if (!taskNames.has('due_at')) {
      deps.db.exec('ALTER TABLE tasks ADD COLUMN due_at TEXT');
    }

    const videoTaskColumns = deps.db.prepare("PRAGMA table_info('video_tasks')").all() as Array<{ name: string }>;
    const videoTaskNames = new Set(videoTaskColumns.map((item) => item.name));
    if (!videoTaskNames.has('priority')) {
      deps.db.exec("ALTER TABLE video_tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'medium'");
      deps.db.exec("UPDATE video_tasks SET priority = 'medium' WHERE priority IS NULL OR priority = ''");
    }
    if (!videoTaskNames.has('model_name')) {
      deps.db.exec('ALTER TABLE video_tasks ADD COLUMN model_name TEXT');
    }
    if (!videoTaskNames.has('params')) {
      deps.db.exec("ALTER TABLE video_tasks ADD COLUMN params TEXT NOT NULL DEFAULT '{}'");
    }
    if (!videoTaskNames.has('provider_task_id')) {
      deps.db.exec('ALTER TABLE video_tasks ADD COLUMN provider_task_id TEXT');
    }
    if (!videoTaskNames.has('attempt')) {
      deps.db.exec('ALTER TABLE video_tasks ADD COLUMN attempt INTEGER NOT NULL DEFAULT 0');
    }
    if (!videoTaskNames.has('next_retry_at')) {
      deps.db.exec('ALTER TABLE video_tasks ADD COLUMN next_retry_at TEXT');
    }
    if (!videoTaskNames.has('provider_error_code')) {
      deps.db.exec('ALTER TABLE video_tasks ADD COLUMN provider_error_code TEXT');
    }
    ensureVideoTaskStatusConstraint();

    const audioTaskColumns = deps.db.prepare("PRAGMA table_info('audio_tasks')").all() as Array<{ name: string }>;
    const audioTaskNames = new Set(audioTaskColumns.map((item) => item.name));
    if (audioTaskColumns.length > 0 && !audioTaskNames.has('model_name')) {
      deps.db.exec('ALTER TABLE audio_tasks ADD COLUMN model_name TEXT');
    }
    if (audioTaskColumns.length > 0 && !audioTaskNames.has('params')) {
      deps.db.exec("ALTER TABLE audio_tasks ADD COLUMN params TEXT NOT NULL DEFAULT '{}'");
    }
  };

  const ensureDomainColumns = (): void => {
    const storyboardColumns = deps.db.prepare("PRAGMA table_info('storyboards')").all() as Array<{ name: string }>;
    const storyboardNames = new Set(storyboardColumns.map((item) => item.name));
    if (storyboardColumns.length > 0 && !storyboardNames.has('scene_id')) {
      deps.db.exec('ALTER TABLE storyboards ADD COLUMN scene_id TEXT');
    }
    if (storyboardColumns.length > 0 && !storyboardNames.has('plan_json')) {
      deps.db.exec('ALTER TABLE storyboards ADD COLUMN plan_json TEXT');
    }
    deps.db.exec('CREATE INDEX IF NOT EXISTS idx_storyboards_scene_id ON storyboards(scene_id)');
    deps.db.exec(`
      CREATE TABLE IF NOT EXISTS scenes (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        prompt TEXT NOT NULL,
        storyboard_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_scenes_project_id ON scenes(project_id);
      CREATE TABLE IF NOT EXISTS storyboard_asset_links (
        storyboard_id TEXT NOT NULL,
        asset_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('scene', 'character', 'prop')),
        created_at TEXT NOT NULL,
        PRIMARY KEY(storyboard_id, asset_id, role),
        FOREIGN KEY(storyboard_id) REFERENCES storyboards(id) ON DELETE CASCADE,
        FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_storyboard_asset_links_storyboard_role ON storyboard_asset_links(storyboard_id, role);
    `);
  };

  const ensureAssetColumns = (): void => {
    const assetColumns = deps.db.prepare("PRAGMA table_info('assets')").all() as Array<{ name: string }>;
    const assetNames = new Set(assetColumns.map((item) => item.name));
    if (assetColumns.length > 0 && !assetNames.has('scope')) {
      deps.db.exec("ALTER TABLE assets ADD COLUMN scope TEXT NOT NULL DEFAULT 'shot'");
    }
    if (assetColumns.length > 0 && !assetNames.has('share_scope')) {
      deps.db.exec("ALTER TABLE assets ADD COLUMN share_scope TEXT NOT NULL DEFAULT 'project'");
    }
    if (assetColumns.length > 0 && !assetNames.has('base_asset_id')) {
      deps.db.exec('ALTER TABLE assets ADD COLUMN base_asset_id TEXT');
    }
    if (assetColumns.length > 0 && !assetNames.has('state_prompt')) {
      deps.db.exec('ALTER TABLE assets ADD COLUMN state_prompt TEXT');
    }
    if (assetColumns.length > 0 && !assetNames.has('state_json')) {
      deps.db.exec('ALTER TABLE assets ADD COLUMN state_json TEXT');
    }
    deps.db.exec("UPDATE assets SET scope = 'shot' WHERE scope IS NULL OR scope = ''");
    deps.db.exec("UPDATE assets SET share_scope = 'project' WHERE share_scope IS NULL OR share_scope = ''");
    deps.db.exec('CREATE INDEX IF NOT EXISTS idx_assets_scope ON assets(project_id, scope, type)');
    deps.db.exec('CREATE INDEX IF NOT EXISTS idx_assets_base_asset_id ON assets(base_asset_id)');
  };

  const ensureExtendedDomainColumns = (): void => {
    deps.db.exec(`
      CREATE TABLE IF NOT EXISTS dramas (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        style TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS episodes (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        drama_id TEXT NOT NULL,
        title TEXT NOT NULL,
        order_index INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('draft', 'ready', 'published')) DEFAULT 'draft',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY(drama_id) REFERENCES dramas(id) ON DELETE CASCADE
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_episodes_project_order ON episodes(project_id, order_index);
      CREATE INDEX IF NOT EXISTS idx_episodes_project_id ON episodes(project_id);
      CREATE INDEX IF NOT EXISTS idx_episodes_drama_id ON episodes(drama_id);
      CREATE TABLE IF NOT EXISTS timeline_plans (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        episode_id TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL,
        tracks TEXT NOT NULL DEFAULT '[]',
        clips TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS episode_asset_links (
        project_id TEXT NOT NULL,
        episode_id TEXT NOT NULL,
        asset_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('scene', 'character', 'prop')),
        created_at TEXT NOT NULL,
        PRIMARY KEY (project_id, episode_id, asset_id, role),
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY(episode_id) REFERENCES episodes(id) ON DELETE CASCADE,
        FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
      );
    `);

    const scriptColumns = deps.db.prepare("PRAGMA table_info('scripts')").all() as Array<{ name: string }>;
    const scriptNames = new Set(scriptColumns.map((item) => item.name));
    if (scriptColumns.length > 0 && !scriptNames.has('episode_id')) {
      deps.db.exec('ALTER TABLE scripts ADD COLUMN episode_id TEXT');
    }
    deps.db.exec('CREATE INDEX IF NOT EXISTS idx_scripts_episode_id ON scripts(episode_id)');

    const storyboardColumns = deps.db.prepare("PRAGMA table_info('storyboards')").all() as Array<{ name: string }>;
    const storyboardNames = new Set(storyboardColumns.map((item) => item.name));
    if (storyboardColumns.length > 0 && !storyboardNames.has('episode_id')) {
      deps.db.exec('ALTER TABLE storyboards ADD COLUMN episode_id TEXT');
    }
    if (storyboardColumns.length > 0 && !storyboardNames.has('plan_json')) {
      deps.db.exec('ALTER TABLE storyboards ADD COLUMN plan_json TEXT');
    }
    deps.db.exec('CREATE INDEX IF NOT EXISTS idx_storyboards_episode_id ON storyboards(episode_id)');

    const timelineColumns = deps.db.prepare("PRAGMA table_info('timeline_plans')").all() as Array<{ name: string }>;
    const timelineNames = new Set(timelineColumns.map((item) => item.name));
    if (timelineColumns.length > 0 && !timelineNames.has('episode_id')) {
      deps.db.exec("ALTER TABLE timeline_plans ADD COLUMN episode_id TEXT NOT NULL DEFAULT ''");
    }
    if (timelineColumns.length > 0 && !timelineNames.has('tracks')) {
      deps.db.exec("ALTER TABLE timeline_plans ADD COLUMN tracks TEXT NOT NULL DEFAULT '[]'");
    }
    deps.db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_timeline_plans_project_episode ON timeline_plans(project_id, episode_id)');
    deps.db.exec('CREATE INDEX IF NOT EXISTS idx_episode_asset_links_project_episode_role ON episode_asset_links(project_id, episode_id, role)');
    deps.db.exec('CREATE INDEX IF NOT EXISTS idx_episode_workflow_audits_project_episode ON episode_workflow_audits(project_id, episode_id, id DESC)');
  };

  const ensureCanonicalDomainEntityTables = (): void => {
    deps.db.exec(`
      CREATE TABLE IF NOT EXISTS domain_entities (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('character', 'scene', 'prop')),
        lifecycle_status TEXT NOT NULL DEFAULT 'draft' CHECK (lifecycle_status IN ('draft', 'in_review', 'approved', 'archived')),
        name TEXT NOT NULL,
        prompt TEXT NOT NULL,
        image_url TEXT,
        deleted_at TEXT,
        merged_into_entity_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_domain_entities_project_type ON domain_entities(project_id, type);
      CREATE INDEX IF NOT EXISTS idx_domain_entities_project_name ON domain_entities(project_id, name);
      CREATE INDEX IF NOT EXISTS idx_domain_entities_deleted_at ON domain_entities(project_id, deleted_at);
      CREATE INDEX IF NOT EXISTS idx_domain_entities_deleted_at ON domain_entities(project_id, deleted_at);

      CREATE TABLE IF NOT EXISTS episode_domain_entity_links (
        project_id TEXT NOT NULL,
        episode_id TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('scene', 'character', 'prop')),
        created_at TEXT NOT NULL,
        PRIMARY KEY (project_id, episode_id, entity_id, role),
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY(episode_id) REFERENCES episodes(id) ON DELETE CASCADE,
        FOREIGN KEY(entity_id) REFERENCES domain_entities(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_episode_domain_entity_links_project_episode_role ON episode_domain_entity_links(project_id, episode_id, role);

      CREATE TABLE IF NOT EXISTS storyboard_domain_entity_links (
        project_id TEXT NOT NULL,
        storyboard_id TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('scene', 'character', 'prop')),
        created_at TEXT NOT NULL,
        PRIMARY KEY (project_id, storyboard_id, entity_id, role),
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY(storyboard_id) REFERENCES storyboards(id) ON DELETE CASCADE,
        FOREIGN KEY(entity_id) REFERENCES domain_entities(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_storyboard_domain_entity_links_project_storyboard_role ON storyboard_domain_entity_links(project_id, storyboard_id, role);

      CREATE TABLE IF NOT EXISTS domain_entity_audits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL,
        actor TEXT NOT NULL,
        action TEXT NOT NULL,
        target_type TEXT NOT NULL CHECK (target_type IN ('domain_entity', 'episode_relation', 'storyboard_relation', 'apply')),
        target_id TEXT NOT NULL,
        details TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_domain_entity_audits_project_created ON domain_entity_audits(project_id, id DESC);
      CREATE INDEX IF NOT EXISTS idx_domain_entity_audits_project_actor ON domain_entity_audits(project_id, actor);
    `);

    const domainEntityColumns = deps.db.prepare("PRAGMA table_info('domain_entities')").all() as Array<{ name: string }>;
    const domainEntityNames = new Set(domainEntityColumns.map((item) => item.name));
    if (domainEntityColumns.length > 0 && !domainEntityNames.has('deleted_at')) {
      deps.db.exec('ALTER TABLE domain_entities ADD COLUMN deleted_at TEXT');
    }
    if (domainEntityColumns.length > 0 && !domainEntityNames.has('merged_into_entity_id')) {
      deps.db.exec('ALTER TABLE domain_entities ADD COLUMN merged_into_entity_id TEXT');
    }
    if (domainEntityColumns.length > 0 && !domainEntityNames.has('lifecycle_status')) {
      deps.db.exec("ALTER TABLE domain_entities ADD COLUMN lifecycle_status TEXT NOT NULL DEFAULT 'draft'");
    }
    deps.db.exec('CREATE INDEX IF NOT EXISTS idx_domain_entities_deleted_at ON domain_entities(project_id, deleted_at)');
  };

  const ensureVideoTaskStatusConstraint = (): void => {
    const tableRow = deps.db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'video_tasks' LIMIT 1")
      .get() as { sql?: string } | undefined;
    const ddl = tableRow?.sql ?? '';
    if (ddl.includes("'submitting'") && ddl.includes("'polling'") && ddl.includes("'cancelled'")) {
      return;
    }

    deps.db.exec(`
      PRAGMA foreign_keys = OFF;
      BEGIN;
      CREATE TABLE IF NOT EXISTS video_tasks_new (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        storyboard_id TEXT NOT NULL,
        prompt TEXT NOT NULL,
        model_name TEXT,
        params TEXT NOT NULL DEFAULT '{}',
        priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
        status TEXT NOT NULL CHECK (status IN ('queued', 'submitting', 'polling', 'running', 'done', 'failed', 'cancelled')),
        progress INTEGER NOT NULL,
        result_url TEXT,
        first_frame_url TEXT,
        last_frame_url TEXT,
        error TEXT,
        provider_task_id TEXT,
        attempt INTEGER NOT NULL DEFAULT 0,
        next_retry_at TEXT,
        provider_error_code TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY(storyboard_id) REFERENCES storyboards(id) ON DELETE CASCADE
      );
      INSERT INTO video_tasks_new (
        id, project_id, storyboard_id, prompt, model_name, params, priority, status, progress, result_url, error, provider_task_id, attempt, next_retry_at, provider_error_code, created_at, updated_at
      )
      SELECT
        id,
        project_id,
        storyboard_id,
        prompt,
        model_name,
        COALESCE(params, '{}'),
        COALESCE(priority, 'medium'),
        CASE
          WHEN status IN ('queued', 'submitting', 'polling', 'running', 'done', 'failed', 'cancelled') THEN status
          ELSE 'failed'
        END,
        progress,
        result_url,
        error,
        provider_task_id,
        COALESCE(attempt, 0),
        next_retry_at,
        provider_error_code,
        created_at,
        updated_at
      FROM video_tasks;
      DROP TABLE video_tasks;
      ALTER TABLE video_tasks_new RENAME TO video_tasks;
      CREATE INDEX IF NOT EXISTS idx_video_tasks_project_id ON video_tasks(project_id);
      COMMIT;
      PRAGMA foreign_keys = ON;
    `);
  };

  const ensureModelConfigColumns = (): void => {
    const tableRow = deps.db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'model_configs' LIMIT 1")
      .get() as { sql?: string } | undefined;

    const ddl = tableRow?.sql ?? '';
    if (!ddl.includes("'audio'")) {
      deps.db.exec(`
        BEGIN;
        CREATE TABLE IF NOT EXISTS model_configs_new (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL CHECK (type IN ('text', 'image', 'video', 'audio')),
          name TEXT NOT NULL,
          provider TEXT NOT NULL,
          manufacturer TEXT NOT NULL DEFAULT '',
          model TEXT NOT NULL DEFAULT '',
          auth_type TEXT NOT NULL DEFAULT 'bearer',
          endpoint TEXT NOT NULL,
          endpoints TEXT NOT NULL DEFAULT '{}',
          api_key TEXT NOT NULL,
          capabilities TEXT NOT NULL DEFAULT '{}',
          priority INTEGER NOT NULL DEFAULT 100,
          rate_limit INTEGER NOT NULL DEFAULT 0,
          is_default INTEGER NOT NULL DEFAULT 0,
          enabled INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        INSERT INTO model_configs_new (
          id, type, name, provider, manufacturer, model, auth_type, endpoint, endpoints, api_key, capabilities, priority, rate_limit, is_default, enabled, created_at, updated_at
        )
        SELECT
          id,
          type,
          name,
          provider,
          provider,
          name,
          'bearer',
          endpoint,
          '{}',
          api_key,
          '{}',
          100,
          0,
          is_default,
          enabled,
          created_at,
          updated_at
        FROM model_configs;
        DROP TABLE model_configs;
        ALTER TABLE model_configs_new RENAME TO model_configs;
        CREATE INDEX IF NOT EXISTS idx_model_configs_type ON model_configs(type);
        COMMIT;
      `);
      return;
    }

    const columns = deps.db.prepare("PRAGMA table_info('model_configs')").all() as Array<{ name: string }>;
    const names = new Set(columns.map((item) => item.name));

    if (!names.has('manufacturer')) {
      deps.db.exec("ALTER TABLE model_configs ADD COLUMN manufacturer TEXT NOT NULL DEFAULT ''");
      deps.db.exec("UPDATE model_configs SET manufacturer = provider WHERE manufacturer = ''");
    }
    if (!names.has('model')) {
      deps.db.exec("ALTER TABLE model_configs ADD COLUMN model TEXT NOT NULL DEFAULT ''");
      deps.db.exec("UPDATE model_configs SET model = name WHERE model = ''");
    }
    if (!names.has('auth_type')) {
      deps.db.exec("ALTER TABLE model_configs ADD COLUMN auth_type TEXT NOT NULL DEFAULT 'bearer'");
    }
    if (!names.has('endpoints')) {
      deps.db.exec("ALTER TABLE model_configs ADD COLUMN endpoints TEXT NOT NULL DEFAULT '{}'");
    }
    if (!names.has('capabilities')) {
      deps.db.exec("ALTER TABLE model_configs ADD COLUMN capabilities TEXT NOT NULL DEFAULT '{}'");
    }
    if (!names.has('priority')) {
      deps.db.exec('ALTER TABLE model_configs ADD COLUMN priority INTEGER NOT NULL DEFAULT 100');
    }
    if (!names.has('rate_limit')) {
      deps.db.exec('ALTER TABLE model_configs ADD COLUMN rate_limit INTEGER NOT NULL DEFAULT 0');
    }
  };

  const ensureVideoMergeColumns = (): void => {
    const tableRows = deps.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'video_merges'")
      .all() as Array<{ name: string }>;
    if (tableRows.length === 0) {
      return;
    }
    const columns = deps.db.prepare("PRAGMA table_info('video_merges')").all() as Array<{ name: string }>;
    const hasOutputPath = columns.some((col) => col.name === 'output_path');
    if (!hasOutputPath) {
      deps.db.exec('ALTER TABLE video_merges ADD COLUMN output_path TEXT');
    }
    const hasParams = columns.some((col) => col.name === 'params');
    if (!hasParams) {
      deps.db.exec("ALTER TABLE video_merges ADD COLUMN params TEXT NOT NULL DEFAULT '{}'");
    }
    const hasErrorCode = columns.some((col) => col.name === 'error_code');
    if (!hasErrorCode) {
      deps.db.exec('ALTER TABLE video_merges ADD COLUMN error_code TEXT');
    }
  };

  const ensureModelConfigApiKeysEncrypted = (): void => {
    const rows = deps.db.prepare("SELECT id, api_key FROM model_configs WHERE api_key IS NOT NULL AND api_key <> ''").all() as Array<{
      id: string;
      api_key: string;
    }>;
    const updateStmt = deps.db.prepare('UPDATE model_configs SET api_key = ? WHERE id = ?');
    for (const row of rows) {
      if (isEncryptedSecret(row.api_key)) {
        continue;
      }
      updateStmt.run(encryptSecret(row.api_key, env.modelSecretKey), row.id);
    }
  };

  const runSchemaMigrations = (): void => {
    const current = readSchemaVersion();
    if (current >= TARGET_SCHEMA_VERSION) {
      return;
    }
    const migrations: Array<{ version: number; run: () => void }> = [
      { version: 1, run: () => { ensureTaskColumns(); ensureVideoMergeColumns(); } },
      { version: 2, run: () => { ensureModelConfigColumns(); } },
      { version: 3, run: () => { ensureDomainColumns(); } },
      { version: 4, run: () => { ensureModelConfigApiKeysEncrypted(); } },
      { version: 5, run: () => { ensureExtendedDomainColumns(); } },
      { version: 6, run: () => { ensureExtendedDomainColumns(); } },
      { version: 7, run: () => { ensureExtendedDomainColumns(); } },
      { version: 8, run: () => { ensureCanonicalDomainEntityTables(); } },
      { version: 9, run: () => { ensureCanonicalDomainEntityTables(); } },
      { version: 10, run: () => { ensureCanonicalDomainEntityTables(); ensureAssetColumns(); } },
    ];

    for (const migration of migrations) {
      if (migration.version <= current) {
        continue;
      }
      const fromVersion = migration.version - 1;
      const snapshotPath = writeMigrationSnapshot(fromVersion, migration.version);
      try {
        migration.run();
        writeSchemaVersion(migration.version);
      } catch (error) {
        try {
          const payload = readMigrationSnapshot(snapshotPath);
          deps.importBusinessBackup(payload.backup);
          writeSchemaVersion(payload.fromVersion);
        } catch {
          // rollback best-effort
        }
        throw error;
      }
    }
  };

  const seedSystemSettings = (): void => {
    const timestamp = nowIso();
    deps.db.prepare('INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES (?, ?, ?)').run(
      'video_task_auto_retry',
      String(TASK_RUNTIME_DEFAULTS.videoTaskAutoRetry),
      timestamp,
    );
    deps.db.prepare('INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES (?, ?, ?)').run(
      'video_task_retry_delay_ms',
      String(TASK_RUNTIME_DEFAULTS.videoTaskRetryDelayMs),
      timestamp,
    );
    deps.db.prepare('INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES (?, ?, ?)').run(
      'video_task_poll_interval_ms',
      String(TASK_RUNTIME_DEFAULTS.videoTaskPollIntervalMs),
      timestamp,
    );
  };

  return {
    ensurePreInitLegacyColumns,
    ensureCanonicalDomainEntityTables,
    initSchema,
    runSchemaMigrations,
    seedAdmin,
    seedPromptTemplates,
    seedSystemSettings,
  };
};
