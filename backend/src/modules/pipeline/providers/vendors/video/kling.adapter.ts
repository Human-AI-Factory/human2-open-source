import { ProviderValidationError } from '../../errors.js';
import { VendorVideoAdapter } from './types.js';
import { getProviderOptions, normalizeAuthHeader, readPollingUrlResult, readTaskIdOrThrow, withIdempotencyHeader, toJsonHeaders } from './common.js';
import { createVideoPollingRecipeAdapter } from '../../recipes/adapter-factories.js';

export const klingVideoAdapter: VendorVideoAdapter = createVideoPollingRecipeAdapter({
  manufacturer: 'kling',
  buildSubmitRequest: ({ config, input, defaultEndpoint, defaultAuthHeader }) => {
    const submitUrl = config.endpoints.submit || config.endpoints.text2video || config.endpoint || defaultEndpoint || '';
    if (!submitUrl) {
      throw new ProviderValidationError('kling submit endpoint is not configured');
    }
    const authHeaders = normalizeAuthHeader(config.authType, config.apiKey, defaultAuthHeader);
    const options = getProviderOptions(input.providerOptions, 'kling');
    return {
      url: submitUrl,
      headers: toJsonHeaders(withIdempotencyHeader(authHeaders, input.idempotencyKey)),
      body: {
        model_name: config.model || input.model,
        mode: input.mode,
        prompt: input.prompt,
        duration: input.duration ? String(input.duration) : undefined,
        aspect_ratio: input.aspectRatio,
        resolution: input.resolution,
        projectId: input.projectId,
        storyboardId: input.storyboardId,
        ...(typeof options.negativePrompt === 'string' ? { negative_prompt: options.negativePrompt } : {}),
        ...(typeof options.cfgScale === 'number' ? { cfg_scale: options.cfgScale } : {}),
        ...(typeof options.steps === 'number' ? { steps: Math.floor(options.steps) } : {}),
        ...(typeof options.cameraControl === 'object' && options.cameraControl !== null ? { camera_control: options.cameraControl } : {}),
        ...(typeof options.motionBrush === 'object' && options.motionBrush !== null ? { motion_brush: options.motionBrush } : {}),
        ...(typeof options.seed === 'number' ? { seed: Math.floor(options.seed) } : {})
      },
      errorPrefix: 'kling submit failed'
    };
  },
  onSubmit: (_ctx, data) => {
    const record = data as {
      code?: number;
      message?: string;
      data?: { task_id?: string };
      task_id?: string;
    };
    if (typeof record.code === 'number' && record.code !== 0) {
      throw new ProviderValidationError(record.message || 'kling submit failed');
    }
    return {
      taskId: readTaskIdOrThrow(record, ['data.task_id', 'task_id'], 'kling submit response missing task id')
    };
  },
  buildPollRequest: ({ config, input, defaultEndpoint, defaultAuthHeader }, state) => {
    const submitUrl = config.endpoints.submit || config.endpoints.text2video || config.endpoint || defaultEndpoint || '';
    const queryUrlTemplate = config.endpoints.query || `${submitUrl}/{taskId}`;
    return {
      url: queryUrlTemplate.replace('{taskId}', state.taskId),
      method: 'GET',
      headers: toJsonHeaders(withIdempotencyHeader(normalizeAuthHeader(config.authType, config.apiKey, defaultAuthHeader), input.idempotencyKey)),
      errorPrefix: 'kling query failed'
    };
  },
  onPoll: (_ctx, data, state) => {
    const record = data as {
      code?: number;
      message?: string;
      data?: Record<string, unknown>;
    };
    if (typeof record.code === 'number' && record.code !== 0) {
      return { done: false, error: record.message || 'kling query failed' };
    }
    return readPollingUrlResult(record, {
      statusPaths: ['data.task_status'],
      successStatuses: ['succeed', 'success', 'done'],
      failureStatuses: ['failed'],
      urlArrayPaths: [{ arrayPaths: ['data.task_result.videos'], itemPaths: ['url'] }],
      errorPaths: ['data.task_status_msg'],
      successWithoutUrlError: 'kling task succeeded without video url',
      defaultFailureMessage: 'kling task failed',
      providerTaskId: state.taskId
    });
  },
  fallbackError: () => 'kling video polling timed out'
});
