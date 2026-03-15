import { API_BASE_URL } from '@/config/env';

const TOKEN_KEY = 'tf_next_lite_token';
export const AUTH_EXPIRED_EVENT = 'tf-auth-expired';

export const getToken = (): string => localStorage.getItem(TOKEN_KEY) ?? '';
export const setToken = (token: string): void => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = (): void => localStorage.removeItem(TOKEN_KEY);

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly bizCode: string | null = null
  ) {
    super(message);
  }
}

type ApiEnvelope<T> = {
  code: number;
  bizCode: string;
  data: T;
  message: string;
};

const isApiEnvelope = <T>(payload: unknown): payload is ApiEnvelope<T> => {
  if (!payload || typeof payload !== 'object') {
    return false;
  }
  const data = payload as Record<string, unknown>;
  return 'code' in data && 'bizCode' in data && 'data' in data && 'message' in data;
};

const shouldForceRelogin = (url: string, status: number, hadToken: boolean): boolean => {
  if (status !== 401 || !hadToken) {
    return false;
  }
  return !url.startsWith('/api/auth/login');
};

const normalizeApiPath = (url: string): string => {
  if (url.startsWith('/api/')) {
    return url.slice(4);
  }
  if (url.startsWith('/')) {
    return url;
  }
  return `/${url}`;
};

const resolveRequestUrl = (url: string): string => {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  return `${API_BASE_URL}${normalizeApiPath(url)}`;
};

export async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const hadToken = Boolean(token);
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const requestUrl = resolveRequestUrl(url);
  const response = await fetch(requestUrl, {
    ...options,
    headers
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const data = await response.json().catch(() => ({}));

  if (isApiEnvelope<T>(data)) {
    if (!response.ok || data.code < 200 || data.code >= 300) {
      if (shouldForceRelogin(url, response.status, hadToken)) {
        clearToken();
        window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
      }
      throw new ApiError(response.status, data.message || 'Request failed', data.bizCode || null);
    }
    return data.data as T;
  }

  if (!response.ok) {
    if (shouldForceRelogin(url, response.status, hadToken)) {
      clearToken();
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    }
    const bizCode =
      data && typeof data === 'object' && !Array.isArray(data) && typeof (data as Record<string, unknown>).bizCode === 'string'
        ? String((data as Record<string, unknown>).bizCode)
        : null;
    throw new ApiError(response.status, data.message || 'Request failed', bizCode);
  }

  return data as T;
}

export async function requestForm<T>(url: string, formData: FormData, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const hadToken = Boolean(token);
  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const requestUrl = resolveRequestUrl(url);
  const response = await fetch(requestUrl, {
    ...options,
    method: options.method ?? 'POST',
    headers,
    body: formData
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const data = await response.json().catch(() => ({}));
  if (isApiEnvelope<T>(data)) {
    if (!response.ok || data.code < 200 || data.code >= 300) {
      if (shouldForceRelogin(url, response.status, hadToken)) {
        clearToken();
        window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
      }
      throw new ApiError(response.status, data.message || 'Request failed', data.bizCode || null);
    }
    return data.data as T;
  }

  if (!response.ok) {
    if (shouldForceRelogin(url, response.status, hadToken)) {
      clearToken();
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    }
    const bizCode =
      data && typeof data === 'object' && !Array.isArray(data) && typeof (data as Record<string, unknown>).bizCode === 'string'
        ? String((data as Record<string, unknown>).bizCode)
        : null;
    throw new ApiError(response.status, data.message || 'Request failed', bizCode);
  }

  return data as T;
}

export async function requestText(url: string, options: RequestInit = {}): Promise<string> {
  const token = getToken();
  const hadToken = Boolean(token);
  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const requestUrl = resolveRequestUrl(url);
  const response = await fetch(requestUrl, {
    ...options,
    headers
  });
  const text = await response.text();
  if (!response.ok) {
    if (shouldForceRelogin(url, response.status, hadToken)) {
      clearToken();
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    }
    throw new ApiError(response.status, text || 'Request failed');
  }
  return text;
}
