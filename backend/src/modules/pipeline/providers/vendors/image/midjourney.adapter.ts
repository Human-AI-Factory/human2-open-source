import { ProviderValidationError } from '../../errors.js';
import { VendorImageAdapter } from './types.js';
import { getProviderOptions, normalizeAuthHeader, toJsonHeaders } from '../video/common.js';
import { createImagePollingRecipeAdapter } from '../../recipes/adapter-factories.js';

const extractMidjourneyImageUrl = (record: unknown): string | undefined => {
  if (!record || typeof record !== 'object') {
    return undefined;
  }

  const data = record as {
    resultInfoJson?: {
      resultUrls?: Array<{ resultUrl?: string }>;
    };
    data?: {
      resultInfoJson?: {
        resultUrls?: Array<{ resultUrl?: string }>;
      };
    };
    url?: string;
  };

  // Check resultInfoJson.resultUrls
  const resultInfo = data.resultInfoJson || data.data?.resultInfoJson;
  if (resultInfo?.resultUrls && Array.isArray(resultInfo.resultUrls)) {
    const url = resultInfo.resultUrls[0]?.resultUrl;
    if (typeof url === 'string' && url.trim()) {
      return url;
    }
  }

  // Check direct url
  if (typeof data.url === 'string' && data.url.trim()) {
    return data.url;
  }

  return undefined;
};

export const midjourneyImageAdapter: VendorImageAdapter = createImagePollingRecipeAdapter({
  manufacturer: 'midjourney',
  buildSubmitRequest: ({ config, input, defaultEndpoint, defaultAuthHeader }) => {
    const submitUrl = config.endpoints.submit || config.endpoint || defaultEndpoint || '';
    if (!submitUrl) {
      throw new ProviderValidationError('midjourney image submit endpoint is not configured');
    }
    const authHeaders = normalizeAuthHeader(config.authType, config.apiKey, defaultAuthHeader);
    const options = getProviderOptions(input.providerOptions, 'midjourney');

    // Map aspect ratio
    const aspectRatioMap: Record<string, string> = {
      '1:1': '1:1',
      '16:9': '16:9',
      '9:16': '9:16',
      '4:3': '4:3',
      '3:4': '3:4'
    };

    // Determine task type
    const isImageToImage = input.providerOptions && (
      (input.providerOptions as Record<string, unknown>).fileUrl ||
      (input.providerOptions as Record<string, unknown>).imageUrl
    );

    const payload: Record<string, unknown> = {
      taskType: isImageToImage ? 'mj_img2img' : 'mj_txt2img',
      prompt: input.prompt,
      ...(options.speed ? { speed: options.speed } : {}),
      ...(input.aspectRatio ? { aspectRatio: aspectRatioMap[input.aspectRatio] || '1:1' } : {}),
      ...(options.version ? { version: options.version } : {}),
      ...(options.fileUrl ? { fileUrl: options.fileUrl } : {}),
      ...(options.stylization ? { stylization: options.stylization } : {}),
      ...(options.callBackUrl ? { callBackUrl: options.callBackUrl } : {})
    };

    return {
      url: submitUrl,
      headers: toJsonHeaders(authHeaders),
      body: payload,
      errorPrefix: 'midjourney image submit failed'
    };
  },
  onSubmit: (_ctx, data) => {
    const record = data as {
      code?: number;
      data?: { taskId?: string };
      taskId?: string;
    };

    if (record.code !== 200) {
      throw new ProviderValidationError(`midjourney image submit failed: ${JSON.stringify(data)}`);
    }

    // Check for direct result
    const directUrl = extractMidjourneyImageUrl(data);
    if (directUrl) {
      return { directResult: { url: directUrl } };
    }

    // Return task ID for polling
    const taskId = record.data?.taskId || record.taskId;
    if (!taskId) {
      throw new ProviderValidationError('midjourney image response missing task id');
    }
    return { taskId };
  },
  buildPollRequest: ({ config, defaultAuthHeader }, state) => {
    const pollUrl = config.endpoints.query || `${config.endpoint || ''}/api/v1/mj/record-info?taskId=${state.taskId}`;
    return {
      url: pollUrl,
      method: 'GET',
      headers: toJsonHeaders(normalizeAuthHeader(config.authType, config.apiKey, defaultAuthHeader)),
      errorPrefix: 'midjourney image query failed'
    };
  },
  onPoll: (_ctx, data) => {
    const record = data as {
      code?: number;
      data?: {
        successFlag?: number;
        resultInfoJson?: {
          resultUrls?: Array<{ resultUrl?: string }>;
        };
        errorMessage?: string;
      };
    };

    if (record.code !== 200) {
      return { done: false, error: `midjourney query failed: ${JSON.stringify(data)}` };
    }

    const successFlag = record.data?.successFlag;

    // 1 = Success
    if (successFlag === 1) {
      const url = extractMidjourneyImageUrl(data);
      if (!url) {
        return { done: false, error: 'midjourney task succeeded without image url' };
      }
      return { done: true, value: { url } };
    }

    // 2 = Task failed, 3 = Created but generation failed
    if (successFlag === 2 || successFlag === 3) {
      const error = record.data?.errorMessage || 'midjourney task failed';
      return { done: false, error };
    }

    // 0 = Still processing
    return { done: false };
  },
  initialIntervalMs: 5_000,
  maxIntervalMs: 30_000,
  backoffMultiplier: 1.5,
  fallbackError: () => 'midjourney image polling timed out'
});
