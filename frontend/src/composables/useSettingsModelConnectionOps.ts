import { ref, type Ref } from 'vue';
import { testDraftModelConnection, testSavedModelConnection } from '@/api/settings-admin';
import type { ModelConnectionTestResult, ModelConfig } from '@/types/models';
import { toErrorMessage } from '@/utils/errors';
import {
  parseJsonRecord,
  parseJsonUnknownRecord,
  requiresApiKey,
  type ModelDraftLike
} from '@/composables/useSettingsModelConfigOps';

type UseSettingsModelConnectionOpsOptions<T extends ModelDraftLike> = {
  error: Ref<string>;
  newModel: Ref<T>;
  editingModel: Ref<T | null>;
};

const buildDraftPayload = <T extends ModelDraftLike>(
  draft: T,
  options: { requireApiKey: boolean }
): {
  type: 'text' | 'image' | 'video' | 'audio';
  name: string;
  provider: string;
  manufacturer: string;
  model: string;
  authType: 'bearer' | 'api_key' | 'none';
  endpoint: string;
  endpoints: Record<string, string>;
  apiKey?: string;
  capabilities: Record<string, unknown>;
  priority: number;
  rateLimit: number;
  isDefault: boolean;
  enabled?: boolean;
} => {
  if (
    !draft.name.trim() ||
    !draft.provider.trim() ||
    !draft.manufacturer.trim() ||
    !draft.model.trim() ||
    !draft.endpoint.trim() ||
    (options.requireApiKey && requiresApiKey(draft.authType) && !draft.apiKey.trim())
  ) {
    throw new Error('请完整填写模型配置后再测试连接');
  }

  return {
    type: draft.type,
    name: draft.name.trim(),
    provider: draft.provider.trim(),
    manufacturer: draft.manufacturer.trim(),
    model: draft.model.trim(),
    authType: draft.authType,
    endpoint: draft.endpoint.trim(),
    endpoints: parseJsonRecord(draft.endpointsText, 'endpoints'),
    ...(draft.apiKey.trim() ? { apiKey: draft.apiKey.trim() } : {}),
    capabilities: parseJsonUnknownRecord(draft.capabilitiesText, 'capabilities'),
    priority: Number(draft.priority) || 100,
    rateLimit: Number(draft.rateLimit) || 0,
    isDefault: draft.isDefault,
    ...(draft.enabled === undefined ? {} : { enabled: draft.enabled })
  };
};

export const useSettingsModelConnectionOps = <T extends ModelDraftLike>(options: UseSettingsModelConnectionOpsOptions<T>) => {
  const newModelConnectionLoading = ref(false);
  const editingModelConnectionLoading = ref(false);
  const savedModelConnectionLoadingId = ref('');
  const newModelConnectionResult = ref<ModelConnectionTestResult | null>(null);
  const editingModelConnectionResult = ref<ModelConnectionTestResult | null>(null);
  const savedModelConnectionResults = ref<Record<string, ModelConnectionTestResult>>({});

  const clearNewModelConnection = (): void => {
    newModelConnectionResult.value = null;
  };

  const clearEditingModelConnection = (): void => {
    editingModelConnectionResult.value = null;
  };

  const clearSavedModelConnection = (modelId: string): void => {
    const next = { ...savedModelConnectionResults.value };
    delete next[modelId];
    savedModelConnectionResults.value = next;
  };

  const testNewModelConnection = async (): Promise<void> => {
    newModelConnectionLoading.value = true;
    newModelConnectionResult.value = null;
    try {
      const payload = buildDraftPayload(options.newModel.value, { requireApiKey: true });
      newModelConnectionResult.value = await testDraftModelConnection(payload);
      options.error.value = '';
    } catch (err) {
      options.error.value = toErrorMessage(err, '测试模型连接失败');
    } finally {
      newModelConnectionLoading.value = false;
    }
  };

  const testEditingModelConnection = async (): Promise<void> => {
    if (!options.editingModel.value?.id) {
      options.error.value = '未找到待测试的模型';
      return;
    }
    editingModelConnectionLoading.value = true;
    editingModelConnectionResult.value = null;
    try {
      const payload = buildDraftPayload(options.editingModel.value, { requireApiKey: false });
      editingModelConnectionResult.value = await testSavedModelConnection(options.editingModel.value.id, payload);
      options.error.value = '';
    } catch (err) {
      options.error.value = toErrorMessage(err, '测试模型连接失败');
    } finally {
      editingModelConnectionLoading.value = false;
    }
  };

  const testSavedModelConnectionById = async (model: ModelConfig): Promise<void> => {
    savedModelConnectionLoadingId.value = model.id;
    clearSavedModelConnection(model.id);
    try {
      savedModelConnectionResults.value = {
        ...savedModelConnectionResults.value,
        [model.id]: await testSavedModelConnection(model.id)
      };
      options.error.value = '';
    } catch (err) {
      options.error.value = toErrorMessage(err, '测试模型连接失败');
    } finally {
      savedModelConnectionLoadingId.value = '';
    }
  };

  return {
    clearEditingModelConnection,
    clearNewModelConnection,
    clearSavedModelConnection,
    editingModelConnectionLoading,
    editingModelConnectionResult,
    newModelConnectionLoading,
    newModelConnectionResult,
    savedModelConnectionLoadingId,
    savedModelConnectionResults,
    testEditingModelConnection,
    testNewModelConnection,
    testSavedModelConnectionById
  };
};
