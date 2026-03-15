import { ProviderValidationError } from '../../errors.js';
import { VendorAudioAdapter } from './types.js';
import { extractAudioUrl, extractTaskId } from './common.js';
import { normalizeAuthHeader, toJsonHeaders } from '../video/common.js';
import { createAudioPollingRecipeAdapter } from '../../recipes/adapter-factories.js';

export const apimartAudioAdapter: VendorAudioAdapter = createAudioPollingRecipeAdapter({
  manufacturer: 'apimart',
  buildSubmitRequest: ({ config, input, defaultEndpoint, defaultAuthHeader }) => {
    const submitUrl = config.endpoints.submit || config.endpoint || defaultEndpoint || '';
    if (!submitUrl) {
      throw new ProviderValidationError('apimart audio endpoint is not configured');
    }
    return {
      url: submitUrl,
      headers: toJsonHeaders(normalizeAuthHeader(config.authType, config.apiKey, defaultAuthHeader)),
      responseType: 'binary-or-json',
      body: {
        model: config.model || input.model,
        input: input.prompt,
        ...(input.voice ? { voice: input.voice } : {}),
        ...(input.speed !== undefined ? { speed: input.speed } : {}),
        ...(input.format ? { response_format: input.format } : {}),
      },
      errorPrefix: 'apimart audio submit failed'
    };
  },
  onSubmit: (_ctx, submitData) => {
    const direct = extractAudioUrl(submitData);
    return {
      ...(direct ? { directResult: { url: direct } } : {}),
      ...(extractTaskId(submitData) ? { taskId: extractTaskId(submitData) ?? undefined } : {})
    };
  },
  buildPollRequest: ({ config, defaultAuthHeader }, state) => {
    if (!config.endpoints.query) {
      throw new ProviderValidationError('apimart audio query endpoint is not configured');
    }
    return {
      url: config.endpoints.query.replace('{taskId}', state.taskId),
      method: 'GET',
      headers: toJsonHeaders(normalizeAuthHeader(config.authType, config.apiKey, defaultAuthHeader)),
      errorPrefix: 'apimart audio query failed'
    };
  },
  onPoll: (_ctx, data) => {
    const url = extractAudioUrl(data);
    if (url) {
      return { done: true, value: { url } };
    }
    const status = String(
      (typeof data === 'object' && data && 'status' in data ? (data as { status?: unknown }).status : '') ||
        (typeof data === 'object' && data && 'state' in data ? (data as { state?: unknown }).state : '')
    ).toLowerCase();
    if (status === 'failed' || status === 'cancelled' || status === 'error') {
      return { done: false, error: `apimart audio task ${status}` };
    }
    return { done: false };
  },
  fallbackError: () => 'apimart audio polling timed out'
});
