const createMainWindowShell = ({
  BrowserWindow,
  path,
  toRendererFileUrl,
  flushPendingWorkspaceFiles,
  getIsQuitting,
  getRendererUrl
}) => {
  /** @type {import('electron').BrowserWindow | null} */
  let mainWindow = null;

  const createWindow = async () => {
    mainWindow = new BrowserWindow({
      width: 1560,
      height: 960,
      minWidth: 1180,
      minHeight: 760,
      title: 'Toonflow Next Lite Desktop',
      autoHideMenuBar: true,
      backgroundColor: '#0f1728',
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload', 'main-preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });

    const rendererUrl = getRendererUrl ? getRendererUrl() : process.env.TF_RENDERER_URL || '';
    if (rendererUrl) {
      await mainWindow.loadURL(rendererUrl);
    } else {
      await mainWindow.loadURL(toRendererFileUrl());
    }

    flushPendingWorkspaceFiles();

    mainWindow.on('close', (event) => {
      if (getIsQuitting() || process.platform === 'darwin') {
        return;
      }
      event.preventDefault();
      mainWindow?.hide();
    });

    mainWindow.on('closed', () => {
      mainWindow = null;
    });

    return mainWindow;
  };

  const showOrCreateMainWindow = () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      void createWindow();
      return;
    }
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.show();
    mainWindow.focus();
  };

  return {
    getMainWindow: () => mainWindow,
    createWindow,
    showOrCreateMainWindow
  };
};

module.exports = {
  createMainWindowShell
};
