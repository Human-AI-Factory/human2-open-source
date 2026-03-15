import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { TASK_TYPE_CATALOG } from '../src/modules/tasks/task-type-catalog.js';
import { TASKS_ROUTE_CATALOG } from '../src/modules/tasks/route-catalog.js';
import { evaluateTaskCatalogContract } from '../src/modules/tasks/task-catalog-contract.js';

const readSource = (relative: string): string => {
  const target = path.resolve(process.cwd(), 'src', relative);
  return fs.readFileSync(target, 'utf-8');
};

const hasToken = (text: string, token: string): boolean =>
  text.includes(`'${token}'`) || text.includes(`"${token}"`) || text.includes(`\`${token}\``);

test('contract matrix: task catalog should match baseline contract', () => {
  const result = evaluateTaskCatalogContract(TASK_TYPE_CATALOG);
  assert.equal(result.driftCount, 0, result.reason);
});

test('contract matrix: each task type should be represented in failure-injection contracts', () => {
  const routesText = readSource('modules/tasks/tasks.routes.ts');
  const pipelineText = readSource('modules/pipeline/pipeline.service.ts');
  const guardText = readSource('scripts/guards/check-failure-injection.ts');
  for (const item of TASK_TYPE_CATALOG) {
    assert.equal(hasToken(routesText, item.taskType), true, `tasks.routes missing taskType token: ${item.taskType}`);
    assert.equal(hasToken(pipelineText, item.taskType), true, `pipeline.service missing taskType token: ${item.taskType}`);
  }
  assert.equal(guardText.includes('TASK_TYPE_CATALOG'), true, 'failure guard should validate task types from TASK_TYPE_CATALOG');
});

test('contract matrix: failure-injection route catalog should include required endpoints', () => {
  const required = [
    '/video/failure-injection/report',
    '/video/failure-injection/config',
    '/video/failure-injection/export',
    '/video/failure-injection/reset'
  ];
  for (const route of required) {
    assert.equal(TASKS_ROUTE_CATALOG.includes(route), true, `missing route catalog: ${route}`);
  }
});
