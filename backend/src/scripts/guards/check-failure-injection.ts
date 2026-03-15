import { TASK_TYPE_CATALOG } from '../../modules/tasks/task-type-catalog.js';
import { TASKS_ROUTE_CATALOG } from '../../modules/tasks/route-catalog.js';

const parseBool = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined || value.trim() === '') {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
};

const main = () => {
  const enabled = parseBool(process.env.FAILURE_INJECTION_ENABLED, false);
  const allowInProd = parseBool(process.env.FAILURE_INJECTION_ALLOW_IN_PROD, false);
  const nodeEnv = (process.env.NODE_ENV || '').trim().toLowerCase();
  const knownTaskTypes = new Set(TASK_TYPE_CATALOG.map((item) => item.taskType));
  const knownErrorCodes = new Set([
    'CAPABILITY_MISMATCH',
    'PROVIDER_AUTH_FAILED',
    'PROVIDER_RATE_LIMITED',
    'PROVIDER_TIMEOUT',
    'PROVIDER_UNKNOWN'
  ]);
  const requiredFailureInjectionRoutes = [
    '/video/failure-injection/report',
    '/video/failure-injection/config',
    '/video/failure-injection/export',
    '/video/failure-injection/reset'
  ];
  const catalogRoutes = TASKS_ROUTE_CATALOG as readonly string[];
  const missingFailureInjectionRoutes = requiredFailureInjectionRoutes.filter((route) => !catalogRoutes.includes(route));
  if (missingFailureInjectionRoutes.length > 0) {
    throw new Error(`failure-injection route catalog mismatch: missing ${missingFailureInjectionRoutes.join(', ')}`);
  }

  const taskTypeList = (process.env.FAILURE_INJECTION_TASK_TYPES || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  for (const taskType of taskTypeList) {
    if (!knownTaskTypes.has(taskType as (typeof TASK_TYPE_CATALOG)[number]['taskType'])) {
      throw new Error(`unknown FAILURE_INJECTION_TASK_TYPES item: ${taskType}`);
    }
  }

  const errorCodeList = (process.env.FAILURE_INJECTION_ERROR_CODES || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  for (const code of errorCodeList) {
    if (!knownErrorCodes.has(code)) {
      throw new Error(`unknown FAILURE_INJECTION_ERROR_CODES item: ${code}`);
    }
  }

  const ratioRaw = (process.env.FAILURE_INJECTION_RATIO || '').trim();
  if (ratioRaw) {
    const ratio = Number(ratioRaw);
    if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1) {
      throw new Error(`FAILURE_INJECTION_RATIO must be within [0,1], received: ${ratioRaw}`);
    }
  }

  if (enabled && nodeEnv === 'production' && !allowInProd) {
    throw new Error('failure injection is enabled in production without FAILURE_INJECTION_ALLOW_IN_PROD=1');
  }

  console.log(
    `[guard] failure injection config ok (enabled=${enabled ? 'on' : 'off'}, taskTypes=${taskTypeList.length}, errorCodes=${errorCodeList.length}, routes=${requiredFailureInjectionRoutes.length})`
  );
};

main();
