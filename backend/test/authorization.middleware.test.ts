import test from 'node:test';
import assert from 'node:assert/strict';
import { requireRole } from '../src/middleware/authorization.js';
import { BIZ_CODE } from '../src/constants/bizCode.js';

const runGuard = (role: string | undefined, allowedRoles: string[]) => {
  let nextCalled = false;
  const req = {} as any;
  const statusCalls: number[] = [];
  const jsonCalls: Array<Record<string, unknown>> = [];
  const res = {
    locals: role ? { auth: { role } } : { auth: {} },
    status(code: number) {
      statusCalls.push(code);
      return this;
    },
    json(body: Record<string, unknown>) {
      jsonCalls.push(body);
      return this;
    }
  } as any;
  requireRole(...allowedRoles)(req, res, () => {
    nextCalled = true;
  });
  return { nextCalled, statusCalls, jsonCalls };
};

test('authorization middleware should allow matching role', () => {
  const result = runGuard('admin', ['admin']);
  assert.equal(result.nextCalled, true);
  assert.deepEqual(result.statusCalls, []);
});

test('authorization middleware should block non-matching role with FORBIDDEN', () => {
  const result = runGuard('viewer', ['admin', 'owner']);
  assert.equal(result.nextCalled, false);
  assert.equal(result.statusCalls[0], 403);
  assert.equal(result.jsonCalls[0].bizCode, BIZ_CODE.FORBIDDEN);
});

test('authorization middleware should block missing role with FORBIDDEN', () => {
  const result = runGuard(undefined, ['admin']);
  assert.equal(result.nextCalled, false);
  assert.equal(result.statusCalls[0], 403);
  assert.equal(result.jsonCalls[0].message, 'Forbidden: requires role admin');
});
