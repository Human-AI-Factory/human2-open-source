const registerDesktopAppLifecycle = ({
  app,
  BrowserWindow,
  resolveWorkspaceFilePathFromArg,
  appendPendingWorkspaceFile,
  openWorkspaceFile,
  showOrCreateMainWindow,
  createMainWindow,
  startDesktopRuntime,
  beforeQuit
}) => {
  const singleInstance = app.requestSingleInstanceLock();
  if (!singleInstance) {
    app.quit();
    return false;
  }

  app.on('second-instance', (_event, argv) => {
    const maybeFile = argv.map(resolveWorkspaceFilePathFromArg).find(Boolean);
    if (maybeFile) {
      openWorkspaceFile(maybeFile);
    } else {
      showOrCreateMainWindow();
    }
  });

  app.on('open-file', (event, filePath) => {
    event.preventDefault();
    const resolved = resolveWorkspaceFilePathFromArg(filePath);
    if (resolved) {
      openWorkspaceFile(resolved);
    }
  });

  app.on('open-url', (event, url) => {
    event.preventDefault();
    const resolved = resolveWorkspaceFilePathFromArg(url);
    if (resolved) {
      openWorkspaceFile(resolved);
    }
  });

  app.whenReady().then(async () => {
    app.setAsDefaultProtocolClient('toonflowlite');
    const startupWorkspaceFile = process.argv.map(resolveWorkspaceFilePathFromArg).find(Boolean);
    if (startupWorkspaceFile) {
      appendPendingWorkspaceFile(startupWorkspaceFile);
    }

    await startDesktopRuntime();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        void createMainWindow();
      } else {
        showOrCreateMainWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('before-quit', () => {
    beforeQuit();
  });

  return true;
};

module.exports = {
  registerDesktopAppLifecycle
};
