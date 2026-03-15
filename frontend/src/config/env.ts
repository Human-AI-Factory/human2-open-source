const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

const metaEnv =
  ((import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env as Record<string, string | undefined> | undefined) ??
  undefined;
const rawApiBase = metaEnv?.VITE_API_BASE_URL?.trim() || '/api';

export const API_BASE_URL = trimTrailingSlash(rawApiBase);
