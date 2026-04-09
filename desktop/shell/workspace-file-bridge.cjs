const createWorkspaceFileBridge = ({
  path,
  nowIso,
  broadcast,
  getMainWindow,
  getPendingWorkspaceFiles,
  setPendingWorkspaceFiles
}) => {
  const resolveWorkspaceFilePathFromArg = (value) => {
    if (typeof value !== 'string' || !value.trim()) {
      return '';
    }
    const trimmed = value.trim();
    if (trimmed.startsWith('toonflowlite://open-workspace?path=')) {
      try {
        const query = trimmed.split('?')[1] || '';
        const params = new URLSearchParams(query);
        const encodedPath = params.get('path') || '';
        return encodedPath ? decodeURIComponent(encodedPath) : '';
      } catch {
        return '';
      }
    }
    if (trimmed.endsWith('.toonflow') || trimmed.endsWith('.json')) {
      if (path.isAbsolute(trimmed)) {
        return trimmed;
      }
      return path.resolve(trimmed);
    }
    return '';
  };

  const emitWorkspaceFileOpened = (filePath) => {
    if (!filePath) {
      return;
    }
    broadcast('desktop:workspace-file-opened', {
      filePath,
      openedAt: nowIso()
    });
  };

  const openWorkspaceFile = (filePath) => {
    if (!filePath) {
      return false;
    }
    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) {
      setPendingWorkspaceFiles([...getPendingWorkspaceFiles(), filePath]);
      return true;
    }
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.show();
    mainWindow.focus();
    emitWorkspaceFileOpened(filePath);
    return true;
  };

  const flushPendingWorkspaceFiles = () => {
    const pending = [...getPendingWorkspaceFiles()];
    if (pending.length === 0) {
      return;
    }
    setPendingWorkspaceFiles([]);
    for (const filePath of pending) {
      emitWorkspaceFileOpened(filePath);
    }
  };

  return {
    resolveWorkspaceFilePathFromArg,
    emitWorkspaceFileOpened,
    openWorkspaceFile,
    flushPendingWorkspaceFiles
  };
};

module.exports = {
  createWorkspaceFileBridge
};
