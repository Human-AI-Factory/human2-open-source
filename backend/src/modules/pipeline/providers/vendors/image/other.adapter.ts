import { ProviderValidationError } from '../../errors.js';
import { VendorImageAdapter } from './types.js';
import { normalizeAuthHeader, toJsonHeaders } from '../video/common.js';
import { createImageDirectRecipeAdapter } from '../../recipes/adapter-factories.js';

export const otherImageAdapter: VendorImageAdapter = createImageDirectRecipeAdapter({
  manufacturer: 'other',
  buildRequest: ({ config, input, defaultEndpoint, defaultAuthHeader }) => {
    const submitUrl = config.endpoints.submit || config.endpoint || defaultEndpoint || '';
    if (!submitUrl) {
      throw new ProviderValidationError('other image endpoint is not configured');
    }
    return {
      url: submitUrl,
      headers: toJsonHeaders(normalizeAuthHeader(config.authType, config.apiKey, defaultAuthHeader)),
      body: {
        model: config.model || input.model,
        prompt: input.prompt,
        ...(input.resolution ? { resolution: input.resolution } : {}),
        ...(input.aspectRatio ? { aspectRatio: input.aspectRatio } : {})
      },
      errorPrefix: 'other image generation failed'
    };
  },
  extract: (_ctx, data) => {
    const record = data as { url?: string; data?: Array<{ url?: string }>; imageUrl?: string };
    const url = record.url || record.imageUrl || record.data?.[0]?.url;
    if (!url) {
      throw new ProviderValidationError('other image response missing url');
    }
    return { url };
  }
});
