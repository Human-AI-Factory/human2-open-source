const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('toonflowStatusPanel', {
  onStatusUpdated: (listener) => {
    const handler = (_event, payload) => listener(payload);
    ipcRenderer.on('desktop:status-panel-updated', handler);
    return () => ipcRenderer.removeListener('desktop:status-panel-updated', handler);
  }
});
