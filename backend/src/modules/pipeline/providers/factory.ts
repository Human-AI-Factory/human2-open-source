import { HttpAiProvider } from './http.provider.js';
import { ModelConfigAwareAiProvider } from './model-config-aware.provider.js';
import { MockAiProvider } from './mock.provider.js';
import { AiProvider } from './types.js';

export const createAiProvider = (input: {
  provider: string;
  textEndpoint: string;
  imageEndpoint: string;
  videoEndpoint: string;
  audioEndpoint: string;
  timeoutMs: number;
  authHeader: string;
  apiKey: string;
  maxRetries: number;
  retryDelayMs: number;
}): AiProvider => {
  const httpProvider = new HttpAiProvider(
    input.textEndpoint,
    input.imageEndpoint,
    input.videoEndpoint,
    input.audioEndpoint,
    input.timeoutMs,
    input.authHeader,
    input.apiKey,
    input.maxRetries,
    input.retryDelayMs
  );

  if (input.provider === 'http') {
    return httpProvider;
  }

  return new ModelConfigAwareAiProvider(httpProvider, new MockAiProvider());
};
