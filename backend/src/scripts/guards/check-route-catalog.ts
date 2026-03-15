import fs from 'node:fs';
import path from 'node:path';
import { TASKS_ROUTE_CATALOG } from '../../modules/tasks/route-catalog.js';

const readFileOrFail = (target: string): string => {
  if (!fs.existsSync(target)) {
    throw new Error(`required file missing: ${target}`);
  }
  return fs.readFileSync(target, 'utf-8');
};

const checkTasksRouteCatalog = (): void => {
  const routeFile = path.resolve(process.cwd(), 'dist/modules/tasks/tasks.routes.js');
  const text = readFileOrFail(routeFile);
  const missing = TASKS_ROUTE_CATALOG.filter((item) => !text.includes(`'${item}'`) && !text.includes(`"${item}"`) && !text.includes(`\`${item}\``));
  if (missing.length > 0) {
    throw new Error(`tasks route catalog mismatch, missing routes: ${missing.join(', ')}`);
  }
};

const checkServerMounts = (): void => {
  const serverFile = path.resolve(process.cwd(), 'dist/server.js');
  const text = readFileOrFail(serverFile);
  const required = ['/api/tasks', '/api/pipeline', '/api/studio', '/api/domain', '/api/library', '/api/settings'];
  const missing = required.filter((item) => !text.includes(`'${item}'`) && !text.includes(`"${item}"`) && !text.includes(`\`${item}\``));
  if (missing.length > 0) {
    throw new Error(`server route mounts missing: ${missing.join(', ')}`);
  }
};

const run = (): void => {
  checkTasksRouteCatalog();
  checkServerMounts();
  console.log(`[guard] route catalog ok (tasks=${TASKS_ROUTE_CATALOG.length})`);
};

run();
