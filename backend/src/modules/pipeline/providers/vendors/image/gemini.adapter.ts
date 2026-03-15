import { ProviderValidationError } from '../../errors.js';
import { VendorImageAdapter } from './types.js';
import { normalizeAuthHeader, toJsonHeaders } from '../video/common.js';
import { createImagePollingRecipeAdapter } from '../../recipes/adapter-factories.js';
import { readDirectUrlOrTaskId, readPollingUrlResult } from '../polling.js';

export const geminiImageAdapter: VendorImageAdapter = createImagePollingRecipeAdapter({
  manufacturer: 'gemini',
  buildSubmitRequest: ({ config, input, defaultEndpoint }) => {
    const submitUrlTemplate = config.endpoints.submit || config.endpoint || defaultEndpoint || '';
    if (!submitUrlTemplate) {
      throw new ProviderValidationError('gemini image submit endpoint is not configured');
    }
    return {
      url: submitUrlTemplate.replace('{model}', config.model || input.model || ''),
      headers: toJsonHeaders(normalizeAuthHeader(config.authType, config.apiKey, 'x-goog-api-key')),
      body: {
        prompt: input.prompt,
        ...(input.aspectRatio ? { aspectRatio: input.aspectRatio } : {}),
        ...(input.resolution ? { size: input.resolution } : {})
      },
      errorPrefix: 'gemini image submit failed'
    };
  },
  onSubmit: ({ config }, submitData) => {
    if (!config.endpoints.query) {
      throw new ProviderValidationError('gemini image response missing url and operation name');
    }
    return readDirectUrlOrTaskId(submitData, {
      urlPaths: ['url'],
      urlArrayPaths: [{ arrayPaths: ['data'], itemPaths: ['url'] }],
      taskIdPaths: ['name'],
      missingTaskIdMessage: 'gemini image response missing url and operation name'
    });
  },
  buildPollRequest: ({ config }, state) => ({
    url: config.endpoints.query.replace('{name}', state.taskId),
    method: 'GET',
    headers: toJsonHeaders(normalizeAuthHeader(config.authType, config.apiKey, 'x-goog-api-key')),
    errorPrefix: 'gemini image query failed'
  }),
  onPoll: (_ctx, data) => {
    const record = data as { done?: boolean; error?: { message?: string } };
    if (!record.done) {
      return { done: false };
    }
    if (record.error) {
      return { done: false, error: record.error.message || 'gemini image failed' };
    }
    return readPollingUrlResult(data, {
      statusPaths: ['done'],
      successStatuses: ['true'],
      failureStatuses: [],
      urlArrayPaths: [{ arrayPaths: ['response.images'], itemPaths: ['uri'] }],
      successWithoutUrlError: 'gemini image done without url',
      defaultFailureMessage: 'gemini image failed'
    });
  },
  fallbackError: () => 'gemini image polling timed out'
});
