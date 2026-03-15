import { ProviderValidationError } from '../../errors.js';
import { VendorVideoAdapter } from './types.js';
import { getProviderOptions, normalizeAuthHeader, readTaskIdOrThrow, withIdempotencyHeader, toJsonHeaders } from './common.js';
import { createVideoPollingRecipeAdapter } from '../../recipes/adapter-factories.js';

export const minimaxVideoAdapter: VendorVideoAdapter = createVideoPollingRecipeAdapter({
  manufacturer: 'minimax',
  buildSubmitRequest: ({ config, input, defaultEndpoint, defaultAuthHeader }) => {
    const submitUrl = config.endpoints.submit || config.endpoints.text2video || config.endpoint || defaultEndpoint || '';
    if (!submitUrl) {
      throw new ProviderValidationError('minimax submit endpoint is not configured');
    }
    const authHeaders = normalizeAuthHeader(config.authType, config.apiKey, defaultAuthHeader);
    const options = getProviderOptions(input.providerOptions, 'minimax');

    // Parse resolution
    let resolution: string | undefined;
    if (input.resolution) {
      const res = input.resolution.toLowerCase();
      if (res === '720p' || res === '720') resolution = '720P';
      else if (res === '768p' || res === '768') resolution = '768P';
      else if (res === '1080p' || res === '1080') resolution = '1080P';
      else resolution = input.resolution;
    }

    return {
      url: submitUrl,
      headers: toJsonHeaders(withIdempotencyHeader(authHeaders, input.idempotencyKey)),
      body: {
        model: config.model || input.model,
        prompt: input.prompt,
        ...(input.duration ? { duration: input.duration } : {}),
        ...(resolution ? { resolution } : {}),
        ...(typeof options.promptOptimizer === 'boolean' ? { prompt_optimizer: options.promptOptimizer } : {}),
        ...(typeof options.fastPretreatment === 'boolean' ? { fast_pretreatment: options.fastPretreatment } : {}),
        ...(typeof options.aigcWatermark === 'boolean' ? { aigc_watermark: options.aigcWatermark } : {}),
        ...(typeof options.seed === 'number' ? { seed: Math.floor(options.seed) } : {})
      },
      errorPrefix: 'minimax submit failed'
    };
  },
  onSubmit: (_ctx, data) => {
    const record = data as {
      task_id?: string;
      base_resp?: { status_code?: number; status_msg?: string };
    };
    if (record.base_resp?.status_code && record.base_resp.status_code !== 0) {
      throw new ProviderValidationError(record.base_resp.status_msg || 'minimax submit failed');
    }
    return {
      taskId: readTaskIdOrThrow(record, ['task_id'], 'minimax submit response missing task id')
    };
  },
  buildPollRequest: ({ config, input, defaultAuthHeader }, state) => {
    const submitUrl = config.endpoints.submit || config.endpoint || '';
    // MiniMax uses same base URL for query, task_id in path
    const queryUrlTemplate = config.endpoints.query || `${submitUrl.replace('/video_generation', '/query/video_generation')}/{taskId}`;
    return {
      url: queryUrlTemplate.replace('{taskId}', state.taskId),
      method: 'GET',
      headers: toJsonHeaders(
        withIdempotencyHeader(normalizeAuthHeader(config.authType, config.apiKey, defaultAuthHeader), input.idempotencyKey)
      ),
      errorPrefix: 'minimax query failed'
    };
  },
  onPoll: (_ctx, data, state) => {
    const record = data as {
      task_id?: string;
      status?: string;
      base_resp?: { status_code?: number; status_msg?: string };
      file_ids?: string[];
      file_id?: string;
    };

    if (record.base_resp?.status_code && record.base_resp.status_code !== 0) {
      return { done: false, error: record.base_resp.status_msg || 'minimax query failed' };
    }

    const status = (record.status || '').toLowerCase();
    if (status === 'success') {
      const fileId = record.file_ids?.[0] || record.file_id;
      if (!fileId) {
        return { done: false, error: 'minimax task succeeded without file id' };
      }
      // MiniMax returns file_id, we need to construct the URL or return the file_id
      // The actual video URL needs to be obtained from another API or callback
      return { done: true, value: { url: fileId, providerTaskId: state.taskId } };
    }

    if (status === 'failed' || status === 'failed') {
      return { done: false, error: record.base_resp?.status_msg || 'minimax task failed' };
    }

    return { done: false };
  },
  initialIntervalMs: 3_000,
  maxIntervalMs: 15_000,
  backoffMultiplier: 1.5,
  timeoutMs: (ctx) => Math.max(ctx.timeoutMs, 600_000),
  fallbackError: () => 'minimax video polling timed out'
});
