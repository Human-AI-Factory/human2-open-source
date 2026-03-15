import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { Duplex } from 'node:stream';
import { IncomingMessage, ServerResponse } from 'node:http';
import jwt from 'jsonwebtoken';
import { BIZ_CODE } from '../src/constants/bizCode.js';
import { env } from '../src/config/env.js';
import { buildApp, sendApiNotFound, sendInternalError } from '../src/server.js';

const createMockResponse = () => {
  const statusCalls: number[] = [];
  const jsonCalls: Array<Record<string, unknown>> = [];
  const res = {
    status(code: number) {
      statusCalls.push(code);
      return this;
    },
    json(body: Record<string, unknown>) {
      jsonCalls.push(body);
      return this;
    }
  } as any;
  return { res, statusCalls, jsonCalls };
};

test('server contract: api not found should return 404 + NOT_FOUND', () => {
  const { res, statusCalls, jsonCalls } = createMockResponse();
  sendApiNotFound(res);
  assert.equal(statusCalls[0], 404);
  assert.equal(jsonCalls[0].bizCode, BIZ_CODE.NOT_FOUND);
  assert.equal(jsonCalls[0].message, 'API route not found');
});

test('server contract: internal error should return 500 + INTERNAL_ERROR', () => {
  const { res, statusCalls, jsonCalls } = createMockResponse();
  sendInternalError(res, new Error('boom'));
  assert.equal(statusCalls[0], 500);
  assert.equal(jsonCalls[0].bizCode, BIZ_CODE.INTERNAL_ERROR);
  assert.equal(jsonCalls[0].message, 'boom');
});

test('server contract: unknown error value should use default message', () => {
  const { res, statusCalls, jsonCalls } = createMockResponse();
  sendInternalError(res, null);
  assert.equal(statusCalls[0], 500);
  assert.equal(jsonCalls[0].bizCode, BIZ_CODE.INTERNAL_ERROR);
  assert.equal(jsonCalls[0].message, 'Internal server error');
});

class MockSocket extends Duplex {
  output: Buffer[] = [];
  remoteAddress = '127.0.0.1';
  writable = true;

  _read() {}

  _write(chunk: string | Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    this.output.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    callback();
  }

  setTimeout() {
    return this;
  }

  setNoDelay() {
    return this;
  }

  setKeepAlive() {
    return this;
  }

  cork() {}

  uncork() {}

  destroy() {
    return this;
  }
}

const createTempAppHarness = () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'human2-server-contract-'));
  const dataFile = path.join(tempDir, 'data.sqlite');
  const staticDir = path.join(tempDir, 'static');
  const app = buildApp(dataFile, staticDir);

  const close = async () => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  };

  return { app, close };
};

const invokeApp = async (
  app: ReturnType<typeof buildApp>,
  input: { method: string; url: string; headers?: Record<string, string>; body?: string }
) => {
  const socket = new MockSocket();
  const req = new IncomingMessage(socket as never);
  req.method = input.method;
  req.url = input.url;
  const normalizedHeaders = Object.fromEntries(
    Object.entries(input.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value])
  );
  if (input.body !== undefined) {
    normalizedHeaders['content-length'] = String(Buffer.byteLength(input.body));
    normalizedHeaders['content-type'] = normalizedHeaders['content-type'] ?? 'application/json';
  }
  req.headers = normalizedHeaders;
  const res = new ServerResponse(req);
  res.assignSocket(socket as never);
  if (input.body !== undefined) {
    req.push(input.body);
  }
  req.push(null);

  await new Promise<void>((resolve, reject) => {
    res.once('finish', () => resolve());
    res.once('error', (error) => reject(error));
    app.handle(req, res, reject);
  });

  const raw = Buffer.concat(socket.output).toString('utf8');
  const splitIndex = raw.indexOf('\r\n\r\n');
  const rawHead = splitIndex >= 0 ? raw.slice(0, splitIndex) : raw;
  const bodyText = splitIndex >= 0 ? raw.slice(splitIndex + 4) : '';
  const headerLines = rawHead.split('\r\n').slice(1);
  const headers = Object.fromEntries(
    headerLines
      .map((line) => {
        const colonIndex = line.indexOf(':');
        if (colonIndex < 0) {
          return null;
        }
        return [line.slice(0, colonIndex).trim().toLowerCase(), line.slice(colonIndex + 1).trim()];
      })
      .filter(Boolean) as Array<[string, string]>
  );
  return {
    statusCode: res.statusCode,
    headers,
    bodyText
  };
};

test('server contract: api responses should include request id and duration headers', async () => {
  const harness = createTempAppHarness();
  try {
    const inboundRequestId = 'req-server-contract-001';
    const response = await invokeApp(harness.app, {
      method: 'GET',
      url: '/api/health',
      headers: { 'x-request-id': inboundRequestId }
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['x-request-id'], inboundRequestId);
    const durationHeader = response.headers['x-api-duration-ms'];
    assert.ok(durationHeader);
    assert.ok(Number(durationHeader) >= 0);

    const body = JSON.parse(response.bodyText) as {
      code: number;
      bizCode: string;
      data?: { ok: boolean; service: string };
    };
    assert.equal(body.code, 200);
    assert.equal(body.bizCode, BIZ_CODE.OK);
    assert.equal(body.data?.ok, true);
    assert.equal(body.data?.service, 'human2-next-lite-backend');
  } finally {
    await harness.close();
  }
});

test('server contract: request metrics endpoint should expose aggregated api request snapshot', async () => {
  const harness = createTempAppHarness();
  try {
    await invokeApp(harness.app, {
      method: 'GET',
      url: '/api/health'
    });
    await invokeApp(harness.app, {
      method: 'GET',
      url: '/api/not-real'
    });

    const response = await invokeApp(harness.app, {
      method: 'GET',
      url: '/api/health/metrics'
    });
    assert.equal(response.statusCode, 200);
    assert.ok(response.headers['x-request-id']);

    const body = JSON.parse(response.bodyText) as {
      code: number;
      bizCode: string;
      data: {
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
      durationMs: { samples: number };
      };
    };
    assert.equal(body.code, 200);
    assert.equal(body.bizCode, BIZ_CODE.OK);
    assert.ok(body.data.uptimeMs >= 0);
    assert.ok(body.data.totalRequests >= 3);
    assert.ok(body.data.apiRequests >= 2);
    assert.ok(body.data.inFlightRequests >= 1);
    assert.ok(body.data.lastRequestAt);
    assert.ok(body.data.lastApiRequestAt);
    assert.ok((body.data.statusClasses['2xx'] ?? 0) >= 1);
    assert.ok((body.data.statusClasses['4xx'] ?? 0) >= 1);
    assert.ok((body.data.bizCodes.OK ?? 0) >= 1);
    assert.ok((body.data.bizCodes.NOT_FOUND ?? 0) >= 1);
    assert.ok((body.data.methods.GET ?? 0) >= 2);
    assert.ok(body.data.topRoutes.some((item) => item.route === 'GET /api/health'));
    assert.ok(body.data.durationMs.samples >= 2);
  } finally {
    await harness.close();
  }
});

test('server contract: api 404 should still include observability headers and stable payload', async () => {
  const harness = createTempAppHarness();
  try {
    const response = await invokeApp(harness.app, {
      method: 'GET',
      url: '/api/not-real'
    });
    assert.equal(response.statusCode, 404);
    assert.ok(response.headers['x-request-id']);
    assert.ok(Number(response.headers['x-api-duration-ms']) >= 0);

    const body = JSON.parse(response.bodyText) as {
      code: number;
      bizCode: string;
      data: null;
      message: string;
    };
    assert.equal(body.code, 404);
    assert.equal(body.bizCode, BIZ_CODE.NOT_FOUND);
    assert.equal(body.data, null);
    assert.equal(body.message, 'API route not found');
  } finally {
    await harness.close();
  }
});

test('server contract: admin-only settings ops should return 403 + FORBIDDEN for viewer token', async () => {
  const harness = createTempAppHarness();
  try {
    const viewerToken = jwt.sign({ uid: 'u-viewer', role: 'viewer' }, env.jwtSecret, {
      expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn']
    });
    const response = await invokeApp(harness.app, {
      method: 'GET',
      url: '/api/settings/ops/summary',
      headers: { authorization: `Bearer ${viewerToken}` }
    });
    assert.equal(response.statusCode, 403);
    assert.ok(response.headers['x-request-id']);

    const body = JSON.parse(response.bodyText) as {
      code: number;
      bizCode: string;
      data: null;
      message: string;
    };
    assert.equal(body.code, 403);
    assert.equal(body.bizCode, BIZ_CODE.FORBIDDEN);
    assert.equal(body.message, 'Forbidden: requires role admin');
  } finally {
    await harness.close();
  }
});

test('server contract: provider catalog should expose canonical providers and aliases for authenticated viewer', async () => {
  const harness = createTempAppHarness();
  try {
    const viewerToken = jwt.sign({ uid: 'u-viewer', role: 'viewer' }, env.jwtSecret, {
      expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn']
    });
    const response = await invokeApp(harness.app, {
      method: 'GET',
      url: '/api/settings/providers/catalog',
      headers: { authorization: `Bearer ${viewerToken}` }
    });
    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.bodyText) as {
      code: number;
      bizCode: string;
      data: Array<{ provider: string; aliases: string[] }>;
    };
    assert.equal(body.code, 200);
    assert.equal(body.bizCode, BIZ_CODE.OK);
    assert.ok(body.data.some((item) => item.provider === 'http' && item.aliases.includes('vidu')));
    assert.ok(body.data.some((item) => item.provider === 'mock' && item.aliases.includes('demo')));
  } finally {
    await harness.close();
  }
});

test('server contract: runtime reconcile should return 403 + FORBIDDEN for viewer token', async () => {
  const harness = createTempAppHarness();
  try {
    const viewerToken = jwt.sign({ uid: 'u-viewer', role: 'viewer' }, env.jwtSecret, {
      expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn']
    });
    const response = await invokeApp(harness.app, {
      method: 'GET',
      url: '/api/tasks/video/runtime/reconcile',
      headers: { authorization: `Bearer ${viewerToken}` }
    });
    assert.equal(response.statusCode, 403);
    const body = JSON.parse(response.bodyText) as {
      code: number;
      bizCode: string;
      data: null;
      message: string;
    };
    assert.equal(body.code, 403);
    assert.equal(body.bizCode, BIZ_CODE.FORBIDDEN);
    assert.equal(body.message, 'Forbidden: requires role admin');
  } finally {
    await harness.close();
  }
});

test('server contract: admin-only audit endpoint should return 200 for admin token', async () => {
  const harness = createTempAppHarness();
  try {
    const adminToken = jwt.sign({ uid: 'u-admin', role: 'admin' }, env.jwtSecret, {
      expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn']
    });
    const response = await invokeApp(harness.app, {
      method: 'GET',
      url: '/api/settings/ops/admin-audit?limit=10',
      headers: { authorization: `Bearer ${adminToken}` }
    });
    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.bodyText) as {
      code: number;
      bizCode: string;
      data: unknown[];
    };
    assert.equal(body.code, 200);
    assert.equal(body.bizCode, BIZ_CODE.OK);
    assert.deepEqual(body.data, []);
  } finally {
    await harness.close();
  }
});

test('server contract: admin should create authType=none text model without api key', async () => {
  const harness = createTempAppHarness();
  try {
    const adminToken = jwt.sign({ uid: 'u-admin', role: 'admin' }, env.jwtSecret, {
      expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn']
    });
    const response = await invokeApp(harness.app, {
      method: 'POST',
      url: '/api/settings/models',
      headers: { authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        type: 'text',
        name: 'Local Text Gateway',
        provider: 'http',
        manufacturer: 'other',
        model: 'local-text-model',
        authType: 'none',
        endpoint: 'http://127.0.0.1:7000/v1/chat/completions',
        apiKey: ''
      })
    });
    assert.equal(response.statusCode, 201);
    const body = JSON.parse(response.bodyText) as {
      code: number;
      bizCode: string;
      data: {
        type: string;
        authType: string;
        endpoint: string;
        apiKey: string;
      };
    };
    assert.equal(body.code, 201);
    assert.equal(body.bizCode, BIZ_CODE.OK);
    assert.equal(body.data.type, 'text');
    assert.equal(body.data.authType, 'none');
    assert.equal(body.data.endpoint, 'http://127.0.0.1:7000/v1/chat/completions');
    assert.equal(body.data.apiKey, '');
  } finally {
    await harness.close();
  }
});
