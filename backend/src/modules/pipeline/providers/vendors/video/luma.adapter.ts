import { ProviderValidationError } from '../../errors.js';
import { VendorVideoAdapter } from './types.js';
import { getProviderOptions, normalizeAuthHeader, toJsonHeaders } from './common.js';
import { createVideoPollingRecipeAdapter } from '../../recipes/adapter-factories.js';

const extractLumaVideoUrl = (record: unknown): string | undefined => {
  if (!record || typeof record !== 'object') {
    return undefined;
  }

  const data = record as {
    assets?: { video?: string; image?: string };
    url?: string;
  };

  // Check assets.video
  if (typeof data.assets?.video === 'string' && data.assets.video.trim()) {
    return data.assets.video;
  }

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

export const lumaVideoAdapter: VendorVideoAdapter = createVideoPollingRecipeAdapter({
  manufacturer: 'luma',
  buildSubmitRequest: ({ config, input, defaultEndpoint, defaultAuthHeader }) => {
    const submitUrl = config.endpoints.submit || config.endpoints.text2video || config.endpoint || defaultEndpoint || '';
    if (!submitUrl) {
      throw new ProviderValidationError('luma video submit endpoint is not configured');
    }
    const authHeaders = normalizeAuthHeader(config.authType, config.apiKey, defaultAuthHeader);
    const options = getProviderOptions(input.providerOptions, 'luma');

    // Determine if this is image-to-video or text-to-video
    const hasImageInput = input.imageInputs?.length || input.imageWithRoles?.length;

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
      model: config.model || input.model || 'ray-2',
      ...(input.prompt ? { prompt: input.prompt } : {}),
      ...(input.aspectRatio ? { aspect_ratio: aspectRatioMap[input.aspectRatio] || '16:9' } : {}),
      ...(input.duration ? { duration: String(input.duration) + 's' } : {}),
      ...(options.loop ? { loop: options.loop } : {}),
      ...(options.keyframes ? { keyframes: options.keyframes } : {}),
      ...(options.callbackUrl ? { callback_url: options.callbackUrl } : {}),
      ...(options.resolution ? { resolution: options.resolution } : {})
    };

    // Add image input for image-to-video
    if (hasImageInput) {
      const imageUrl = input.imageInputs?.[0] || input.imageWithRoles?.[0]?.url;
      if (imageUrl) {
        payload.keyframes = {
          frame0: { type: 'image', url: imageUrl }
        };
      }
    }

    return {
      url: submitUrl,
      headers: toJsonHeaders(authHeaders),
      body: payload,
      errorPrefix: 'luma video submit failed'
    };
  },
  onSubmit: (_ctx, data) => {
    const record = data as {
      id?: string;
      state?: string;
    };

    // Check for direct result (sync mode)
    const directUrl = extractLumaVideoUrl(data);
    if (directUrl) {
      return { directResult: { url: directUrl } };
    }

    // Return task ID for polling
    const taskId = record.id;
    if (!taskId) {
      throw new ProviderValidationError('luma video response missing generation id');
    }
    return { taskId };
  },
  buildPollRequest: ({ config, defaultAuthHeader }, state) => {
    const pollUrl = config.endpoints.query || `${config.endpoint || ''}/generations/video/${state.taskId}`;
    return {
      url: pollUrl,
      method: 'GET',
      headers: toJsonHeaders(normalizeAuthHeader(config.authType, config.apiKey, defaultAuthHeader)),
      errorPrefix: 'luma video query failed'
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
      const url = extractLumaVideoUrl(data);
      if (!url) {
        return { done: false, error: 'luma video task succeeded without video url' };
      }
      return { done: true, value: { url, providerTaskId: record.id } };
    }

    if (state === 'failed') {
      return { done: false, error: record.failure_reason || 'luma video task failed' };
    }

    // queued, dreaming - still processing
    return { done: false };
  },
  initialIntervalMs: 2_000,
  maxIntervalMs: 15_000,
  backoffMultiplier: 1.5,
  timeoutMs: (ctx) => Math.max(ctx.timeoutMs, 300_000),
  fallbackError: () => 'luma video polling timed out'
});
