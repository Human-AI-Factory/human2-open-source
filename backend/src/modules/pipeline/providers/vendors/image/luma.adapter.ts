import { ProviderValidationError } from '../../errors.js';
import { VendorImageAdapter } from './types.js';
import { getProviderOptions, normalizeAuthHeader, toJsonHeaders } from '../video/common.js';
import { createImagePollingRecipeAdapter } from '../../recipes/adapter-factories.js';

const extractLumaImageUrl = (record: unknown): string | undefined => {
  if (!record || typeof record !== 'object') {
    return undefined;
  }

  const data = record as {
    assets?: { image?: string; video?: string };
    url?: string;
  };

  // Check assets.image
  if (typeof data.assets?.image === 'string' && data.assets.image.trim()) {
    return data.assets.image;
  }

  // Check direct url
  if (typeof data.url === 'string' && data.url.trim()) {
    return data.url;
  }

  return undefined;
};

export const lumaImageAdapter: VendorImageAdapter = createImagePollingRecipeAdapter({
  manufacturer: 'luma',
  buildSubmitRequest: ({ config, input, defaultEndpoint, defaultAuthHeader }) => {
    const submitUrl = config.endpoints.submit || config.endpoint || defaultEndpoint || '';
    if (!submitUrl) {
      throw new ProviderValidationError('luma image submit endpoint is not configured');
    }
    const authHeaders = normalizeAuthHeader(config.authType, config.apiKey, defaultAuthHeader);
    const options = getProviderOptions(input.providerOptions, 'luma');

    // Map aspect ratio
    const aspectRatioMap: Record<string, string> = {
      '1:1': '1:1',
      '16:9': '16:9',
      '9:16': '9:16',
      '4:3': '4:3',
      '3:4': '3:4',
      '21:9': '21:9',
      '9:21': '9:21'
    };

    const payload: Record<string, unknown> = {
      model: config.model || input.model || 'photon-1',
      prompt: input.prompt,
      ...(input.aspectRatio ? { aspect_ratio: aspectRatioMap[input.aspectRatio] || '1:1' } : {}),
      ...(options.format ? { format: options.format } : {}),
      ...(options.callbackUrl ? { callback_url: options.callbackUrl } : {}),
      ...(options.imageRef ? { image_ref: options.imageRef } : {}),
      ...(options.styleRef ? { style_ref: options.styleRef } : {}),
      ...(options.characterRef ? { character_ref: options.characterRef } : {}),
      ...(options.modifyImageRef ? { modify_image_ref: options.modifyImageRef } : {}),
      ...(options.sync !== undefined ? { sync: options.sync } : {}),
      ...(options.syncTimeout ? { sync_timeout: options.syncTimeout } : {})
    };

    return {
      url: submitUrl,
      headers: toJsonHeaders(authHeaders),
      body: payload,
      errorPrefix: 'luma image submit failed'
    };
  },
  onSubmit: (_ctx, data) => {
    const record = data as {
      id?: string;
      state?: string;
    };

    // Check for direct result (sync mode)
    const directUrl = extractLumaImageUrl(data);
    if (directUrl) {
      return { directResult: { url: directUrl } };
    }

    // Return task ID for polling
    const taskId = record.id;
    if (!taskId) {
      throw new ProviderValidationError('luma image response missing generation id');
    }
    return { taskId };
  },
  buildPollRequest: ({ config, defaultAuthHeader }, state) => {
    const pollUrl = config.endpoints.query || `${config.endpoint || ''}/generations/image/${state.taskId}`;
    return {
      url: pollUrl,
      method: 'GET',
      headers: toJsonHeaders(normalizeAuthHeader(config.authType, config.apiKey, defaultAuthHeader)),
      errorPrefix: 'luma image query failed'
    };
  },
  onPoll: (_ctx, data) => {
    const record = data as {
      id?: string;
      state?: string;
      failure_reason?: string;
    };

    const state = (record.state || '').toLowerCase();

    if (state === 'completed') {
      const url = extractLumaImageUrl(data);
      if (!url) {
        return { done: false, error: 'luma image task succeeded without image url' };
      }
      return { done: true, value: { url } };
    }

    if (state === 'failed') {
      return { done: false, error: record.failure_reason || 'luma image task failed' };
    }

    return { done: false };
  },
  initialIntervalMs: 2_000,
  maxIntervalMs: 10_000,
  backoffMultiplier: 1.5,
  fallbackError: () => 'luma image polling timed out'
});
