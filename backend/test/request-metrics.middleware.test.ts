import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequestMetricsCollector } from '../src/middleware/request-metrics.js';
import { requestContextMiddleware } from '../src/middleware/request-context.js';

const createHarness = (input: { method?: string; url?: string; statusCode?: number; requestId?: string } = {}) => {
  const collector = createRequestMetricsCollector({ maxSamples: 5 });
  const req = {
    method: input.method ?? 'GET',
    url: input.url ?? '/api/health',
    originalUrl: input.url ?? '/api/health',
    baseUrl: '',
    path: input.url ?? '/api/health',
    header(name: string) {
      if (name.toLowerCase() !== 'x-request-id') {
        return undefined;
      }
      return input.requestId;
    }
  } as any;
  const listeners = new Map<string, Array<() => void>>();
  const res = {
    locals: {},
    statusCode: input.statusCode ?? 200,
    setHeader() {
      return this;
    },
    on(event: string, handler: () => void) {
      listeners.set(event, [...(listeners.get(event) ?? []), handler]);
      return this;
    }
  } as any;

  requestContextMiddleware(req, res, () => undefined);
  collector.middleware(req, res, () => undefined);
  return {
    finish() {
      for (const handler of listeners.get('finish') ?? []) {
        handler();
      }
    },
    snapshot: () => collector.getSnapshot(),
    collector
  };
};

test('request metrics collector should record api request status, method and route counts', () => {
  const harness = createHarness({ method: 'POST', url: '/api/health', statusCode: 201 });
  const started = harness.snapshot();
  assert.equal(started.inFlightRequests, 1);
  assert.ok(started.lastRequestAt);
  harness.finish();

  const snapshot = harness.snapshot();
  assert.ok(snapshot.uptimeMs >= 0);
  assert.equal(snapshot.totalRequests, 1);
  assert.equal(snapshot.apiRequests, 1);
  assert.equal(snapshot.inFlightRequests, 0);
  assert.ok(snapshot.lastApiRequestAt);
  assert.equal(snapshot.statusClasses['2xx'], 1);
  assert.equal(snapshot.bizCodes.UNKNOWN, 1);
  assert.equal(snapshot.methods.POST, 1);
  assert.deepEqual(snapshot.topRoutes, [{ route: 'POST /api/health', count: 1 }]);
  assert.equal(snapshot.durationMs.samples, 1);
});

test('request metrics collector should ignore non-api requests in api aggregates', () => {
  const harness = createHarness({ method: 'GET', url: '/index.html', statusCode: 200 });
  harness.finish();

  const snapshot = harness.snapshot();
  assert.equal(snapshot.totalRequests, 1);
  assert.equal(snapshot.apiRequests, 0);
  assert.equal(snapshot.inFlightRequests, 0);
  assert.ok(snapshot.lastRequestAt);
  assert.equal(snapshot.lastApiRequestAt, null);
  assert.deepEqual(snapshot.topRoutes, []);
  assert.equal(snapshot.durationMs.samples, 0);
});

test('request metrics collector reset should clear accumulated snapshot state', () => {
  const harness = createHarness({ method: 'GET', url: '/api/health/metrics', statusCode: 200 });
  harness.finish();
  harness.collector.reset();

  const snapshot = harness.snapshot();
  assert.ok(snapshot.uptimeMs >= 0);
  assert.equal(snapshot.totalRequests, 0);
  assert.equal(snapshot.apiRequests, 0);
  assert.equal(snapshot.inFlightRequests, 0);
  assert.equal(snapshot.lastRequestAt, null);
  assert.equal(snapshot.lastApiRequestAt, null);
  assert.deepEqual(snapshot.statusClasses, {});
  assert.deepEqual(snapshot.bizCodes, {});
  assert.deepEqual(snapshot.methods, {});
  assert.deepEqual(snapshot.topRoutes, []);
  assert.equal(snapshot.durationMs.samples, 0);
});
