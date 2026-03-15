import { ProviderValidationError } from '../../errors.js';
import { VendorImageAdapter } from './types.js';
import { getProviderOptions, normalizeAuthHeader, toJsonHeaders } from '../video/common.js';
import { createImagePollingRecipeAdapter } from '../../recipes/adapter-factories.js';
import { readDirectUrlOrTaskId, readPollingUrlResult } from '../polling.js';

const isDashScopeMultimodalImageEndpoint = (submitUrl: string): boolean =>
  submitUrl.includes('/services/aigc/multimodal-generation/generation');

const normalizeDashScopeImageSize = (resolution?: string, aspectRatio?: string): string | undefined => {
  const normalizedResolution = (resolution ?? '').trim().toLowerCase();
  if (normalizedResolution === '1k') {
    return '1024*1024';
  }
  if (normalizedResolution === '2k') {
    return aspectRatio === '16:9' ? '1664*928' : '1328*1328';
  }
  if (normalizedResolution === '4k') {
    return aspectRatio === '16:9' ? '2048*1152' : '2048*2048';
  }
  if (/^\d{3,4}\*\d{3,4}$/.test(resolution ?? '')) {
    return resolution;
  }
  return undefined;
};

const extractDashScopeImageUrl = (record: unknown): string | undefined => {
  if (!record || typeof record !== 'object') {
    return undefined;
  }
  const output = (record as { output?: unknown }).output;
  if (!output || typeof output !== 'object') {
    return undefined;
  }

  const directImageUrl = (output as { image_url?: unknown }).image_url;
  if (typeof directImageUrl === 'string' && directImageUrl.trim()) {
    return directImageUrl;
  }

  const results = (output as { results?: Array<{ url?: unknown }> }).results;
  const resultsUrl = Array.isArray(results) ? results.find((item) => typeof item?.url === 'string' && item.url.trim())?.url : undefined;
  if (typeof resultsUrl === 'string' && resultsUrl.trim()) {
    return resultsUrl;
  }

  const choices = (output as {
    choices?: Array<{
      message?: {
        content?: Array<{ image?: unknown; image_url?: unknown; url?: unknown }>;
      };
    }>;
  }).choices;
  if (!Array.isArray(choices)) {
    return undefined;
  }

  for (const choice of choices) {
    const content = choice?.message?.content;
    if (!Array.isArray(content)) {
      continue;
    }
    for (const block of content) {
      const candidate = block?.image ?? block?.image_url ?? block?.url;
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate;
      }
    }
  }

  return undefined;
};

export const wanImageAdapter: VendorImageAdapter = createImagePollingRecipeAdapter({
  manufacturer: 'wan',
  buildSubmitRequest: ({ config, input, defaultEndpoint, defaultAuthHeader }) => {
    const submitUrl = config.endpoints.submit || config.endpoint || defaultEndpoint || '';
    if (!submitUrl) {
      throw new ProviderValidationError('wan image submit endpoint is not configured');
    }
    const authHeaders = normalizeAuthHeader(config.authType, config.apiKey, defaultAuthHeader);
    const options = getProviderOptions(input.providerOptions, 'wan');
    const dashScopeMultimodal = isDashScopeMultimodalImageEndpoint(submitUrl);
    const enableAsync = !dashScopeMultimodal && options.async === true;

    // Build content array - support image inputs for img2img/reference
    const buildContent = (): Array<{ text?: string; image?: string }> => {
      const content: Array<{ text?: string; image?: string }> = [];

      // Add reference images first if provided (for img2img)
      if (input.imageInputs && input.imageInputs.length > 0) {
        for (const imgUrl of input.imageInputs) {
          content.push({ image: imgUrl });
        }
      }

      // Add the prompt text
      content.push({ text: input.prompt });

      return content;
    };

    const payload = dashScopeMultimodal
      ? {
          model: config.model || input.model,
          input: {
            messages: [
              {
                role: 'user',
                content: buildContent()
              }
            ]
          },
          parameters: {
            ...(typeof options.negativePrompt === 'string' ? { negative_prompt: options.negativePrompt } : {}),
            ...(typeof options.promptExtend === 'boolean' ? { prompt_extend: options.promptExtend } : {}),
            ...(typeof options.watermark === 'boolean' ? { watermark: options.watermark } : {}),
            ...(normalizeDashScopeImageSize(input.resolution, input.aspectRatio)
              ? { size: normalizeDashScopeImageSize(input.resolution, input.aspectRatio) }
              : {})
          }
        }
      : {
          model: config.model || input.model,
          input: {
            prompt: input.prompt,
            ...(typeof options.negativePrompt === 'string' ? { negative_prompt: options.negativePrompt } : {}),
            ...(input.imageInputs && input.imageInputs.length > 0 ? { image_urls: input.imageInputs } : {})
          },
          parameters: {
            ...(input.resolution ? { size: input.resolution } : {}),
            ...(input.aspectRatio ? { aspect_ratio: input.aspectRatio } : {}),
            ...(typeof options.seed === 'number' ? { seed: Math.floor(options.seed) } : {}),
            ...(typeof options.style === 'string' ? { style: options.style } : {}),
            ...(typeof options.watermark === 'boolean' ? { watermark: options.watermark } : {})
          }
        };
    return {
      url: submitUrl,
      headers: {
        ...toJsonHeaders(authHeaders),
        ...(enableAsync ? { 'X-DashScope-Async': 'enable' } : {})
      },
      body: payload,
      errorPrefix: 'wan image submit failed'
    };
  },
  onSubmit: ({ config }, data) => {
    const record = data as {
      output?: { task_id?: string };
      code?: string;
      message?: string;
    };
    if (record.code) {
      throw new ProviderValidationError(`wan image submit failed: [${record.code}] ${record.message ?? ''}`.trim());
    }
    if (!config.endpoints.query) {
      throw new ProviderValidationError('wan image response missing task id/query endpoint');
    }
    const directUrl = extractDashScopeImageUrl(data);
    if (directUrl) {
      return { directResult: { url: directUrl } };
    }
    return readDirectUrlOrTaskId(data, {
      taskIdPaths: ['output.task_id'],
      missingTaskIdMessage: 'wan image response missing task id/query endpoint'
    });
  },
  buildPollRequest: ({ config, defaultAuthHeader }, state) => ({
    url: config.endpoints.query.replace('{taskId}', state.taskId),
    method: 'GET',
    headers: toJsonHeaders(normalizeAuthHeader(config.authType, config.apiKey, defaultAuthHeader)),
    errorPrefix: 'wan image query failed'
  }),
  onPoll: (_ctx, data) => {
    const record = data as {
      output?: { task_status?: string };
      code?: string;
      message?: string;
    };
    if (record.code) {
      return { done: false, error: `wan image query failed: [${record.code}] ${record.message ?? ''}`.trim() };
    }
    const directUrl = extractDashScopeImageUrl(data);
    if (directUrl) {
      return { done: true, value: { url: directUrl } };
    }
    return readPollingUrlResult(data, {
      statusPaths: ['output.task_status'],
      successStatuses: ['succeeded'],
      failureStatuses: ['failed', 'canceled'],
      errorPaths: [],
      successWithoutUrlError: 'wan image task succeeded without url',
      defaultFailureMessage: 'wan image task failed'
    });
  },
  fallbackError: () => 'wan image polling timed out'
});
