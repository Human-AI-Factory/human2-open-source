import { ProviderValidationError } from '../../errors.js';
import { VendorImageAdapter } from './types.js';
import { normalizeAuthHeader, toJsonHeaders } from '../video/common.js';
import { createImagePollingRecipeAdapter } from '../../recipes/adapter-factories.js';
import { firstIdentifierAtPaths, firstNumberAtPaths, firstStatusAtPaths, firstStringAtPaths } from '../../recipes/extractors.js';

export const apimartImageAdapter: VendorImageAdapter = createImagePollingRecipeAdapter({
  manufacturer: 'apimart',
  buildSubmitRequest: ({ config, input, defaultEndpoint, defaultAuthHeader }) => {
    const submitUrl = config.endpoints.submit || config.endpoint || defaultEndpoint || '';
    const queryUrlTemplate = config.endpoints.query || '';
    if (!submitUrl || !queryUrlTemplate) {
      throw new ProviderValidationError('apimart image submit/query endpoints are not configured');
    }
    return {
      url: submitUrl,
      headers: toJsonHeaders(normalizeAuthHeader(config.authType, config.apiKey, defaultAuthHeader)),
      body: {
        model: config.model || input.model,
        prompt: input.prompt,
        n: 1,
        ...(input.resolution ? { resolution: input.resolution } : {}),
        ...(input.aspectRatio ? { size: input.aspectRatio } : {})
      },
      errorPrefix: 'apimart image submit failed'
    };
  },
  onSubmit: (_ctx, submitData) => {
    const code = firstNumberAtPaths(submitData, ['code']);
    const taskId = firstIdentifierAtPaths(submitData, ['data[0].task_id']);
    if (code !== 200 || !taskId) {
      throw new ProviderValidationError('apimart image submit response invalid');
    }
    return { taskId };
  },
  buildPollRequest: ({ config, defaultAuthHeader }, state) => ({
    url: config.endpoints.query.replace('{taskId}', state.taskId),
    method: 'GET',
    headers: toJsonHeaders(normalizeAuthHeader(config.authType, config.apiKey, defaultAuthHeader)),
    errorPrefix: 'apimart image query failed'
  }),
  onPoll: (_ctx, data) => {
    const code = firstNumberAtPaths(data, ['code']);
    if (code !== 200) {
      return { done: false, error: 'apimart image query failed' };
    }
    const status = firstStatusAtPaths(data, ['data.status']);
    if (status === 'completed') {
      const url = firstStringAtPaths(data, ['data.result.images[0].url[0]', 'data.result.images[0].url']);
      if (!url) {
        return { done: false, error: 'apimart image done without url' };
      }
      return { done: true, value: { url } };
    }
    if (status === 'failed' || status === 'cancelled') {
      return {
        done: false,
        error: firstStringAtPaths(data, ['data.error.message']) || `apimart image ${status}`
      };
    }
    return { done: false };
  },
  timeoutMs: (ctx) => Math.max(ctx.timeoutMs, 180_000),
  fallbackError: (_ctx, state) => `apimart image polling timed out (taskId=${state.taskId})`
});
