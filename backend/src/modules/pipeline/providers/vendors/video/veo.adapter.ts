import { ProviderValidationError } from '../../errors.js';
import { VendorVideoAdapter } from './types.js';
import { getProviderOptions, normalizeAuthHeader, toJsonHeaders } from './common.js';
import { createVideoPollingRecipeAdapter } from '../../recipes/adapter-factories.js';

const extractVeoVideoUrl = (record: unknown): string | undefined => {
  if (!record || typeof record !== 'object') {
    return undefined;
  }

  const data = record as {
    data?: {
      response?: string;
      video_url?: string;
      url?: string;
    };
    response?: string;
    video_url?: string;
    url?: string;
  };

  // Check nested data.response (Veo API returns URL in response field)
  if (typeof data.data?.response === 'string' && data.data.response.trim()) {
    return data.data.response;
  }
  if (typeof data.data?.video_url === 'string' && data.data.video_url.trim()) {
    return data.data.video_url;
  }
  if (typeof data.data?.url === 'string' && data.data.url.trim()) {
    return data.data.url;
  }

  // Check direct fields
  if (typeof data.response === 'string' && data.response.trim()) {
    return data.response;
  }
  if (typeof data.video_url === 'string' && data.video_url.trim()) {
    return data.video_url;
  }
  if (typeof data.url === 'string' && data.url.trim()) {
    return data.url;
  }

  return undefined;
};

export const veoVideoAdapter: VendorVideoAdapter = createVideoPollingRecipeAdapter({
  manufacturer: 'veo',
  buildSubmitRequest: ({ config, input, defaultEndpoint, defaultAuthHeader }) => {
    const submitUrl = config.endpoints.submit || config.endpoints.text2video || config.endpoint || defaultEndpoint || '';
    if (!submitUrl) {
      throw new ProviderValidationError('veo video submit endpoint is not configured');
    }
    const authHeaders = normalizeAuthHeader(config.authType, config.apiKey, defaultAuthHeader);
    const options = getProviderOptions(input.providerOptions, 'veo');

    // Determine if this is image-to-video or text-to-video
    const hasImageInput = input.imageInputs?.length || input.imageWithRoles?.length;

    // Map aspect ratio
    const aspectRatioMap: Record<string, string> = {
      '1:1': '1:1',
      '16:9': '16:9',
      '9:16': '9:16',
      '4:3': '4:3',
      '3:4': '3:4',
      'auto': 'Auto'
    };

    const payload: Record<string, unknown> = {
      prompt: input.prompt,
      model: config.model || input.model || 'veo3',
      ...(input.aspectRatio ? { aspect_ratio: aspectRatioMap[input.aspectRatio] || '16:9' } : {}),
      ...(options.watermark !== undefined ? { watermark: options.watermark } : {}),
      ...(options.seeds ? { seeds: options.seeds } : {})
    };

    // Add image input for image-to-video
    if (hasImageInput) {
      const imageUrl = input.imageInputs?.[0] || input.imageWithRoles?.[0]?.url;
      if (imageUrl) {
        payload.image_urls = [imageUrl];
      }
    }

    return {
      url: submitUrl,
      headers: toJsonHeaders(authHeaders),
      body: payload,
      errorPrefix: 'veo video submit failed'
    };
  },
  onSubmit: (_ctx, data) => {
    const record = data as {
      code?: number;
      data?: { task_id?: string; taskId?: string };
      task_id?: string;
      taskId?: string;
    };

    if (record.code && record.code !== 200) {
      throw new ProviderValidationError(`veo video submit failed: ${JSON.stringify(data)}`);
    }

    // Check for direct result
    const directUrl = extractVeoVideoUrl(data);
    if (directUrl) {
      return { directResult: { url: directUrl } };
    }

    // Return task ID for polling
    const taskId = record.data?.task_id || record.data?.taskId || record.task_id || record.taskId;
    if (!taskId) {
      throw new ProviderValidationError('veo video response missing task id');
    }
    return { taskId };
  },
  buildPollRequest: ({ config, defaultAuthHeader }, state) => {
    const pollUrl = config.endpoints.query || `${config.endpoint || ''}/feed?task_id=${state.taskId}`;
    return {
      url: pollUrl,
      method: 'GET',
      headers: toJsonHeaders(normalizeAuthHeader(config.authType, config.apiKey, defaultAuthHeader)),
      errorPrefix: 'veo video query failed'
    };
  },
  onPoll: (_ctx, data) => {
    const record = data as {
      code?: number;
      data?: {
        status?: string;
        response?: string;
      };
      status?: string;
    };

    if (record.code && record.code !== 200) {
      return { done: false, error: `veo query failed: ${JSON.stringify(data)}` };
    }

    const status = record.data?.status || record.status;
    const statusLower = (status || '').toLowerCase();

    if (statusLower === 'success' || statusLower === 'completed' || statusLower === 'done') {
      const url = extractVeoVideoUrl(data);
      if (!url) {
        return { done: false, error: 'veo task succeeded without video url' };
      }
      return { done: true, value: { url } };
    }

    if (statusLower === 'failed' || statusLower === 'error') {
      return { done: false, error: 'veo task failed' };
    }

    // pending, processing - still processing
    return { done: false };
  },
  initialIntervalMs: 5_000,
  maxIntervalMs: 30_000,
  backoffMultiplier: 1.5,
  timeoutMs: (ctx) => Math.max(ctx.timeoutMs, 300_000),
  fallbackError: () => 'veo video polling timed out'
});
