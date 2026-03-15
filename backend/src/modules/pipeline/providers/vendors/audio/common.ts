import { ProviderAudioInput } from '../../types.js';
import { ProviderValidationError } from '../../errors.js';
import { getProviderOptions, normalizeAuthHeader, pollWithTimeout, throwByStatus, toJsonHeaders } from '../video/common.js';
import { VendorAudioAdapter } from './types.js';
import { createAudioPollingRecipeAdapter } from '../../recipes/adapter-factories.js';

type AudioProviderOptions = {
  language?: string;
  style?: string;
  seed?: number;
  temperature?: number;
  topP?: number;
  sampleRate?: number;
  bitrateKbps?: number;
  volume?: number;
  pitch?: number;
  channels?: number;
  noiseScale?: number;
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

export const readAudioProviderOptions = (raw: unknown, manufacturer: string): AudioProviderOptions => {
  const scoped = getProviderOptions(raw, manufacturer);
  return {
    language: typeof scoped.language === 'string' ? scoped.language : undefined,
    style: typeof scoped.style === 'string' ? scoped.style : undefined,
    seed: typeof scoped.seed === 'number' && Number.isFinite(scoped.seed) ? Math.floor(scoped.seed) : undefined,
    temperature: typeof scoped.temperature === 'number' && Number.isFinite(scoped.temperature) ? scoped.temperature : undefined,
    topP: typeof scoped.topP === 'number' && Number.isFinite(scoped.topP) ? scoped.topP : undefined,
    sampleRate: typeof scoped.sampleRate === 'number' && Number.isFinite(scoped.sampleRate) ? Math.floor(scoped.sampleRate) : undefined,
    bitrateKbps: typeof scoped.bitrateKbps === 'number' && Number.isFinite(scoped.bitrateKbps) ? Math.floor(scoped.bitrateKbps) : undefined,
    volume: typeof scoped.volume === 'number' && Number.isFinite(scoped.volume) ? scoped.volume : undefined,
    pitch: typeof scoped.pitch === 'number' && Number.isFinite(scoped.pitch) ? scoped.pitch : undefined,
    channels: typeof scoped.channels === 'number' && Number.isFinite(scoped.channels) ? Math.floor(scoped.channels) : undefined,
    noiseScale: typeof scoped.noiseScale === 'number' && Number.isFinite(scoped.noiseScale) ? scoped.noiseScale : undefined
  };
};

const readAudioTaskStatus = (raw: unknown): string => {
  const record = asRecord(raw);
  if (!record) {
    return '';
  }
  const status = record.status ?? record.state;
  return typeof status === 'string' ? status.trim().toLowerCase() : '';
};

export const buildAudioPayload = (input: ProviderAudioInput, options: AudioProviderOptions): Record<string, unknown> => ({
  model: input.modelConfig?.model || input.model,
  prompt: input.prompt,
  projectId: input.projectId,
  storyboardId: input.storyboardId,
  ...(input.voice ? { voice: input.voice } : {}),
  ...(input.speed !== undefined ? { speed: input.speed } : {}),
  ...(input.emotion ? { emotion: input.emotion } : {}),
  ...(input.format ? { format: input.format } : {}),
  ...(options.language ? { language: options.language } : {}),
  ...(options.style ? { style: options.style } : {}),
  ...(options.seed !== undefined ? { seed: options.seed } : {}),
  ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
  ...(options.topP !== undefined ? { top_p: options.topP } : {}),
  ...(options.sampleRate !== undefined ? { sample_rate: options.sampleRate } : {}),
  ...(options.bitrateKbps !== undefined ? { bitrate_kbps: options.bitrateKbps } : {}),
  ...(options.volume !== undefined ? { volume: options.volume } : {}),
  ...(options.pitch !== undefined ? { pitch: options.pitch } : {}),
  ...(options.channels !== undefined ? { channels: options.channels } : {}),
  ...(options.noiseScale !== undefined ? { noise_scale: options.noiseScale } : {})
});

const findUrlFromRecord = (raw: Record<string, unknown>): string | null => {
  const directCandidates = ['url', 'audioUrl', 'audio_url', 'resultUrl', 'result_url', 'downloadUrl', 'download_url'];
  for (const key of directCandidates) {
    const value = raw[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  const data = asRecord(raw.data);
  if (data) {
    const nested = findUrlFromRecord(data);
    if (nested) {
      return nested;
    }
  }
  const result = asRecord(raw.result);
  if (result) {
    const nested = findUrlFromRecord(result);
    if (nested) {
      return nested;
    }
  }
  const inlineData =
    (asRecord(raw.inlineData) ?? asRecord(raw.inline_data) ?? asRecord(raw.audio)) as Record<string, unknown> | null;
  if (inlineData) {
    const base64 = typeof inlineData.data === 'string' ? inlineData.data : typeof inlineData.audioContent === 'string' ? inlineData.audioContent : null;
    if (base64 && base64.trim()) {
      const mime =
        typeof inlineData.mimeType === 'string'
          ? inlineData.mimeType
          : typeof inlineData.mime_type === 'string'
            ? inlineData.mime_type
            : 'audio/mpeg';
      return `data:${mime};base64,${base64}`;
    }
  }
  if (typeof raw.audioContent === 'string' && raw.audioContent.trim()) {
    return `data:audio/mpeg;base64,${raw.audioContent}`;
  }
  return null;
};

export const extractAudioUrl = (raw: unknown): string | null => {
  const rec = asRecord(raw);
  if (!rec) {
    return null;
  }
  return findUrlFromRecord(rec);
};

export const extractTaskId = (raw: unknown): string | null => {
  const rec = asRecord(raw);
  if (!rec) {
    return null;
  }
  const candidates = ['id', 'taskId', 'task_id', 'jobId', 'job_id'];
  for (const key of candidates) {
    const value = rec[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  const data = asRecord(rec.data);
  if (data) {
    for (const key of candidates) {
      const value = data[key];
      if (typeof value === 'string' && value.trim()) {
        return value;
      }
    }
  }
  return null;
};

export const createStandardPollingAudioAdapter = (manufacturer: string): VendorAudioAdapter =>
  createAudioPollingRecipeAdapter({
    manufacturer,
    buildSubmitRequest: ({ config, input, defaultEndpoint, defaultAuthHeader }) => {
      const submitUrl = config.endpoints.submit || config.endpoint || defaultEndpoint || '';
      if (!submitUrl) {
        throw new ProviderValidationError(`${manufacturer} audio endpoint is not configured`);
      }
      return {
        url: submitUrl,
        headers: toJsonHeaders(normalizeAuthHeader(config.authType, config.apiKey, defaultAuthHeader)),
        responseType: 'binary-or-json',
        body: buildAudioPayload(input, readAudioProviderOptions(input.providerOptions, manufacturer)),
        errorPrefix: `${manufacturer} audio submit failed`
      };
    },
    onSubmit: (_ctx, submitData) => {
      const direct = extractAudioUrl(submitData);
      const taskId = extractTaskId(submitData);
      return {
        ...(direct ? { directResult: { url: direct } } : {}),
        ...(taskId ? { taskId } : {})
      };
    },
    buildPollRequest: ({ config, defaultAuthHeader }, state) => {
      if (!config.endpoints.query) {
        throw new ProviderValidationError(`${manufacturer} audio query endpoint is not configured`);
      }
      return {
        url: config.endpoints.query.replace('{taskId}', state.taskId),
        method: 'GET',
        headers: toJsonHeaders(normalizeAuthHeader(config.authType, config.apiKey, defaultAuthHeader)),
        errorPrefix: `${manufacturer} audio query failed`
      };
    },
    onPoll: (_ctx, data) => {
      const url = extractAudioUrl(data);
      if (url) {
        return { done: true, value: { url } };
      }
      const status = readAudioTaskStatus(data);
      if (status === 'failed' || status === 'cancelled' || status === 'error') {
        return { done: false, error: `${manufacturer} audio task ${status}` };
      }
      return { done: false };
    },
    fallbackError: () => `${manufacturer} audio polling timed out`
  });

export const postAudioSubmit = async (input: {
  submitUrl: string;
  authType: 'bearer' | 'api_key' | 'none';
  apiKey: string;
  authHeader: string;
  payload: Record<string, unknown>;
  manufacturer: string;
}): Promise<unknown> => {
  const response = await fetch(input.submitUrl, {
    method: 'POST',
    headers: toJsonHeaders(normalizeAuthHeader(input.authType, input.apiKey, input.authHeader)),
    body: JSON.stringify(input.payload)
  });
  if (!response.ok) {
    await throwByStatus(response, `${input.manufacturer} audio submit failed`);
  }
  const contentType = String(response.headers.get('content-type') ?? '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase();
  if (
    contentType.startsWith('audio/') ||
    (contentType === 'application/octet-stream' &&
      (input.submitUrl.includes('/audio/speech') || input.submitUrl.includes('/services/audio/tts/realtimesynthesizer')))
  ) {
    const buffer = Buffer.from(await response.arrayBuffer());
    return {
      inlineData: {
        data: buffer.toString('base64'),
        mimeType: contentType === 'application/octet-stream' ? 'audio/mpeg' : contentType
      }
    };
  }
  return response.json();
};

export const pollAudioTaskUntilDone = async (input: {
  taskId: string;
  queryUrlTemplate: string;
  authType: 'bearer' | 'api_key' | 'none';
  apiKey: string;
  authHeader: string;
  timeoutMs: number;
  manufacturer: string;
}): Promise<{ url: string }> => {
  return pollWithTimeout(
    async () => {
      const queryUrl = input.queryUrlTemplate.replace('{taskId}', input.taskId);
      const response = await fetch(queryUrl, {
        headers: toJsonHeaders(normalizeAuthHeader(input.authType, input.apiKey, input.authHeader))
      });
      if (!response.ok) {
        await throwByStatus(response, `${input.manufacturer} audio query failed`);
      }
      const data = (await response.json()) as unknown;
      const url = extractAudioUrl(data);
      if (url) {
        return { done: true, value: { url } };
      }
      const rec = asRecord(data);
      const status = typeof rec?.status === 'string' ? rec.status.toLowerCase() : typeof rec?.state === 'string' ? rec.state.toLowerCase() : '';
      if (status === 'failed' || status === 'cancelled' || status === 'error') {
        return { done: false, error: `${input.manufacturer} audio task ${status}` };
      }
      return { done: false };
    },
    {
      timeoutMs: input.timeoutMs,
      intervalMs: 2000,
      fallbackError: `${input.manufacturer} audio polling timed out`
    }
  );
};

export const resolveAudioResult = async (input: {
  submitData: unknown;
  queryUrlTemplate?: string;
  authType: 'bearer' | 'api_key' | 'none';
  apiKey: string;
  authHeader: string;
  timeoutMs: number;
  manufacturer: string;
}): Promise<{ url: string }> => {
  const direct = extractAudioUrl(input.submitData);
  if (direct) {
    return { url: direct };
  }
  const taskId = extractTaskId(input.submitData);
  if (!taskId || !input.queryUrlTemplate) {
    throw new ProviderValidationError(`${input.manufacturer} audio response missing url`);
  }
  return pollAudioTaskUntilDone({
    taskId,
    queryUrlTemplate: input.queryUrlTemplate,
    authType: input.authType,
    apiKey: input.apiKey,
    authHeader: input.authHeader,
    timeoutMs: input.timeoutMs,
    manufacturer: input.manufacturer
  });
};
