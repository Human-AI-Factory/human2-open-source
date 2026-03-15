import { watch, type Ref } from 'vue';
import {
  createAudioTask,
  createDramaAudioTask
} from '@/api/workflow-ops';
import {
  createDramaTimelineAudioTasksBatch,
  createTimelineAudioTasksBatch
} from '@/api/timeline-editor';
import type {
  ModelConfig
} from '@/types/models';

type StoryboardOption = {
  id: string;
  title: string;
  episodeId: string | null;
};

type UseWorkflowAudioTaskOpsOptions = {
  hasDramaScopedApi: Ref<boolean>;
  dramaId: Ref<string>;
  projectId: Ref<string>;
  workflowMode: Ref<'single' | 'batch'>;
  workflowScopeEpisodeId: Ref<string>;
  episodeBatchIds: Ref<string[]>;
  selectedEpisodeIds: Ref<string[]>;
  loading: Ref<boolean>;
  error: Ref<string>;
  audioModels: Ref<ModelConfig[]>;
  storyboards: Ref<StoryboardOption[]>;
  audioStoryboardId: Ref<string>;
  audioModelId: Ref<string>;
  audioPriority: Ref<'low' | 'medium' | 'high'>;
  audioVoice: Ref<string>;
  audioSpeedText: Ref<string>;
  audioEmotion: Ref<string>;
  audioFormat: Ref<string>;
  audioProviderOptionsText: Ref<string>;
  audioOpsMessage: Ref<string>;
  selectedAudioModel: Ref<ModelConfig | null>;
  audioVoiceOptions: Ref<string[]>;
  audioSpeedOptions: Ref<number[]>;
  audioEmotionOptions: Ref<string[]>;
  audioFormatOptions: Ref<string[]>;
  audioProviderOptionRuleRoot: Ref<Record<string, unknown>>;
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

const validateProviderOptionByRule = (pathKey: string, value: unknown, rule: Record<string, unknown>): void => {
  const type = typeof rule.type === 'string' ? rule.type : '';
  if (type === 'string') {
    if (typeof value !== 'string') {
      throw new Error(`providerOptions.${pathKey} 必须是 string`);
    }
    if (typeof rule.maxLength === 'number' && value.length > Math.floor(rule.maxLength)) {
      throw new Error(`providerOptions.${pathKey} 长度不能超过 ${Math.floor(rule.maxLength)}`);
    }
    const enums = Array.isArray(rule.enum) ? rule.enum.filter((item): item is string => typeof item === 'string') : [];
    if (enums.length > 0 && !enums.includes(value)) {
      throw new Error(`providerOptions.${pathKey} 不支持值 ${value}`);
    }
    return;
  }
  if (type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`providerOptions.${pathKey} 必须是 number`);
    }
    if (rule.integer === true && !Number.isInteger(value)) {
      throw new Error(`providerOptions.${pathKey} 必须是 integer`);
    }
    if (typeof rule.min === 'number' && value < rule.min) {
      throw new Error(`providerOptions.${pathKey} 不能小于 ${rule.min}`);
    }
    if (typeof rule.max === 'number' && value > rule.max) {
      throw new Error(`providerOptions.${pathKey} 不能大于 ${rule.max}`);
    }
    const enums = Array.isArray(rule.enum)
      ? rule.enum.filter((item): item is number => typeof item === 'number' && Number.isFinite(item))
      : [];
    if (enums.length > 0 && !enums.includes(value)) {
      throw new Error(`providerOptions.${pathKey} 不支持值 ${value}`);
    }
    return;
  }
  if (type === 'boolean') {
    if (typeof value !== 'boolean') {
      throw new Error(`providerOptions.${pathKey} 必须是 boolean`);
    }
    return;
  }
  if (type === 'object') {
    const node = asRecord(value);
    if (!node) {
      throw new Error(`providerOptions.${pathKey} 必须是 object`);
    }
    const props = asRecord(rule.properties);
    if (!props) {
      throw new Error(`providerOptions.${pathKey} 规则无效`);
    }
    for (const key of Object.keys(node)) {
      if (!(key in props)) {
        throw new Error(`providerOptions.${pathKey}.${key} 不支持`);
      }
      const childRule = asRecord(props[key]);
      if (!childRule) {
        throw new Error(`providerOptions.${pathKey}.${key} 规则无效`);
      }
      validateProviderOptionByRule(`${pathKey}.${key}`, node[key], childRule);
    }
    return;
  }
  throw new Error(`providerOptions.${pathKey} 规则类型无效`);
};

export const useWorkflowAudioTaskOps = (options: UseWorkflowAudioTaskOpsOptions) => {
  const parseAndValidateAudioProviderOptions = (): Record<string, unknown> | undefined => {
    const text = options.audioProviderOptionsText.value.trim();
    if (!text) {
      return undefined;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('providerOptions 必须是合法 JSON');
    }
    const node = asRecord(parsed);
    if (!node) {
      throw new Error('providerOptions 必须是对象');
    }
    const rules = options.audioProviderOptionRuleRoot.value;
    if (Object.keys(rules).length > 0) {
      for (const key of Object.keys(node)) {
        const rule = asRecord(rules[key]);
        if (!rule) {
          throw new Error(`providerOptions.${key} 不支持`);
        }
        validateProviderOptionByRule(key, node[key], rule);
      }
    }
    return Object.keys(node).length > 0 ? node : undefined;
  };

  const syncAudioSelections = (): void => {
    if (options.audioVoiceOptions.value.length > 0 && !options.audioVoiceOptions.value.includes(options.audioVoice.value)) {
      options.audioVoice.value = options.audioVoiceOptions.value[0];
    }
    if (options.audioEmotionOptions.value.length > 0 && !options.audioEmotionOptions.value.includes(options.audioEmotion.value)) {
      options.audioEmotion.value = options.audioEmotionOptions.value[0];
    }
    if (
      options.audioFormatOptions.value.length > 0 &&
      !options.audioFormatOptions.value.map((item) => item.toLowerCase()).includes(options.audioFormat.value.toLowerCase())
    ) {
      options.audioFormat.value = options.audioFormatOptions.value[0];
    }
    if (options.audioSpeedOptions.value.length > 0) {
      const current = options.audioSpeedText.value.trim() ? Number(options.audioSpeedText.value) : NaN;
      if (!Number.isFinite(current) || !options.audioSpeedOptions.value.includes(current)) {
        options.audioSpeedText.value = String(options.audioSpeedOptions.value[0]);
      }
    }
  };

  const ensureAudioDefaults = (): void => {
    if (!options.audioModelId.value && options.audioModels.value.length > 0) {
      const defaultModel = options.audioModels.value.find((item) => item.isDefault) ?? options.audioModels.value[0];
      options.audioModelId.value = defaultModel.id;
    }
    if (!options.audioStoryboardId.value && options.storyboards.value.length > 0) {
      options.audioStoryboardId.value = options.storyboards.value[0].id;
    }
    if (!options.audioFormat.value && options.audioFormatOptions.value.length > 0) {
      options.audioFormat.value = options.audioFormatOptions.value[0];
    }
    syncAudioSelections();
  };

  watch(options.audioModelId, () => {
    syncAudioSelections();
  });

  const createWorkflowAudioTask = async (): Promise<void> => {
    if (!options.audioStoryboardId.value) {
      options.error.value = '请先选择分镜';
      return;
    }
    const model = options.selectedAudioModel.value;
    if (!model) {
      options.error.value = '请先选择音频模型';
      return;
    }
    const voice = options.audioVoice.value.trim() || undefined;
    const emotion = options.audioEmotion.value.trim() || undefined;
    const format = options.audioFormat.value.trim().toLowerCase() || undefined;
    const speed = options.audioSpeedText.value.trim() ? Number(options.audioSpeedText.value) : undefined;

    if (voice && options.audioVoiceOptions.value.length > 0 && !options.audioVoiceOptions.value.includes(voice)) {
      options.error.value = `当前模型不支持音色 ${voice}`;
      return;
    }
    if (emotion && options.audioEmotionOptions.value.length > 0 && !options.audioEmotionOptions.value.includes(emotion)) {
      options.error.value = `当前模型不支持情绪 ${emotion}`;
      return;
    }
    if (
      format &&
      options.audioFormatOptions.value.length > 0 &&
      !options.audioFormatOptions.value.map((item) => item.toLowerCase()).includes(format)
    ) {
      options.error.value = `当前模型不支持格式 ${format}`;
      return;
    }
    if (speed !== undefined) {
      if (!Number.isFinite(speed)) {
        options.error.value = 'speed 必须是数字';
        return;
      }
      if (options.audioSpeedOptions.value.length > 0 && !options.audioSpeedOptions.value.includes(speed)) {
        options.error.value = `当前模型不支持语速 ${speed}`;
        return;
      }
    }

    let providerOptions: Record<string, unknown> | undefined;
    try {
      providerOptions = parseAndValidateAudioProviderOptions();
    } catch (err) {
      options.error.value = err instanceof Error ? err.message : 'providerOptions 校验失败';
      return;
    }

    options.loading.value = true;
    try {
      const payload = {
        storyboardId: options.audioStoryboardId.value,
        priority: options.audioPriority.value,
        modelId: model.id,
        voice,
        speed,
        emotion,
        format: format as 'mp3' | 'wav' | 'aac' | 'flac' | 'ogg' | undefined,
        providerOptions
      };
      const task = options.hasDramaScopedApi.value
        ? await createDramaAudioTask(options.dramaId.value, payload)
        : await createAudioTask(options.projectId.value, payload);
      options.audioOpsMessage.value = `已创建音频任务 ${task.id}（status=${task.status}）`;
      options.error.value = '';
    } catch (err) {
      options.error.value = err instanceof Error ? err.message : '创建音频任务失败';
    } finally {
      options.loading.value = false;
    }
  };

  const resolveDialogueEpisodeIds = (): string[] => {
    if (options.workflowMode.value === 'single') {
      if (options.workflowScopeEpisodeId.value) {
        return [options.workflowScopeEpisodeId.value];
      }
      const selectedStoryboard = options.storyboards.value.find((item) => item.id === options.audioStoryboardId.value);
      if (selectedStoryboard?.episodeId) {
        return [selectedStoryboard.episodeId];
      }
      return [];
    }
    if (options.episodeBatchIds.value.length > 0) {
      return [...new Set(options.episodeBatchIds.value)];
    }
    if (options.selectedEpisodeIds.value.length > 0) {
      return [...new Set(options.selectedEpisodeIds.value)];
    }
    return [
      ...new Set(
        options.storyboards.value
          .map((item) => item.episodeId)
          .filter((item): item is string => typeof item === 'string' && item.length > 0)
      )
    ];
  };

  const createWorkflowDialogueTasks = async (): Promise<void> => {
    const targetEpisodeIds = resolveDialogueEpisodeIds();
    const model = options.selectedAudioModel.value;
    if (targetEpisodeIds.length === 0) {
      options.error.value = '请先选择分集作用域，或选择一个已绑定分集的分镜';
      return;
    }
    if (!model) {
      options.error.value = '请先选择音频模型';
      return;
    }
    const voice = options.audioVoice.value.trim() || undefined;
    const emotion = options.audioEmotion.value.trim() || undefined;
    const format = options.audioFormat.value.trim().toLowerCase() || undefined;
    const speed = options.audioSpeedText.value.trim() ? Number(options.audioSpeedText.value) : undefined;

    if (voice && options.audioVoiceOptions.value.length > 0 && !options.audioVoiceOptions.value.includes(voice)) {
      options.error.value = `当前模型不支持音色 ${voice}`;
      return;
    }
    if (emotion && options.audioEmotionOptions.value.length > 0 && !options.audioEmotionOptions.value.includes(emotion)) {
      options.error.value = `当前模型不支持情绪 ${emotion}`;
      return;
    }
    if (
      format &&
      options.audioFormatOptions.value.length > 0 &&
      !options.audioFormatOptions.value.map((item) => item.toLowerCase()).includes(format)
    ) {
      options.error.value = `当前模型不支持格式 ${format}`;
      return;
    }
    if (speed !== undefined) {
      if (!Number.isFinite(speed)) {
        options.error.value = 'speed 必须是数字';
        return;
      }
      if (options.audioSpeedOptions.value.length > 0 && !options.audioSpeedOptions.value.includes(speed)) {
        options.error.value = `当前模型不支持语速 ${speed}`;
        return;
      }
    }

    let providerOptions: Record<string, unknown> | undefined;
    try {
      providerOptions = parseAndValidateAudioProviderOptions();
    } catch (err) {
      options.error.value = err instanceof Error ? err.message : 'providerOptions 校验失败';
      return;
    }

    options.loading.value = true;
    try {
      let createdTaskCount = 0;
      let createdStoryboardCount = 0;
      let skippedStoryboardCount = 0;
      let speakerCount = 0;
      let usedConfiguredTextModel = false;
      let fallback = false;
      let modelLabel: string | null = null;

      for (const episodeId of targetEpisodeIds) {
        const payload = {
          episodeId,
          priority: options.audioPriority.value,
          modelId: model.id,
          voice,
          speed,
          emotion,
          format: format as 'mp3' | 'wav' | 'aac' | 'flac' | 'ogg' | undefined,
          providerOptions
        };
        const result = options.hasDramaScopedApi.value
          ? await createDramaTimelineAudioTasksBatch(options.dramaId.value, payload)
          : await createTimelineAudioTasksBatch(options.projectId.value, payload);
        createdTaskCount += result.createdTaskCount;
        createdStoryboardCount += result.createdStoryboardIds.length;
        skippedStoryboardCount += result.skippedStoryboardIds.length;
        speakerCount += result.speakerCount;
        usedConfiguredTextModel = usedConfiguredTextModel || result.usedConfiguredTextModel;
        fallback = fallback || result.fallback;
        modelLabel = modelLabel || result.modelLabel;
      }

      options.audioOpsMessage.value = `已为 ${targetEpisodeIds.length} 个分集创建 ${createdTaskCount} 条对白音频任务，覆盖 ${createdStoryboardCount} 个分镜，角色声部 ${speakerCount}${
        usedConfiguredTextModel ? `，对白规划模型：${modelLabel || '已配置文本模型'}` : fallback ? '，当前为回退对白规划' : ''
      }；跳过 ${skippedStoryboardCount} 个已有对白任务的分镜`;
      options.error.value = '';
    } catch (err) {
      options.error.value = err instanceof Error ? err.message : '批量生成对白任务失败';
    } finally {
      options.loading.value = false;
    }
  };

  return {
    createWorkflowAudioTask,
    createWorkflowDialogueTasks,
    ensureAudioDefaults
  };
};
