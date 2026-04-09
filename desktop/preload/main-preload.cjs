const { contextBridge, ipcRenderer } = require('electron');

const desktopApi = {
  getRuntime: () => ipcRenderer.invoke('desktop:get-runtime'),
  getLocalQueue: () => ipcRenderer.invoke('desktop:get-local-queue'),
  enqueueLocalTask: (input) => ipcRenderer.invoke('desktop:enqueue-local-task', input),
  cancelLocalTask: (input) => ipcRenderer.invoke('desktop:cancel-local-task', input),
  clearLocalQueue: () => ipcRenderer.invoke('desktop:clear-local-queue'),
  setQueuePaused: (input) => ipcRenderer.invoke('desktop:set-queue-paused', input),
  processLocalQueueNow: () => ipcRenderer.invoke('desktop:process-local-queue-now'),
  exportDiagnostics: () => ipcRenderer.invoke('desktop:export-diagnostics'),
  pickResourceDirectory: () => ipcRenderer.invoke('desktop:pick-resource-directory'),
  indexResourceDirectory: (input) => ipcRenderer.invoke('desktop:index-resource-directory', input),
  pickLocalMediaFiles: () => ipcRenderer.invoke('desktop:pick-local-media-files'),
  revealPath: (targetPath) => ipcRenderer.invoke('desktop:reveal-path', targetPath),
  readWorkspaceFile: (input) => ipcRenderer.invoke('desktop:read-workspace-file', input),
  onLocalQueueUpdated: (listener) => {
    const handler = (_event, payload) => listener(payload);
    ipcRenderer.on('desktop:local-queue-updated', handler);
    return () => ipcRenderer.removeListener('desktop:local-queue-updated', handler);
  },
  onResourceIndexUpdated: (listener) => {
    const handler = (_event, payload) => listener(payload);
    ipcRenderer.on('desktop:resource-index-updated', handler);
    return () => ipcRenderer.removeListener('desktop:resource-index-updated', handler);
  },
  onMenuCommand: (listener) => {
    const handler = (_event, payload) => listener(payload);
    ipcRenderer.on('desktop:menu-command', handler);
    return () => ipcRenderer.removeListener('desktop:menu-command', handler);
  },
  onWorkspaceFileOpened: (listener) => {
    const handler = (_event, payload) => listener(payload);
    ipcRenderer.on('desktop:workspace-file-opened', handler);
    return () => ipcRenderer.removeListener('desktop:workspace-file-opened', handler);
  }
};

// Keep both names during the runtime bridge migration.
contextBridge.exposeInMainWorld('toonflowDesktop', desktopApi);
contextBridge.exposeInMainWorld('human2Desktop', desktopApi);
