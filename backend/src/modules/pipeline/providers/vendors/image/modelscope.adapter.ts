import { ProviderValidationError } from '../../errors.js';
import { VendorImageAdapter } from './types.js';
import { normalizeAuthHeader, toJsonHeaders } from '../video/common.js';
import { createImagePollingRecipeAdapter } from '../../recipes/adapter-factories.js';
import { readDirectUrlOrTaskId, readPollingUrlResult } from '../polling.js';

const normalizeSize = (resolution?: string, aspectRatio?: string): string => {
  const normalizedResolution = resolution?.trim().replace(/\*/g, 'x');
  if (normalizedResolution) {
    return normalizedResolution;
  }
  const normalizedAspectRatio = aspectRatio?.trim();
  switch (normalizedAspectRatio) {
    case '16:9':
      return '1280x720';
    case '9:16':
      return '720x1280';
    case '4:3':
      return '1024x768';
    case '3:4':
      return '768x1024';
    case '3:2':
      return '1152x768';
    case '2:3':
      return '768x1152';
    default:
      return '1024x1024';
  }
};

const buildTaskQueryUrl = (submitUrl: string, queryTemplate: string | undefined, taskId: string): string => {
  if (queryTemplate?.trim()) {
    return queryTemplate.replace('{taskId}', encodeURIComponent(taskId));
  }
  const submit = new URL(submitUrl);
  return `${submit.origin}/v1/tasks/${encodeURIComponent(taskId)}`;
};

export const modelscopeImageAdapter: VendorImageAdapter = createImagePollingRecipeAdapter({
  manufacturer: 'modelscope',
  buildSubmitRequest: ({ config, input, defaultEndpoint, defaultAuthHeader }) => {
    const submitUrl = config.endpoints.submit || config.endpoint || defaultEndpoint || '';
    if (!submitUrl) {
      throw new ProviderValidationError('ModelScope image endpoint is not configured');
    }
    return {
      url: submitUrl,
      headers: toJsonHeaders({
        ...normalizeAuthHeader(config.authType, config.apiKey, defaultAuthHeader),
        'X-ModelScope-Async-Mode': 'true'
      }),
      body: {
        model: config.model || input.model,
        prompt: input.prompt,
        size: normalizeSize(input.resolution, input.aspectRatio)
      },
      errorPrefix: 'ModelScope image submit failed'
    };
  },
  onSubmit: (_ctx, data) =>
    readDirectUrlOrTaskId(data, {
      urlArrayPaths: [
        { arrayPaths: ['output_images', 'outputImages', 'data.output_images', 'data.outputImages'], itemPaths: ['url', 'image_url', 'imageUrl'] }
      ],
      taskIdPaths: ['task_id', 'taskId', 'data.task_id', 'data.taskId'],
      missingTaskIdMessage: 'ModelScope image response missing task id'
    }),
  buildPollRequest: ({ config, defaultEndpoint, defaultAuthHeader }, state) => {
    const submitUrl = config.endpoints.submit || config.endpoint || defaultEndpoint || '';
    return {
      url: buildTaskQueryUrl(submitUrl, config.endpoints.query, state.taskId),
      method: 'GET',
      headers: toJsonHeaders({
        ...normalizeAuthHeader(config.authType, config.apiKey, defaultAuthHeader),
        'X-ModelScope-Task-Type': 'image_generation'
      }),
      errorPrefix: 'ModelScope image query failed'
    };
  },
  onPoll: (_ctx, data) =>
    readPollingUrlResult(data, {
      statusPaths: ['task_status', 'taskStatus', 'status', 'data.task_status', 'data.taskStatus', 'data.status'],
      successStatuses: ['succeed', 'succeeded', 'success', 'completed', 'done'],
      failureStatuses: ['failed', 'error', 'cancelled'],
      urlArrayPaths: [
        { arrayPaths: ['output_images', 'outputImages', 'data.output_images', 'data.outputImages'], itemPaths: ['url', 'image_url', 'imageUrl'] }
      ],
      errorPaths: ['errors.message', 'message', 'data.errors.message', 'data.message'],
      successWithoutUrlError: 'ModelScope image task succeeded without url',
      defaultFailureMessage: 'ModelScope image task failed'
    }),
  timeoutMs: (ctx) => Math.max(ctx.timeoutMs, 300_000),
  intervalMs: 5_000,
  fallbackError: (_ctx, state) => `ModelScope image polling timed out (taskId=${state.taskId})`
});
