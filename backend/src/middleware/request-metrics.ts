import { NextFunction, Request, Response } from 'express';
import { getRequestContext } from './request-context.js';
import { getResponseBizCode } from './response.js';

type RequestMetricsSnapshot = {
  startedAt: string;
  uptimeMs: number;
  totalRequests: number;
  apiRequests: number;
  inFlightRequests: number;
  lastRequestAt: string | null;
  lastApiRequestAt: string | null;
  statusClasses: Record<string, number>;
  bizCodes: Record<string, number>;
  methods: Record<string, number>;
  topRoutes: Array<{ route: string; count: number }>;
  durationMs: {
    avg: number;
    p50: number;
    p95: number;
    max: number;
    samples: number;
  };
};

const isApiRequest = (req: Request): boolean => {
  const candidates = [req.originalUrl, req.baseUrl, req.path]
    .filter((value): value is string => typeof value === 'string' && value.length > 0);
  return candidates.some((value) => value === '/api' || value.startsWith('/api/'));
};

const percentile = (sorted: number[], ratio: number): number => {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index] ?? 0;
};

export const createRequestMetricsCollector = (input: { maxSamples?: number } = {}) => {
  const maxSamples = Math.max(20, Math.floor(input.maxSamples ?? 200));
  const startedAt = new Date().toISOString();
  let totalRequests = 0;
  let apiRequests = 0;
  let inFlightRequests = 0;
  let lastRequestAt: string | null = null;
  let lastApiRequestAt: string | null = null;
  const statusClasses = new Map<string, number>();
  const bizCodes = new Map<string, number>();
  const methods = new Map<string, number>();
  const routes = new Map<string, number>();
  const durations: number[] = [];

  const middleware = (req: Request, res: Response, next: NextFunction): void => {
    totalRequests += 1;
    inFlightRequests += 1;
    lastRequestAt = new Date().toISOString();
    let finalized = false;

    const finish = () => {
      if (finalized) {
        return;
      }
      finalized = true;
      inFlightRequests = Math.max(0, inFlightRequests - 1);

      if (!isApiRequest(req)) {
        return;
      }

      apiRequests += 1;
      lastApiRequestAt = new Date().toISOString();
      const statusClass = `${Math.floor(res.statusCode / 100)}xx`;
      statusClasses.set(statusClass, (statusClasses.get(statusClass) ?? 0) + 1);
      const bizCode = getResponseBizCode(res) ?? 'UNKNOWN';
      bizCodes.set(bizCode, (bizCodes.get(bizCode) ?? 0) + 1);

      const method = req.method.toUpperCase();
      methods.set(method, (methods.get(method) ?? 0) + 1);

      const route = `${method} ${(req.originalUrl || req.url || '').split('?')[0] || '/'}`;
      routes.set(route, (routes.get(route) ?? 0) + 1);

      const requestContext = getRequestContext(res);
      const durationMs = Math.max(0, Date.now() - (requestContext?.startedAtMs ?? Date.now()));
      durations.push(durationMs);
      if (durations.length > maxSamples) {
        durations.splice(0, durations.length - maxSamples);
      }
    };

    res.on('finish', finish);
    res.on('close', finish);

    next();
  };

  const getSnapshot = (): RequestMetricsSnapshot => {
    const sortedDurations = [...durations].sort((left, right) => left - right);
    const durationTotal = sortedDurations.reduce((sum, value) => sum + value, 0);
    const topRoutes = [...routes.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 10)
      .map(([route, count]) => ({ route, count }));

    return {
      startedAt,
      uptimeMs: Math.max(0, Date.now() - Date.parse(startedAt)),
      totalRequests,
      apiRequests,
      inFlightRequests,
      lastRequestAt,
      lastApiRequestAt,
      statusClasses: Object.fromEntries([...statusClasses.entries()].sort((left, right) => left[0].localeCompare(right[0]))),
      bizCodes: Object.fromEntries([...bizCodes.entries()].sort((left, right) => left[0].localeCompare(right[0]))),
      methods: Object.fromEntries([...methods.entries()].sort((left, right) => left[0].localeCompare(right[0]))),
      topRoutes,
      durationMs: {
        avg: sortedDurations.length > 0 ? Number((durationTotal / sortedDurations.length).toFixed(2)) : 0,
        p50: percentile(sortedDurations, 0.5),
        p95: percentile(sortedDurations, 0.95),
        max: sortedDurations.length > 0 ? sortedDurations[sortedDurations.length - 1] ?? 0 : 0,
        samples: sortedDurations.length
      }
    };
  };

  const reset = (): void => {
    totalRequests = 0;
    apiRequests = 0;
    inFlightRequests = 0;
    lastRequestAt = null;
    lastApiRequestAt = null;
    statusClasses.clear();
    bizCodes.clear();
    methods.clear();
    routes.clear();
    durations.length = 0;
  };

  return {
    getSnapshot,
    middleware,
    reset
  };
};

export type { RequestMetricsSnapshot };
