const { app, BrowserWindow, ipcMain, dialog, shell, Menu, Tray, nativeImage, globalShortcut } = require('electron');
const { spawn } = require('node:child_process');
const http = require('node:http');
const net = require('node:net');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { registerLocalMediaBridge } = require('../local-media/bridge.cjs');
const fs = require('node:fs');
const { MEDIA_EXTENSIONS, collectMediaFiles } = require('../local-media/service.cjs');
const { createWorkspaceFileBridge } = require('./workspace-file-bridge.cjs');
const { createDesktopStatusShell } = require('./status-shell.cjs');
const { createLocalRuntimeController } = require('./local-runtime-controller.cjs');
const { createMainWindowShell } = require('./window-shell.cjs');
const { registerDesktopIpcRoutes } = require('./ipc-routes.cjs');
const { registerDesktopAppLifecycle } = require('./app-lifecycle.cjs');
const { createDesktopBackendRuntimeController } = require('./backend-runtime-controller.cjs');
const QUEUE_TICK_MS = 1200;

const desktopStatePath = () => path.join(app.getPath('userData'), 'desktop-workstation.json');
const localQueuePath = () => path.join(app.getPath('userData'), 'desktop-local-queue.json');
const localJobsDir = () => path.join(app.getPath('userData'), 'local-jobs');

let isQuitting = false;
/** @type {string[]} */
let pendingWorkspaceFiles = [];
let desktopStatusShell = null;

const nowIso = () => new Date().toISOString();

const toRendererFileUrl = () => {
  const indexPath = path.join(__dirname, '..', '..', 'frontend', 'dist', 'index.html');
  return `file://${indexPath}`;
};

const toStatusPanelFileUrl = () => `file://${path.join(__dirname, '..', 'status-panel.html')}`;
const localRuntimeController = createLocalRuntimeController({
  fs,
  fsp,
  collectMediaFiles,
  desktopStatePath: desktopStatePath(),
  localQueuePath: localQueuePath(),
  localJobsDir: localJobsDir(),
  nowIso,
  queueTickMs: QUEUE_TICK_MS,
  onQueueUpdated: (payload) => {
    broadcast('desktop:local-queue-updated', payload);
    desktopStatusShell?.refreshDesktopStatusUi();
  },
  onResourceUpdated: (payload) => {
    broadcast('desktop:resource-index-updated', payload);
  }
});
const backendRuntimeController = createDesktopBackendRuntimeController({
  app,
  fs,
  path,
  net,
  http,
  spawn,
  nowIso
});

let mainWindowShell = null;

const broadcast = (channel, payload) => {
  const mainWindow = mainWindowShell?.getMainWindow();
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send(channel, payload);
};

const workspaceFileBridge = createWorkspaceFileBridge({
  path,
  nowIso,
  broadcast,
  getMainWindow: () => mainWindowShell?.getMainWindow() ?? null,
  getPendingWorkspaceFiles: () => pendingWorkspaceFiles,
  setPendingWorkspaceFiles: (nextPendingWorkspaceFiles) => {
    pendingWorkspaceFiles = nextPendingWorkspaceFiles;
  }
});

const {
  resolveWorkspaceFilePathFromArg,
  openWorkspaceFile,
  flushPendingWorkspaceFiles
} = workspaceFileBridge;

mainWindowShell = createMainWindowShell({
  BrowserWindow,
  path,
  toRendererFileUrl,
  flushPendingWorkspaceFiles,
  getIsQuitting: () => isQuitting,
  getRendererUrl: () => process.env.TF_RENDERER_URL || backendRuntimeController.getRendererUrl()
});

registerDesktopIpcRoutes({
  ipcMain,
  dialog,
  shell,
  app,
  path,
  fsp,
  registerLocalMediaBridge,
  mediaExtensions: MEDIA_EXTENSIONS,
  localRuntimeController,
  backendRuntimeController
});

registerDesktopAppLifecycle({
  app,
  BrowserWindow,
  resolveWorkspaceFilePathFromArg,
  appendPendingWorkspaceFile: (filePath) => {
    pendingWorkspaceFiles.push(filePath);
  },
  openWorkspaceFile,
  showOrCreateMainWindow: mainWindowShell.showOrCreateMainWindow,
  createMainWindow: mainWindowShell.createWindow,
  startDesktopRuntime: async () => {
    await localRuntimeController.bootstrap();
    if (!process.env.TF_RENDERER_URL) {
      await backendRuntimeController.start();
    }
    desktopStatusShell = createDesktopStatusShell({
      BrowserWindow,
      Menu,
      Tray,
      nativeImage,
      globalShortcut,
      dialog,
      path,
      toStatusPanelFileUrl,
      nowIso,
      queueSummary: localRuntimeController.queueSummary,
      averagePumpDelayMs: localRuntimeController.averagePumpDelayMs,
      buildDelayTrendSparkline: localRuntimeController.buildDelayTrendSparkline,
      getQueuePaused: localRuntimeController.getQueuePaused,
      setQueuePaused: localRuntimeController.setQueuePaused,
      processQueueTick: localRuntimeController.processQueueTick,
      showOrCreateMainWindow: mainWindowShell.showOrCreateMainWindow,
      openWorkspaceFile,
      quitApp: () => {
        isQuitting = true;
        app.quit();
      },
      broadcast
    });
    localRuntimeController.startQueueWorker();
    desktopStatusShell.refreshDesktopStatusUi();
    desktopStatusShell.registerGlobalShortcuts();
    desktopStatusShell.setupTray();
    await mainWindowShell.createWindow();
    localRuntimeController.emitResourceUpdated();
    localRuntimeController.emitQueueUpdated();
  },
  beforeQuit: () => {
    isQuitting = true;
    localRuntimeController.dispose();
    desktopStatusShell?.dispose();
    void backendRuntimeController.stop();
  }
});
