import type { ModelConfig } from '../../core/types.js';
import { SqliteStore } from '../../db/sqlite.js';
import { nowIso } from '../../utils/time.js';
import { ProviderError } from '../pipeline/providers/errors.js';
import type { AiProvider, ProviderModelConfig } from '../pipeline/providers/types.js';

export type ModelConnectionDraftInput = {
  type: 'text' | 'image' | 'video' | 'audio';
  name: string;
  provider: string;
  manufacturer?: string;
  model?: string;
  authType?: 'bearer' | 'api_key' | 'none';
  endpoint: string;
  endpoints?: Record<string, string>;
  apiKey?: string;
  capabilities?: Record<string, unknown>;
};

export type ModelConnectionOverrideInput = Partial<ModelConnectionDraftInput>;

export type ModelConnectionTestResult = {
  ok: boolean;
  checkedAt: string;
  latencyMs: number;
  type: 'text' | 'image' | 'video' | 'audio';
  provider: string;
  manufacturer: string;
  model: string;
  endpoint: string;
  message: string;
  preview: string | null;
  errorKind: ProviderError['kind'] | null;
  statusCode: number | null;
};

const TEST_PROJECT_ID = 'settings-model-connection';
const TEXT_CONNECTION_PROMPT = 'Reply with exactly: CONNECTION_OK';

const trimOrFallback = (value: string | undefined, fallback: string): string => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
};

const extractStatusCodeFromError = (message: string): number | null => {
  const match = message.match(/\b(4\d\d|5\d\d)\b/);
  if (!match) {
    return null;
  }
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
};

export class ModelConnectionService {
  constructor(
    private readonly store: SqliteStore,
    private readonly provider: AiProvider
  ) {}

  async testDraft(input: ModelConnectionDraftInput): Promise<ModelConnectionTestResult> {
    return this.runConnectionTest(this.normalizeDraft(input));
  }

  async testStoredModel(modelId: string, overrides: ModelConnectionOverrideInput = {}): Promise<ModelConnectionTestResult | null> {
    const current = this.store.getModelConfigById(modelId);
    if (!current) {
      return null;
    }
    return this.runConnectionTest(this.mergeStoredModel(current, overrides));
  }

  private normalizeDraft(input: ModelConnectionDraftInput): ModelConfig {
    const name = input.name.trim();
    const provider = input.provider.trim();
    const manufacturer = trimOrFallback(input.manufacturer, provider);
    const model = trimOrFallback(input.model, name);
    const endpoint = input.endpoint.trim();
    return {
      id: 'draft-model-connection',
      type: input.type,
      name,
      provider,
      manufacturer,
      model,
      authType: input.authType ?? 'bearer',
      endpoint,
      endpoints: input.endpoints ?? {},
      apiKey: input.apiKey?.trim() ?? '',
      capabilities: input.capabilities ?? {},
      priority: 100,
      rateLimit: 0,
      isDefault: false,
      enabled: true,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
  }

  private mergeStoredModel(current: ModelConfig, overrides: ModelConnectionOverrideInput): ModelConfig {
    return {
      ...current,
      type: overrides.type ?? current.type,
      name: trimOrFallback(overrides.name, current.name),
      provider: trimOrFallback(overrides.provider, current.provider),
      manufacturer: trimOrFallback(overrides.manufacturer, current.manufacturer),
      model: trimOrFallback(overrides.model, current.model),
      authType: overrides.authType ?? current.authType,
      endpoint: trimOrFallback(overrides.endpoint, current.endpoint),
      endpoints: overrides.endpoints ?? current.endpoints,
      apiKey: trimOrFallback(overrides.apiKey, current.apiKey),
      capabilities: overrides.capabilities ?? current.capabilities,
      updatedAt: nowIso()
    };
  }

  private async runConnectionTest(modelConfig: ModelConfig): Promise<ModelConnectionTestResult> {
    const checkedAt = nowIso();
    const start = Date.now();
    const baseResult = {
      checkedAt,
      type: modelConfig.type,
      provider: modelConfig.provider,
      manufacturer: modelConfig.manufacturer,
      model: modelConfig.model,
      endpoint: modelConfig.endpoint
    } satisfies Omit<ModelConnectionTestResult, 'ok' | 'latencyMs' | 'message' | 'preview' | 'errorKind' | 'statusCode'>;

    if (modelConfig.type !== 'text') {
      return {
        ...baseResult,
        ok: false,
        latencyMs: Date.now() - start,
        message: '当前测试连接仅支持 text 模型，避免误触发 image/video/audio 的真实计费任务。',
        preview: null,
        errorKind: null,
        statusCode: null
      };
    }

    try {
      const result = await this.provider.generateText({
        prompt: TEXT_CONNECTION_PROMPT,
        projectId: TEST_PROJECT_ID,
        model: modelConfig.model,
        modelConfig: this.toProviderModelConfig(modelConfig)
      });
      return {
        ...baseResult,
        ok: true,
        latencyMs: Date.now() - start,
        message: '连接成功',
        preview: result.text.trim().slice(0, 400) || null,
        errorKind: null,
        statusCode: null
      };
    } catch (err) {
      const normalized = this.normalizeError(err);
      return {
        ...baseResult,
        ok: false,
        latencyMs: Date.now() - start,
        message: normalized.message,
        preview: null,
        errorKind: normalized.kind,
        statusCode: normalized.statusCode
      };
    }
  }

  private toProviderModelConfig(modelConfig: ModelConfig): ProviderModelConfig {
    return {
      provider: modelConfig.provider,
      manufacturer: modelConfig.manufacturer,
      model: modelConfig.model,
      authType: modelConfig.authType,
      endpoint: modelConfig.endpoint,
      endpoints: modelConfig.endpoints,
      apiKey: modelConfig.apiKey,
      capabilities: modelConfig.capabilities
    };
  }

  private normalizeError(err: unknown): { message: string; kind: ProviderError['kind'] | null; statusCode: number | null } {
    if (err instanceof ProviderError) {
      return {
        message: err.message,
        kind: err.kind,
        statusCode: err.statusCode ?? null
      };
    }
    if (err instanceof Error) {
      return {
        message: err.message,
        kind: null,
        statusCode: extractStatusCodeFromError(err.message)
      };
    }
    return {
      message: '连接测试失败',
      kind: null,
      statusCode: null
    };
  }
}
