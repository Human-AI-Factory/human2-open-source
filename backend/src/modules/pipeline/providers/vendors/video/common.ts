import { ProviderAuthError, ProviderRateLimitError, ProviderTransientError, ProviderValidationError } from '../../errors.js';
import {
  firstStringAtPaths
} from '../../recipes/extractors.js';
import {
  readPollingUrlResult,
  readTaskIdOrThrow,
  readUrlAtPaths,
  type UrlArrayPathSpec
} from '../polling.js';

const PLACEHOLDER_API_KEY_PATTERNS = [
  /<token>/i,
  /你的真实token/i,
  /your\s+(real\s+)?token/i,
  /replace.+token/i
];

export const sanitizeApiKey = (apiKey: string): string => {
  const normalized = apiKey.replace(/^Bearer\s+/i, '').trim();
  if (!normalized) {
    return '';
  }
  if (/[^\x20-\x7E]/.test(normalized) || PLACEHOLDER_API_KEY_PATTERNS.some((pattern) => pattern.test(normalized))) {
    throw new ProviderValidationError('Configured API key still contains placeholder or non-ASCII characters. Replace it with the real provider token.');
  }
  return normalized;
};

export const normalizeAuthHeader = (
  authType: 'bearer' | 'api_key' | 'none',
  apiKey: string,
  headerName = 'Authorization'
): Record<string, string> => {
  if (authType === 'none' || !apiKey.trim()) {
    return {};
  }
  if (authType === 'api_key') {
    return { [headerName]: sanitizeApiKey(apiKey) };
  }
  return { [headerName]: `Bearer ${sanitizeApiKey(apiKey)}` };
};

export const toJsonHeaders = (extra?: Record<string, string>): Record<string, string> => ({
  'Content-Type': 'application/json',
  ...(extra ?? {})
});

export const withIdempotencyHeader = (headers: Record<string, string>, idempotencyKey?: string): Record<string, string> => {
  if (!idempotencyKey) {
    return headers;
  }
  return {
    ...headers,
    'Idempotency-Key': idempotencyKey
  };
};

export const throwByStatus = async (response: Response, fallbackPrefix: string): Promise<never> => {
  const text = await response.text().catch(() => '');
  const message = `${fallbackPrefix}: ${response.status}${text ? ` ${text}` : ''}`;
  if (response.status === 400 || response.status === 402) {
    throw new ProviderValidationError(message, response.status);
  }
  if (response.status === 401 || response.status === 403) {
    throw new ProviderAuthError(message, response.status);
  }
  if (response.status === 429) {
    throw new ProviderRateLimitError(message, response.status);
  }
  if (response.status >= 500) {
    throw new ProviderTransientError(message, response.status);
  }
  throw new Error(message);
};

export const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

export const pollWithTimeout = async <T>(
  fn: () => Promise<{ done: boolean; value?: T; error?: string }>,
  options: {
    timeoutMs: number;
    intervalMs?: number;
    initialIntervalMs?: number;
    maxIntervalMs?: number;
    backoffMultiplier?: number;
    fallbackError: string;
  }
): Promise<T> => {
  const start = Date.now();
  let intervalMs = options.initialIntervalMs ?? options.intervalMs ?? 2000;
  const maxIntervalMs = options.maxIntervalMs ?? intervalMs;
  const backoffMultiplier = options.backoffMultiplier ?? 1;
  while (Date.now() - start < options.timeoutMs) {
    const status = await fn();
    if (status.done && status.value !== undefined) {
      return status.value;
    }
    if (status.error) {
      throw new Error(status.error);
    }
    await sleep(intervalMs);
    intervalMs = Math.min(maxIntervalMs, Math.max(intervalMs, Math.round(intervalMs * backoffMultiplier)));
  }
  throw new ProviderTransientError(options.fallbackError);
};

const KNOWN_MANUFACTURERS = ['modelscope', 'volcengine', 'kling', 'vidu', 'wan', 'runninghub', 'apimart', 'gemini', 'other'] as const;

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

export const getProviderOptions = (raw: unknown, manufacturer: string): Record<string, unknown> => {
  const root = asRecord(raw);
  if (!root) {
    return {};
  }
  const normalizedManufacturer = manufacturer.trim().toLowerCase();
  const scoped = asRecord(root[normalizedManufacturer]);
  const global = asRecord(root.global);
  if (scoped || global) {
    return {
      ...(global ?? {}),
      ...(scoped ?? {})
    };
  }
  const hasKnownVendorKey = KNOWN_MANUFACTURERS.some((name) => asRecord(root[name]));
  if (hasKnownVendorKey) {
    return {};
  }
  return root;
};

export { readPollingUrlResult, readTaskIdOrThrow, readUrlAtPaths };
