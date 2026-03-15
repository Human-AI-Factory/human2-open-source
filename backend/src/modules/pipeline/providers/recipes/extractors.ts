export type JsonRecord = Record<string, unknown>;

export const asRecord = (value: unknown): JsonRecord | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as JsonRecord;
};

export const asArray = (value: unknown): unknown[] | null => {
  return Array.isArray(value) ? value : null;
};

const tokenizePath = (path: string): Array<string | number> => {
  const tokens: Array<string | number> = [];
  const normalized = path.replace(/\[(\d+)\]/g, '.$1');
  for (const part of normalized.split('.').map((item) => item.trim()).filter(Boolean)) {
    const index = Number(part);
    tokens.push(Number.isInteger(index) && String(index) === part ? index : part);
  }
  return tokens;
};

export const readAtPath = (value: unknown, path: string): unknown => {
  let current: unknown = value;
  for (const token of tokenizePath(path)) {
    if (typeof token === 'number') {
      const list = asArray(current);
      if (!list || token < 0 || token >= list.length) {
        return undefined;
      }
      current = list[token];
      continue;
    }
    const record = asRecord(current);
    if (!record || !(token in record)) {
      return undefined;
    }
    current = record[token];
  }
  return current;
};

export const firstDefinedAtPaths = (value: unknown, paths: string[]): unknown => {
  for (const path of paths) {
    const candidate = readAtPath(value, path);
    if (candidate !== undefined && candidate !== null) {
      return candidate;
    }
  }
  return undefined;
};

export const firstStringAtPaths = (value: unknown, paths: string[]): string | null => {
  const candidate = firstDefinedAtPaths(value, paths);
  if (typeof candidate !== 'string') {
    return null;
  }
  const normalized = candidate.trim();
  return normalized ? normalized : null;
};

export const firstIdentifierAtPaths = (value: unknown, paths: string[]): string | null => {
  const candidate = firstDefinedAtPaths(value, paths);
  if (typeof candidate === 'string') {
    const normalized = candidate.trim();
    return normalized ? normalized : null;
  }
  if (typeof candidate === 'number' && Number.isFinite(candidate)) {
    return String(candidate);
  }
  return null;
};

export const firstNumberAtPaths = (value: unknown, paths: string[]): number | null => {
  const candidate = firstDefinedAtPaths(value, paths);
  if (typeof candidate === 'number' && Number.isFinite(candidate)) {
    return candidate;
  }
  if (typeof candidate === 'string' && candidate.trim()) {
    const parsed = Number(candidate);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export const firstArrayAtPaths = (value: unknown, paths: string[]): unknown[] | null => {
  const candidate = firstDefinedAtPaths(value, paths);
  return asArray(candidate);
};

export const firstStringInArrayItemsAtPaths = (
  value: unknown,
  arrayPaths: string[],
  itemPaths: string[]
): string | null => {
  for (const arrayPath of arrayPaths) {
    const list = firstArrayAtPaths(value, [arrayPath]);
    if (!list) {
      continue;
    }
    for (const item of list) {
      const direct = typeof item === 'string' ? item.trim() : '';
      if (direct) {
        return direct;
      }
      const nested = firstStringAtPaths(item, itemPaths);
      if (nested) {
        return nested;
      }
    }
  }
  return null;
};

export const normalizeStatus = (value: unknown): string => {
  if (typeof value === 'string') {
    return value.trim().toLowerCase();
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return '';
};

export const firstStatusAtPaths = (value: unknown, paths: string[]): string => {
  return normalizeStatus(firstDefinedAtPaths(value, paths));
};
