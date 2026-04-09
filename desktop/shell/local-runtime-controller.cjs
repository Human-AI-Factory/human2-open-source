const createLocalRuntimeController = ({
  fs,
  fsp,
  collectMediaFiles,
  desktopStatePath,
  localQueuePath,
  localJobsDir,
  nowIso,
  queueTickMs,
  onQueueUpdated,
  onResourceUpdated
}) => {
  /** @type {{ resourceDir: string, cachedFiles: Array<{path:string,relativePath:string,size:number,updatedAt:string,ext:string}> }} */
  let desktopState = {
    resourceDir: '',
    cachedFiles: []
  };

  /** @type {{ tasks: Array<any> }} */
  let localQueueState = {
    tasks: []
  };
  let queuePaused = false;
  let recoveredTaskCount = 0;
  /** @type {Array<{time:string,level:'info'|'warn'|'error',message:string,meta?:Record<string,unknown>}>} */
  let desktopOpsLog = [];
  /** @type {number[]} */
  let recentPumpDelayMs = [];
  let lastPumpTickAtMs = 0;
  /** @type {NodeJS.Timeout | null} */
  let queueTimer = null;
  /** @type {fs.FSWatcher | null} */
  let resourceWatcher = null;
  /** @type {NodeJS.Timeout | null} */
  let watcherDebounceTimer = null;

  const MAX_PUMP_DELAY_SAMPLES = 30;

  const randomId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  const logEvent = (level, message, meta) => {
    desktopOpsLog = [{ time: nowIso(), level, message, meta: meta || undefined }, ...desktopOpsLog].slice(0, 500);
  };

  const readJsonFile = async (filePath, fallback) => {
    try {
      const raw = await fsp.readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        return fallback;
      }
      return parsed;
    } catch {
      return fallback;
    }
  };

  const writeJsonFile = async (filePath, payload) => {
    try {
      await fsp.mkdir(require('node:path').dirname(filePath), { recursive: true });
      await fsp.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
    } catch {
      // ignore write errors
    }
  };

  const pushPumpDelaySample = (value) => {
    if (!Number.isFinite(value)) {
      return;
    }
    recentPumpDelayMs = [Math.max(0, Math.round(value)), ...recentPumpDelayMs].slice(0, MAX_PUMP_DELAY_SAMPLES);
  };

  const averagePumpDelayMs = () => {
    if (recentPumpDelayMs.length === 0) {
      return 0;
    }
    const sum = recentPumpDelayMs.reduce((acc, item) => acc + item, 0);
    return Math.round(sum / recentPumpDelayMs.length);
  };

  const buildDelayTrendSparkline = () => {
    if (recentPumpDelayMs.length === 0) {
      return '-';
    }
    const bars = '▁▂▃▄▅▆▇█';
    const sample = [...recentPumpDelayMs].slice(0, 10).reverse();
    const max = Math.max(...sample, 1);
    return sample
      .map((value) => {
        const index = Math.max(0, Math.min(bars.length - 1, Math.round((value / max) * (bars.length - 1))));
        return bars[index];
      })
      .join('');
  };

  const queueSummary = () => {
    const counts = { queued: 0, running: 0, done: 0, failed: 0, cancelled: 0 };
    for (const task of localQueueState.tasks) {
      if (counts[task.status] !== undefined) {
        counts[task.status] += 1;
      }
    }
    return {
      total: localQueueState.tasks.length,
      paused: queuePaused,
      recoveredTaskCount,
      avgPumpDelayMs: averagePumpDelayMs(),
      recentPumpDelayMs: recentPumpDelayMs.slice(0, 10),
      ...counts
    };
  };

  const buildQueuePayload = () => ({
    tasks: localQueueState.tasks,
    summary: queueSummary(),
    logs: desktopOpsLog.slice(0, 120),
    updatedAt: nowIso()
  });

  const buildResourcePayload = () => ({
    dir: desktopState.resourceDir,
    files: desktopState.cachedFiles,
    count: desktopState.cachedFiles.length,
    updatedAt: nowIso()
  });

  const emitQueueUpdated = () => {
    onQueueUpdated?.(buildQueuePayload());
  };

  const emitResourceUpdated = () => {
    onResourceUpdated?.(buildResourcePayload());
  };

  const persistDesktopState = async () => {
    await writeJsonFile(desktopStatePath, desktopState);
  };

  const persistQueueState = async () => {
    await writeJsonFile(localQueuePath, localQueueState);
  };

  const updateResourceIndex = async (dir, maxItems = 1200) => {
    if (!dir) {
      desktopState.resourceDir = '';
      desktopState.cachedFiles = [];
      await persistDesktopState();
      emitResourceUpdated();
      return [];
    }
    const files = await collectMediaFiles(dir, maxItems);
    desktopState.resourceDir = dir;
    desktopState.cachedFiles = files;
    await persistDesktopState();
    emitResourceUpdated();
    return files;
  };

  const enqueueLocalTask = async (type, payload, source = 'ui') => {
    const task = {
      id: randomId(),
      type,
      source,
      payload,
      status: 'queued',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      startedAt: null,
      finishedAt: null,
      error: null,
      result: null
    };
    localQueueState.tasks = [task, ...localQueueState.tasks].slice(0, 2000);
    logEvent('info', 'local queue task enqueued', { taskId: task.id, type, source });
    await persistQueueState();
    emitQueueUpdated();
    return task;
  };

  const ensureResourceWatcher = (dir) => {
    if (resourceWatcher) {
      try {
        resourceWatcher.close();
      } catch {
        // ignore
      }
      resourceWatcher = null;
    }
    if (!dir) {
      return;
    }
    try {
      resourceWatcher = fs.watch(dir, { recursive: true }, () => {
        if (watcherDebounceTimer) {
          clearTimeout(watcherDebounceTimer);
        }
        watcherDebounceTimer = setTimeout(() => {
          void enqueueLocalTask('index-resource-dir', { dir, maxItems: 1500 }, 'watcher');
        }, 600);
      });
    } catch {
      // watcher not available in some platforms, keep manual indexing only
    }
  };

  const runSingleTask = async (task) => {
    if (!task) {
      return;
    }
    task.status = 'running';
    task.startedAt = nowIso();
    task.updatedAt = nowIso();
    task.error = null;
    await persistQueueState();
    emitQueueUpdated();
    logEvent('info', 'local queue task started', { taskId: task.id, type: task.type, source: task.source });

    try {
      if (task.type === 'index-resource-dir') {
        const dir = task.payload && typeof task.payload.dir === 'string' ? task.payload.dir : desktopState.resourceDir;
        const maxItems = task.payload && typeof task.payload.maxItems === 'number' ? Math.max(1, Math.min(task.payload.maxItems, 5000)) : 1500;
        const files = await updateResourceIndex(dir, maxItems);
        task.result = { indexed: files.length, dir };
      } else if (task.type === 'ingest-local-files') {
        const paths = Array.isArray(task.payload?.paths) ? task.payload.paths.filter((item) => typeof item === 'string') : [];
        task.result = { accepted: paths.length, paths };
      } else if (task.type === 'compose-local-preview') {
        await fsp.mkdir(localJobsDir, { recursive: true });
        const outputFile = require('node:path').join(localJobsDir, `${task.id}.json`);
        const content = {
          id: task.id,
          createdAt: nowIso(),
          title: task.payload?.title || 'Local Preview',
          clips: Array.isArray(task.payload?.clips) ? task.payload.clips : [],
          notes: 'Local offline queue preview artifact'
        };
        await fsp.writeFile(outputFile, JSON.stringify(content, null, 2), 'utf8');
        task.result = { outputFile };
      } else {
        task.result = { noop: true };
      }
      task.status = 'done';
      logEvent('info', 'local queue task done', { taskId: task.id, type: task.type });
    } catch (error) {
      task.status = 'failed';
      task.error = error instanceof Error ? error.message : 'Task failed';
      logEvent('error', 'local queue task failed', {
        taskId: task.id,
        type: task.type,
        error: task.error
      });
    }

    task.finishedAt = nowIso();
    task.updatedAt = nowIso();
    await persistQueueState();
    emitQueueUpdated();
  };

  const processQueueTick = async () => {
    const nowMs = Date.now();
    if (lastPumpTickAtMs > 0) {
      const drift = nowMs - lastPumpTickAtMs - queueTickMs;
      pushPumpDelaySample(drift);
    }
    lastPumpTickAtMs = nowMs;
    if (queuePaused) {
      emitQueueUpdated();
      return;
    }
    const next = localQueueState.tasks.find((item) => item.status === 'queued');
    if (!next) {
      emitQueueUpdated();
      return;
    }
    await runSingleTask(next);
  };

  const startQueueWorker = () => {
    if (queueTimer) {
      clearInterval(queueTimer);
    }
    queueTimer = setInterval(() => {
      void processQueueTick();
    }, queueTickMs);
  };

  const stopQueueWorker = () => {
    if (queueTimer) {
      clearInterval(queueTimer);
      queueTimer = null;
    }
  };

  const bootstrap = async () => {
    desktopState = await readJsonFile(desktopStatePath, { resourceDir: '', cachedFiles: [] });
    if (!Array.isArray(desktopState.cachedFiles)) {
      desktopState.cachedFiles = [];
    }
    localQueueState = await readJsonFile(localQueuePath, { tasks: [] });
    if (!Array.isArray(localQueueState.tasks)) {
      localQueueState.tasks = [];
    }
    let recovered = 0;
    localQueueState.tasks = localQueueState.tasks.map((task) => {
      if (task && task.status === 'running') {
        recovered += 1;
        return {
          ...task,
          status: 'queued',
          updatedAt: nowIso(),
          error: task.error || 'Recovered from previous desktop session'
        };
      }
      return task;
    });
    recoveredTaskCount = recovered;
    if (recoveredTaskCount > 0) {
      logEvent('warn', 'recovered pending tasks from previous session', { recoveredTaskCount });
    }
    await persistQueueState();
    ensureResourceWatcher(desktopState.resourceDir || '');
  };

  const cancelLocalTask = async (taskId) => {
    const target = localQueueState.tasks.find((task) => task.id === taskId);
    if (!target) {
      return false;
    }
    if (target.status === 'queued' || target.status === 'running') {
      target.status = 'cancelled';
      target.updatedAt = nowIso();
      target.finishedAt = nowIso();
      logEvent('warn', 'local queue task cancelled', { taskId, type: target.type });
      await persistQueueState();
      emitQueueUpdated();
    }
    return true;
  };

  const clearLocalQueue = async () => {
    localQueueState.tasks = localQueueState.tasks.filter((task) => task.status === 'running');
    await persistQueueState();
    emitQueueUpdated();
    return true;
  };

  const setQueuePaused = async (paused, source = 'runtime') => {
    queuePaused = Boolean(paused);
    logEvent('info', queuePaused ? `queue paused by ${source}` : `queue resumed by ${source}`);
    await persistQueueState();
    emitQueueUpdated();
    return queueSummary();
  };

  const getRuntimeSnapshot = ({ appVersion, platform, defaultResourceDir, apiBaseUrl = '', backend = null }) => ({
    isDesktop: true,
    platform,
    appVersion,
    localResourceDir: desktopState.resourceDir || '',
    defaultResourceDir,
    apiBaseUrl,
    backend,
    queueSummary: queueSummary(),
    queuePaused
  });

  const getLocalQueueSnapshot = () => buildQueuePayload();

  const exportDiagnostics = async (filePath, meta) => {
    const payload = {
      exportedAt: nowIso(),
      appVersion: meta.appVersion,
      platform: meta.platform,
      backend: meta.backend ?? null,
      queueSummary: queueSummary(),
      queueState: localQueueState,
      desktopState,
      logs: desktopOpsLog
    };
    await writeJsonFile(filePath, payload);
    logEvent('info', 'desktop diagnostics exported', { filePath });
    emitQueueUpdated();
    return { filePath };
  };

  const dispose = () => {
    stopQueueWorker();
    if (resourceWatcher) {
      try {
        resourceWatcher.close();
      } catch {
        // ignore
      }
      resourceWatcher = null;
    }
    if (watcherDebounceTimer) {
      clearTimeout(watcherDebounceTimer);
      watcherDebounceTimer = null;
    }
  };

  return {
    averagePumpDelayMs,
    buildDelayTrendSparkline,
    queueSummary,
    getQueuePaused: () => queuePaused,
    getResourceDir: () => desktopState.resourceDir,
    getDesktopState: () => desktopState,
    updateResourceIndex,
    ensureResourceWatcher,
    enqueueLocalTask,
    processQueueTick,
    startQueueWorker,
    stopQueueWorker,
    bootstrap,
    cancelLocalTask,
    clearLocalQueue,
    setQueuePaused,
    getRuntimeSnapshot,
    getLocalQueueSnapshot,
    exportDiagnostics,
    emitQueueUpdated,
    emitResourceUpdated,
    dispose
  };
};

module.exports = {
  createLocalRuntimeController
};
