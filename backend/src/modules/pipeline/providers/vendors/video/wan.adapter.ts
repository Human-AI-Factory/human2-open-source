import { ProviderValidationError } from '../../errors.js';
import { VendorVideoAdapter } from './types.js';
import { getProviderOptions, normalizeAuthHeader, withIdempotencyHeader, toJsonHeaders } from './common.js';
import { createVideoPollingRecipeAdapter } from '../../recipes/adapter-factories.js';

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

const extractWanTaskError = (raw: unknown, fallback: string): string => {
  const record = asRecord(raw);
  if (!record) {
    return fallback;
  }
  const output = asRecord(record.output);
  const data = asRecord(record.data);
  const candidates = [
    output?.message,
    output?.task_status_msg,
    output?.taskStatusMsg,
    output?.error_message,
    output?.errorMessage,
    record.message,
    record.error_message,
    record.errorMessage,
    data?.message,
    data?.error_message,
    data?.errorMessage,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  const code =
    (typeof output?.code === 'string' && output.code.trim()) ||
    (typeof record.code === 'string' && record.code.trim()) ||
    (typeof data?.code === 'string' && data.code.trim()) ||
    null;
  if (code) {
    return `[${code}] ${fallback}`;
  }
  return fallback;
};

export const wanVideoAdapter: VendorVideoAdapter = createVideoPollingRecipeAdapter({
  manufacturer: 'wan',
  buildSubmitRequest: ({ config, input, defaultEndpoint, defaultAuthHeader }) => {
    const submitUrl = config.endpoints.submit || config.endpoints.text2video || config.endpoint || defaultEndpoint || '';
    const queryUrlTemplate = config.endpoints.query || '';
    if (!submitUrl || !queryUrlTemplate) {
      throw new ProviderValidationError('wan submit/query endpoints are not configured');
    }
    const authHeaders = normalizeAuthHeader(config.authType, config.apiKey, defaultAuthHeader);
    const options = getProviderOptions(input.providerOptions, 'wan');
    const roleEntries = Array.isArray(input.imageWithRoles) ? input.imageWithRoles : [];
    const primaryRoleUrl =
      roleEntries.find((item) => item.role === 'first_frame')?.url?.trim() ||
      roleEntries.find((item) => item.role === 'reference')?.url?.trim() ||
      (Array.isArray(input.imageInputs) ? input.imageInputs.find((item) => typeof item === 'string' && item.trim()) : '') ||
      '';
    const isImageToVideoMode = input.mode && input.mode !== 'text';
    return {
      url: submitUrl,
      headers: {
        ...toJsonHeaders(withIdempotencyHeader(authHeaders, input.idempotencyKey)),
        'X-DashScope-Async': 'enable'
      },
      body: {
        model: config.model || input.model,
        input: isImageToVideoMode
          ? {
              img_url: primaryRoleUrl,
              ...(typeof options.template === 'string' && options.template.trim()
                ? { template: options.template.trim() }
                : {})
            }
          : {
              prompt: input.prompt,
              ...(typeof options.negativePrompt === 'string' ? { negative_prompt: options.negativePrompt } : {})
            },
        parameters: {
          duration: input.duration ?? 5,
          ...(input.resolution ? { resolution: input.resolution } : {}),
          ...(input.aspectRatio ? { aspect_ratio: input.aspectRatio } : {}),
          ...(typeof options.seed === 'number' ? { seed: Math.floor(options.seed) } : {}),
          ...(typeof options.style === 'string' ? { style: options.style } : {}),
          ...(typeof options.motionStrength === 'number' ? { motion_strength: options.motionStrength } : {}),
          ...(typeof options.cinematic === 'boolean' ? { cinematic: options.cinematic } : {})
        }
      },
      errorPrefix: 'wan submit failed'
    };
  },
  onSubmit: (_ctx, data) => {
    const record = data as {
      output?: { task_id?: string };
      code?: string;
      message?: string;
    };
    if (record.code) {
      throw new ProviderValidationError(`wan submit failed: [${record.code}] ${record.message ?? ''}`.trim());
    }
    const taskId = record.output?.task_id;
    if (!taskId) {
      throw new ProviderValidationError('wan submit response missing task id');
    }
    return { taskId };
  },
  resumeTaskId: ({ input }) => input.providerTaskId?.trim() || undefined,
  onTaskAccepted: async ({ input }, state) => {
    if (!state.resumed) {
      await input.onProviderTaskAccepted?.(state.taskId);
    }
  },
  buildPollRequest: ({ config, input, defaultAuthHeader }, state) => ({
    url: config.endpoints.query.replace('{taskId}', state.taskId),
    method: 'GET',
    headers: toJsonHeaders(
      withIdempotencyHeader(normalizeAuthHeader(config.authType, config.apiKey, defaultAuthHeader), input.idempotencyKey)
    ),
    errorPrefix: 'wan query failed'
  }),
  onPoll: (_ctx, data, state) => {
    const record = data as {
      output?: {
        task_status?: string;
        video_url?: string;
        code?: string;
        message?: string;
      };
      code?: string;
      message?: string;
    };
    if (record.code) {
      return { done: false, error: `wan query failed: [${record.code}] ${record.message ?? ''}`.trim() };
    }
    const status = (record.output?.task_status || '').toUpperCase();
    if (status === 'SUCCEEDED') {
      const url = record.output?.video_url;
      if (!url) {
        return { done: false, error: 'wan task succeeded without video url' };
      }
      return { done: true, value: { url, providerTaskId: state.taskId } };
    }
    if (status === 'FAILED' || status === 'CANCELED') {
      return { done: false, error: extractWanTaskError(data, `wan task ${status.toLowerCase()}`) };
    }
    return { done: false };
  },
  initialIntervalMs: 2_000,
  maxIntervalMs: 12_000,
  backoffMultiplier: 1.5,
  timeoutMs: (ctx) => Math.max(ctx.timeoutMs, 900_000),
  fallbackError: () => 'wan video polling timed out'
});
