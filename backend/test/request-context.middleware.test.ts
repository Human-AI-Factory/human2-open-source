import test from 'node:test';
import assert from 'node:assert/strict';
import { getRequestContext, requestContextMiddleware } from '../src/middleware/request-context.js';

const createHarness = (requestId?: string) => {
  const headers = new Map<string, string>();
  const req = {
    header(name: string) {
      if (name.toLowerCase() !== 'x-request-id') {
        return undefined;
      }
      return requestId;
    }
  } as any;
  const res = {
    locals: {},
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
      return this;
    }
  } as any;
  let nextCalled = false;
  requestContextMiddleware(req, res, () => {
    nextCalled = true;
  });
  return { headers, nextCalled, res };
};

test('request context middleware should generate request id when client does not provide one', () => {
  const { headers, nextCalled, res } = createHarness();
  assert.equal(nextCalled, true);
  const requestId = headers.get('x-request-id');
  assert.equal(typeof requestId, 'string');
  assert.equal(Boolean(requestId && requestId.length > 10), true);

  const context = getRequestContext(res);
  assert.ok(context);
  assert.equal(context.source, 'generated');
  assert.equal(context.requestId, requestId);
  assert.equal(typeof context.startedAtMs, 'number');
});

test('request context middleware should preserve inbound request id', () => {
  const { headers, res } = createHarness('req-from-client');
  assert.equal(headers.get('x-request-id'), 'req-from-client');

  const context = getRequestContext(res);
  assert.ok(context);
  assert.equal(context.source, 'client');
  assert.equal(context.requestId, 'req-from-client');
});
