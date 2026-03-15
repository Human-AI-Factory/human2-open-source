import { ProviderValidationError } from '../../errors.js';
import { normalizeAuthHeader, toJsonHeaders } from '../video/common.js';
import { buildOpenAiChatPayload, parseOpenAiTextResponse, requireTextResponse } from './common.js';
import { VendorTextAdapter } from './types.js';
import { createTextDirectRecipeAdapter } from '../../recipes/adapter-factories.js';

export const openAiCompatibleTextAdapter: VendorTextAdapter = createTextDirectRecipeAdapter({
  manufacturer: 'openai-compatible',
  buildRequest: ({ config, input, defaultEndpoint, defaultAuthHeader }) => {
    const targetEndpoint = config.endpoints.submit || config.endpoint || defaultEndpoint || '';
    if (!targetEndpoint) {
      throw new ProviderValidationError('openai-compatible text endpoint is not configured');
    }
    return {
      url: targetEndpoint,
      headers: toJsonHeaders(normalizeAuthHeader(config.authType, config.apiKey, defaultAuthHeader)),
      body: buildOpenAiChatPayload(input, { endpoint: targetEndpoint }),
      errorPrefix: 'openai-compatible text generation failed'
    };
  },
  extract: (_ctx, data) => ({
    text: requireTextResponse(parseOpenAiTextResponse(data), 'openai-compatible')
  })
});
