import type { AudioTaskParams, ModelConfig, VideoTask, VideoTaskParams } from '../../core/types.js';
import { type SqliteStore } from '../../db/sqlite.js';
import { getProviderOptions } from '../pipeline/providers/vendors/video/common.js';
import type { ProviderModelConfig } from '../pipeline/providers/types.js';
import { CapabilityCatalogService, defaultCapabilityCatalogService } from './capability-catalog.service.js';
import { PROVIDER_CAPABILITY_PRESETS } from '../settings/capability-presets.js';

const ALLOWED_VIDEO_MODES = new Set(['text', 'singleImage', 'startEnd', 'multiImage', 'reference']);
const CAPABILITY_PRESET_LOOKUP = PROVIDER_CAPABILITY_PRESETS as unknown as Record<
  'text' | 'image' | 'video' | 'audio',
  Record<string, Record<string, unknown>>
>;

export class MediaModelPolicyService {
  constructor(
    private readonly store: SqliteStore,
    private readonly capabilityCatalog: CapabilityCatalogService = defaultCapabilityCatalogService
  ) {}

  resolveModelName(
    type: 'text' | 'image' | 'video' | 'audio',
    modelId?: string,
    customModel?: string
  ): string | undefined {
    if (modelId) {
      const picked = this.store.getModelConfigById(modelId);
      if (picked && picked.type === type && picked.enabled) {
        return picked.name;
      }
    }
    if (customModel?.trim()) {
      return customModel.trim();
    }
    return this.store.getDefaultModelConfig(type)?.name ?? this.getSingleEnabledModelConfig(type)?.name;
  }

  /**
   * 根据生成模式选择模型
   * - t2i (text-to-image): 使用默认模型
   * - img2img: 查找支持 img2img 模式的模型
   */
  resolveImageModelByMode(mode: 't2i' | 'img2img', preferredModelId?: string, customModel?: string): string | undefined {
    // 如果用户明确指定了模型，直接使用
    if (preferredModelId) {
      const picked = this.store.getModelConfigById(preferredModelId);
      if (picked && picked.type === 'image' && picked.enabled) {
        return picked.name;
      }
    }
    if (customModel?.trim()) {
      return customModel.trim();
    }

    // 根据模式查找模型
    if (mode === 'img2img') {
      const img2imgModels = this.store.listModelConfigs('image').filter((m) => {
        if (!m.enabled) return false;
        const caps = m.capabilities as Record<string, unknown> | null;
        if (!caps || typeof caps !== 'object') return false;
        const imageCaps = caps.image as Record<string, unknown> | null;
        if (!imageCaps || typeof imageCaps !== 'object') return false;
        const modes = imageCaps.modes as string[] | null;
        return modes?.includes('img2img') ?? false;
      });
      if (img2imgModels.length > 0) {
        // 返回第一个支持 img2img 的模型
        return img2imgModels[0].name;
      }
    }

    // 回退到默认模型
    return this.store.getDefaultModelConfig('image')?.name ?? this.getSingleEnabledModelConfig('image')?.name;
  }

  pickModelConfig(type: 'text' | 'image' | 'video' | 'audio', modelName?: string): ModelConfig | null {
    if (modelName?.trim()) {
      const matched = this.store.findEnabledModelConfigByName(type, modelName.trim());
      if (matched) {
        return this.applyCapabilityPreset(type, matched);
      }
    }
    const fallback = this.store.getDefaultModelConfig(type) ?? this.getSingleEnabledModelConfig(type);
    return fallback ? this.applyCapabilityPreset(type, fallback) : null;
  }

  private getSingleEnabledModelConfig(type: 'text' | 'image' | 'video' | 'audio'): ModelConfig | null {
    const enabled = this.store.listModelConfigs(type).filter((item) => item.enabled);
    return enabled.length === 1 ? enabled[0] ?? null : null;
  }

  private applyCapabilityPreset(type: 'text' | 'image' | 'video' | 'audio', modelConfig: ModelConfig): ModelConfig {
    const presetGroup = CAPABILITY_PRESET_LOOKUP[type];
    const preset = presetGroup?.[modelConfig.manufacturer];
    if (!preset) {
      return modelConfig;
    }

    const root =
      modelConfig.capabilities &&
      typeof modelConfig.capabilities === 'object' &&
      !Array.isArray(modelConfig.capabilities) &&
      type in modelConfig.capabilities &&
      modelConfig.capabilities[type] &&
      typeof modelConfig.capabilities[type] === 'object' &&
      !Array.isArray(modelConfig.capabilities[type])
        ? (modelConfig.capabilities[type] as Record<string, unknown>)
        : modelConfig.capabilities;

    const mergedRoot: Record<string, unknown> = {
      ...preset,
      ...root,
      modes: this.mergeStringArrays(preset.modes, root.modes),
      durations: this.mergeNumberArrays(preset.durations, root.durations),
      resolutions: this.mergeStringArrays(preset.resolutions, root.resolutions),
      aspectRatios: this.mergeStringArrays(preset.aspectRatios, root.aspectRatios),
      voices: this.mergeStringArrays(preset.voices, root.voices),
      emotions: this.mergeStringArrays(preset.emotions, root.emotions),
      formats: this.mergeStringArrays(preset.formats, root.formats),
      speeds: this.mergeFloatArrays(preset.speeds, root.speeds),
      providerOptions:
        preset.providerOptions || root.providerOptions
          ? {
              ...(typeof preset.providerOptions === 'object' && preset.providerOptions && !Array.isArray(preset.providerOptions)
                ? preset.providerOptions
                : {}),
              ...(typeof root.providerOptions === 'object' && root.providerOptions && !Array.isArray(root.providerOptions)
                ? root.providerOptions
                : {})
            }
          : undefined
    };

    const capabilities =
      modelConfig.capabilities &&
      typeof modelConfig.capabilities === 'object' &&
      !Array.isArray(modelConfig.capabilities) &&
      type in modelConfig.capabilities
        ? {
            ...modelConfig.capabilities,
            [type]: mergedRoot
          }
        : mergedRoot;

    return {
      ...modelConfig,
      capabilities
    };
  }

  private mergeStringArrays(...values: unknown[]): string[] | undefined {
    const merged = [...new Set(values.flatMap((value) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [])))];
    return merged.length > 0 ? merged : undefined;
  }

  private mergeNumberArrays(...values: unknown[]): number[] | undefined {
    const merged = [
      ...new Set(
        values.flatMap((value) =>
          Array.isArray(value)
            ? value
                .map((item) => (typeof item === 'number' && Number.isFinite(item) ? Math.floor(item) : null))
                .filter((item): item is number => item !== null)
            : []
        )
      )
    ];
    return merged.length > 0 ? merged : undefined;
  }

  private mergeFloatArrays(...values: unknown[]): number[] | undefined {
    const merged = [
      ...new Set(
        values.flatMap((value) =>
          Array.isArray(value)
            ? value
                .map((item) => (typeof item === 'number' && Number.isFinite(item) ? Number(item.toFixed(2)) : null))
                .filter((item): item is number => item !== null)
            : []
        )
      )
    ];
    return merged.length > 0 ? merged : undefined;
  }

  normalizeVideoTaskParams(raw: VideoTask['params']): VideoTaskParams {
    const next: VideoTaskParams = {};
    if (raw.mode && ALLOWED_VIDEO_MODES.has(raw.mode)) {
      next.mode = raw.mode;
    }
    if (typeof raw.duration === 'number' && Number.isFinite(raw.duration)) {
      next.duration = Math.max(1, Math.floor(raw.duration));
    }
    if (typeof raw.resolution === 'string' && raw.resolution.trim()) {
      next.resolution = raw.resolution.trim();
    }
    if (typeof raw.aspectRatio === 'string' && raw.aspectRatio.trim()) {
      next.aspectRatio = raw.aspectRatio.trim();
    }
    if (typeof raw.audio === 'boolean') {
      next.audio = raw.audio;
    }
    if (Array.isArray(raw.imageInputs)) {
      const imageInputs = raw.imageInputs.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
      if (imageInputs.length > 0) {
        next.imageInputs = imageInputs.slice(0, 8);
      }
    }
    if (Array.isArray(raw.imageWithRoles)) {
      const imageWithRoles = raw.imageWithRoles
        .map((item) => {
          if (!item || typeof item !== 'object' || Array.isArray(item)) {
            return null;
          }
          const url = typeof item.url === 'string' && item.url.trim() ? item.url.trim() : '';
          const role =
            typeof item.role === 'string' && ['first_frame', 'last_frame', 'reference'].includes(item.role)
              ? (item.role as 'first_frame' | 'last_frame' | 'reference')
              : null;
          return url && role ? { url, role } : null;
        })
        .filter((item): item is { url: string; role: 'first_frame' | 'last_frame' | 'reference' } => Boolean(item));
      if (imageWithRoles.length > 0) {
        next.imageWithRoles = imageWithRoles.slice(0, 8);
      }
    }
    if (typeof raw.endFrame === 'string' && raw.endFrame.trim()) {
      next.endFrame = raw.endFrame.trim();
    }
    if (raw.providerOptions && typeof raw.providerOptions === 'object' && !Array.isArray(raw.providerOptions)) {
      next.providerOptions = raw.providerOptions;
    }
    if (typeof raw.autoPolicyApplied === 'number' && Number.isFinite(raw.autoPolicyApplied)) {
      next.autoPolicyApplied = Math.max(0, Math.floor(raw.autoPolicyApplied));
    }
    return next;
  }

  normalizeAudioTaskParams(raw: AudioTaskParams): AudioTaskParams {
    const next: AudioTaskParams = {};
    if (typeof raw.trackKind === 'string' && ['narration', 'dialogue', 'ambience', 'music'].includes(raw.trackKind)) {
      next.trackKind = raw.trackKind as 'narration' | 'dialogue' | 'ambience' | 'music';
    }
    if (typeof raw.speaker === 'string' && raw.speaker.trim()) {
      next.speaker = raw.speaker.trim();
    }
    if (typeof raw.sourceText === 'string' && raw.sourceText.trim()) {
      next.sourceText = raw.sourceText.trim();
    }
    if (typeof raw.segmentIndex === 'number' && Number.isFinite(raw.segmentIndex)) {
      next.segmentIndex = Math.max(0, Math.floor(raw.segmentIndex));
    }
    if (typeof raw.segmentStartMs === 'number' && Number.isFinite(raw.segmentStartMs)) {
      next.segmentStartMs = Math.max(0, Math.floor(raw.segmentStartMs));
    }
    if (typeof raw.segmentEndMs === 'number' && Number.isFinite(raw.segmentEndMs)) {
      next.segmentEndMs = Math.max(0, Math.floor(raw.segmentEndMs));
    }
    if (typeof raw.voice === 'string' && raw.voice.trim()) {
      next.voice = raw.voice.trim();
    }
    if (typeof raw.speed === 'number' && Number.isFinite(raw.speed)) {
      next.speed = Number(raw.speed.toFixed(2));
    }
    if (typeof raw.emotion === 'string' && raw.emotion.trim()) {
      next.emotion = raw.emotion.trim();
    }
    if (typeof raw.format === 'string' && raw.format.trim()) {
      next.format = raw.format.trim().toLowerCase();
    }
    if (raw.providerOptions && typeof raw.providerOptions === 'object' && !Array.isArray(raw.providerOptions)) {
      next.providerOptions = raw.providerOptions;
    }
    return next;
  }

  validateVideoTaskParams(modelConfig: ModelConfig | null, params: VideoTaskParams): void {
    if (
      !params.mode &&
      params.duration === undefined &&
      !params.resolution &&
      !params.aspectRatio &&
      params.audio === undefined &&
      !params.imageInputs &&
      !params.endFrame &&
      !params.providerOptions
    ) {
      return;
    }

    if (params.mode && !ALLOWED_VIDEO_MODES.has(params.mode)) {
      throw new Error(`Invalid video mode: ${params.mode}`);
    }

    if ((params.imageInputs || params.imageWithRoles) && !['singleImage', 'multiImage', 'reference', 'startEnd'].includes(params.mode ?? '')) {
      throw new Error('visual references require mode singleImage, multiImage, reference or startEnd');
    }
    if (params.mode === 'singleImage' && params.imageInputs && params.imageInputs.length !== 1) {
      throw new Error('singleImage mode requires exactly one image input');
    }
    if (params.mode === 'singleImage' && params.imageWithRoles && params.imageWithRoles.length !== 1) {
      throw new Error('singleImage mode requires exactly one role-based image input');
    }
    if (params.mode === 'multiImage' && params.imageInputs && params.imageInputs.length < 2) {
      throw new Error('multiImage mode requires at least two image inputs');
    }
    if (params.mode === 'multiImage' && params.imageWithRoles && params.imageWithRoles.length < 2) {
      throw new Error('multiImage mode requires at least two role-based image inputs');
    }
    if (params.endFrame && params.mode !== 'startEnd') {
      throw new Error('endFrame requires mode startEnd');
    }
    if (
      params.mode === 'startEnd' &&
      !params.endFrame &&
      !(params.imageWithRoles?.some((item) => item.role === 'first_frame') && params.imageWithRoles?.some((item) => item.role === 'last_frame'))
    ) {
      throw new Error('startEnd mode requires endFrame or first/last frame references');
    }

    const capabilities = this.capabilityCatalog.getVideoCapabilities(modelConfig);
    if (!capabilities || !modelConfig) {
      return;
    }

    if (params.mode && capabilities.modes.length > 0 && !capabilities.modes.includes(params.mode)) {
      throw new Error(`Model ${modelConfig.name} does not support mode ${params.mode}`);
    }
    if (params.duration !== undefined && capabilities.durations.length > 0 && !capabilities.durations.includes(params.duration)) {
      throw new Error(`Model ${modelConfig.name} does not support duration ${params.duration}`);
    }
    if (params.resolution && capabilities.resolutions.length > 0 && !capabilities.resolutions.includes(params.resolution)) {
      throw new Error(`Model ${modelConfig.name} does not support resolution ${params.resolution}`);
    }
    if (params.aspectRatio && capabilities.aspectRatios.length > 0 && !capabilities.aspectRatios.includes(params.aspectRatio)) {
      throw new Error(`Model ${modelConfig.name} does not support aspect ratio ${params.aspectRatio}`);
    }
    if (params.audio === true && capabilities.audioSupported === false) {
      throw new Error(`Model ${modelConfig.name} does not support audio generation`);
    }
    if ((params.imageInputs && params.imageInputs.length > 0) || (params.imageWithRoles && params.imageWithRoles.length > 0)) {
      if (capabilities.imageInputSupported === false) {
        throw new Error(`Model ${modelConfig.name} does not support image inputs`);
      }
    }
    if (params.endFrame && capabilities.endFrameSupported === false) {
      throw new Error(`Model ${modelConfig.name} does not support end-frame mode`);
    }
    this.validateProviderOptions(modelConfig, capabilities.root, params.providerOptions);
  }

  validateAudioTaskParams(modelConfig: ModelConfig | null, params: AudioTaskParams): void {
    if (!params.voice && params.speed === undefined && !params.emotion && !params.format && !params.providerOptions) {
      return;
    }
    const capabilities = this.capabilityCatalog.getAudioCapabilities(modelConfig);
    if (!capabilities || !modelConfig) {
      return;
    }

    if (params.voice && capabilities.voices.length > 0 && !capabilities.voices.includes(params.voice)) {
      throw new Error(`Model ${modelConfig.name} does not support voice ${params.voice}`);
    }
    if (params.speed !== undefined && capabilities.speeds.length > 0 && !capabilities.speeds.includes(params.speed)) {
      throw new Error(`Model ${modelConfig.name} does not support speed ${params.speed}`);
    }
    if (params.emotion && capabilities.emotions.length > 0 && !capabilities.emotions.includes(params.emotion)) {
      throw new Error(`Model ${modelConfig.name} does not support emotion ${params.emotion}`);
    }
    if (params.format && capabilities.formats.length > 0 && !capabilities.formats.includes(params.format.toLowerCase())) {
      throw new Error(`Model ${modelConfig.name} does not support format ${params.format}`);
    }
    this.validateProviderOptions(modelConfig, capabilities.root, params.providerOptions);
  }

  validateImageGenerationParams(
    modelConfig: ModelConfig | null,
    kind: 'storyboard' | 'asset',
    input: { resolution?: string; aspectRatio?: string; providerOptions?: Record<string, unknown> }
  ): void {
    const capabilities = this.capabilityCatalog.getImageCapabilities(modelConfig);
    if (!capabilities || !modelConfig) {
      return;
    }
    if (capabilities.kinds.length > 0 && !capabilities.kinds.includes(kind)) {
      throw new Error(`Model ${modelConfig.name} does not support image kind ${kind}`);
    }
    if (input.resolution && capabilities.resolutions.length > 0 && !capabilities.resolutions.includes(input.resolution)) {
      throw new Error(`Model ${modelConfig.name} does not support image resolution ${input.resolution}`);
    }
    if (input.aspectRatio && capabilities.aspectRatios.length > 0 && !capabilities.aspectRatios.includes(input.aspectRatio)) {
      throw new Error(`Model ${modelConfig.name} does not support image aspect ratio ${input.aspectRatio}`);
    }
    this.validateProviderOptions(modelConfig, capabilities.root, input.providerOptions);
  }

  toProviderModelConfig(modelConfig: ModelConfig): ProviderModelConfig {
    return {
      provider: modelConfig.provider,
      manufacturer: modelConfig.manufacturer,
      model: modelConfig.model,
      authType: modelConfig.authType,
      endpoint: modelConfig.endpoint,
      endpoints: modelConfig.endpoints,
      apiKey: modelConfig.apiKey,
      capabilities: modelConfig.capabilities,
    };
  }

  private validateProviderOptions(
    modelConfig: ModelConfig,
    capabilityRoot: Record<string, unknown>,
    rawProviderOptions: Record<string, unknown> | undefined
  ): void {
    if (!rawProviderOptions || Object.keys(rawProviderOptions).length === 0) {
      return;
    }
    const scopedOptions = getProviderOptions(rawProviderOptions, modelConfig.manufacturer);
    if (Object.keys(scopedOptions).length === 0) {
      return;
    }
    const providerOptionRules = this.capabilityCatalog.getProviderOptionRules(capabilityRoot);
    if (!providerOptionRules) {
      return;
    }
    for (const [key, value] of Object.entries(scopedOptions)) {
      const ruleRaw = providerOptionRules[key];
      if (!ruleRaw || typeof ruleRaw !== 'object' || Array.isArray(ruleRaw)) {
        throw new Error(`Model ${modelConfig.name} does not support provider option ${key}`);
      }
      this.validateProviderOptionByRule(key, value, ruleRaw as Record<string, unknown>);
    }
  }

  private validateProviderOptionByRule(pathKey: string, value: unknown, rule: Record<string, unknown>): void {
    const type = typeof rule.type === 'string' ? rule.type : '';
    if (type === 'string') {
      if (typeof value !== 'string') {
        throw new Error(`Provider option ${pathKey} requires string`);
      }
      if (typeof rule.maxLength === 'number' && value.length > Math.floor(rule.maxLength)) {
        throw new Error(`Provider option ${pathKey} exceeds max length ${Math.floor(rule.maxLength)}`);
      }
      if (Array.isArray(rule.enum)) {
        const enumValues = rule.enum.filter((item): item is string => typeof item === 'string');
        if (enumValues.length > 0 && !enumValues.includes(value)) {
          throw new Error(`Provider option ${pathKey} does not support value ${value}`);
        }
      }
      return;
    }
    if (type === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`Provider option ${pathKey} requires number`);
      }
      if (rule.integer === true && !Number.isInteger(value)) {
        throw new Error(`Provider option ${pathKey} requires integer`);
      }
      if (typeof rule.min === 'number' && value < rule.min) {
        throw new Error(`Provider option ${pathKey} must be >= ${rule.min}`);
      }
      if (typeof rule.max === 'number' && value > rule.max) {
        throw new Error(`Provider option ${pathKey} must be <= ${rule.max}`);
      }
      if (Array.isArray(rule.enum)) {
        const enumValues = rule.enum.filter((item): item is number => typeof item === 'number' && Number.isFinite(item));
        if (enumValues.length > 0 && !enumValues.includes(value)) {
          throw new Error(`Provider option ${pathKey} does not support value ${value}`);
        }
      }
      return;
    }
    if (type === 'boolean') {
      if (typeof value !== 'boolean') {
        throw new Error(`Provider option ${pathKey} requires boolean`);
      }
      return;
    }
    if (type === 'object') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`Provider option ${pathKey} requires object`);
      }
      const propertiesRaw = rule.properties;
      if (!propertiesRaw || typeof propertiesRaw !== 'object' || Array.isArray(propertiesRaw)) {
        throw new Error(`Provider option ${pathKey} has invalid object rule`);
      }
      const properties = propertiesRaw as Record<string, unknown>;
      for (const key of Object.keys(value as Record<string, unknown>)) {
        if (!(key in properties)) {
          throw new Error(`Provider option ${pathKey}.${key} is not supported`);
        }
      }
      for (const [key, childValue] of Object.entries(value as Record<string, unknown>)) {
        const childRule = properties[key];
        if (!childRule || typeof childRule !== 'object' || Array.isArray(childRule)) {
          throw new Error(`Provider option ${pathKey}.${key} has invalid capability rule`);
        }
        this.validateProviderOptionByRule(`${pathKey}.${key}`, childValue, childRule as Record<string, unknown>);
      }
      return;
    }
    throw new Error(`Provider option ${pathKey} has invalid capability rule`);
  }
}
