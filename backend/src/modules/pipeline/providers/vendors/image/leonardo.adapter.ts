import { ProviderValidationError } from '../../errors.js';
import { VendorImageAdapter } from './types.js';
import { getProviderOptions, normalizeAuthHeader, toJsonHeaders } from '../video/common.js';
import { createImagePollingRecipeAdapter } from '../../recipes/adapter-factories.js';

const extractLeonardoImageUrl = (record: unknown): string | undefined => {
  if (!record || typeof record !== 'object') {
    return undefined;
  }

  const gen = record as {
    generated_images?: Array<{ url?: unknown; display_url?: unknown }>;
    url?: unknown;
  };

  // Check generated_images array
  const images = gen.generated_images;
  if (Array.isArray(images) && images.length > 0) {
    const firstImage = images[0];
    const url = firstImage?.url ?? firstImage?.display_url;
    if (typeof url === 'string' && url.trim()) {
      return url;
    }
  }

  // Check direct url field
  if (typeof gen.url === 'string' && gen.url.trim()) {
    return gen.url;
  }

  return undefined;
};

export const leonardoImageAdapter: VendorImageAdapter = createImagePollingRecipeAdapter({
  manufacturer: 'leonardo',
  buildSubmitRequest: ({ config, input, defaultEndpoint, defaultAuthHeader }) => {
    const submitUrl = config.endpoints.submit || config.endpoint || defaultEndpoint || '';
    if (!submitUrl) {
      throw new ProviderValidationError('leonardo image submit endpoint is not configured');
    }
    const authHeaders = normalizeAuthHeader(config.authType, config.apiKey, defaultAuthHeader);
    const options = getProviderOptions(input.providerOptions, 'leonardo');

    // Map aspect ratio to dimensions
    const getDimensions = (aspectRatio?: string, resolution?: string) => {
      const sizeMap: Record<string, [number, number]> = {
        '1:1': [1024, 1024],
        '16:9': [1024, 576],
        '9:16': [576, 1024],
        '4:3': [1024, 768],
        '3:4': [768, 1024],
        '21:9': [1280, 576],
        '9:21': [576, 1280]
      };

      if (resolution) {
        // If resolution is directly specified (e.g., "1024x1024")
        const match = resolution.match(/^(\d+)\s*[x×]\s*(\d+)$/i);
        if (match) {
          return { width: parseInt(match[1]), height: parseInt(match[2]) };
        }
      }

      const dims = aspectRatio ? sizeMap[aspectRatio] : undefined;
      if (dims) {
        return { width: dims[0], height: dims[1] };
      }
      return { width: 1024, height: 1024 };
    };

    const dims = getDimensions(input.aspectRatio, input.resolution);

    const payload: Record<string, unknown> = {
      prompt: input.prompt,
      width: dims.width,
      height: dims.height,
      num_images: typeof options.numImages === 'number' ? options.numImages : 1,
      guidance_scale: options.guidanceScale || 7,
      ...(options.negativePrompt ? { negative_prompt: options.negativePrompt } : {}),
      ...(typeof options.seed === 'number' ? { seed: Math.floor(options.seed) } : {}),
      ...(options.modelId ? { modelId: options.modelId } : {}),
      ...(options.sdVersion ? { sd_version: options.sdVersion } : {}),
      ...(options.scheduler ? { scheduler: options.scheduler } : {}),
      ...(options.presetStyle ? { presetStyle: options.presetStyle } : {}),
      ...(options.alchemy !== undefined ? { alchemy: options.alchemy } : {}),
      ...(options.promptMagic !== undefined ? { promptMagic: options.promptMagic } : {}),
      ...(options.photoReal ? { photoReal: options.photoReal } : {})
    };

    // Use model from config or input
    if (config.model || input.model) {
      payload.model = config.model || input.model;
    }

    return {
      url: submitUrl,
      headers: toJsonHeaders(authHeaders),
      body: payload,
      errorPrefix: 'leonardo image submit failed'
    };
  },
  onSubmit: (_ctx, data) => {
    const record = data as {
      sdGenerationJob?: { generationId?: string };
      id?: string;
    };

    // Check for sync response (direct image)
    const directUrl = extractLeonardoImageUrl(data);
    if (directUrl) {
      return { directResult: { url: directUrl } };
    }

    // Return task ID for polling
    const taskId = record.sdGenerationJob?.generationId || record.id;
    if (!taskId) {
      throw new ProviderValidationError('leonardo image response missing generation id');
    }
    return { taskId };
  },
  buildPollRequest: ({ config, defaultAuthHeader }, state) => {
    const pollUrl = config.endpoints.query || `${config.endpoint || ''}/generations/${state.taskId}`;
    return {
      url: pollUrl,
      method: 'GET',
      headers: toJsonHeaders(normalizeAuthHeader(config.authType, config.apiKey, defaultAuthHeader)),
      errorPrefix: 'leonardo image query failed'
    };
  },
  onPoll: (_ctx, data) => {
    const record = data as {
      status?: string;
      generations_by_pk?: {
        status?: string;
        generated_images?: Array<{ url?: string; display_url?: string }>;
      };
    };

    const status = record.status || record.generations_by_pk?.status;
    const statusLower = (status || '').toLowerCase();

    if (statusLower === 'completed' || statusLower === 'success') {
      const url = extractLeonardoImageUrl(record.generations_by_pk || data);
      if (!url) {
        return { done: false, error: 'leonardo image task succeeded without image url' };
      }
      return { done: true, value: { url } };
    }

    if (statusLower === 'failed' || statusLower === 'error') {
      const error = record.generations_by_pk?.generated_images?.[0]?.url;
      return { done: false, error: error || 'leonardo image task failed' };
    }

    return { done: false };
  },
  initialIntervalMs: 2_000,
  maxIntervalMs: 10_000,
  backoffMultiplier: 1.5,
  fallbackError: () => 'leonardo image polling timed out'
});
