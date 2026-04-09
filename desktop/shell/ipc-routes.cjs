const registerDesktopIpcRoutes = ({
  ipcMain,
  dialog,
  shell,
  app,
  path,
  fsp,
  registerLocalMediaBridge,
  mediaExtensions,
  localRuntimeController,
  backendRuntimeController
}) => {
  ipcMain.handle('desktop:get-runtime', async () => {
    return localRuntimeController.getRuntimeSnapshot({
      appVersion: app.getVersion(),
      platform: process.platform,
      defaultResourceDir: path.join(app.getPath('userData'), 'local-resources'),
      apiBaseUrl: backendRuntimeController?.getApiBaseUrl?.() || '',
      backend: backendRuntimeController?.getSnapshot?.() || null
    });
  });

  ipcMain.handle('desktop:get-local-queue', async () => {
    return localRuntimeController.getLocalQueueSnapshot();
  });

  ipcMain.handle('desktop:enqueue-local-task', async (_event, input) => {
    const type = input && typeof input.type === 'string' ? input.type : 'compose-local-preview';
    const payload = input && typeof input.payload === 'object' && input.payload ? input.payload : {};
    const source = input && typeof input.source === 'string' ? input.source : 'ui';
    return localRuntimeController.enqueueLocalTask(type, payload, source);
  });

  ipcMain.handle('desktop:cancel-local-task', async (_event, input) => {
    const taskId = input && typeof input.taskId === 'string' ? input.taskId : '';
    return localRuntimeController.cancelLocalTask(taskId);
  });

  ipcMain.handle('desktop:clear-local-queue', async () => {
    return localRuntimeController.clearLocalQueue();
  });

  ipcMain.handle('desktop:set-queue-paused', async (_event, input) => {
    return localRuntimeController.setQueuePaused(Boolean(input && input.paused), 'ipc');
  });

  ipcMain.handle('desktop:process-local-queue-now', async () => {
    await localRuntimeController.processQueueTick();
    return localRuntimeController.queueSummary();
  });

  ipcMain.handle('desktop:export-diagnostics', async () => {
    const defaultName = `toonflow-desktop-diagnostics-${Date.now()}.json`;
    const result = await dialog.showSaveDialog({
      title: '导出桌面诊断包',
      defaultPath: path.join(app.getPath('documents'), defaultName),
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (result.canceled || !result.filePath) {
      return null;
    }
    return localRuntimeController.exportDiagnostics(result.filePath, {
      appVersion: app.getVersion(),
      platform: process.platform,
      backend: backendRuntimeController?.getSnapshot?.() || null
    });
  });

  registerLocalMediaBridge({
    ipcMain,
    dialog,
    shell,
    mediaExtensions,
    getResourceDir: () => localRuntimeController.getResourceDir(),
    updateResourceIndex: localRuntimeController.updateResourceIndex,
    ensureResourceWatcher: localRuntimeController.ensureResourceWatcher,
    enqueueLocalTask: localRuntimeController.enqueueLocalTask
  });

  ipcMain.handle('desktop:read-workspace-file', async (_event, input) => {
    const filePath = input && typeof input.filePath === 'string' ? input.filePath : '';
    if (!filePath) {
      return null;
    }
    try {
      const raw = await fsp.readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      return {
        filePath,
        raw,
        parsed
      };
    } catch (error) {
      return {
        filePath,
        error: error instanceof Error ? error.message : 'Failed to read workspace file'
      };
    }
  });
};

module.exports = {
  registerDesktopIpcRoutes
};
