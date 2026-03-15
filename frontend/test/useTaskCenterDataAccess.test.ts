import test from 'node:test';
import assert from 'node:assert/strict';
import { ref } from 'vue';
import { useTaskCenterDataAccess } from '../src/composables/useTaskCenterDataAccess';

const createLocalStorageStub = () => {
  const store = new Map<string, string>();
  return {
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    }
  };
};

test('useTaskCenterDataAccess should load tasks and runtime snapshots through api client', async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;

  const fetchCalls: string[] = [];
  const okResponse = (data: unknown) => ({
    ok: true,
    status: 200,
    async json() {
      return { code: 200, bizCode: 'OK', data, message: '成功' };
    }
  });

  globalThis.localStorage = createLocalStorageStub() as Storage;
  globalThis.window = { dispatchEvent() {} } as Window & typeof globalThis;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    fetchCalls.push(url);
    if (url.includes('/api/tasks/video?')) {
      return okResponse({
        items: [{ id: 'task-1', projectId: 'project-1', status: 'queued', updatedAt: '2026-03-07T00:00:00.000Z' }],
        total: 1,
        page: 1,
        pageSize: 20
      }) as Response;
    }
    if (url.endsWith('/api/tasks/video/metrics')) {
      return okResponse({
        total: 1,
        queued: 1,
        running: 0,
        done: 0,
        failed: 0,
        failureRate: 0,
        avgQueueWaitMs: 10,
        avgRunDurationMs: 20
      }) as Response;
    }
    if (url.includes('/api/tasks/video/runtime/health?')) {
      return okResponse({
        snapshot: {
          heartbeatAt: '2026-03-07T00:00:00.000Z',
          isPumpRunning: true,
          maxConcurrent: 2,
          activeWorkerCount: 1,
          activeTaskIds: [],
          queueDriver: 'internal',
          queueBackend: 'lease',
          bullmqReady: false,
          bullmqWorkerEnabled: false,
          queueLoopEnabled: true,
          queueLeaseOwnerId: 'lease-1',
          lockOwnerId: null,
          lockExpiresAt: null,
          lockHeartbeatAt: null,
          queuedProjects: 1,
          queuedTotal: 1,
          runningTotal: 0,
          pumpCycleCount: 2,
          pumpErrorCount: 0,
          lastPumpStartedAt: null,
          lastPumpFinishedAt: null,
          lastPumpDurationMs: null,
          lastPumpError: null,
          projects: []
        },
        trend: [{ queued: 1, running: 0, pumpDurationMs: 100 }]
      }) as Response;
    }
    if (url.includes('/api/tasks/video/runtime-alerts?')) {
      return okResponse({ events: [], latestEvent: null, config: { warnQueuedThreshold: 5, criticalQueuedThreshold: 10 } }) as Response;
    }
    if (url.includes('/api/tasks/video/failure-injection/report?')) {
      return okResponse({ events: [], summary: { total: 0, byTaskType: {}, byErrorCode: {} } }) as Response;
    }
    throw new Error(`Unexpected fetch url: ${url}`);
  }) as typeof fetch;

  const tasks = ref<any[]>([]);
  const total = ref(0);
  const metrics = ref<any>({});
  const runtime = ref<any>({});
  const runtimeTrend = ref<any[]>([]);
  const queueAlertState = ref<any>({});
  const failureInjectionReport = ref<any>({});
  const keyword = ref('');
  const providerTaskIdKeyword = ref('');
  const providerErrorCode = ref('');
  const createdFromLocal = ref('');
  const createdToLocal = ref('');
  const sortBy = ref<'createdAt' | 'updatedAt' | 'priority' | 'status'>('createdAt');
  const order = ref<'asc' | 'desc'>('desc');
  const status = ref<any>('');
  const page = ref(1);
  const taskQuotaUsageProjectId = ref('');
  const taskQuotaDiffEntries = ref<any[]>([]);
  const error = ref('');
  const actionMessage = ref('');
  let refreshCatalogCount = 0;
  let refreshUnifiedAlertsCount = 0;
  let loadSloCount = 0;
  let refreshQuotaCount = 0;
  let loadQuotaUsageEventsCount = 0;
  let loadQuotaRejectEventsCount = 0;

  const access = useTaskCenterDataAccess({
    pageSize: 20,
    tasks,
    total,
    metrics,
    runtime,
    runtimeTrend,
    queueAlertState,
    failureInjectionReport,
    keyword,
    providerTaskIdKeyword,
    providerErrorCode: providerErrorCode as any,
    createdFromLocal,
    createdToLocal,
    sortBy,
    order,
    status,
    page,
    taskQuotaUsageProjectId,
    taskQuotaDiffEntries,
    error,
    actionMessage,
    refreshTaskCatalog: async () => {
      refreshCatalogCount += 1;
    },
    refreshUnifiedAlertsOnly: async () => {
      refreshUnifiedAlertsCount += 1;
    },
    loadTaskSloState: async () => {
      loadSloCount += 1;
    },
    refreshTaskQuotaUsage: async () => {
      refreshQuotaCount += 1;
    },
    loadTaskQuotaUsageEvents: async () => {
      loadQuotaUsageEventsCount += 1;
    },
    loadTaskQuotaRejectEvents: async () => {
      loadQuotaRejectEventsCount += 1;
    }
  });

  try {
    await access.loadTasks();
    assert.equal(tasks.value.length, 1);
    assert.equal(total.value, 1);
    assert.equal(metrics.value.queued, 1);
    assert.equal(runtime.value.maxConcurrent, 2);
    assert.equal(runtimeTrend.value.length, 1);
    assert.equal(taskQuotaUsageProjectId.value, 'project-1');
    assert.equal(error.value, '');
    assert.equal(refreshCatalogCount, 1);
    assert.equal(refreshUnifiedAlertsCount, 1);

    await Promise.resolve();
    assert.equal(loadSloCount, 1);
    assert.equal(refreshQuotaCount, 1);
    assert.equal(loadQuotaUsageEventsCount, 1);
    assert.equal(loadQuotaRejectEventsCount, 1);

    await access.loadRuntimeOnly();
    assert.equal(runtime.value.queuedTotal, 1);
    assert.equal(refreshUnifiedAlertsCount, 2);
    assert.ok(fetchCalls.some((url) => url.includes('/api/tasks/video/runtime/health?limit=30')));
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
    globalThis.localStorage = originalLocalStorage;
  }
});
