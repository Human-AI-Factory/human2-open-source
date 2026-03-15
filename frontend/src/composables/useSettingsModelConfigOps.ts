import type { Ref } from 'vue';
import { createModelConfig, deleteModelConfig, updateModelConfig } from '@/api/settings-admin';
import type { ModelConfig } from '@/types/models';
import { toErrorMessage } from '@/utils/errors';
import type { RuleEditorScope } from '@/composables/useSettingsProviderOptionRules';

export type ModelDraftLike = {
  id?: string;
  type: 'text' | 'image' | 'video' | 'audio';
  name: string;
  provider: string;
  manufacturer: string;
  model: string;
  authType: 'bearer' | 'api_key' | 'none';
  endpoint: string;
  endpointsText: string;
  capabilitiesText: string;
  apiKey: string;
  priority: number;
  rateLimit: number;
  isDefault: boolean;
  enabled?: boolean;
};

type UseSettingsModelConfigOpsOptions<T extends ModelDraftLike> = {
  error: Ref<string>;
  loading: Ref<boolean>;
  newModel: Ref<T>;
  editingModel: Ref<T | null>;
  capabilityPresets: Ref<Record<string, Record<string, Record<string, unknown>>>>;
  buildEmptyModelDraft: () => T;
  loadAll: () => Promise<void>;
  syncProviderOptionRulesFromCapabilities: (scope: RuleEditorScope) => void;
  resetNewProviderRuleState: () => void;
  resetEditProviderRuleState: () => void;
};

const defaultEndpointTemplates: Record<string, Record<string, string>> = {
  'text:atlascloud': { submit: 'https://api.atlascloud.ai/v1/chat/completions' },
  'text:apimart': { submit: 'https://api.apimart.ai/v1/chat/completions' },
  'text:modelscope': { submit: 'https://api-inference.modelscope.cn/v1/chat/completions' },
  'text:openai': { submit: 'https://api.openai.com/v1/chat/completions' },
  'text:deepseek': { submit: 'https://api.deepseek.com/v1/chat/completions' },
  'text:gemini': { submit: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent' },
  'text:other': { submit: 'https://api.example.com/v1/chat/completions' },
  'video:volcengine': {
    submit: 'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks',
    query: 'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/{taskId}'
  },
  'video:modelscope': {
    submit: 'https://api-inference.modelscope.cn/v1/videos/generations',
    query: 'https://api-inference.modelscope.cn/v1/tasks/{taskId}'
  },
  'video:kling': {
    submit: 'https://api-beijing.klingai.com/v1/videos/text2video',
    query: 'https://api-beijing.klingai.com/v1/videos/text2video/{taskId}'
  },
  'video:vidu': { submit: 'https://api.vidu.cn/ent/v2/text2video', query: 'https://api.vidu.cn/ent/v2/tasks' },
  'video:wan': {
    submit: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis',
    query: 'https://dashscope.aliyuncs.com/api/v1/tasks/{taskId}'
  },
  'video:runninghub': { submit: 'https://www.runninghub.cn/openapi/v2/rhart-video-s/text-to-video', query: 'https://www.runninghub.cn/openapi/v2/query' },
  'video:apimart': { submit: 'https://api.apimart.ai/v1/videos/generations', query: 'https://api.apimart.ai/v1/tasks/{taskId}' },
  'video:gemini': {
    submit: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:predictLongRunning',
    query: 'https://generativelanguage.googleapis.com/v1beta/{name}'
  },
  'image:volcengine': { submit: 'https://ark.cn-beijing.volces.com/api/v3/images/generations' },
  'image:modelscope': {
    submit: 'https://api-inference.modelscope.cn/v1/images/generations',
    query: 'https://api-inference.modelscope.cn/v1/tasks/{taskId}'
  },
  'image:kling': { submit: 'https://api-beijing.klingai.com/v1/images/omni-image' },
  'image:vidu': { submit: 'https://api.vidu.cn/ent/v2/reference2image', query: 'https://api.vidu.cn/ent/v2/tasks/{id}/creations' },
  'image:wan': {
    submit: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis',
    query: 'https://dashscope.aliyuncs.com/api/v1/tasks/{taskId}'
  },
  'image:runninghub': { submit: 'https://www.runninghub.cn/openapi/v2/rhart-image-n-pro/text-to-image', query: 'https://www.runninghub.cn/task/openapi/outputs' },
  'image:apimart': { submit: 'https://api.apimart.ai/v1/images/generations', query: 'https://api.apimart.ai/v1/tasks/{taskId}' },
  'image:gemini': { submit: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:predict', query: 'https://generativelanguage.googleapis.com/v1beta/{name}' },
  'audio:volcengine': { submit: 'https://ark.cn-beijing.volces.com/api/v3/audio/speech' },
  'audio:kling': { submit: 'https://api-beijing.klingai.com/v1/audio/speech' },
  'audio:vidu': { submit: 'https://api.vidu.cn/ent/v2/tts' },
  'audio:dashscope-cosyvoice': { submit: 'https://dashscope.aliyuncs.com/api/v1/services/audio/tts/realtimesynthesizer' },
  'audio:wan': { submit: 'https://dashscope.aliyuncs.com/api/v1/services/audio/tts/realtimesynthesizer' },
  'audio:runninghub': { submit: 'https://www.runninghub.cn/openapi/v2/tts' },
  'audio:apimart': { submit: 'https://api.apimart.ai/v1/audio/speech' },
  'audio:gemini': { submit: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateSpeech' },
  'audio:other': { submit: 'https://api.example.com/audio/generate' }
};

export const parseJsonRecord = (text: string, label: string): Record<string, string> => {
  if (!text.trim()) {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${label} 必须是合法 JSON`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} 必须是对象`);
  }
  return Object.entries(parsed as Record<string, unknown>).reduce<Record<string, string>>((acc, [key, value]) => {
    if (typeof value === 'string') {
      acc[key] = value;
    }
    return acc;
  }, {});
};

export const parseJsonUnknownRecord = (text: string, label: string): Record<string, unknown> => {
  if (!text.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`${label} 必须是对象`);
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    if (err instanceof Error && err.message.includes('必须是对象')) {
      throw err;
    }
    throw new Error(`${label} 必须是合法 JSON`);
  }
};

const readStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
};

const readNumberArray = (value: unknown): number[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'number' && Number.isFinite(item) ? Math.floor(item) : null))
    .filter((item): item is number => item !== null);
};

const cut = <T>(list: T[], limit: number): T[] => (list.length <= limit ? list : [...list.slice(0, limit - 1), (`+${list.length - limit + 1}` as T)]);

export const requiresApiKey = (authType: ModelDraftLike['authType']): boolean => authType !== 'none';

export const useSettingsModelConfigOps = <T extends ModelDraftLike>(options: UseSettingsModelConfigOpsOptions<T>) => {
  const inferRuleScopeForTarget = (target: T): RuleEditorScope =>
    options.editingModel.value && target === options.editingModel.value ? 'edit' : 'new';

  const createModel = async (): Promise<boolean> => {
    if (
      !options.newModel.value.name.trim() ||
      !options.newModel.value.provider.trim() ||
      !options.newModel.value.manufacturer.trim() ||
      !options.newModel.value.model.trim() ||
      !options.newModel.value.endpoint.trim() ||
      (requiresApiKey(options.newModel.value.authType) && !options.newModel.value.apiKey.trim())
    ) {
      options.error.value = '请完整填写模型配置';
      return false;
    }

    let endpoints: Record<string, string> = {};
    let capabilities: Record<string, unknown> = {};
    try {
      endpoints = parseJsonRecord(options.newModel.value.endpointsText, 'endpoints');
      capabilities = parseJsonUnknownRecord(options.newModel.value.capabilitiesText, 'capabilities');
    } catch (err) {
      options.error.value = err instanceof Error ? err.message : 'endpoints/capabilities 必须是合法 JSON';
      return false;
    }

    options.loading.value = true;
    try {
      await createModelConfig({
        type: options.newModel.value.type,
        name: options.newModel.value.name.trim(),
        provider: options.newModel.value.provider.trim(),
        manufacturer: options.newModel.value.manufacturer.trim(),
        model: options.newModel.value.model.trim(),
        authType: options.newModel.value.authType,
        endpoint: options.newModel.value.endpoint.trim(),
        endpoints,
        apiKey: options.newModel.value.apiKey.trim(),
        capabilities,
        priority: Number(options.newModel.value.priority) || 100,
        rateLimit: Number(options.newModel.value.rateLimit) || 0,
        isDefault: options.newModel.value.isDefault
      });
      options.newModel.value = options.buildEmptyModelDraft();
      options.resetNewProviderRuleState();
      await options.loadAll();
      return true;
    } catch (err) {
      options.error.value = toErrorMessage(err, '创建模型配置失败');
      return false;
    } finally {
      options.loading.value = false;
    }
  };

  const applyCapabilityPreset = (target: T = options.newModel.value): void => {
    const typeMap = options.capabilityPresets.value[target.type];
    if (!typeMap) {
      options.error.value = '当前类型没有可用预置';
      return;
    }
    const preset = typeMap[target.manufacturer.trim().toLowerCase()];
    if (!preset) {
      options.error.value = `未找到厂商 ${target.manufacturer} 的能力预置`;
      return;
    }
    target.capabilitiesText = JSON.stringify({ [target.type]: preset }, null, 2);
    options.syncProviderOptionRulesFromCapabilities(inferRuleScopeForTarget(target));
    options.error.value = '';
  };

  const fillDefaultEndpoints = (target: T = options.newModel.value): void => {
    const manufacturer = target.manufacturer.trim().toLowerCase();
    const key = `${target.type}:${manufacturer}`;
    const picked = defaultEndpointTemplates[key];
    if (!picked) {
      options.error.value = `未找到 ${key} 的默认端点模板`;
      return;
    }
    target.endpointsText = JSON.stringify(picked, null, 2);
    if (picked.submit && !target.endpoint.trim()) {
      target.endpoint = picked.submit;
    }
    options.error.value = '';
  };

  const startEditModel = (model: ModelConfig): void => {
    options.editingModel.value = {
      id: model.id,
      type: model.type,
      name: model.name,
      provider: model.provider,
      manufacturer: model.manufacturer,
      model: model.model,
      authType: model.authType,
      endpoint: model.endpoint,
      endpointsText: JSON.stringify(model.endpoints ?? {}, null, 2),
      capabilitiesText: JSON.stringify(model.capabilities ?? {}, null, 2),
      apiKey: '',
      priority: model.priority,
      rateLimit: model.rateLimit,
      isDefault: model.isDefault,
      enabled: model.enabled
    } as T;
    options.syncProviderOptionRulesFromCapabilities('edit');
  };

  const cancelEditModel = (): void => {
    options.editingModel.value = null;
    options.resetEditProviderRuleState();
  };

  const saveEditModel = async (): Promise<boolean> => {
    if (!options.editingModel.value?.id) {
      return false;
    }
    if (
      !options.editingModel.value.name.trim() ||
      !options.editingModel.value.provider.trim() ||
      !options.editingModel.value.manufacturer.trim() ||
      !options.editingModel.value.model.trim() ||
      !options.editingModel.value.endpoint.trim()
    ) {
      options.error.value = '请完整填写编辑后的模型配置';
      return false;
    }

    let endpoints: Record<string, string> = {};
    let capabilities: Record<string, unknown> = {};
    try {
      endpoints = parseJsonRecord(options.editingModel.value.endpointsText, 'endpoints');
      capabilities = parseJsonUnknownRecord(options.editingModel.value.capabilitiesText, 'capabilities');
    } catch (err) {
      options.error.value = err instanceof Error ? err.message : 'endpoints/capabilities 必须是合法 JSON';
      return false;
    }

    options.loading.value = true;
    try {
      await updateModelConfig(options.editingModel.value.id, {
        name: options.editingModel.value.name.trim(),
        provider: options.editingModel.value.provider.trim(),
        manufacturer: options.editingModel.value.manufacturer.trim(),
        model: options.editingModel.value.model.trim(),
        authType: options.editingModel.value.authType,
        endpoint: options.editingModel.value.endpoint.trim(),
        endpoints,
        capabilities,
        priority: Number(options.editingModel.value.priority) || 100,
        rateLimit: Number(options.editingModel.value.rateLimit) || 0,
        isDefault: options.editingModel.value.isDefault,
        enabled: options.editingModel.value.enabled ?? true,
        ...(options.editingModel.value.apiKey.trim() ? { apiKey: options.editingModel.value.apiKey.trim() } : {})
      });
      options.editingModel.value = null;
      options.resetEditProviderRuleState();
      await options.loadAll();
      return true;
    } catch (err) {
      options.error.value = toErrorMessage(err, '更新模型配置失败');
      return false;
    } finally {
      options.loading.value = false;
    }
  };

  const capabilitySummary = (model: ModelConfig): string[] => {
    const root = model.capabilities ?? {};
    const scope =
      (model.type === 'video' && root.video && typeof root.video === 'object' && !Array.isArray(root.video)
        ? (root.video as Record<string, unknown>)
        : model.type === 'image' && root.image && typeof root.image === 'object' && !Array.isArray(root.image)
          ? (root.image as Record<string, unknown>)
          : root) ?? {};

    const tags: string[] = [];
    if (model.type === 'video') {
      const modes = readStringArray(scope.modes);
      const durations = readNumberArray(scope.durations);
      const resolutions = readStringArray(scope.resolutions);
      const ratios = readStringArray(scope.aspectRatios);
      const audioSupported = typeof scope.audioSupported === 'boolean' ? scope.audioSupported : undefined;
      if (modes.length) tags.push(`模式: ${cut(modes, 3).join('/')}`);
      if (durations.length) tags.push(`时长: ${cut(durations.map((duration) => `${duration}s`), 3).join('/')}`);
      if (resolutions.length) tags.push(`分辨率: ${cut(resolutions, 3).join('/')}`);
      if (ratios.length) tags.push(`比例: ${cut(ratios, 3).join('/')}`);
      if (audioSupported !== undefined) tags.push(`音频: ${audioSupported ? '支持' : '不支持'}`);
    } else if (model.type === 'image') {
      const kinds = readStringArray(scope.kinds);
      const resolutions = readStringArray(scope.resolutions);
      const ratios = readStringArray(scope.aspectRatios);
      if (kinds.length) tags.push(`类型: ${cut(kinds, 3).join('/')}`);
      if (resolutions.length) tags.push(`分辨率: ${cut(resolutions, 3).join('/')}`);
      if (ratios.length) tags.push(`比例: ${cut(ratios, 3).join('/')}`);
    } else if (model.type === 'audio') {
      const voices = readStringArray(scope.voices);
      const speeds = readNumberArray(scope.speeds);
      const emotions = readStringArray(scope.emotions);
      const formats = readStringArray(scope.formats);
      if (voices.length) tags.push(`音色: ${cut(voices, 3).join('/')}`);
      if (speeds.length) tags.push(`语速: ${cut(speeds.map((speed) => `${speed}x`), 3).join('/')}`);
      if (emotions.length) tags.push(`情绪: ${cut(emotions, 3).join('/')}`);
      if (formats.length) tags.push(`格式: ${cut(formats, 3).join('/')}`);
    }
    return tags.slice(0, 5);
  };

  const setDefault = async (modelId: string): Promise<void> => {
    try {
      await updateModelConfig(modelId, { isDefault: true });
      await options.loadAll();
    } catch (err) {
      options.error.value = toErrorMessage(err, '设置默认模型失败');
    }
  };

  const toggleEnabled = async (modelId: string, enabled: boolean): Promise<void> => {
    try {
      await updateModelConfig(modelId, { enabled });
      await options.loadAll();
    } catch (err) {
      options.error.value = toErrorMessage(err, '更新模型状态失败');
    }
  };

  const removeModel = async (modelId: string): Promise<boolean> => {
    try {
      await deleteModelConfig(modelId);
      await options.loadAll();
      return true;
    } catch (err) {
      options.error.value = toErrorMessage(err, '删除模型配置失败');
      return false;
    }
  };

  return {
    applyCapabilityPreset,
    capabilitySummary,
    cancelEditModel,
    createModel,
    fillDefaultEndpoints,
    removeModel,
    saveEditModel,
    setDefault,
    startEditModel,
    toggleEnabled
  };
};
