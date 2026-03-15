import { throwByStatus } from '../vendors/video/common.js';

export type RecipeResponseType = 'json' | 'binary-or-json';

export type HttpRequestSpec = {
  url: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: unknown;
  responseType?: RecipeResponseType;
  binaryMimeType?: string;
  errorPrefix: string;
};

const isBinaryBody = (body: unknown): body is ArrayBuffer | Uint8Array => {
  return body instanceof ArrayBuffer || body instanceof Uint8Array;
};

const isFormDataLike = (body: unknown): body is FormData => {
  return typeof FormData !== 'undefined' && body instanceof FormData;
};

const normalizeBody = (body: unknown, headers: Record<string, string>): BodyInit | undefined => {
  if (body === undefined) {
    return undefined;
  }
  if (typeof body === 'string' || isBinaryBody(body) || isFormDataLike(body)) {
    return body as BodyInit;
  }
  if (!Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')) {
    headers['Content-Type'] = 'application/json';
  }
  return JSON.stringify(body);
};

const normalizeBinaryInlineData = async (response: Response, fallbackMimeType?: string): Promise<unknown> => {
  const contentType = String(response.headers.get('content-type') ?? '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase();
  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    inlineData: {
      data: buffer.toString('base64'),
      mimeType: contentType && contentType !== 'application/octet-stream' ? contentType : fallbackMimeType || contentType || 'application/octet-stream'
    }
  };
};

export const executeHttpRequest = async (spec: HttpRequestSpec): Promise<unknown> => {
  const headers = { ...(spec.headers ?? {}) };
  const response = await fetch(spec.url, {
    method: spec.method ?? 'POST',
    headers,
    body: normalizeBody(spec.body, headers)
  });

  if (!response.ok) {
    await throwByStatus(response, spec.errorPrefix);
  }

  if (spec.responseType === 'binary-or-json') {
    const contentType = String(response.headers.get('content-type') ?? '')
      .split(';', 1)[0]
      .trim()
      .toLowerCase();
    if (contentType.startsWith('audio/') || contentType === 'application/octet-stream') {
      return normalizeBinaryInlineData(response, spec.binaryMimeType);
    }
  }

  return response.json();
};
