import { ProviderValidationError } from '../../errors.js';
import { VendorVideoAdapter } from './types.js';
import { getProviderOptions, readPollingUrlResult, readTaskIdOrThrow, sanitizeApiKey, withIdempotencyHeader, toJsonHeaders } from './common.js';
import { createVideoPollingRecipeAdapter } from '../../recipes/adapter-factories.js';

export const viduVideoAdapter: VendorVideoAdapter = createVideoPollingRecipeAdapter({
  manufacturer: 'vidu',
  buildSubmitRequest: ({ config, input, defaultEndpoint }) => {
    const submitUrl = config.endpoints.submit || config.endpoints.text2video || config.endpoint || defaultEndpoint || '';
    const queryUrl = config.endpoints.query || '';
    if (!submitUrl || !queryUrl) {
      throw new ProviderValidationError('vidu submit/query endpoints are not configured');
    }
    const authHeaders: Record<string, string> = {};
    if (config.authType !== 'none') {
      authHeaders.Authorization =
        config.authType === 'api_key' ? `Token ${sanitizeApiKey(config.apiKey)}` : `Bearer ${sanitizeApiKey(config.apiKey)}`;
    }
    const options = getProviderOptions(input.providerOptions, 'vidu');
    return {
      url: submitUrl,
      headers: toJsonHeaders(withIdempotencyHeader(authHeaders, input.idempotencyKey)),
      body: {
        model: config.model || input.model,
        prompt: input.prompt,
        duration: input.duration,
        aspect_ratio: input.aspectRatio,
        resolution: input.resolution,
        audio: input.audio,
        projectId: input.projectId,
        storyboardId: input.storyboardId,
        ...(typeof options.seed === 'number' ? { seed: Math.floor(options.seed) } : {}),
        ...(typeof options.style === 'string' ? { style: options.style } : {}),
        ...(typeof options.movementAmplitude === 'number' ? { movement_amplitude: options.movementAmplitude } : {}),
        ...(typeof options.negativePrompt === 'string' ? { negative_prompt: options.negativePrompt } : {}),
        ...(typeof options.enhancePrompt === 'boolean' ? { enhance_prompt: options.enhancePrompt } : {})
      },
      errorPrefix: 'vidu submit failed'
    };
  },
  onSubmit: (_ctx, data) => ({
    taskId: readTaskIdOrThrow(data, ['task_id', 'taskId'], 'vidu submit response missing task id')
  }),
  buildPollRequest: ({ config, input }, state) => {
    const authHeaders: Record<string, string> = {};
    if (config.authType !== 'none') {
      authHeaders.Authorization =
        config.authType === 'api_key' ? `Token ${sanitizeApiKey(config.apiKey)}` : `Bearer ${sanitizeApiKey(config.apiKey)}`;
    }
    return {
      url: `${config.endpoints.query}?task_ids=${encodeURIComponent(state.taskId)}`,
      method: 'GET',
      headers: toJsonHeaders(withIdempotencyHeader(authHeaders, input.idempotencyKey)),
      errorPrefix: 'vidu query failed'
    };
  },
  onPoll: (_ctx, data, state) =>
    readPollingUrlResult(data, {
      statusPaths: ['tasks[0].state'],
      successStatuses: ['success', 'done'],
      failureStatuses: ['failed'],
      urlArrayPaths: [{ arrayPaths: ['tasks[0].creations'], itemPaths: ['url'] }],
      successWithoutUrlError: 'vidu task succeeded without video url',
      defaultFailureMessage: 'vidu task failed',
      providerTaskId: state.taskId
    }),
  fallbackError: () => 'vidu video polling timed out'
});
