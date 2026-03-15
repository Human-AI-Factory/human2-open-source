import { ProviderValidationError } from '../../errors.js';
import { VendorVideoAdapter } from './types.js';
import { getProviderOptions, normalizeAuthHeader, readPollingUrlResult, readTaskIdOrThrow, withIdempotencyHeader, toJsonHeaders } from './common.js';
import { createVideoPollingRecipeAdapter } from '../../recipes/adapter-factories.js';

export const volcengineVideoAdapter: VendorVideoAdapter = createVideoPollingRecipeAdapter({
  manufacturer: 'volcengine',
  buildSubmitRequest: ({ config, input, defaultEndpoint, defaultAuthHeader }) => {
    const submitUrl = config.endpoints.submit || config.endpoints.create || config.endpoint || defaultEndpoint || '';
    if (!submitUrl) {
      throw new ProviderValidationError('volcengine submit endpoint is not configured');
    }
    const authHeaders = normalizeAuthHeader(config.authType, config.apiKey, defaultAuthHeader);
    const options = getProviderOptions(input.providerOptions, 'volcengine');
    return {
      url: submitUrl,
      headers: toJsonHeaders(withIdempotencyHeader(authHeaders, input.idempotencyKey)),
      body: {
        model: config.model || input.model,
        prompt: input.prompt,
        duration: input.duration,
        resolution: input.resolution,
        aspectRatio: input.aspectRatio,
        audio: input.audio,
        projectId: input.projectId,
        storyboardId: input.storyboardId,
        ...(typeof options.seed === 'number' ? { seed: Math.floor(options.seed) } : {}),
        ...(typeof options.camera === 'object' && options.camera !== null ? { camera: options.camera } : {}),
        ...(typeof options.motionStrength === 'number' ? { motionStrength: options.motionStrength } : {}),
        ...(typeof options.watermark === 'boolean' ? { watermark: options.watermark } : {}),
        ...(typeof options.extendPrompt === 'boolean' ? { extendPrompt: options.extendPrompt } : {}),
        ...(typeof options.negativePrompt === 'string' ? { negativePrompt: options.negativePrompt } : {})
      },
      errorPrefix: 'volcengine submit failed'
    };
  },
  onSubmit: (_ctx, data) => ({
    taskId: readTaskIdOrThrow(data, ['id', 'taskId'], 'volcengine submit response missing task id')
  }),
  buildPollRequest: ({ config, input, defaultEndpoint, defaultAuthHeader }, state) => {
    const submitUrl = config.endpoints.submit || config.endpoints.create || config.endpoint || defaultEndpoint || '';
    const queryUrlTemplate = config.endpoints.query || `${submitUrl}/{taskId}`;
    return {
      url: queryUrlTemplate.replace('{taskId}', state.taskId),
      method: 'GET',
      headers: toJsonHeaders(
        withIdempotencyHeader(normalizeAuthHeader(config.authType, config.apiKey, defaultAuthHeader), input.idempotencyKey)
      ),
      errorPrefix: 'volcengine query failed'
    };
  },
  onPoll: (_ctx, data, state) =>
    readPollingUrlResult(data, {
      statusPaths: ['status', 'state'],
      successStatuses: ['succeeded', 'success', 'done'],
      failureStatuses: ['failed', 'cancelled', 'expired'],
      urlPaths: ['content.video_url', 'videoUrl', 'url'],
      errorPaths: ['error'],
      successWithoutUrlError: 'volcengine task succeeded without video url',
      defaultFailureMessage: 'volcengine task failed',
      providerTaskId: state.taskId
    }),
  fallbackError: () => 'volcengine video polling timed out'
});
