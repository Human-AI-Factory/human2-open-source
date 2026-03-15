import { ProviderValidationError } from '../../errors.js';
import { VendorAudioAdapter } from './types.js';
import { extractAudioUrl, extractTaskId, readAudioProviderOptions } from './common.js';
import { normalizeAuthHeader, toJsonHeaders } from '../video/common.js';
import { createAudioPollingRecipeAdapter } from '../../recipes/adapter-factories.js';

const inferBinaryMimeType = (format?: string): string | undefined => {
  switch ((format || '').trim().toLowerCase()) {
    case 'mp3':
      return 'audio/mpeg';
    case 'wav':
      return 'audio/wav';
    case 'pcm':
      return 'audio/L16';
    case 'ogg':
    case 'opus':
      return 'audio/ogg';
    default:
      return undefined;
  }
};

export const wanAudioAdapter: VendorAudioAdapter = createAudioPollingRecipeAdapter({
  manufacturer: 'wan',
  buildSubmitRequest: ({ config, input, defaultEndpoint, defaultAuthHeader }) => {
    const submitUrl = config.endpoints.submit || config.endpoint || defaultEndpoint || '';
    if (!submitUrl) {
      throw new ProviderValidationError('wan audio endpoint is not configured');
    }
    const options = readAudioProviderOptions(input.providerOptions, 'wan');
    return {
      url: submitUrl,
      headers: toJsonHeaders(normalizeAuthHeader(config.authType, config.apiKey, defaultAuthHeader)),
      responseType: 'binary-or-json',
      binaryMimeType: inferBinaryMimeType(input.format),
      body: {
        model: config.model || input.model,
        input: {
          text: input.prompt,
        },
        parameters: {
          ...(input.voice ? { voice: input.voice } : {}),
          ...(input.format ? { format: input.format } : {}),
          ...(options.sampleRate !== undefined ? { sample_rate: options.sampleRate } : {}),
          ...(options.volume !== undefined ? { volume: options.volume } : {}),
          ...(input.speed !== undefined ? { speech_rate: input.speed } : {}),
          ...(options.pitch !== undefined ? { pitch_rate: options.pitch } : {}),
        },
      },
      errorPrefix: 'wan audio submit failed'
    };
  },
  onSubmit: (_ctx, submitData) => {
    const direct = extractAudioUrl(submitData);
    return {
      ...(direct ? { directResult: { url: direct } } : {}),
      ...(extractTaskId(submitData) ? { taskId: extractTaskId(submitData) ?? undefined } : {})
    };
  },
  buildPollRequest: ({ config, defaultAuthHeader }, state) => {
    if (!config.endpoints.query) {
      throw new ProviderValidationError('wan audio query endpoint is not configured');
    }
    return {
      url: config.endpoints.query.replace('{taskId}', state.taskId),
      method: 'GET',
      headers: toJsonHeaders(normalizeAuthHeader(config.authType, config.apiKey, defaultAuthHeader)),
      errorPrefix: 'wan audio query failed'
    };
  },
  onPoll: (_ctx, data) => {
    const url = extractAudioUrl(data);
    if (url) {
      return { done: true, value: { url } };
    }
    const status = String(
      (typeof data === 'object' && data && 'status' in data ? (data as { status?: unknown }).status : '') ||
        (typeof data === 'object' && data && 'state' in data ? (data as { state?: unknown }).state : '')
    ).toLowerCase();
    if (status === 'failed' || status === 'cancelled' || status === 'error') {
      return { done: false, error: `wan audio task ${status}` };
    }
    return { done: false };
  },
  fallbackError: () => 'wan audio polling timed out'
});
