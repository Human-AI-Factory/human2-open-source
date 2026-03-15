import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

type DesktopMediaFile = {
  path: string;
  relativePath: string;
  size: number;
  updatedAt: string;
  ext: string;
};

type LocalQueueTask = {
  id: string;
  type: string;
  source: string;
  payload: Record<string, unknown>;
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  result: Record<string, unknown> | null;
};

type QueueSummary = {
  total: number;
  paused?: boolean;
  recoveredTaskCount?: number;
  queued: number;
  running: number;
  done: number;
  failed: number;
  cancelled: number;
};

const runtimeReady = ref(false);
const desktopAvailable = ref(false);
const isDesktop = ref(false);
const platform = ref('web');
const appVersion = ref('');
const localResourceDir = ref('');
const localResourceFiles = ref<DesktopMediaFile[]>([]);
const localQueueTasks = ref<LocalQueueTask[]>([]);
const localQueueSummary = ref<QueueSummary>({ total: 0, queued: 0, running: 0, done: 0, failed: 0, cancelled: 0 });
const localQueueLogs = ref<Array<{ time: string; level: 'info' | 'warn' | 'error'; message: string; meta?: Record<string, unknown> }>>([]);
const desktopError = ref('');
const online = ref(typeof navigator !== 'undefined' ? navigator.onLine : true);

let initialized = false;
let runtimeRefCount = 0;
let detachQueueListener: (() => void) | null = null;
let detachResourceListener: (() => void) | null = null;

const applyOnline = () => {
  online.value = navigator.onLine;
};

const refreshQueue = async (): Promise<void> => {
  const bridge = window.human2Desktop;
  if (!bridge) {
    localQueueTasks.value = [];
    localQueueSummary.value = { total: 0, queued: 0, running: 0, done: 0, failed: 0, cancelled: 0 };
    localQueueLogs.value = [];
    return;
  }
  const queue = await bridge.getLocalQueue();
  localQueueTasks.value = queue.tasks;
  localQueueSummary.value = queue.summary;
  localQueueLogs.value = Array.isArray(queue.logs) ? queue.logs : [];
};

const attachDesktopListeners = () => {
  const bridge = window.human2Desktop;
  if (!bridge) {
    return;
  }
  if (!detachQueueListener) {
    detachQueueListener = bridge.onLocalQueueUpdated((payload) => {
      localQueueTasks.value = payload.tasks;
      localQueueSummary.value = payload.summary;
      localQueueLogs.value = Array.isArray(payload.logs) ? payload.logs : [];
    });
  }
  if (!detachResourceListener) {
    detachResourceListener = bridge.onResourceIndexUpdated((payload) => {
      localResourceDir.value = payload.dir || '';
      localResourceFiles.value = payload.files || [];
    });
  }
};

const detachDesktopListeners = () => {
  if (detachQueueListener) {
    detachQueueListener();
    detachQueueListener = null;
  }
  if (detachResourceListener) {
    detachResourceListener();
    detachResourceListener = null;
  }
};

const refreshRuntime = async (): Promise<void> => {
  desktopError.value = '';
  const bridge = window.human2Desktop;
  if (!bridge) {
    desktopAvailable.value = false;
    isDesktop.value = false;
    runtimeReady.value = true;
    return;
  }
  desktopAvailable.value = true;
  try {
    const runtime = await bridge.getRuntime();
    isDesktop.value = Boolean(runtime.isDesktop);
    platform.value = runtime.platform || 'desktop';
    appVersion.value = runtime.appVersion || '';
    localResourceDir.value = runtime.localResourceDir || runtime.defaultResourceDir || '';
    if (runtime.queueSummary) {
      localQueueSummary.value = runtime.queueSummary;
    }
    if (localResourceDir.value) {
      const indexed = await bridge.indexResourceDirectory({ dir: localResourceDir.value, maxItems: 500 });
      localResourceFiles.value = indexed.files;
    } else {
      localResourceFiles.value = [];
    }
    await refreshQueue();
    attachDesktopListeners();
  } catch (error) {
    desktopError.value = error instanceof Error ? error.message : 'Desktop runtime unavailable';
  } finally {
    runtimeReady.value = true;
  }
};

const pickResourceDirectory = async (): Promise<void> => {
  const bridge = window.human2Desktop;
  if (!bridge) {
    return;
  }
  const selected = await bridge.pickResourceDirectory();
  if (!selected) {
    return;
  }
  localResourceDir.value = selected;
  const indexed = await bridge.indexResourceDirectory({ dir: selected, maxItems: 1200 });
  localResourceFiles.value = indexed.files;
};

const pickLocalMediaFiles = async (): Promise<string[]> => {
  const bridge = window.human2Desktop;
  if (!bridge) {
    return [];
  }
  return bridge.pickLocalMediaFiles();
};

const revealPath = async (targetPath: string): Promise<boolean> => {
  const bridge = window.human2Desktop;
  if (!bridge) {
    return false;
  }
  return bridge.revealPath(targetPath);
};

const enqueueLocalTask = async (input: { type: string; payload?: Record<string, unknown>; source?: string }): Promise<void> => {
  const bridge = window.human2Desktop;
  if (!bridge) {
    return;
  }
  await bridge.enqueueLocalTask(input);
};

const processLocalQueueNow = async (): Promise<void> => {
  const bridge = window.human2Desktop;
  if (!bridge) {
    return;
  }
  const summary = await bridge.processLocalQueueNow();
  localQueueSummary.value = summary;
  await refreshQueue();
};

const clearLocalQueue = async (): Promise<void> => {
  const bridge = window.human2Desktop;
  if (!bridge) {
    return;
  }
  await bridge.clearLocalQueue();
  await refreshQueue();
};

const setQueuePaused = async (paused: boolean): Promise<void> => {
  const bridge = window.human2Desktop;
  if (!bridge) {
    return;
  }
  const summary = await bridge.setQueuePaused({ paused });
  localQueueSummary.value = summary;
};

const cancelLocalTask = async (taskId: string): Promise<void> => {
  const bridge = window.human2Desktop;
  if (!bridge || !taskId) {
    return;
  }
  await bridge.cancelLocalTask({ taskId });
  await refreshQueue();
};

const exportDiagnostics = async (): Promise<string | null> => {
  const bridge = window.human2Desktop;
  if (!bridge) {
    return null;
  }
  const exported = await bridge.exportDiagnostics();
  if (!exported) {
    return null;
  }
  return exported.filePath;
};

const queueTopItems = computed(() => localQueueTasks.value.slice(0, 5));

export const useDesktopRuntime = () => {
  onMounted(() => {
    runtimeRefCount += 1;
    if (!initialized) {
      initialized = true;
      void refreshRuntime();
    } else {
      attachDesktopListeners();
    }
    window.addEventListener('online', applyOnline);
    window.addEventListener('offline', applyOnline);
  });

  onBeforeUnmount(() => {
    runtimeRefCount = Math.max(0, runtimeRefCount - 1);
    if (runtimeRefCount === 0) {
      detachDesktopListeners();
    }
    window.removeEventListener('online', applyOnline);
    window.removeEventListener('offline', applyOnline);
  });

  return {
    runtimeReady: computed(() => runtimeReady.value),
    desktopAvailable: computed(() => desktopAvailable.value),
    isDesktop: computed(() => isDesktop.value),
    platform: computed(() => platform.value),
    appVersion: computed(() => appVersion.value),
    localResourceDir: computed(() => localResourceDir.value),
    localResourceFiles: computed(() => localResourceFiles.value),
    localResourceCount: computed(() => localResourceFiles.value.length),
    localQueueTasks: computed(() => localQueueTasks.value),
    localQueueSummary: computed(() => localQueueSummary.value),
    localQueueLogs: computed(() => localQueueLogs.value),
    queueTopItems,
    online: computed(() => online.value),
    desktopError: computed(() => desktopError.value),
    refreshRuntime,
    refreshQueue,
    pickResourceDirectory,
    pickLocalMediaFiles,
    revealPath,
    enqueueLocalTask,
    processLocalQueueNow,
    clearLocalQueue,
    setQueuePaused,
    cancelLocalTask,
    exportDiagnostics
  };
};
