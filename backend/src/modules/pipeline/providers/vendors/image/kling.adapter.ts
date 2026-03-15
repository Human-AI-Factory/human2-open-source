import { ProviderValidationError } from '../../errors.js';
import { VendorImageAdapter } from './types.js';
import { getProviderOptions, normalizeAuthHeader, readPollingUrlResult, readTaskIdOrThrow, toJsonHeaders } from '../video/common.js';
import { createImagePollingRecipeAdapter } from '../../recipes/adapter-factories.js';

export const klingImageAdapter: VendorImageAdapter = createImagePollingRecipeAdapter({
  manufacturer: 'kling',
  buildSubmitRequest: ({ config, input, defaultEndpoint, defaultAuthHeader }) => {
    const submitUrl = config.endpoints.submit || config.endpoint || defaultEndpoint || '';
    if (!submitUrl) {
      throw new ProviderValidationError('kling image endpoint is not configured');
    }
    const options = getProviderOptions(input.providerOptions, 'kling');
    return {
      url: submitUrl,
      headers: toJsonHeaders(normalizeAuthHeader(config.authType, config.apiKey, defaultAuthHeader)),
      body: {
        model_name: config.model || input.model,
        prompt: input.prompt,
        n: 1,
        ...(input.resolution ? { resolution: input.resolution.toLowerCase() } : {}),
        ...(input.aspectRatio ? { aspect_ratio: input.aspectRatio } : {}),
        ...(typeof options.negativePrompt === 'string' ? { negative_prompt: options.negativePrompt } : {}),
        ...(typeof options.cfgScale === 'number' ? { cfg_scale: options.cfgScale } : {}),
        ...(typeof options.seed === 'number' ? { seed: Math.floor(options.seed) } : {}),
        ...(typeof options.style === 'string' ? { style: options.style } : {})
      },
      errorPrefix: 'kling image submit failed'
    };
  },
  onSubmit: (_ctx, data) => {
    const record = data as {
      code?: number;
      message?: string;
      data?: { task_id?: string; task_status_msg?: string };
    };
    if (typeof record.code === 'number' && record.code !== 0) {
      throw new ProviderValidationError(record.message || 'kling image submit failed');
    }
    return {
      taskId: readTaskIdOrThrow(record, ['data.task_id'], 'kling image submit response missing task id')
    };
  },
  buildPollRequest: ({ config, defaultEndpoint, defaultAuthHeader }, state) => {
    const submitUrl = config.endpoints.submit || config.endpoint || defaultEndpoint || '';
    return {
      url: `${submitUrl}/${state.taskId}`,
      method: 'GET',
      headers: toJsonHeaders(normalizeAuthHeader(config.authType, config.apiKey, defaultAuthHeader)),
      errorPrefix: 'kling image query failed'
    };
  },
  onPoll: (_ctx, data) => {
    const record = data as {
      code?: number;
      message?: string;
      data?: Record<string, unknown>;
    };
    if (typeof record.code === 'number' && record.code !== 0) {
      return { done: false, error: record.message || 'kling image query failed' };
    }
    return readPollingUrlResult(record, {
      statusPaths: ['data.task_status'],
      successStatuses: ['succeed'],
      failureStatuses: ['failed'],
      urlArrayPaths: [{ arrayPaths: ['data.task_result.images'], itemPaths: ['url'] }],
      errorPaths: ['data.task_status_msg'],
      successWithoutUrlError: 'kling image done without url',
      defaultFailureMessage: 'kling image failed'
    });
  },
  fallbackError: () => 'kling image polling timed out'
});
