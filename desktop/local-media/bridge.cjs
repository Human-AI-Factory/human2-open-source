const registerLocalMediaBridge = ({
  ipcMain,
  dialog,
  shell,
  mediaExtensions,
  getResourceDir,
  updateResourceIndex,
  ensureResourceWatcher,
  enqueueLocalTask
}) => {
  ipcMain.handle('desktop:pick-resource-directory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: '选择本地素材目录'
    });
    if (result.canceled || !result.filePaths[0]) {
      return null;
    }
    const selected = result.filePaths[0];
    await updateResourceIndex(selected, 1600);
    ensureResourceWatcher(selected);
    await enqueueLocalTask('index-resource-dir', { dir: selected, maxItems: 1600 }, 'manual-pick');
    return selected;
  });

  ipcMain.handle('desktop:index-resource-directory', async (_event, input) => {
    const dir = input && typeof input.dir === 'string' ? input.dir : getResourceDir();
    const maxItems = input && typeof input.maxItems === 'number' ? Math.max(1, Math.min(input.maxItems, 5000)) : 800;
    if (!dir) {
      return { dir: '', files: [] };
    }
    const files = await updateResourceIndex(dir, maxItems);
    ensureResourceWatcher(dir);
    return {
      dir,
      files
    };
  });

  ipcMain.handle('desktop:pick-local-media-files', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      title: '选择本地素材文件',
      filters: [
        { name: 'Media', extensions: Array.from(mediaExtensions).map((ext) => ext.replace('.', '')) },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    if (result.canceled || result.filePaths.length === 0) {
      return [];
    }
    await enqueueLocalTask('ingest-local-files', { paths: result.filePaths }, 'manual-pick');
    return result.filePaths;
  });

  ipcMain.handle('desktop:reveal-path', async (_event, targetPath) => {
    if (typeof targetPath !== 'string' || !targetPath.trim()) {
      return false;
    }
    try {
      shell.showItemInFolder(targetPath);
      return true;
    } catch {
      return false;
    }
  });
};

module.exports = {
  registerLocalMediaBridge
};
