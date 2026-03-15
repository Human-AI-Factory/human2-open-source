import { computed, type Ref } from 'vue';
import type { VideoTaskEvent, VideoTaskListItem, VideoTaskRuntimeSnapshot, VideoTaskRuntimeTrendPoint } from '@/types/models';

type UseTaskCenterDerivedStateOptions = {
  tasks: Ref<VideoTaskListItem[]>;
  total: Ref<number>;
  pageSize: number;
  providerErrorCode: Ref<string>;
  providerTaskIdKeyword: Ref<string>;
  events: Ref<VideoTaskEvent[]>;
  eventStatusFilter: Ref<string>;
  eventKeyword: Ref<string>;
  eventCreatedFromLocal: Ref<string>;
  eventCreatedToLocal: Ref<string>;
  tableColumnVisible: Ref<Record<'scope' | 'status' | 'progress' | 'priority' | 'providerTaskId' | 'providerErrorCode' | 'updatedAt', boolean>>;
  tableSortKey: Ref<'status' | 'progress' | 'updatedAt'>;
  tableSortOrder: Ref<'asc' | 'desc'>;
  runtime: Ref<VideoTaskRuntimeSnapshot>;
  queueThresholdCritical: Ref<number>;
  queueThresholdWarn: Ref<number>;
  runtimeTrend: Ref<VideoTaskRuntimeTrendPoint[]>;
};

export const useTaskCenterDerivedState = (options: UseTaskCenterDerivedStateOptions) => {
  const totalPages = computed(() => Math.max(1, Math.ceil(options.total.value / options.pageSize)));

  const filteredTasks = computed(() =>
    options.tasks.value.filter((item) => {
      if (!options.providerErrorCode.value) {
        if (!options.providerTaskIdKeyword.value.trim()) return true;
        return (item.providerTaskId ?? '').toLowerCase().includes(options.providerTaskIdKeyword.value.trim().toLowerCase());
      }
      if ((item.providerErrorCode ?? '') !== options.providerErrorCode.value) {
        return false;
      }
      if (options.providerTaskIdKeyword.value.trim()) {
        return (item.providerTaskId ?? '').toLowerCase().includes(options.providerTaskIdKeyword.value.trim().toLowerCase());
      }
      return true;
    })
  );

  const filteredEvents = computed(() =>
    options.events.value.filter((item) => {
      if (options.eventStatusFilter.value && item.status !== options.eventStatusFilter.value) {
        return false;
      }
      if (options.eventKeyword.value.trim()) {
        const kw = options.eventKeyword.value.trim().toLowerCase();
        const source = `${item.error ?? ''}`.toLowerCase();
        if (!source.includes(kw)) {
          return false;
        }
      }
      if (options.eventCreatedFromLocal.value) {
        const from = Date.parse(options.eventCreatedFromLocal.value);
        const current = Date.parse(item.createdAt);
        if (Number.isFinite(from) && Number.isFinite(current) && current < from) {
          return false;
        }
      }
      if (options.eventCreatedToLocal.value) {
        const to = Date.parse(options.eventCreatedToLocal.value);
        const current = Date.parse(item.createdAt);
        if (Number.isFinite(to) && Number.isFinite(current) && current > to) {
          return false;
        }
      }
      return true;
    })
  );

  const visibleTableColumnCount = computed(
    () =>
      (Object.keys(options.tableColumnVisible.value) as Array<keyof typeof options.tableColumnVisible.value>).filter(
        (key) => options.tableColumnVisible.value[key]
      ).length
  );

  const displayTasks = computed(() => {
    const items = [...filteredTasks.value];
    const orderFactor = options.tableSortOrder.value === 'asc' ? 1 : -1;
    if (options.tableSortKey.value === 'progress') {
      return items.sort((a, b) => (a.progress - b.progress) * orderFactor || b.updatedAt.localeCompare(a.updatedAt));
    }
    if (options.tableSortKey.value === 'status') {
      const rank: Record<VideoTaskListItem['status'], number> = {
        queued: 1,
        submitting: 2,
        polling: 3,
        running: 4,
        done: 5,
        failed: 6,
        cancelled: 7
      };
      return items.sort((a, b) => (rank[a.status] - rank[b.status]) * orderFactor || b.updatedAt.localeCompare(a.updatedAt));
    }
    return items.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt) * orderFactor);
  });

  const congestionLevel = computed<'green' | 'yellow' | 'red'>(() => {
    if (options.runtime.value.queuedTotal >= options.queueThresholdCritical.value || options.runtime.value.pumpErrorCount > 0) {
      return 'red';
    }
    if (
      options.runtime.value.queuedTotal >= options.queueThresholdWarn.value ||
      options.runtime.value.runningTotal > options.runtime.value.maxConcurrent
    ) {
      return 'yellow';
    }
    return 'green';
  });

  const congestionLabel = computed(() => {
    if (congestionLevel.value === 'red') {
      return '拥塞';
    }
    if (congestionLevel.value === 'yellow') {
      return '预警';
    }
    return '正常';
  });

  const runtimeTrendPoints = computed(() => {
    const points = options.runtimeTrend.value;
    if (points.length === 0) {
      return { queued: '', running: '', pump: '' };
    }
    const width = 280;
    const height = 60;
    const maxQueue = Math.max(1, ...points.map((item) => item.queued), ...points.map((item) => item.running));
    const maxPump = Math.max(1, ...points.map((item) => item.pumpDurationMs));
    const toPath = (values: number[], maxValue: number) =>
      values
        .map((value, idx) => {
          const x = points.length === 1 ? 0 : (idx / (points.length - 1)) * width;
          const y = height - (Math.max(0, value) / maxValue) * height;
          return `${x.toFixed(2)},${y.toFixed(2)}`;
        })
        .join(' ');
    return {
      queued: toPath(points.map((item) => item.queued), maxQueue),
      running: toPath(points.map((item) => item.running), maxQueue),
      pump: toPath(points.map((item) => item.pumpDurationMs), maxPump)
    };
  });

  return {
    congestionLabel,
    congestionLevel,
    displayTasks,
    filteredEvents,
    filteredTasks,
    runtimeTrendPoints,
    totalPages,
    visibleTableColumnCount
  };
};
