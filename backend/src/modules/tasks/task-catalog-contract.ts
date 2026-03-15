import { TaskCatalogItem } from './task-type-catalog.js';

export type TaskCatalogContractCheckItem = {
  taskType: string;
  drift: boolean;
  reasons: string[];
  expected?: TaskCatalogItem;
  actual?: TaskCatalogItem;
};

export type TaskCatalogContractCheckResult = {
  total: number;
  driftCount: number;
  level: 'green' | 'yellow' | 'red';
  reason: string;
  items: TaskCatalogContractCheckItem[];
};

export const TASK_CATALOG_CONTRACT_BASELINE: TaskCatalogItem[] = [
  {
    taskType: 'video',
    queueTopic: 'video_task',
    terminalStatuses: ['done', 'failed', 'cancelled'],
    retryableStatuses: ['failed', 'cancelled'],
    defaultPriority: 'medium'
  },
  {
    taskType: 'audio',
    queueTopic: 'audio_task',
    terminalStatuses: ['done', 'failed'],
    retryableStatuses: ['failed'],
    defaultPriority: 'medium'
  },
  {
    taskType: 'video_merge',
    queueTopic: 'video_merge',
    terminalStatuses: ['done', 'failed'],
    retryableStatuses: ['failed'],
    defaultPriority: 'medium'
  }
];

const normalize = (values: string[]): string[] => [...new Set(values)].sort((a, b) => a.localeCompare(b));

export const evaluateTaskCatalogContract = (
  actualCatalog: TaskCatalogItem[],
  expectedCatalog: TaskCatalogItem[] = TASK_CATALOG_CONTRACT_BASELINE
): TaskCatalogContractCheckResult => {
  const expectedMap = new Map(expectedCatalog.map((item) => [item.taskType, item]));
  const actualMap = new Map(actualCatalog.map((item) => [item.taskType, item]));
  const taskTypes = [...new Set([...expectedMap.keys(), ...actualMap.keys()])].sort((a, b) => a.localeCompare(b));
  const items: TaskCatalogContractCheckItem[] = taskTypes.map((taskType) => {
    const expected = expectedMap.get(taskType);
    const actual = actualMap.get(taskType);
    const reasons: string[] = [];

    if (!expected) {
      reasons.push('unexpected taskType');
    } else if (!actual) {
      reasons.push('missing taskType');
    } else {
      if (actual.queueTopic !== expected.queueTopic) {
        reasons.push(`queueTopic=${actual.queueTopic} (expected ${expected.queueTopic})`);
      }
      if (actual.defaultPriority !== expected.defaultPriority) {
        reasons.push(`defaultPriority=${actual.defaultPriority} (expected ${expected.defaultPriority})`);
      }
      const actualTerminal = normalize(actual.terminalStatuses);
      const expectedTerminal = normalize(expected.terminalStatuses);
      if (actualTerminal.join('|') !== expectedTerminal.join('|')) {
        reasons.push(`terminal=[${actualTerminal.join(',')}] (expected [${expectedTerminal.join(',')}])`);
      }
      const actualRetryable = normalize(actual.retryableStatuses);
      const expectedRetryable = normalize(expected.retryableStatuses);
      if (actualRetryable.join('|') !== expectedRetryable.join('|')) {
        reasons.push(`retryable=[${actualRetryable.join(',')}] (expected [${expectedRetryable.join(',')}])`);
      }
    }

    return {
      taskType,
      drift: reasons.length > 0,
      reasons,
      expected,
      actual
    };
  });

  const driftItems = items.filter((item) => item.drift);
  const driftCount = driftItems.length;
  const hasMissingOrUnexpected = driftItems.some((item) =>
    item.reasons.some((reason) => reason === 'missing taskType' || reason === 'unexpected taskType')
  );
  let level: 'green' | 'yellow' | 'red' = 'green';
  if (driftCount > 0) {
    level = hasMissingOrUnexpected ? 'red' : 'yellow';
  }
  const reason =
    driftCount === 0
      ? 'task catalog contract matched'
      : hasMissingOrUnexpected
        ? `contract drift detected: ${driftCount} item(s), includes missing/unexpected taskType`
        : `contract drift detected: ${driftCount} item(s)`;

  return {
    total: taskTypes.length,
    driftCount,
    level,
    reason,
    items
  };
};
