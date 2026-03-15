import { ProviderCapability } from './types.js';

export const DEFAULT_HTTP_PROVIDER_CAPABILITIES: ProviderCapability[] = [
  { provider: 'http', taskType: 'text', enabled: true },
  { provider: 'http', taskType: 'image', enabled: true },
  {
    provider: 'http',
    taskType: 'video',
    enabled: true,
    modes: ['text', 'singleImage', 'startEnd', 'multiImage', 'reference'],
    audioSupported: true
  },
  { provider: 'http', taskType: 'audio', enabled: true },
  { provider: 'http', taskType: 'embedding', enabled: true },
  { provider: 'http', taskType: 'asr', enabled: true }
];

export const DEFAULT_MOCK_PROVIDER_CAPABILITIES: ProviderCapability[] = [
  { provider: 'mock', taskType: 'text', enabled: true },
  { provider: 'mock', taskType: 'image', enabled: true },
  {
    provider: 'mock',
    taskType: 'video',
    enabled: true,
    modes: ['text', 'singleImage', 'startEnd', 'multiImage', 'reference'],
    durations: [3, 5, 8],
    resolutions: ['720p', '1080p'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    audioSupported: true
  },
  { provider: 'mock', taskType: 'audio', enabled: true },
  { provider: 'mock', taskType: 'embedding', enabled: true },
  { provider: 'mock', taskType: 'asr', enabled: true }
];
