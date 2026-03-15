import { ProviderValidationError } from '../errors.js';
import { firstIdentifierAtPaths, firstStatusAtPaths, firstStringAtPaths, firstStringInArrayItemsAtPaths } from '../recipes/extractors.js';

export type UrlArrayPathSpec = {
  arrayPaths: string[];
  itemPaths: string[];
};

type DirectUrlOrTaskIdSpec = {
  urlPaths?: string[];
  urlArrayPaths?: UrlArrayPathSpec[];
  taskIdPaths: string[];
  missingTaskIdMessage: string;
  providerTaskIdPaths?: string[];
};

type PollingUrlResultSpec = {
  statusPaths: string[];
  successStatuses: string[];
  failureStatuses: string[];
  urlPaths?: string[];
  urlArrayPaths?: UrlArrayPathSpec[];
  errorPaths?: string[];
  successWithoutUrlError: string;
  defaultFailureMessage: string;
  providerTaskId?: string;
};

type UrlPollingResult =
  | { done: false; error?: string }
  | { done: true; value: { url: string; providerTaskId?: string } };

export const readTaskIdOrNull = (raw: unknown, paths: string[]): string | null => firstIdentifierAtPaths(raw, paths);

export const readTaskIdOrThrow = (raw: unknown, paths: string[], missingMessage: string): string => {
  const taskId = readTaskIdOrNull(raw, paths);
  if (!taskId) {
    throw new ProviderValidationError(missingMessage);
  }
  return taskId;
};

export const readUrlAtPaths = (
  raw: unknown,
  options: {
    directPaths?: string[];
    arrayPaths?: UrlArrayPathSpec[];
  }
): string | null => {
  const direct = options.directPaths ? firstStringAtPaths(raw, options.directPaths) : null;
  if (direct) {
    return direct;
  }
  for (const spec of options.arrayPaths ?? []) {
    const nested = firstStringInArrayItemsAtPaths(raw, spec.arrayPaths, spec.itemPaths);
    if (nested) {
      return nested;
    }
  }
  return null;
};

export const readDirectUrlOrTaskId = (
  raw: unknown,
  spec: DirectUrlOrTaskIdSpec
): { directResult?: { url: string; providerTaskId?: string }; taskId?: string } => {
  const directUrl = readUrlAtPaths(raw, {
    directPaths: spec.urlPaths,
    arrayPaths: spec.urlArrayPaths
  });
  const taskId = readTaskIdOrNull(raw, spec.taskIdPaths);
  const providerTaskId = spec.providerTaskIdPaths ? readTaskIdOrNull(raw, spec.providerTaskIdPaths) : taskId;
  if (directUrl) {
    return {
      directResult: {
        url: directUrl,
        ...(providerTaskId ? { providerTaskId } : {})
      }
    };
  }
  return {
    taskId: taskId ?? readTaskIdOrThrow(raw, spec.taskIdPaths, spec.missingTaskIdMessage)
  };
};

export const readPollingUrlResult = (
  raw: unknown,
  spec: PollingUrlResultSpec
): UrlPollingResult => {
  const status = firstStatusAtPaths(raw, spec.statusPaths);
  const url = readUrlAtPaths(raw, {
    directPaths: spec.urlPaths,
    arrayPaths: spec.urlArrayPaths
  });
  if (spec.successStatuses.includes(status)) {
    if (!url) {
      return { done: false, error: spec.successWithoutUrlError };
    }
    return {
      done: true,
      value: {
        url,
        ...(spec.providerTaskId ? { providerTaskId: spec.providerTaskId } : {})
      }
    };
  }
  if (spec.failureStatuses.includes(status)) {
    return {
      done: false,
      error: (spec.errorPaths ? firstStringAtPaths(raw, spec.errorPaths) : null) || spec.defaultFailureMessage
    };
  }
  return { done: false };
};
