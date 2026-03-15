import { ProviderValidationError } from '../../errors.js';
import { normalizeAuthHeader, toJsonHeaders } from '../video/common.js';
import { buildGeminiTextPayload, parseGeminiTextResponse, requireTextResponse } from './common.js';
import { VendorTextAdapter } from './types.js';
import { createTextDirectRecipeAdapter } from '../../recipes/adapter-factories.js';

export const geminiTextAdapter: VendorTextAdapter = createTextDirectRecipeAdapter({
  manufacturer: 'gemini',
  buildRequest: ({ config, input, defaultEndpoint }) => {
    const targetEndpointTemplate = config.endpoints.submit || config.endpoint || defaultEndpoint || '';
    if (!targetEndpointTemplate) {
      throw new ProviderValidationError('gemini text endpoint is not configured');
    }
    return {
      url: targetEndpointTemplate.replace('{model}', config.model || input.model || ''),
      headers: toJsonHeaders(normalizeAuthHeader(config.authType, config.apiKey, 'x-goog-api-key')),
      body: buildGeminiTextPayload(input),
      errorPrefix: 'gemini text generation failed'
    };
  },
  extract: (_ctx, data) => ({
    text: requireTextResponse(parseGeminiTextResponse(data), 'gemini')
  })
});
