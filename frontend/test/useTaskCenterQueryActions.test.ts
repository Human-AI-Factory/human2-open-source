import test from 'node:test';
import assert from 'node:assert/strict';
import { computed, ref } from 'vue';
import { useTaskCenterQueryActions } from '../src/composables/useTaskCenterQueryActions';

const createRouterStub = () => {
  const pushes: any[] = [];
  const replaces: any[] = [];
  return {
    pushes,
    replaces,
    push: async (input: any) => {
      pushes.push(input);
    },
    replace: async (input: any) => {
      replaces.push(input);
    },
    resolve: (input: any) => ({ href: typeof input === 'string' ? input : input.path ?? '/dramas' })
  };
};

test('useTaskCenterQueryActions should expose chips, clear filters and navigate by scope', async () => {
  const router = createRouterStub();
  const route = {
    path: '/task-center',
    hash: '',
    query: {},
    params: {}
  } as any;
  let loadCount = 0;

  const keyword = ref('hero');
  const providerTaskIdKeyword = ref('p-1');
  const status = ref('failed');
  const providerErrorCode = ref('PROVIDER_TIMEOUT');
  const createdFromLocal = ref('2026-03-07T08:00');
  const createdToLocal = ref('');
  const sortBy = ref<'createdAt' | 'updatedAt' | 'priority' | 'status'>('updatedAt');
  const order = ref<'asc' | 'desc'>('asc');
  const page = ref(2);
  const taskCatalogTypeFilter = ref<'' | 'video' | 'audio' | 'video_merge'>('');
  const unifiedAlertWindowMinutes = ref(60);
  const unifiedIncidentStatusFilter = ref<'' | 'open' | 'resolved'>('');
  const unifiedIncidentNotificationDeliveryStatusFilter = ref<'' | 'sent' | 'failed'>('');
  const unifiedIncidentNotificationDeliveryMessageKeyword = ref('');
  const actionMessage = ref('');
  const error = ref('');
  const scopedDramaId = computed(() => 'drama-1');
  const hasDramaPathScope = computed(() => false);
  const totalPages = computed(() => 4);

  const actions = useTaskCenterQueryActions({
    route,
    router: router as any,
    taskCenterQueryKeys: ['q', 'providerTaskId', 'status', 'providerErrorCode', 'createdFrom', 'createdTo', 'sortBy', 'order', 'page'],
    scopedDramaId,
    hasDramaPathScope,
    keyword,
    providerTaskIdKeyword,
    status,
    providerErrorCode,
    createdFromLocal,
    createdToLocal,
    sortBy,
    order,
    page,
    totalPages,
    taskCatalogTypeFilter,
    unifiedAlertWindowMinutes,
    unifiedIncidentStatusFilter,
    unifiedIncidentNotificationDeliveryStatusFilter,
    unifiedIncidentNotificationDeliveryMessageKeyword,
    actionMessage,
    error,
    loadTasks: async () => {
      loadCount += 1;
    }
  });

  assert.equal(actions.activeFilterChips.value.length, 7);

  await actions.removeFilterChip('q');
  assert.equal(keyword.value, '');
  assert.equal(page.value, 1);
  assert.equal(loadCount, 1);

  await actions.focusFailedTasks();
  assert.equal(status.value, 'failed');
  assert.equal(actionMessage.value, '已聚焦失败任务');

  await actions.nextPage();
  assert.equal(page.value, 2);
  assert.equal(loadCount, 3);

  await actions.goHome();
  assert.deepEqual(router.pushes.at(-1), '/dramas/drama-1');
});
