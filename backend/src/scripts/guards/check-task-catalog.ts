import { TASK_TYPE_CATALOG } from '../../modules/tasks/task-type-catalog.js';
import { evaluateTaskCatalogContract } from '../../modules/tasks/task-catalog-contract.js';

const main = () => {
  const seen = new Set<string>();
  for (const item of TASK_TYPE_CATALOG) {
    if (seen.has(item.taskType)) {
      throw new Error(`duplicate taskType in catalog: ${item.taskType}`);
    }
    seen.add(item.taskType);
    if (!item.queueTopic.trim()) {
      throw new Error(`empty queueTopic for taskType=${item.taskType}`);
    }
    if (item.terminalStatuses.length === 0) {
      throw new Error(`terminalStatuses empty for taskType=${item.taskType}`);
    }
    if (item.defaultPriority !== 'low' && item.defaultPriority !== 'medium' && item.defaultPriority !== 'high') {
      throw new Error(`invalid defaultPriority for taskType=${item.taskType}`);
    }
  }
  const contract = evaluateTaskCatalogContract(TASK_TYPE_CATALOG);
  if (contract.driftCount > 0) {
    const detail = contract.items
      .filter((item) => item.drift)
      .map((item) => `${item.taskType}: ${item.reasons.join(' | ')}`)
      .join('; ');
    throw new Error(`task catalog contract drift detected: ${detail}`);
  }
  console.log(`[guard] task catalog ok (${TASK_TYPE_CATALOG.length} items)`);
};

main();
