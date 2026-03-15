import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { TASKS_ROUTE_CATALOG } from '../src/modules/tasks/route-catalog.js';

const readSource = (relative: string): string => {
  const target = path.resolve(process.cwd(), 'src', relative);
  return fs.readFileSync(target, 'utf-8');
};

test('contract matrix: tasks route catalog should include slo/quota endpoints', () => {
  const text = readSource('modules/tasks/route-catalog.ts');
  const required = ['/video/slo-config', '/video/slo-state', '/video/quota-config', '/video/quota-usage'];
  for (const route of required) {
    assert.equal(text.includes(`'${route}'`) || text.includes(`"${route}"`), true, `missing route catalog: ${route}`);
  }
});

test('contract matrix: tasks.routes should include all task route catalog endpoints', () => {
  const text = readSource('modules/tasks/tasks.routes.ts');
  for (const route of TASKS_ROUTE_CATALOG) {
    const found = text.includes(`'${route}'`) || text.includes(`"${route}"`) || text.includes(`\`${route}\``);
    assert.equal(found, true, `tasks.routes missing catalog endpoint: ${route}`);
  }
});

test('contract matrix: tasks route catalog should include unified incident notification delivery endpoints', () => {
  const text = readSource('modules/tasks/route-catalog.ts');
  const required = [
    '/alerts/unified/incidents/notification/config',
    '/alerts/unified/incidents/notification/process',
    '/alerts/unified/incidents/notification/delivery-logs',
    '/alerts/unified/incidents/notification/delivery-logs/export'
  ];
  for (const route of required) {
    assert.equal(text.includes(`'${route}'`) || text.includes(`"${route}"`), true, `missing route catalog: ${route}`);
  }
});

test('contract matrix: domain routes should provide delete-check and conflict-aware delete', () => {
  const text = readSource('modules/domain/domain.routes.ts');
  assert.equal(text.includes('/domain-entities/:entityId/delete-check'), true);
  assert.equal(text.includes('Domain entity delete rejected:'), true);
  assert.equal(text.includes('BIZ_CODE.CONFLICT'), true);
  assert.equal(text.includes('/dramas/:dramaId/production-chain'), true);
});

test('contract matrix: pipeline routes should map daily quota reject to 409 conflict', () => {
  const text = readSource('modules/pipeline/pipeline.routes.ts');
  assert.equal(text.includes('daily video task quota exceeded'), true);
  assert.equal(text.includes('BIZ_CODE.CONFLICT'), true);
});

test('contract matrix: project episode batch pipeline routes should be declared before generic :episodeId routes', () => {
  const text = readSource('modules/pipeline/pipeline.routes.ts');
  const batchAssetsIndex = text.indexOf("router.post('/projects/:projectId/episodes/batch/assets/generate'");
  const singleAssetsIndex = text.indexOf("router.post('/projects/:projectId/episodes/:episodeId/assets/generate'");
  const batchVideoIndex = text.indexOf("router.post('/projects/:projectId/episodes/batch/video-tasks'");
  const singleVideoIndex = text.indexOf("router.post('/projects/:projectId/episodes/:episodeId/video-tasks/batch'");

  assert.ok(batchAssetsIndex >= 0, 'missing batch asset route');
  assert.ok(singleAssetsIndex >= 0, 'missing single episode asset route');
  assert.ok(batchVideoIndex >= 0, 'missing batch video route');
  assert.ok(singleVideoIndex >= 0, 'missing single episode video route');
  assert.ok(batchAssetsIndex < singleAssetsIndex, 'batch asset route must come before :episodeId asset route');
  assert.ok(batchVideoIndex < singleVideoIndex, 'batch video route must come before :episodeId video route');
});

test('contract matrix: settings and tasks routes should guard admin-only runtime and ops endpoints', () => {
  const settingsText = readSource('modules/settings/settings.routes.ts');
  const tasksText = readSource('modules/tasks/tasks.routes.ts');
  assert.equal(settingsText.includes("const adminOnly = requireRole('admin')"), true);
  assert.equal(settingsText.includes("router.get('/providers/catalog'"), true);
  assert.equal(settingsText.includes("router.get('/ops/summary', adminOnly"), true);
  assert.equal(settingsText.includes("router.post('/ops/reset-business-data', adminOnly"), true);
  assert.equal(settingsText.includes("router.get('/ops/admin-audit', adminOnly"), true);
  assert.equal(tasksText.includes("const adminOnly = requireRole('admin')"), true);
  assert.equal(tasksText.includes("router.get('/video/runtime/reconcile', adminOnly"), true);
  assert.equal(tasksText.includes("router.patch('/video/runtime-alert-config', adminOnly"), true);
  assert.equal(tasksText.includes("router.patch('/video/failure-injection/config', adminOnly"), true);
});
