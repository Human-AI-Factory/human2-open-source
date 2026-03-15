import { ProviderValidationError } from '../../errors.js';
import { VendorImageAdapter } from './types.js';
import { normalizeAuthHeader, toJsonHeaders } from '../video/common.js';
import { createImagePollingRecipeAdapter } from '../../recipes/adapter-factories.js';

export const runninghubImageAdapter: VendorImageAdapter = createImagePollingRecipeAdapter({
  manufacturer: 'runninghub',
  buildSubmitRequest: ({ config, input, defaultEndpoint, defaultAuthHeader }) => {
    const submitUrl = config.endpoints.submit || config.endpoint || defaultEndpoint || '';
    const queryUrl = config.endpoints.query || '';
    if (!submitUrl || !queryUrl) {
      throw new ProviderValidationError('runninghub image submit/query endpoints are not configured');
    }
    return {
      url: submitUrl,
      headers: toJsonHeaders(normalizeAuthHeader(config.authType, config.apiKey, defaultAuthHeader)),
      body: {
        prompt: input.prompt,
        ...(input.resolution ? { resolution: input.resolution } : {}),
        ...(input.aspectRatio ? { aspectRatio: input.aspectRatio } : {})
      },
      errorPrefix: 'runninghub image submit failed'
    };
  },
  onSubmit: (_ctx, data) => {
    const taskId = (data as { taskId?: string }).taskId;
    if (!taskId) {
      throw new ProviderValidationError('runninghub image submit response missing task id');
    }
    return { taskId };
  },
  buildPollRequest: ({ config, defaultAuthHeader }, state) => ({
    url: config.endpoints.query,
    method: 'POST',
    headers: toJsonHeaders(normalizeAuthHeader(config.authType, config.apiKey, defaultAuthHeader)),
    body: { taskId: state.taskId },
    errorPrefix: 'runninghub image query failed'
  }),
  onPoll: (_ctx, data) => {
    const record = data as { code?: number; msg?: string; data?: Array<{ fileUrl?: string }> };
    if (record.code === 0 && record.msg === 'success') {
      const url = record.data?.[0]?.fileUrl;
      if (!url) {
        return { done: false, error: 'runninghub image done without url' };
      }
      return { done: true, value: { url } };
    }
    if (record.code === 805) {
      return { done: false, error: 'runninghub image failed' };
    }
    return { done: false };
  },
  fallbackError: () => 'runninghub image polling timed out'
});
