import test from 'node:test';
import assert from 'node:assert/strict';
import { ref } from 'vue';
import { useTaskCenterDerivedState } from '../src/composables/useTaskCenterDerivedState';

test('useTaskCenterDerivedState should filter and sort tasks and compute congestion state', () => {
  const tasks = ref([
    {
      id: 'task-1',
      projectName: 'A',
      storyboardTitle: 'Shot 1',
      providerTaskId: 'provider-a',
      providerErrorCode: 'PROVIDER_TIMEOUT',
      status: 'failed',
      progress: 10,
      priority: 50,
      updatedAt: '2026-03-07T09:00:00.000Z'
    },
    {
      id: 'task-2',
      projectName: 'B',
      storyboardTitle: 'Shot 2',
      providerTaskId: 'provider-b',
      providerErrorCode: null,
      status: 'running',
      progress: 85,
      priority: 10,
      updatedAt: '2026-03-07T10:00:00.000Z'
    }
  ] as any);
  const total = ref(24);
  const providerErrorCode = ref('PROVIDER_TIMEOUT');
  const providerTaskIdKeyword = ref('');
  const events = ref([
    { createdAt: '2026-03-07T09:00:00.000Z', status: 'failed', error: 'timeout while polling' },
    { createdAt: '2026-03-07T10:00:00.000Z', status: 'done', error: null }
  ] as any);
  const eventStatusFilter = ref('failed');
  const eventKeyword = ref('timeout');
  const eventCreatedFromLocal = ref('');
  const eventCreatedToLocal = ref('');
  const tableColumnVisible = ref({
    scope: true,
    status: true,
    progress: false,
    priority: false,
    providerTaskId: false,
    providerErrorCode: true,
    updatedAt: true
  });
  const tableSortKey = ref<'status' | 'progress' | 'updatedAt'>('updatedAt');
  const tableSortOrder = ref<'asc' | 'desc'>('desc');
  const runtime = ref({
    queuedTotal: 14,
    runningTotal: 3,
    maxConcurrent: 2,
    pumpErrorCount: 0
  } as any);
  const queueThresholdCritical = ref(20);
  const queueThresholdWarn = ref(10);
  const runtimeTrend = ref([
    { queued: 3, running: 1, pumpDurationMs: 100 },
    { queued: 5, running: 2, pumpDurationMs: 180 }
  ] as any);

  const state = useTaskCenterDerivedState({
    tasks,
    total,
    pageSize: 20,
    providerErrorCode,
    providerTaskIdKeyword,
    events,
    eventStatusFilter,
    eventKeyword,
    eventCreatedFromLocal,
    eventCreatedToLocal,
    tableColumnVisible,
    tableSortKey,
    tableSortOrder,
    runtime,
    queueThresholdCritical,
    queueThresholdWarn,
    runtimeTrend
  });

  assert.equal(state.totalPages.value, 2);
  assert.equal(state.filteredTasks.value.length, 1);
  assert.equal(state.filteredTasks.value[0].id, 'task-1');
  assert.equal(state.displayTasks.value[0].id, 'task-1');
  assert.equal(state.filteredEvents.value.length, 1);
  assert.equal(state.visibleTableColumnCount.value, 4);
  assert.equal(state.congestionLevel.value, 'yellow');
  assert.equal(state.congestionLabel.value, '预警');
  assert.ok(state.runtimeTrendPoints.value.queued.length > 0);
});
