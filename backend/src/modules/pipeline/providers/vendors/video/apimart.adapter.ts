import { ProviderValidationError } from '../../errors.js';
import { VendorVideoAdapter } from './types.js';
import { normalizeAuthHeader, withIdempotencyHeader, toJsonHeaders } from './common.js';
import { createVideoPollingRecipeAdapter } from '../../recipes/adapter-factories.js';
import { firstIdentifierAtPaths, firstNumberAtPaths, firstStatusAtPaths, firstStringAtPaths } from '../../recipes/extractors.js';

export const apimartVideoAdapter: VendorVideoAdapter = createVideoPollingRecipeAdapter({
  manufacturer: 'apimart',
  buildSubmitRequest: ({ config, input, defaultEndpoint, defaultAuthHeader }) => {
    const submitUrl = config.endpoints.submit || config.endpoints.generate || config.endpoint || defaultEndpoint || '';
    const queryUrlTemplate = config.endpoints.query || '';
    if (!submitUrl || !queryUrlTemplate) {
      throw new ProviderValidationError('apimart submit/query endpoints are not configured');
    }
    const authHeaders = normalizeAuthHeader(config.authType, config.apiKey, defaultAuthHeader);
    const imageUrls = Array.isArray(input.imageInputs)
      ? [...new Set(input.imageInputs.filter((item) => typeof item === 'string' && item.trim().length > 0))]
      : [];
    const imageWithRoles = Array.isArray(input.imageWithRoles)
      ? input.imageWithRoles
          .map((item) => ({ image_url: item.url, role: item.role }))
          .filter((item) => item.image_url.trim().length > 0)
      : [];
    return {
      url: submitUrl,
      headers: toJsonHeaders(withIdempotencyHeader(authHeaders, input.idempotencyKey)),
      body: {
        model: config.model || input.model,
        prompt: input.prompt,
        duration: input.duration ?? 5,
        aspect_ratio: input.aspectRatio ?? '16:9',
        ...(input.resolution ? { resolution: input.resolution } : {}),
        ...(imageUrls.length > 0 ? { image_urls: imageUrls } : {}),
        ...(imageWithRoles.length > 0 ? { image_with_roles: imageWithRoles } : {})
      },
      errorPrefix: 'apimart submit failed'
    };
  },
  onSubmit: (_ctx, data) => {
    const code = firstNumberAtPaths(data, ['code']);
    if (code !== 200) {
      throw new ProviderValidationError(`apimart submit failed: ${firstStringAtPaths(data, ['message']) || 'unknown error'}`);
    }
    const taskId = firstIdentifierAtPaths(data, ['data[0].task_id']);
    if (!taskId) {
      throw new ProviderValidationError('apimart submit response missing task id');
    }
    return { taskId };
  },
  buildPollRequest: ({ config, input, defaultEndpoint, defaultAuthHeader }, state) => ({
    url: config.endpoints.query.replace('{taskId}', state.taskId),
    method: 'GET',
    headers: toJsonHeaders(
      withIdempotencyHeader(normalizeAuthHeader(config.authType, config.apiKey, defaultAuthHeader), input.idempotencyKey)
    ),
    errorPrefix: 'apimart query failed'
  }),
  onPoll: (_ctx, data, state) => {
    const code = firstNumberAtPaths(data, ['code']);
    if (code !== 200) {
      return { done: false, error: 'apimart query failed' };
    }
    const status = firstStatusAtPaths(data, ['data.status']);
    if (status === 'completed') {
      const url = firstStringAtPaths(data, ['data.result.videos[0].url[0]', 'data.result.videos[0].url']);
      if (!url) {
        return { done: false, error: 'apimart task succeeded without video url' };
      }
      return { done: true, value: { url, providerTaskId: state.taskId } };
    }
    if (status === 'failed' || status === 'cancelled') {
      return { done: false, error: firstStringAtPaths(data, ['data.error.message']) || `apimart task ${status}` };
    }
    return { done: false };
  },
  timeoutMs: (ctx) => Math.max(ctx.timeoutMs, 180_000),
  fallbackError: () => 'apimart video polling timed out'
});
