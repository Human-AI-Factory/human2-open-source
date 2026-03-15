import { ProviderValidationError } from '../../errors.js';
import { VendorVideoAdapter } from './types.js';
import { normalizeAuthHeader, toJsonHeaders, withIdempotencyHeader } from './common.js';
import { createVideoPollingRecipeAdapter } from '../../recipes/adapter-factories.js';
import { firstStringAtPaths, firstStringInArrayItemsAtPaths } from '../../recipes/extractors.js';
import { readDirectUrlOrTaskId, readPollingUrlResult, readTaskIdOrNull } from '../polling.js';

const extractVideoUrl = (raw: unknown): string | null =>
  firstStringAtPaths(raw, [
    'url',
    'video_url',
    'videoUrl',
    'output_url',
    'outputUrl',
    'output_video',
    'outputVideo',
    'output_video_url',
    'outputVideoUrl',
    'result_url',
    'resultUrl',
    'output.url',
    'output.video_url',
    'output.videoUrl',
    'result.url',
    'result.video_url',
    'result.videoUrl',
    'data.url',
    'data.video_url',
    'data.videoUrl'
  ]) ||
  firstStringInArrayItemsAtPaths(
    raw,
    [
      'output_videos',
      'outputVideos',
      'videos',
      'output.output_videos',
      'output.outputVideos',
      'output.videos',
      'result.output_videos',
      'result.outputVideos',
      'result.videos',
      'data.output_videos',
      'data.outputVideos',
      'data.videos'
    ],
    ['url', 'video_url', 'videoUrl']
  );

const buildTaskQueryUrl = (submitUrl: string, queryTemplate: string | undefined, taskId: string): string => {
  if (queryTemplate?.trim()) {
    return queryTemplate.replace('{taskId}', encodeURIComponent(taskId));
  }
  const submit = new URL(submitUrl);
  return `${submit.origin}/v1/tasks/${encodeURIComponent(taskId)}`;
};

export const modelscopeVideoAdapter: VendorVideoAdapter = createVideoPollingRecipeAdapter({
  manufacturer: 'modelscope',
  buildSubmitRequest: ({ config, input, defaultEndpoint, defaultAuthHeader }) => {
    const submitUrl = config.endpoints.submit || config.endpoints.text2video || config.endpoint || defaultEndpoint || '';
    if (!submitUrl) {
      throw new ProviderValidationError('ModelScope video endpoint is not configured');
    }
    if (input.mode && input.mode !== 'text') {
      throw new ProviderValidationError('ModelScope video adapter currently supports text mode only');
    }
    return {
      url: submitUrl,
      headers: toJsonHeaders(
        withIdempotencyHeader(
          {
            ...normalizeAuthHeader(config.authType, config.apiKey, defaultAuthHeader),
            'X-ModelScope-Async-Mode': 'true',
            'X-ModelScope-DataInspection': '{}'
          },
          input.idempotencyKey
        )
      ),
      body: {
        model: config.model || input.model,
        prompt: input.prompt,
        ...(input.duration !== undefined ? { duration: input.duration } : {}),
        ...(input.resolution ? { resolution: input.resolution } : {}),
        ...(input.aspectRatio ? { aspect_ratio: input.aspectRatio } : {})
      },
      errorPrefix: 'ModelScope video submit failed'
    };
  },
  onSubmit: (_ctx, data) => {
    const directUrl = extractVideoUrl(data);
    const taskId = readTaskIdOrNull(data, ['task_id', 'taskId', 'data.task_id', 'data.taskId']);
    if (directUrl) {
      return {
        directResult: {
          url: directUrl,
          ...(taskId ? { providerTaskId: taskId } : {})
        }
      };
    }
    return readDirectUrlOrTaskId(data, {
      taskIdPaths: ['task_id', 'taskId', 'data.task_id', 'data.taskId'],
      missingTaskIdMessage: 'ModelScope video response missing task id'
    });
  },
  buildPollRequest: ({ config, input, defaultEndpoint, defaultAuthHeader }, state) => {
    const submitUrl = config.endpoints.submit || config.endpoints.text2video || config.endpoint || defaultEndpoint || '';
    return {
      url: buildTaskQueryUrl(submitUrl, config.endpoints.query, state.taskId),
      method: 'GET',
      headers: toJsonHeaders(normalizeAuthHeader(config.authType, config.apiKey, defaultAuthHeader)),
      errorPrefix: 'ModelScope video query failed'
    };
  },
  onPoll: (_ctx, data, state) => {
    const url = extractVideoUrl(data);
    if (url) {
      return { done: true, value: { url, providerTaskId: state.taskId } };
    }
    return readPollingUrlResult(data, {
      statusPaths: ['task_status', 'taskStatus', 'status', 'data.task_status', 'data.taskStatus', 'data.status'],
      successStatuses: ['succeeded', 'success', 'completed', 'done'],
      failureStatuses: ['failed', 'error', 'cancelled'],
      errorPaths: ['errors.message', 'message', 'data.errors.message', 'data.message'],
      successWithoutUrlError: 'ModelScope video task succeeded without video url',
      defaultFailureMessage: 'ModelScope video task failed',
      providerTaskId: state.taskId
    });
  },
  timeoutMs: (ctx) => Math.max(ctx.timeoutMs, 300_000),
  intervalMs: 5_000,
  fallbackError: () => 'ModelScope video polling timed out'
});
