import { getToken } from '@/api/client';
import { API_BASE_URL } from '@/config/env';

export const buildQuery = (input: Record<string, string | number | boolean | null | undefined>): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }
    search.set(key, String(value));
  }
  return search.toString();
};

const normalizeApiPath = (path: string): string => {
  if (path.startsWith('/api/')) {
    return path.slice(4);
  }
  if (path.startsWith('/')) {
    return path;
  }
  return `/${path}`;
};

export const resolveApiUrl = (path: string): string => `${API_BASE_URL}${normalizeApiPath(path)}`;

export const downloadAuthorizedFile = async (
  path: string,
  input: { defaultFilename: string }
): Promise<{ blob: Blob; filename: string }> => {
  const token = getToken();
  const response = await fetch(resolveApiUrl(path), {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `导出失败(${response.status})`);
  }
  const disposition = response.headers.get('content-disposition') || '';
  const matched = disposition.match(/filename=\"?([^\";]+)\"?/i);
  return {
    blob: await response.blob(),
    filename: matched?.[1] || input.defaultFilename
  };
};
