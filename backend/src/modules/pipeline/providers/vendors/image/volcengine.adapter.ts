import { ProviderValidationError } from '../../errors.js';
import { VendorImageAdapter } from './types.js';
import { getProviderOptions, normalizeAuthHeader, toJsonHeaders } from '../video/common.js';
import { createImageDirectRecipeAdapter } from '../../recipes/adapter-factories.js';

export const volcengineImageAdapter: VendorImageAdapter = createImageDirectRecipeAdapter({
  manufacturer: 'volcengine',
  buildRequest: ({ config, input, defaultEndpoint, defaultAuthHeader }) => {
    const submitUrl = config.endpoints.submit || config.endpoint || defaultEndpoint || '';
    if (!submitUrl) {
      throw new ProviderValidationError('volcengine image endpoint is not configured');
    }
    const options = getProviderOptions(input.providerOptions, 'volcengine');
    return {
      url: submitUrl,
      headers: toJsonHeaders(normalizeAuthHeader(config.authType, config.apiKey, defaultAuthHeader)),
      body: {
        model: config.model || input.model,
        prompt: input.prompt,
        response_format: 'url',
        ...(input.resolution ? { size: input.resolution } : {}),
        ...(input.aspectRatio ? { aspect_ratio: input.aspectRatio } : {}),
        ...(typeof options.seed === 'number' ? { seed: Math.floor(options.seed) } : {}),
        ...(typeof options.negativePrompt === 'string' ? { negative_prompt: options.negativePrompt } : {}),
        ...(typeof options.cfgScale === 'number' ? { cfg_scale: options.cfgScale } : {}),
        ...(typeof options.style === 'string' ? { style: options.style } : {})
      },
      errorPrefix: 'volcengine image failed'
    };
  },
  extract: (_ctx, data) => {
    const url = (data as { data?: Array<{ url?: string }> }).data?.[0]?.url;
    if (!url) {
      throw new ProviderValidationError('volcengine image response missing url');
    }
    return { url };
  }
});
