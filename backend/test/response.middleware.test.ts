import test from 'node:test';
import assert from 'node:assert/strict';
import { responseEnvelopeMiddleware } from '../src/middleware/response.js';
import { BIZ_CODE } from '../src/constants/bizCode.js';

const runWithMiddleware = (path: string, statusCode: number, payload: unknown, input: { originalUrl?: string; baseUrl?: string } = {}) => {
  const req = { path, originalUrl: input.originalUrl ?? path, baseUrl: input.baseUrl ?? '' } as any;
  const sent: unknown[] = [];
  const headers = new Map<string, string>();
  const res = {
    locals: {
      requestContext: {
        requestId: 'req-test-1',
        startedAtMs: Date.now() - 12,
        source: 'generated'
      }
    },
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), String(value));
      return this;
    },
    statusCode,
    json(body: unknown) {
      sent.push(body);
      return this;
    }
  } as any;
  let nextCalled = false;
  responseEnvelopeMiddleware(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
  res.json(payload);
  return { body: sent[0] as Record<string, unknown>, headers };
};

test('response middleware should envelope api success payload', () => {
  const { body, headers } = runWithMiddleware('/api/projects', 200, { id: 'p1' });
  assert.equal(body.code, 200);
  assert.equal(body.bizCode, BIZ_CODE.OK);
  assert.deepEqual(body.data, { id: 'p1' });
  assert.equal(body.message, '成功');
  assert.equal(headers.get('x-request-id'), 'req-test-1');
  assert.equal(typeof headers.get('x-api-duration-ms'), 'string');
});

test('response middleware should map api error status to stable bizCode', () => {
  const { body: body400 } = runWithMiddleware('/api/projects', 400, { message: 'Bad request' });
  assert.equal(body400.bizCode, BIZ_CODE.INVALID_PAYLOAD);

  const { body: body401 } = runWithMiddleware('/api/projects', 401, { message: 'Unauthorized' });
  assert.equal(body401.bizCode, BIZ_CODE.UNAUTHORIZED);

  const { body: body403 } = runWithMiddleware('/api/projects', 403, { message: 'Forbidden' });
  assert.equal(body403.bizCode, BIZ_CODE.FORBIDDEN);

  const { body: body404 } = runWithMiddleware('/api/projects', 404, { message: 'Not found' });
  assert.equal(body404.bizCode, BIZ_CODE.NOT_FOUND);

  const { body: body409 } = runWithMiddleware('/api/projects', 409, { message: 'Conflict' });
  assert.equal(body409.bizCode, BIZ_CODE.CONFLICT);

  const { body: body429 } = runWithMiddleware('/api/projects', 429, { message: 'Rate limited' });
  assert.equal(body429.bizCode, BIZ_CODE.PROVIDER_RATE_LIMITED);

  const { body: body422 } = runWithMiddleware('/api/projects', 422, { message: 'Validation failed' });
  assert.equal(body422.bizCode, BIZ_CODE.INVALID_PAYLOAD);

  const { body: body500 } = runWithMiddleware('/api/projects', 500, { message: 'Internal' });
  assert.equal(body500.bizCode, BIZ_CODE.INTERNAL_ERROR);
});

test('response middleware should preserve explicit bizCode from payload', () => {
  const { body } = runWithMiddleware('/api/projects', 400, {
    message: 'Custom invalid payload',
    bizCode: BIZ_CODE.MODEL_NOT_SUPPORTED
  });
  assert.equal(body.bizCode, BIZ_CODE.MODEL_NOT_SUPPORTED);
  assert.equal(body.message, 'Custom invalid payload');
});

test('response middleware should passthrough non-api payload', () => {
  const { body, headers } = runWithMiddleware('/health', 200, { ok: true });
  assert.deepEqual(body, { ok: true });
  assert.equal(headers.get('x-api-duration-ms'), undefined);
});

test('response middleware should treat /api fallback path as api response', () => {
  const { body, headers } = runWithMiddleware('/not-real', 404, { message: 'API route not found' }, { originalUrl: '/api/not-real', baseUrl: '/api' });
  assert.equal(body.bizCode, BIZ_CODE.NOT_FOUND);
  assert.equal(typeof headers.get('x-api-duration-ms'), 'string');
});
