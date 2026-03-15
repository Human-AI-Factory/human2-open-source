import { ProviderValidationError } from '../../errors.js';
import { VendorVideoAdapter } from './types.js';
import { normalizeAuthHeader, withIdempotencyHeader, toJsonHeaders } from './common.js';
import { createVideoPollingRecipeAdapter } from '../../recipes/adapter-factories.js';
import { readPollingUrlResult, readTaskIdOrThrow } from '../polling.js';

export const geminiVideoAdapter: VendorVideoAdapter = createVideoPollingRecipeAdapter({
  manufacturer: 'gemini',
  buildSubmitRequest: ({ config, input, defaultEndpoint }) => {
    const submitUrlTemplate = config.endpoints.submit || config.endpoints.predict || config.endpoint || defaultEndpoint || '';
    const queryUrlTemplate = config.endpoints.query || '';
    if (!submitUrlTemplate || !queryUrlTemplate) {
      throw new ProviderValidationError('gemini submit/query endpoints are not configured');
    }
    return {
      url: submitUrlTemplate.replace('{model}', config.model || input.model || ''),
      headers: toJsonHeaders(withIdempotencyHeader(normalizeAuthHeader(config.authType, config.apiKey, 'x-goog-api-key'), input.idempotencyKey)),
      body: {
        instances: [{ prompt: input.prompt }],
        parameters: {
          aspectRatio: input.aspectRatio ?? '16:9',
          durationSeconds: input.duration ?? 5,
          ...(input.resolution ? { resolution: input.resolution } : {})
        }
      },
      errorPrefix: 'gemini submit failed'
    };
  },
  onSubmit: (_ctx, data) => ({
    taskId: readTaskIdOrThrow(data, ['name'], 'gemini submit response missing operation name')
  }),
  buildPollRequest: ({ config, input }, state) => ({
    url: config.endpoints.query.replace('{name}', state.taskId),
    method: 'GET',
    headers: toJsonHeaders(withIdempotencyHeader(normalizeAuthHeader(config.authType, config.apiKey, 'x-goog-api-key'), input.idempotencyKey)),
    errorPrefix: 'gemini query failed'
  }),
  onPoll: (_ctx, data, state) => {
    const record = data as { done?: boolean; error?: { message?: string } };
    if (!record.done) {
      return { done: false };
    }
    if (record.error) {
      return { done: false, error: record.error.message || 'gemini task failed' };
    }
    return readPollingUrlResult(data, {
      statusPaths: ['done'],
      successStatuses: ['true'],
      failureStatuses: [],
      urlArrayPaths: [{ arrayPaths: ['response.generateVideoResponse.generatedSamples'], itemPaths: ['video.uri'] }],
      successWithoutUrlError: 'gemini task succeeded without video uri',
      defaultFailureMessage: 'gemini task failed',
      providerTaskId: state.taskId
    });
  },
  fallbackError: () => 'gemini video polling timed out'
});
