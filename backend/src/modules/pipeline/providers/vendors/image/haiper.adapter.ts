import { ProviderValidationError } from '../../errors.js';
import { VendorImageAdapter } from './types.js';
import { getProviderOptions, normalizeAuthHeader, toJsonHeaders } from '../video/common.js';
import { createImagePollingRecipeAdapter } from '../../recipes/adapter-factories.js';

const extractHaiperImageUrl = (record: unknown): string | undefined => {
  if (!record || typeof record !== 'object') {
    return undefined;
  }

  const data = record as {
    data?: {
      image_url?: string;
      url?: string;
    };
    image_url?: string;
    url?: string;
  };

  // Check nested data
  if (typeof data.data?.image_url === 'string' && data.data.image_url.trim()) {
    return data.data.image_url;
  }
  if (typeof data.data?.url === 'string' && data.data.url.trim()) {
    return data.data.url;
  }

  // Check direct fields
  if (typeof data.image_url === 'string' && data.image_url.trim()) {
    return data.image_url;
  }
  if (typeof data.url === 'string' && data.url.trim()) {
    return data.url;
  }

  return undefined;
};

export const haiperImageAdapter: VendorImageAdapter = createImagePollingRecipeAdapter({
  manufacturer: 'haiper',
  buildSubmitRequest: ({ config, input, defaultEndpoint, defaultAuthHeader }) => {
    const submitUrl = config.endpoints.submit || config.endpoint || defaultEndpoint || '';
    if (!submitUrl) {
      throw new ProviderValidationError('haiper image submit endpoint is not configured');
    }
    const authHeaders = normalizeAuthHeader(config.authType, config.apiKey, defaultAuthHeader);
    const options = getProviderOptions(input.providerOptions, 'haiper');

    const payload: Record<string, unknown> = {
      prompt: input.prompt,
      ...(input.aspectRatio ? { aspect_ratio: input.aspectRatio } : {}),
      ...(options.model ? { model: options.model } : {}),
      ...(options.callbackUrl ? { callback_url: options.callbackUrl } : {})
    };

    return {
      url: submitUrl,
      headers: toJsonHeaders(authHeaders),
      body: payload,
      errorPrefix: 'haiper image submit failed'
    };
  },
  onSubmit: (_ctx, data) => {
    const record = data as {
      data?: { task_id?: string; id?: string };
      task_id?: string;
      id?: string;
    };

    // Check for direct result
    const directUrl = extractHaiperImageUrl(data);
    if (directUrl) {
      return { directResult: { url: directUrl } };
    }

    // Return task ID for polling
    const taskId = record.data?.task_id || record.data?.id || record.task_id || record.id;
    if (!taskId) {
      throw new ProviderValidationError('haiper image response missing task id');
    }
    return { taskId };
  },
  buildPollRequest: ({ config, defaultAuthHeader }, state) => {
    const pollUrl = config.endpoints.query || `${config.endpoint || ''}/api/v1/creation/status/${state.taskId}`;
    return {
      url: pollUrl,
      method: 'GET',
      headers: toJsonHeaders(normalizeAuthHeader(config.authType, config.apiKey, defaultAuthHeader)),
      errorPrefix: 'haiper image query failed'
    };
  },
  onPoll: (_ctx, data) => {
    const record = data as {
      data?: {
        status?: string;
        image_url?: string;
        url?: string;
      };
      status?: string;
    };

    const status = record.data?.status || record.status;
    const statusLower = (status || '').toLowerCase();

    if (statusLower === 'completed' || statusLower === 'success' || statusLower === 'done') {
      const url = extractHaiperImageUrl(data);
      if (!url) {
        return { done: false, error: 'haiper task succeeded without image url' };
      }
      return { done: true, value: { url } };
    }

    if (statusLower === 'failed' || statusLower === 'error') {
      return { done: false, error: 'haiper task failed' };
    }

    return { done: false };
  },
  initialIntervalMs: 3_000,
  maxIntervalMs: 20_000,
  backoffMultiplier: 1.5,
  fallbackError: () => 'haiper image polling timed out'
});
