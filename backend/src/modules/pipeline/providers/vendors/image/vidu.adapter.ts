import { ProviderValidationError } from '../../errors.js';
import { VendorImageAdapter } from './types.js';
import { getProviderOptions, readPollingUrlResult, readTaskIdOrThrow, sanitizeApiKey, toJsonHeaders } from '../video/common.js';
import { createImagePollingRecipeAdapter } from '../../recipes/adapter-factories.js';

export const viduImageAdapter: VendorImageAdapter = createImagePollingRecipeAdapter({
  manufacturer: 'vidu',
  buildSubmitRequest: ({ config, input, defaultEndpoint }) => {
    const submitUrl = config.endpoints.submit || config.endpoint || defaultEndpoint || '';
    const queryUrlTemplate = config.endpoints.query || '';
    if (!submitUrl || !queryUrlTemplate) {
      throw new ProviderValidationError('vidu image submit/query endpoints are not configured');
    }
    const authHeaders: Record<string, string> = {};
    if (config.authType !== 'none') {
      authHeaders.Authorization =
        config.authType === 'api_key' ? `Token ${sanitizeApiKey(config.apiKey)}` : `Bearer ${sanitizeApiKey(config.apiKey)}`;
    }
    const options = getProviderOptions(input.providerOptions, 'vidu');
    return {
      url: submitUrl,
      headers: toJsonHeaders(authHeaders),
      body: {
        model: config.model || input.model,
        prompt: input.prompt,
        ...(input.resolution ? { resolution: input.resolution } : {}),
        ...(input.aspectRatio ? { aspect_ratio: input.aspectRatio } : {}),
        ...(typeof options.seed === 'number' ? { seed: Math.floor(options.seed) } : {}),
        ...(typeof options.negativePrompt === 'string' ? { negative_prompt: options.negativePrompt } : {}),
        ...(typeof options.style === 'string' ? { style: options.style } : {}),
        ...(typeof options.refStrength === 'number' ? { ref_strength: options.refStrength } : {})
      },
      errorPrefix: 'vidu image submit failed'
    };
  },
  onSubmit: (_ctx, data) => ({ taskId: readTaskIdOrThrow(data, ['task_id'], 'vidu image submit response missing task id') }),
  buildPollRequest: ({ config, input }, state) => {
    const authHeaders: Record<string, string> = {};
    if (config.authType !== 'none') {
      authHeaders.Authorization =
        config.authType === 'api_key' ? `Token ${sanitizeApiKey(config.apiKey)}` : `Bearer ${sanitizeApiKey(config.apiKey)}`;
    }
    return {
      url: config.endpoints.query.replace('{id}', state.taskId),
      method: 'GET',
      headers: toJsonHeaders(authHeaders),
      errorPrefix: 'vidu image query failed'
    };
  },
  onPoll: (_ctx, data) =>
    readPollingUrlResult(data, {
      statusPaths: ['state'],
      successStatuses: ['success'],
      failureStatuses: ['failed'],
      urlArrayPaths: [{ arrayPaths: ['creations'], itemPaths: ['url'] }],
      errorPaths: ['err_code'],
      successWithoutUrlError: 'vidu image success without url',
      defaultFailureMessage: 'vidu image failed'
    }),
  fallbackError: () => 'vidu image polling timed out'
});
