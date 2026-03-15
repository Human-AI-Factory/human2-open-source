import { DEFAULT_HTTP_PROVIDER_CAPABILITIES, DEFAULT_MOCK_PROVIDER_CAPABILITIES } from '../pipeline/providers/capabilities.js';
import type { ProviderCapability, ProviderTaskType } from '../pipeline/providers/types.js';

export type ProviderDescriptor = {
  provider: string;
  label: string;
  transport: 'http' | 'mock';
  aliases: string[];
  notes?: string;
  capabilities: ProviderCapability[];
};

const PROVIDER_DESCRIPTORS: ProviderDescriptor[] = [
  {
    provider: 'http',
    label: 'HTTP Compatible',
    transport: 'http',
    aliases: [
      'http',
      'generic',
      'openai-compatible',
      'openai_compatible',
      'compat',
      'azure-openai',
      'azure_openai',
      'vidu',
      'doubao',
      'volcengine',
      'kling',
      'hailuo',
      'wanx',
      'cosyvoice',
      'dashscope-cosyvoice',
      'runway',
      'luma',
      'gemini',
      'google',
      'deepseek',
      'apimart',
      'anthropic',
      'qwen',
      'minimax'
    ],
    notes: 'Canonical transport for third-party text/image/video/audio vendors.',
    capabilities: DEFAULT_HTTP_PROVIDER_CAPABILITIES
  },
  {
    provider: 'mock',
    label: 'Mock',
    transport: 'mock',
    aliases: ['mock', 'demo', 'test', 'fake', 'stub'],
    notes: 'Deterministic provider for local development and contract tests.',
    capabilities: DEFAULT_MOCK_PROVIDER_CAPABILITIES
  }
];

const buildAliasMap = (): Map<string, ProviderDescriptor> => {
  const map = new Map<string, ProviderDescriptor>();
  for (const descriptor of PROVIDER_DESCRIPTORS) {
    for (const alias of [descriptor.provider, ...descriptor.aliases]) {
      map.set(alias.trim().toLowerCase(), descriptor);
    }
  }
  return map;
};

const PROVIDER_ALIAS_MAP = buildAliasMap();

const cloneCapabilities = (capabilities: ProviderCapability[]): ProviderCapability[] => capabilities.map((item) => ({ ...item }));

export class ProviderRegistryService {
  listProviderDescriptors(): ProviderDescriptor[] {
    return PROVIDER_DESCRIPTORS.map((descriptor) => ({
      ...descriptor,
      aliases: [...descriptor.aliases],
      capabilities: cloneCapabilities(descriptor.capabilities)
    }));
  }

  getProviderCatalogCapabilities(): Record<string, ProviderCapability[]> {
    return Object.fromEntries(this.listProviderDescriptors().map((descriptor) => [descriptor.provider, descriptor.capabilities]));
  }

  listProviderNames(): string[] {
    return PROVIDER_DESCRIPTORS.map((item) => item.provider).sort();
  }

  resolveProviderName(provider: string): string {
    const normalized = provider.trim().toLowerCase();
    return PROVIDER_ALIAS_MAP.get(normalized)?.provider ?? normalized;
  }

  resolveProviderDescriptor(provider: string): ProviderDescriptor | null {
    const normalized = provider.trim().toLowerCase();
    const descriptor = PROVIDER_ALIAS_MAP.get(normalized);
    if (!descriptor) {
      return null;
    }
    return {
      ...descriptor,
      aliases: [...descriptor.aliases],
      capabilities: cloneCapabilities(descriptor.capabilities)
    };
  }

  normalizeModelProviderInput(input: { provider: string; manufacturer?: string | null }): { provider: string; manufacturer: string } {
    const rawProvider = input.provider.trim().toLowerCase();
    const descriptor = this.resolveProviderDescriptor(rawProvider);
    if (!descriptor) {
      return {
        provider: rawProvider,
        manufacturer: input.manufacturer?.trim() || rawProvider
      };
    }
    return {
      provider: descriptor.provider,
      manufacturer: input.manufacturer?.trim() || (rawProvider === descriptor.provider ? descriptor.provider : rawProvider)
    };
  }

  getProviderCapabilities(provider: string): ProviderCapability[] {
    const descriptor = this.resolveProviderDescriptor(provider);
    return descriptor ? cloneCapabilities(descriptor.capabilities) : [];
  }

  supportsTaskType(provider: string, taskType: ProviderTaskType): boolean {
    return this.getProviderCapabilities(provider).some((item) => item.taskType === taskType && item.enabled);
  }
}

export const defaultProviderRegistryService = new ProviderRegistryService();
