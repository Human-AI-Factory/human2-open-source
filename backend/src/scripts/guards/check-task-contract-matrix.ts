import fs from 'node:fs';
import path from 'node:path';
import { TASK_TYPE_CATALOG } from '../../modules/tasks/task-type-catalog.js';
import { TASKS_ROUTE_CATALOG } from '../../modules/tasks/route-catalog.js';
import { evaluateTaskCatalogContract } from '../../modules/tasks/task-catalog-contract.js';

const readFileOrFail = (target: string): string => {
  if (!fs.existsSync(target)) {
    throw new Error(`required file missing: ${target}`);
  }
  return fs.readFileSync(target, 'utf-8');
};

const hasToken = (text: string, token: string): boolean =>
  text.includes(`'${token}'`) || text.includes(`"${token}"`) || text.includes(`\`${token}\``);

const main = () => {
  const contract = evaluateTaskCatalogContract(TASK_TYPE_CATALOG);
  if (contract.driftCount > 0) {
    const detail = contract.items
      .filter((item) => item.drift)
      .map((item) => `${item.taskType}: ${item.reasons.join(' | ')}`)
      .join('; ');
    throw new Error(`task catalog baseline drift detected: ${detail}`);
  }

  const routeFile = path.resolve(process.cwd(), 'dist/modules/tasks/tasks.routes.js');
  const pipelineFile = path.resolve(process.cwd(), 'dist/modules/pipeline/pipeline.service.js');
  const fiGuardFile = path.resolve(process.cwd(), 'dist/scripts/guards/check-failure-injection.js');
  const routeText = readFileOrFail(routeFile);
  const pipelineText = readFileOrFail(pipelineFile);
  const failureGuardText = readFileOrFail(fiGuardFile);

  const missingTaskTypeRefs = TASK_TYPE_CATALOG.map((item) => item.taskType).filter(
    (taskType) => !hasToken(routeText, taskType) || !hasToken(pipelineText, taskType)
  );
  if (missingTaskTypeRefs.length > 0) {
    throw new Error(`task contract matrix drift: task types missing in runtime contracts: ${missingTaskTypeRefs.join(', ')}`);
  }
  if (!failureGuardText.includes('TASK_TYPE_CATALOG')) {
    throw new Error('task contract matrix drift: failure-injection guard must validate against TASK_TYPE_CATALOG');
  }

  const requiredFailureInjectionRoutes = [
    '/video/failure-injection/report',
    '/video/failure-injection/config',
    '/video/failure-injection/export',
    '/video/failure-injection/reset'
  ];
  const catalogRoutes = TASKS_ROUTE_CATALOG as readonly string[];
  const missingFailureRoutes = requiredFailureInjectionRoutes.filter((route) => !catalogRoutes.includes(route) || !hasToken(routeText, route));
  if (missingFailureRoutes.length > 0) {
    throw new Error(`task contract matrix drift: failure-injection routes missing: ${missingFailureRoutes.join(', ')}`);
  }

  console.log(
    `[guard] task contract matrix ok (taskTypes=${TASK_TYPE_CATALOG.length}, routes=${TASKS_ROUTE_CATALOG.length}, failureRoutes=${requiredFailureInjectionRoutes.length})`
  );
};

main();
