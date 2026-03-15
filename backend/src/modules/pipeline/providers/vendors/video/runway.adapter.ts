import { ProviderValidationError } from '../../errors.js';
import { VendorVideoAdapter } from './types.js';
import { getProviderOptions, normalizeAuthHeader, readTaskIdOrThrow, withIdempotencyHeader, toJsonHeaders } from './common.js';
import { createVideoPollingRecipeAdapter } from '../../recipes/adapter-factories.js';

export const runwayVideoAdapter: VendorVideoAdapter = createVideoPollingRecipeAdapter({
  manufacturer: 'runway',
  buildSubmitRequest: ({ config, input, defaultEndpoint, defaultAuthHeader }) => {
    const submitUrl = config.endpoints.submit || config.endpoints.text2video || config.endpoint || defaultEndpoint || '';
    if (!submitUrl) {
      throw new ProviderValidationError('runway submit endpoint is not configured');
    }
    const authHeaders = normalizeAuthHeader(config.authType, config.apiKey, defaultAuthHeader);
    const options = getProviderOptions(input.providerOptions, 'runway');

    // Check if this is image to video or text to video
    const isImageToVideo = !!(input.imageInputs?.length || input.imageWithRoles?.length);

    return {
      url: submitUrl,
      headers: toJsonHeaders(withIdempotencyHeader(authHeaders, input.idempotencyKey)),
      body: isImageToVideo
        ? {
            model: config.model || input.model || 'gen4.5',
            prompt_image: input.imageInputs?.[0] || input.imageWithRoles?.[0]?.url,
            promptText: input.prompt,
            ...(input.duration ? { duration: input.duration } : {}),
            ...(input.aspectRatio ? { ratio: input.aspectRatio } : {}),
            ...(typeof options.seed === 'number' ? { seed: Math.floor(options.seed) } : {})
          }
        : {
            model: config.model || input.model || 'gen4.5',
            promptText: input.prompt,
            ...(input.duration ? { duration: input.duration } : {}),
            ...(input.aspectRatio ? { ratio: input.aspectRatio } : {}),
            ...(typeof options.seed === 'number' ? { seed: Math.floor(options.seed) } : {})
          },
      errorPrefix: 'runway submit failed'
    };
  },
  onSubmit: (_ctx, data) => {
    const record = data as {
      id?: string;
      task_id?: string;
    };
    const taskId = record.id || record.task_id;
    if (!taskId) {
      throw new ProviderValidationError('runway submit response missing task id');
    }
    return { taskId };
  },
  buildPollRequest: ({ config, input, defaultAuthHeader }, state) => {
    const submitUrl = config.endpoints.submit || config.endpoint || '';
    const queryUrlTemplate = config.endpoints.query || `${submitUrl}/${state.taskId}`;
    return {
      url: queryUrlTemplate,
      method: 'GET',
      headers: toJsonHeaders(
        withIdempotencyHeader(normalizeAuthHeader(config.authType, config.apiKey, defaultAuthHeader), input.idempotencyKey)
      ),
      errorPrefix: 'runway query failed'
    };
  },
  onPoll: (_ctx, data, state) => {
    const record = data as {
      status?: string;
      output?: string[];
      task_id?: string;
    };

    const status = (record.status || '').toLowerCase();
    if (status === 'succeeded' || status === 'completed' || status === 'done') {
      const url = record.output?.[0];
      if (!url) {
        return { done: false, error: 'runway task succeeded without video url' };
      }
      return { done: true, value: { url, providerTaskId: state.taskId } };
    }

    if (status === 'failed' || status === 'error') {
      return { done: false, error: record.output?.[0] || 'runway task failed' };
    }

    return { done: false };
  },
  initialIntervalMs: 2_000,
  maxIntervalMs: 15_000,
  backoffMultiplier: 1.5,
  timeoutMs: (ctx) => Math.max(ctx.timeoutMs, 300_000),
  fallbackError: () => 'runway video polling timed out'
});
