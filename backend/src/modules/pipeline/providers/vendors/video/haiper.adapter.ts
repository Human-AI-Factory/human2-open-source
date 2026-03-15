import { ProviderValidationError } from '../../errors.js';
import { VendorVideoAdapter } from './types.js';
import { getProviderOptions, normalizeAuthHeader, toJsonHeaders } from './common.js';
import { createVideoPollingRecipeAdapter } from '../../recipes/adapter-factories.js';

const extractHaiperVideoUrl = (record: unknown): string | undefined => {
  if (!record || typeof record !== 'object') {
    return undefined;
  }

  const data = record as {
    data?: {
      video_url?: string;
      url?: string;
    };
    video_url?: string;
    url?: string;
  };

  // Check nested data
  if (typeof data.data?.video_url === 'string' && data.data.video_url.trim()) {
    return data.data.video_url;
  }
  if (typeof data.data?.url === 'string' && data.data.url.trim()) {
    return data.data.url;
  }

  // Check direct fields
  if (typeof data.video_url === 'string' && data.video_url.trim()) {
    return data.video_url;
  }
  if (typeof data.url === 'string' && data.url.trim()) {
    return data.url;
  }

  return undefined;
};

export const haiperVideoAdapter: VendorVideoAdapter = createVideoPollingRecipeAdapter({
  manufacturer: 'haiper',
  buildSubmitRequest: ({ config, input, defaultEndpoint, defaultAuthHeader }) => {
    const submitUrl = config.endpoints.submit || config.endpoints.text2video || config.endpoint || defaultEndpoint || '';
    if (!submitUrl) {
      throw new ProviderValidationError('haiper video submit endpoint is not configured');
    }
    const authHeaders = normalizeAuthHeader(config.authType, config.apiKey, defaultAuthHeader);
    const options = getProviderOptions(input.providerOptions, 'haiper');

    // Determine if this is image-to-video or text-to-video
    const hasImageInput = input.imageInputs?.length || input.imageWithRoles?.length;

    const payload: Record<string, unknown> = {
      ...(input.prompt ? { prompt: input.prompt } : {}),
      ...(input.aspectRatio ? { aspect_ratio: input.aspectRatio } : {}),
      ...(input.duration ? { duration: input.duration } : {}),
      ...(options.model ? { model: options.model } : {}),
      ...(options.callbackUrl ? { callback_url: options.callbackUrl } : {})
    };

    // Add image input for image-to-video
    if (hasImageInput) {
      const imageUrl = input.imageInputs?.[0] || input.imageWithRoles?.[0]?.url;
      if (imageUrl) {
        payload.image_url = imageUrl;
      }
    }

    return {
      url: submitUrl,
      headers: toJsonHeaders(authHeaders),
      body: payload,
      errorPrefix: 'haiper video submit failed'
    };
  },
  onSubmit: (_ctx, data) => {
    const record = data as {
      data?: { task_id?: string; id?: string };
      task_id?: string;
      id?: string;
    };

    // Check for direct result
    const directUrl = extractHaiperVideoUrl(data);
    if (directUrl) {
      return { directResult: { url: directUrl } };
    }

    // Return task ID for polling
    const taskId = record.data?.task_id || record.data?.id || record.task_id || record.id;
    if (!taskId) {
      throw new ProviderValidationError('haiper video response missing task id');
    }
    return { taskId };
  },
  buildPollRequest: ({ config, defaultAuthHeader }, state) => {
    const pollUrl = config.endpoints.query || `${config.endpoint || ''}/api/v1/creation/status/${state.taskId}`;
    return {
      url: pollUrl,
      method: 'GET',
      headers: toJsonHeaders(normalizeAuthHeader(config.authType, config.apiKey, defaultAuthHeader)),
      errorPrefix: 'haiper video query failed'
    };
  },
  onPoll: (_ctx, data) => {
    const record = data as {
      data?: {
        status?: string;
        video_url?: string;
        url?: string;
      };
      status?: string;
    };

    const status = record.data?.status || record.status;
    const statusLower = (status || '').toLowerCase();

    if (statusLower === 'completed' || statusLower === 'success' || statusLower === 'done') {
      const url = extractHaiperVideoUrl(data);
      if (!url) {
        return { done: false, error: 'haiper task succeeded without video url' };
      }
      return { done: true, value: { url } };
    }

    if (statusLower === 'failed' || statusLower === 'error') {
      return { done: false, error: 'haiper task failed' };
    }

    // pending, processing - still processing
    return { done: false };
  },
  initialIntervalMs: 3_000,
  maxIntervalMs: 30_000,
  backoffMultiplier: 1.5,
  timeoutMs: (ctx) => Math.max(ctx.timeoutMs, 300_000),
  fallbackError: () => 'haiper video polling timed out'
});
