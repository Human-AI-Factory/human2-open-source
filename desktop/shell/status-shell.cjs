const createDesktopStatusShell = ({
  BrowserWindow,
  Menu,
  Tray,
  nativeImage,
  globalShortcut,
  dialog,
  path,
  toStatusPanelFileUrl,
  nowIso,
  queueSummary,
  averagePumpDelayMs,
  buildDelayTrendSparkline,
  getQueuePaused,
  setQueuePaused,
  processQueueTick,
  showOrCreateMainWindow,
  openWorkspaceFile,
  quitApp,
  broadcast,
}) => {
  /** @type {import('electron').Tray | null} */
  let tray = null;
  /** @type {import('electron').BrowserWindow | null} */
  let statusPanelWindow = null;

  const resolveQueueCongestionLevel = () => {
    const summary = queueSummary();
    const avgDelay = averagePumpDelayMs();
    if (summary.queued >= 25 || avgDelay >= 2500) {
      return 'red';
    }
    if (summary.queued >= 8 || avgDelay >= 900 || getQueuePaused()) {
      return 'yellow';
    }
    return 'green';
  };

  const buildStatusDotIcon = (level) => {
    const color = level === 'red' ? '#ef4444' : level === 'yellow' ? '#f59e0b' : '#22c55e';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="6" fill="${color}" /></svg>`;
    const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
    return nativeImage.createFromDataURL(dataUrl);
  };

  const buildStatusPanelPayload = () => {
    const summary = queueSummary();
    const level = resolveQueueCongestionLevel();
    return {
      level,
      summary,
      avgPumpDelayMs: averagePumpDelayMs(),
      trend: buildDelayTrendSparkline(),
      recentPumpDelayMs: summary.recentPumpDelayMs || [],
      queuePaused: getQueuePaused(),
      updatedAt: nowIso()
    };
  };

  const pushStatusPanelUpdate = () => {
    if (!statusPanelWindow || statusPanelWindow.isDestroyed()) {
      return;
    }
    statusPanelWindow.webContents.send('desktop:status-panel-updated', buildStatusPanelPayload());
  };

  const createStatusPanelWindow = async () => {
    if (statusPanelWindow && !statusPanelWindow.isDestroyed()) {
      statusPanelWindow.show();
      statusPanelWindow.focus();
      pushStatusPanelUpdate();
      return statusPanelWindow;
    }
    statusPanelWindow = new BrowserWindow({
      width: 360,
      height: 280,
      resizable: false,
      minimizable: false,
      maximizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      title: 'Toonflow Queue Status',
      autoHideMenuBar: true,
      backgroundColor: '#0b1220',
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload', 'status-preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });
    await statusPanelWindow.loadURL(toStatusPanelFileUrl());
    statusPanelWindow.on('blur', () => {
      if (!statusPanelWindow || statusPanelWindow.isDestroyed()) {
        return;
      }
      statusPanelWindow.hide();
    });
    statusPanelWindow.on('closed', () => {
      statusPanelWindow = null;
    });
    pushStatusPanelUpdate();
    return statusPanelWindow;
  };

  const toggleStatusPanelWindow = async () => {
    if (statusPanelWindow && !statusPanelWindow.isDestroyed() && statusPanelWindow.isVisible()) {
      statusPanelWindow.hide();
      return;
    }
    await createStatusPanelWindow();
  };

  const toggleQueuePausedFromShell = async (source) => {
    await setQueuePaused(!getQueuePaused(), source);
    refreshDesktopStatusUi();
  };

  const buildAppMenu = () => {
    const congestionLevel = resolveQueueCongestionLevel();
    const congestionText = congestionLevel === 'red' ? 'RED' : congestionLevel === 'yellow' ? 'YELLOW' : 'GREEN';
    return Menu.buildFromTemplate([
      {
        label: 'Toonflow',
        submenu: [
          {
            label: '打开工作区文件…',
            accelerator: 'CmdOrCtrl+O',
            click: async () => {
              const result = await dialog.showOpenDialog({
                title: '打开 Toonflow 工作区文件',
                properties: ['openFile'],
                filters: [
                  { name: 'Toonflow Workspace', extensions: ['toonflow', 'json'] },
                  { name: 'All Files', extensions: ['*'] }
                ]
              });
              if (!result.canceled && result.filePaths[0]) {
                openWorkspaceFile(result.filePaths[0]);
              }
            }
          },
          { type: 'separator' },
          {
            label: '显示主窗口',
            accelerator: 'CmdOrCtrl+Shift+M',
            click: () => {
              showOrCreateMainWindow();
            }
          },
          { type: 'separator' },
          { role: 'quit', label: '退出' }
        ]
      },
      {
        label: '工作台',
        submenu: [
          {
            label: '聚焦命令条',
            accelerator: 'CmdOrCtrl+Shift+K',
            click: () => broadcast('desktop:menu-command', { command: 'focus-command' })
          },
          {
            label: '保存时间线',
            accelerator: 'CmdOrCtrl+S',
            click: () => broadcast('desktop:menu-command', { command: 'save-timeline' })
          },
          {
            label: '发起合成',
            accelerator: 'CmdOrCtrl+Enter',
            click: () => broadcast('desktop:menu-command', { command: 'merge-timeline' })
          },
          {
            label: '播放/暂停',
            accelerator: 'Space',
            click: () => broadcast('desktop:menu-command', { command: 'toggle-playback' })
          }
        ]
      },
      {
        label: '队列',
        submenu: [
          {
            label: `拥塞状态: ${congestionText} · avgDelay=${averagePumpDelayMs()}ms`,
            enabled: false
          },
          {
            label: '打开队列状态看板',
            accelerator: 'CmdOrCtrl+Shift+L',
            click: () => {
              void toggleStatusPanelWindow();
            }
          },
          {
            label: getQueuePaused() ? '恢复队列' : '暂停队列',
            click: async () => {
              await toggleQueuePausedFromShell('menu');
            }
          },
          {
            label: '执行一轮队列',
            accelerator: 'CmdOrCtrl+Shift+P',
            click: () => {
              void processQueueTick();
            }
          }
        ]
      }
    ]);
  };

  const buildTrayMenu = () =>
    Menu.buildFromTemplate([
      {
        label: `拥塞: ${resolveQueueCongestionLevel().toUpperCase()} · avgDelay=${averagePumpDelayMs()}ms`,
        enabled: false
      },
      {
        label: `延迟趋势: ${buildDelayTrendSparkline()}`,
        enabled: false
      },
      { type: 'separator' },
      {
        label: '显示队列状态看板',
        click: () => {
          void toggleStatusPanelWindow();
        }
      },
      {
        label: '显示主窗口',
        click: () => {
          showOrCreateMainWindow();
        }
      },
      {
        label: getQueuePaused() ? '恢复队列' : '暂停队列',
        click: async () => {
          await toggleQueuePausedFromShell('tray');
        }
      },
      {
        label: '执行一轮队列',
        click: () => {
          void processQueueTick();
        }
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          quitApp();
        }
      }
    ]);

  const refreshDesktopStatusUi = () => {
    Menu.setApplicationMenu(buildAppMenu());
    if (!tray) {
      return;
    }
    const level = resolveQueueCongestionLevel();
    const summary = queueSummary();
    tray.setImage(buildStatusDotIcon(level));
    tray.setToolTip(
      `Toonflow Desktop · ${level.toUpperCase()} · q=${summary.queued} r=${summary.running} avgDelay=${summary.avgPumpDelayMs}ms trend=${buildDelayTrendSparkline()}`
    );
    tray.setContextMenu(buildTrayMenu());
    if (typeof tray.setTitle === 'function') {
      tray.setTitle(level === 'red' ? '●' : level === 'yellow' ? '◐' : '◉');
    }
    pushStatusPanelUpdate();
  };

  const setupTray = () => {
    if (tray) {
      return;
    }
    const icon = buildStatusDotIcon(resolveQueueCongestionLevel());
    tray = new Tray(icon);
    tray.setToolTip('Toonflow Next Lite Desktop');
    tray.setContextMenu(buildTrayMenu());
    tray.on('click', () => {
      void toggleStatusPanelWindow();
    });
    tray.on('double-click', () => {
      showOrCreateMainWindow();
    });
    refreshDesktopStatusUi();
  };

  const registerGlobalShortcuts = () => {
    globalShortcut.register('CommandOrControl+Shift+K', () => {
      broadcast('desktop:menu-command', { command: 'focus-command' });
    });
    globalShortcut.register('CommandOrControl+Shift+P', () => {
      void processQueueTick();
    });
    globalShortcut.register('CommandOrControl+Shift+L', () => {
      void toggleStatusPanelWindow();
    });
  };

  const dispose = () => {
    globalShortcut.unregisterAll();
    if (tray) {
      tray.destroy();
      tray = null;
    }
    if (statusPanelWindow && !statusPanelWindow.isDestroyed()) {
      statusPanelWindow.destroy();
      statusPanelWindow = null;
    }
  };

  return {
    refreshDesktopStatusUi,
    setupTray,
    registerGlobalShortcuts,
    toggleStatusPanelWindow,
    dispose
  };
};

module.exports = {
  createDesktopStatusShell
};
