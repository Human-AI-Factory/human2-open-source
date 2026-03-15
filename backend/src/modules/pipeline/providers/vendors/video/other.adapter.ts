import { ProviderValidationError } from '../../errors.js';
import { VendorVideoAdapter } from './types.js';
import { normalizeAuthHeader, withIdempotencyHeader, toJsonHeaders } from './common.js';
import { createVideoPollingRecipeAdapter } from '../../recipes/adapter-factories.js';

export const otherVideoAdapter: VendorVideoAdapter = createVideoPollingRecipeAdapter({
  manufacturer: 'other',
  buildSubmitRequest: ({ config, input, defaultEndpoint, defaultAuthHeader }) => {
    const submitUrl = config.endpoints.submit || config.endpoints.text2video || config.endpoint || defaultEndpoint || '';
    if (!submitUrl) {
      throw new ProviderValidationError('other video endpoint is not configured');
    }
    return {
      url: submitUrl,
      headers: toJsonHeaders(withIdempotencyHeader(normalizeAuthHeader(config.authType, config.apiKey, defaultAuthHeader), input.idempotencyKey)),
      body: {
        model: config.model || input.model,
        prompt: input.prompt,
        mode: input.mode,
        duration: input.duration,
        resolution: input.resolution,
        aspectRatio: input.aspectRatio,
        audio: input.audio,
        imageInputs: input.imageInputs,
        imageWithRoles: input.imageWithRoles,
        endFrame: input.endFrame,
        projectId: input.projectId,
        storyboardId: input.storyboardId
      },
      errorPrefix: 'other video submit failed'
    };
  },
  onSubmit: ({ config }, data) => {
    const record = data as {
      url?: string;
      videoUrl?: string;
      data?: { url?: string; videoUrl?: string };
      taskId?: string;
      task_id?: string;
    };
    const directUrl = record.url || record.videoUrl || record.data?.url || record.data?.videoUrl;
    const taskId = record.taskId || record.task_id;
    if (directUrl) {
      return { directResult: { url: directUrl, ...(taskId ? { providerTaskId: taskId } : {}) } };
    }
    if (!taskId || !config.endpoints.query) {
      throw new ProviderValidationError('other video response missing url/task id');
    }
    return { taskId };
  },
  buildPollRequest: ({ config, input, defaultAuthHeader }, state) => ({
    url: `${config.endpoints.query}?taskId=${encodeURIComponent(state.taskId)}`,
    method: 'GET',
    headers: toJsonHeaders(
      withIdempotencyHeader(normalizeAuthHeader(config.authType, config.apiKey, defaultAuthHeader), input.idempotencyKey)
    ),
    errorPrefix: 'other video query failed'
  }),
  onPoll: (_ctx, data, state) => {
    const record = data as {
      status?: string;
      state?: string;
      url?: string;
      videoUrl?: string;
      data?: { url?: string; videoUrl?: string };
      error?: string;
    };
    const status = String(record.status || record.state || '').toLowerCase();
    const polledUrl = record.url || record.videoUrl || record.data?.url || record.data?.videoUrl;
    if (status === 'done' || status === 'success' || status === 'completed') {
      if (!polledUrl) {
        return { done: false, error: 'other video task succeeded without url' };
      }
      return { done: true, value: { url: polledUrl, providerTaskId: state.taskId } };
    }
    if (status === 'failed' || status === 'error') {
      return { done: false, error: record.error || 'other video task failed' };
    }
    if (polledUrl) {
      return { done: true, value: { url: polledUrl, providerTaskId: state.taskId } };
    }
    return { done: false };
  },
  fallbackError: () => 'other video polling timed out'
});
