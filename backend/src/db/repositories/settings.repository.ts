import type { ModelConfig, PromptTemplate, PromptTemplateVersion, TaskRuntimeConfig } from '../../core/types.js';
import { env } from '../../config/env.js';
import { encryptSecret } from '../../utils/secret.js';
import {
  mapModelConfig,
  mapPromptTemplate,
  mapPromptTemplateVersion,
  parseJsonRecord,
  parseJsonRecordUnknown,
} from '../sqlite/row-mappers.js';
import type { ModelConfigRow, PromptTemplateRow, PromptTemplateVersionRow, SystemSettingRow } from '../sqlite/row-types.js';
import { BaseRepository } from './base.repository.js';

const TASK_RUNTIME_DEFAULTS: TaskRuntimeConfig = {
  videoTaskAutoRetry: 1,
  videoTaskRetryDelayMs: 800,
  videoTaskPollIntervalMs: 2000,
};

export class SettingsRepository extends BaseRepository {
  listModelConfigs(type?: 'text' | 'image' | 'video' | 'audio'): ModelConfig[] {
    const rows = type
      ? (this.db
          .prepare(
            'SELECT id, type, name, provider, manufacturer, model, auth_type, endpoint, endpoints, api_key, capabilities, priority, rate_limit, is_default, enabled, created_at, updated_at FROM model_configs WHERE type = ? ORDER BY is_default DESC, updated_at DESC'
          )
          .all(type) as ModelConfigRow[])
      : (this.db
          .prepare(
            'SELECT id, type, name, provider, manufacturer, model, auth_type, endpoint, endpoints, api_key, capabilities, priority, rate_limit, is_default, enabled, created_at, updated_at FROM model_configs ORDER BY type ASC, is_default DESC, updated_at DESC'
          )
          .all() as ModelConfigRow[]);
    return rows.map((row) => mapModelConfig(row));
  }

  getDefaultModelConfig(type: 'text' | 'image' | 'video' | 'audio'): ModelConfig | null {
    const row = this.db
      .prepare(
        'SELECT id, type, name, provider, manufacturer, model, auth_type, endpoint, endpoints, api_key, capabilities, priority, rate_limit, is_default, enabled, created_at, updated_at FROM model_configs WHERE type = ? AND is_default = 1 AND enabled = 1 LIMIT 1'
      )
      .get(type) as ModelConfigRow | undefined;
    return row ? mapModelConfig(row) : null;
  }

  createModelConfig(input: {
    id: string;
    type: 'text' | 'image' | 'video' | 'audio';
    name: string;
    provider: string;
    manufacturer: string;
    model: string;
    authType: 'bearer' | 'api_key' | 'none';
    endpoint: string;
    endpoints: Record<string, string>;
    apiKey: string;
    capabilities: Record<string, unknown>;
    priority: number;
    rateLimit: number;
    isDefault: boolean;
    enabled: boolean;
  }): ModelConfig {
    const timestamp = this.timestamp();
    if (input.isDefault) {
      this.db.prepare('UPDATE model_configs SET is_default = 0 WHERE type = ?').run(input.type);
    }
    this.db
      .prepare(
        'INSERT INTO model_configs (id, type, name, provider, manufacturer, model, auth_type, endpoint, endpoints, api_key, capabilities, priority, rate_limit, is_default, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        input.id,
        input.type,
        input.name,
        input.provider,
        input.manufacturer,
        input.model,
        input.authType,
        input.endpoint,
        JSON.stringify(input.endpoints),
        encryptSecret(input.apiKey, env.modelSecretKey),
        JSON.stringify(input.capabilities),
        input.priority,
        input.rateLimit,
        input.isDefault ? 1 : 0,
        input.enabled ? 1 : 0,
        timestamp,
        timestamp
      );

    const row = this.db
      .prepare(
        'SELECT id, type, name, provider, manufacturer, model, auth_type, endpoint, endpoints, api_key, capabilities, priority, rate_limit, is_default, enabled, created_at, updated_at FROM model_configs WHERE id = ? LIMIT 1'
      )
      .get(input.id) as ModelConfigRow;
    return mapModelConfig(row);
  }

  updateModelConfig(
    id: string,
    input: {
      name?: string;
      provider?: string;
      manufacturer?: string;
      model?: string;
      authType?: 'bearer' | 'api_key' | 'none';
      endpoint?: string;
      endpoints?: Record<string, string>;
      apiKey?: string;
      capabilities?: Record<string, unknown>;
      priority?: number;
      rateLimit?: number;
      isDefault?: boolean;
      enabled?: boolean;
    }
  ): ModelConfig | null {
    const current = this.db
      .prepare(
        'SELECT id, type, name, provider, manufacturer, model, auth_type, endpoint, endpoints, api_key, capabilities, priority, rate_limit, is_default, enabled, created_at, updated_at FROM model_configs WHERE id = ? LIMIT 1'
      )
      .get(id) as ModelConfigRow | undefined;
    if (!current) {
      return null;
    }

    const name = input.name ?? current.name;
    const provider = input.provider ?? current.provider;
    const manufacturer = input.manufacturer ?? current.manufacturer;
    const model = input.model ?? current.model;
    const authType = input.authType ?? current.auth_type;
    const endpoint = input.endpoint ?? current.endpoint;
    const endpoints = input.endpoints ?? parseJsonRecord(current.endpoints);
    const apiKey = input.apiKey !== undefined ? encryptSecret(input.apiKey, env.modelSecretKey) : current.api_key;
    const capabilities = input.capabilities ?? parseJsonRecordUnknown(current.capabilities);
    const priority = input.priority ?? current.priority;
    const rateLimit = input.rateLimit ?? current.rate_limit;
    const isDefault = input.isDefault ?? Boolean(current.is_default);
    const enabled = input.enabled ?? Boolean(current.enabled);
    const timestamp = this.timestamp();

    if (isDefault) {
      this.db.prepare('UPDATE model_configs SET is_default = 0 WHERE type = ?').run(current.type);
    }
    this.db
      .prepare(
        'UPDATE model_configs SET name = ?, provider = ?, manufacturer = ?, model = ?, auth_type = ?, endpoint = ?, endpoints = ?, api_key = ?, capabilities = ?, priority = ?, rate_limit = ?, is_default = ?, enabled = ?, updated_at = ? WHERE id = ?'
      )
      .run(
        name,
        provider,
        manufacturer,
        model,
        authType,
        endpoint,
        JSON.stringify(endpoints),
        apiKey,
        JSON.stringify(capabilities),
        priority,
        rateLimit,
        isDefault ? 1 : 0,
        enabled ? 1 : 0,
        timestamp,
        id
      );

    const row = this.db
      .prepare(
        'SELECT id, type, name, provider, manufacturer, model, auth_type, endpoint, endpoints, api_key, capabilities, priority, rate_limit, is_default, enabled, created_at, updated_at FROM model_configs WHERE id = ? LIMIT 1'
      )
      .get(id) as ModelConfigRow;
    return mapModelConfig(row);
  }

  getModelConfigById(id: string): ModelConfig | null {
    const row = this.db
      .prepare(
        'SELECT id, type, name, provider, manufacturer, model, auth_type, endpoint, endpoints, api_key, capabilities, priority, rate_limit, is_default, enabled, created_at, updated_at FROM model_configs WHERE id = ? LIMIT 1'
      )
      .get(id) as ModelConfigRow | undefined;
    return row ? mapModelConfig(row) : null;
  }

  findEnabledModelConfigByName(type: 'text' | 'image' | 'video' | 'audio', nameOrModel: string): ModelConfig | null {
    const row = this.db
      .prepare(
        'SELECT id, type, name, provider, manufacturer, model, auth_type, endpoint, endpoints, api_key, capabilities, priority, rate_limit, is_default, enabled, created_at, updated_at FROM model_configs WHERE type = ? AND enabled = 1 AND (name = ? OR model = ?) ORDER BY is_default DESC, updated_at DESC LIMIT 1'
      )
      .get(type, nameOrModel, nameOrModel) as ModelConfigRow | undefined;
    return row ? mapModelConfig(row) : null;
  }

  deleteModelConfig(id: string): boolean {
    const result = this.db.prepare('DELETE FROM model_configs WHERE id = ?').run(id);
    return Number(result.changes) > 0;
  }

  listPromptTemplates(): PromptTemplate[] {
    const rows = this.db
      .prepare('SELECT id, key, title, content, created_at, updated_at FROM prompt_templates ORDER BY key ASC')
      .all() as PromptTemplateRow[];
    return rows.map((row) => mapPromptTemplate(row));
  }

  listPromptTemplateVersions(promptId: string): PromptTemplateVersion[] {
    const rows = this.db
      .prepare(
        'SELECT id, prompt_id, title, content, created_at FROM prompt_template_versions WHERE prompt_id = ? ORDER BY id DESC LIMIT 30'
      )
      .all(promptId) as PromptTemplateVersionRow[];
    return rows.map((row) => mapPromptTemplateVersion(row));
  }

  updatePromptTemplate(id: string, input: { title?: string; content?: string }): PromptTemplate | null {
    const current = this.db
      .prepare('SELECT id, key, title, content, created_at, updated_at FROM prompt_templates WHERE id = ? LIMIT 1')
      .get(id) as PromptTemplateRow | undefined;
    if (!current) {
      return null;
    }
    const title = input.title ?? current.title;
    const content = input.content ?? current.content;
    const timestamp = this.timestamp();
    this.db
      .prepare('INSERT INTO prompt_template_versions (prompt_id, title, content, created_at) VALUES (?, ?, ?, ?)')
      .run(current.id, current.title, current.content, timestamp);
    this.db.prepare('UPDATE prompt_templates SET title = ?, content = ?, updated_at = ? WHERE id = ?').run(title, content, timestamp, id);

    const row = this.db
      .prepare('SELECT id, key, title, content, created_at, updated_at FROM prompt_templates WHERE id = ? LIMIT 1')
      .get(id) as PromptTemplateRow;
    return mapPromptTemplate(row);
  }

  getTaskRuntimeConfig(): TaskRuntimeConfig {
    const rows = this.db.prepare('SELECT key, value, updated_at FROM system_settings').all() as SystemSettingRow[];
    const map = new Map(rows.map((item) => [item.key, item.value]));
    return {
      videoTaskAutoRetry: this.parseIntSetting(map.get('video_task_auto_retry'), TASK_RUNTIME_DEFAULTS.videoTaskAutoRetry, 0, 5),
      videoTaskRetryDelayMs: this.parseIntSetting(
        map.get('video_task_retry_delay_ms'),
        TASK_RUNTIME_DEFAULTS.videoTaskRetryDelayMs,
        100,
        10_000
      ),
      videoTaskPollIntervalMs: this.parseIntSetting(
        map.get('video_task_poll_interval_ms'),
        TASK_RUNTIME_DEFAULTS.videoTaskPollIntervalMs,
        500,
        10_000
      ),
    };
  }

  updateTaskRuntimeConfig(input: {
    videoTaskAutoRetry?: number;
    videoTaskRetryDelayMs?: number;
    videoTaskPollIntervalMs?: number;
  }): TaskRuntimeConfig {
    const current = this.getTaskRuntimeConfig();
    const next: TaskRuntimeConfig = {
      videoTaskAutoRetry:
        input.videoTaskAutoRetry === undefined ? current.videoTaskAutoRetry : Math.max(0, Math.min(5, Math.trunc(input.videoTaskAutoRetry))),
      videoTaskRetryDelayMs:
        input.videoTaskRetryDelayMs === undefined
          ? current.videoTaskRetryDelayMs
          : Math.max(100, Math.min(10_000, Math.trunc(input.videoTaskRetryDelayMs))),
      videoTaskPollIntervalMs:
        input.videoTaskPollIntervalMs === undefined
          ? current.videoTaskPollIntervalMs
          : Math.max(500, Math.min(10_000, Math.trunc(input.videoTaskPollIntervalMs))),
    };

    const timestamp = this.timestamp();
    this.db.prepare('INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES (?, ?, ?)').run(
      'video_task_auto_retry',
      String(next.videoTaskAutoRetry),
      timestamp
    );
    this.db.prepare('INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES (?, ?, ?)').run(
      'video_task_retry_delay_ms',
      String(next.videoTaskRetryDelayMs),
      timestamp
    );
    this.db.prepare('INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES (?, ?, ?)').run(
      'video_task_poll_interval_ms',
      String(next.videoTaskPollIntervalMs),
      timestamp
    );
    return next;
  }

  getSystemSetting(key: string): string | null {
    const row = this.db
      .prepare('SELECT value FROM system_settings WHERE key = ? LIMIT 1')
      .get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  setSystemSetting(key: string, value: string): void {
    this.db.prepare('INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES (?, ?, ?)').run(key, value, this.timestamp());
  }

  private parseIntSetting(raw: string | undefined, fallback: number, min: number, max: number): number {
    if (raw === undefined) {
      return fallback;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.max(min, Math.min(max, Math.trunc(parsed)));
  }
}
