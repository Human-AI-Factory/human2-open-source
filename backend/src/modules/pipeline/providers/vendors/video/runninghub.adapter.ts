import { ProviderValidationError } from '../../errors.js';
import { VendorVideoAdapter } from './types.js';
import { normalizeAuthHeader, readPollingUrlResult, readTaskIdOrThrow, withIdempotencyHeader, toJsonHeaders } from './common.js';
import { createVideoPollingRecipeAdapter } from '../../recipes/adapter-factories.js';

export const runninghubVideoAdapter: VendorVideoAdapter = createVideoPollingRecipeAdapter({
  manufacturer: 'runninghub',
  buildSubmitRequest: ({ config, input, defaultEndpoint, defaultAuthHeader }) => {
    const submitUrl = config.endpoints.submit || config.endpoints.text2video || config.endpoint || defaultEndpoint || '';
    const queryUrl = config.endpoints.query || '';
    if (!submitUrl || !queryUrl) {
      throw new ProviderValidationError('runninghub submit/query endpoints are not configured');
    }
    return {
      url: submitUrl,
      headers: toJsonHeaders(withIdempotencyHeader(normalizeAuthHeader(config.authType, config.apiKey, defaultAuthHeader), input.idempotencyKey)),
      body: {
        prompt: input.prompt,
        duration: String(input.duration ?? 5),
        aspectRatio: input.aspectRatio ?? '16:9',
        projectId: input.projectId,
        storyboardId: input.storyboardId
      },
      errorPrefix: 'runninghub submit failed'
    };
  },
  onSubmit: (_ctx, data) => {
    const record = data as { taskId?: string; errorMessage?: string };
    if (!record.taskId && record.errorMessage) {
      throw new ProviderValidationError(`runninghub submit failed: ${record.errorMessage}`);
    }
    return { taskId: readTaskIdOrThrow(record, ['taskId'], 'runninghub submit failed: missing task id') };
  },
  buildPollRequest: ({ config, input, defaultAuthHeader }, state) => ({
    url: config.endpoints.query,
    method: 'POST',
    headers: toJsonHeaders(
      withIdempotencyHeader(normalizeAuthHeader(config.authType, config.apiKey, defaultAuthHeader), input.idempotencyKey)
    ),
    body: { taskId: state.taskId },
    errorPrefix: 'runninghub query failed'
  }),
  onPoll: (_ctx, data, state) =>
    readPollingUrlResult(data, {
      statusPaths: ['status'],
      successStatuses: ['success'],
      failureStatuses: ['failed'],
      urlArrayPaths: [{ arrayPaths: ['results'], itemPaths: ['url'] }],
      errorPaths: ['errorMessage'],
      successWithoutUrlError: 'runninghub task succeeded without video url',
      defaultFailureMessage: 'runninghub task failed',
      providerTaskId: state.taskId
    }),
  fallbackError: () => 'runninghub video polling timed out'
});
