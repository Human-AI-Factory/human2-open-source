import type { ModelConfig } from '../../core/types.js';

export type VideoCapabilityCatalog = {
  root: Record<string, unknown>;
  modes: string[];
  durations: number[];
  resolutions: string[];
  aspectRatios: string[];
  audioSupported?: boolean;
  imageInputSupported?: boolean;
  endFrameSupported?: boolean;
};

export type AudioCapabilityCatalog = {
  root: Record<string, unknown>;
  voices: string[];
  speeds: number[];
  emotions: string[];
  formats: string[];
};

export type ImageCapabilityCatalog = {
  root: Record<string, unknown>;
  kinds: string[];
  resolutions: string[];
  aspectRatios: string[];
};

export class CapabilityCatalogService {
  getVideoCapabilities(modelConfig: ModelConfig | null): VideoCapabilityCatalog | null {
    if (!modelConfig) {
      return null;
    }
    const root = this.readNestedObject(modelConfig.capabilities, 'video') ?? modelConfig.capabilities;
    return {
      root,
      modes: this.readStringArray(root.modes),
      durations: this.readNumberArray(root.durations),
      resolutions: this.readStringArray(root.resolutions),
      aspectRatios: this.readStringArray(root.aspectRatios),
      audioSupported: typeof root.audioSupported === 'boolean' ? root.audioSupported : undefined,
      imageInputSupported: typeof root.imageInputSupported === 'boolean' ? root.imageInputSupported : undefined,
      endFrameSupported: typeof root.endFrameSupported === 'boolean' ? root.endFrameSupported : undefined,
    };
  }

  getAudioCapabilities(modelConfig: ModelConfig | null): AudioCapabilityCatalog | null {
    if (!modelConfig) {
      return null;
    }
    const root = this.readNestedObject(modelConfig.capabilities, 'audio') ?? modelConfig.capabilities;
    return {
      root,
      voices: this.readStringArray(root.voices),
      speeds: this.readFloatArray(root.speeds),
      emotions: this.readStringArray(root.emotions),
      formats: this.readStringArray(root.formats).map((item) => item.toLowerCase()),
    };
  }

  getImageCapabilities(modelConfig: ModelConfig | null): ImageCapabilityCatalog | null {
    if (!modelConfig) {
      return null;
    }
    const root = this.readNestedObject(modelConfig.capabilities, 'image') ?? modelConfig.capabilities;
    return {
      root,
      kinds: this.readStringArray(root.kinds),
      resolutions: this.readStringArray(root.resolutions),
      aspectRatios: this.readStringArray(root.aspectRatios),
    };
  }

  getProviderOptionRules(root: Record<string, unknown>): Record<string, unknown> | null {
    const raw = root.providerOptions;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return null;
    }
    return raw as Record<string, unknown>;
  }

  private readNestedObject(root: Record<string, unknown>, key: string): Record<string, unknown> | null {
    const value = root[key];
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private readStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter((item): item is string => typeof item === 'string');
  }

  private readNumberArray(value: unknown): number[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((item) => (typeof item === 'number' && Number.isFinite(item) ? item : null))
      .filter((item): item is number => item !== null)
      .map((item) => Math.floor(item));
  }

  private readFloatArray(value: unknown): number[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((item) => (typeof item === 'number' && Number.isFinite(item) ? Number(item.toFixed(2)) : null))
      .filter((item): item is number => item !== null);
  }
}

export const defaultCapabilityCatalogService = new CapabilityCatalogService();
