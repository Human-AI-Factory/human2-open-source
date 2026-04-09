const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_HEALTH_TIMEOUT_MS = 15000;
const DEFAULT_HEALTH_INTERVAL_MS = 200;

const createDesktopBackendRuntimeController = ({
  app,
  fs,
  path,
  net,
  http,
  spawn,
  nowIso = () => new Date().toISOString()
}) => {
  /** @type {import('node:child_process').ChildProcess | null} */
  let child = null;
  /** @type {Promise<Record<string, unknown>> | null} */
  let startPromise = null;
  /** @type {{status:'idle'|'starting'|'running'|'stopped'|'failed',host:string,port:number|null,rendererUrl:string,apiBaseUrl:string,pid:number|null,startedAt:string|null,stoppedAt:string|null,dataFile:string,lastError:string,logs:string[]}} */
  let runtimeState = {
    status: 'idle',
    host: DEFAULT_HOST,
    port: null,
    rendererUrl: '',
    apiBaseUrl: '',
    pid: null,
    startedAt: null,
    stoppedAt: null,
    dataFile: '',
    lastError: '',
    logs: []
  };

  const pushLog = (line) => {
    const nextLine = `${nowIso()} ${line}`.trim();
    runtimeState.logs = [nextLine, ...runtimeState.logs].slice(0, 120);
  };

  const getAppRoot = () => app.getAppPath();
  const getBackendEntry = () => path.join(getAppRoot(), 'backend', 'dist', 'app.js');
  const getStaticDir = () => path.join(getAppRoot(), 'frontend', 'dist');
  const getDataFile = () => path.join(app.getPath('userData'), 'backend', 'app.db');

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const resolveFreePort = async (host) =>
    new Promise((resolve, reject) => {
      const server = net.createServer();
      server.unref();
      server.once('error', reject);
      server.listen(0, host, () => {
        const address = server.address();
        const port = address && typeof address === 'object' ? address.port : null;
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          if (!port) {
            reject(new Error('Failed to resolve desktop backend port'));
            return;
          }
          resolve(port);
        });
      });
    });

  const probeHealth = (url) =>
    new Promise((resolve, reject) => {
      const request = http.get(url, (response) => {
        response.resume();
        if ((response.statusCode ?? 500) >= 200 && (response.statusCode ?? 500) < 300) {
          resolve(true);
          return;
        }
        reject(new Error(`desktop backend health probe returned ${response.statusCode ?? 500}`));
      });
      request.setTimeout(2000, () => {
        request.destroy(new Error('desktop backend health probe timed out'));
      });
      request.once('error', reject);
    });

  const waitForHealth = async (url, timeoutMs = DEFAULT_HEALTH_TIMEOUT_MS) => {
    const startedAt = Date.now();
    let lastError = null;
    while (Date.now() - startedAt < timeoutMs) {
      try {
        await probeHealth(url);
        return;
      } catch (error) {
        lastError = error;
        await wait(DEFAULT_HEALTH_INTERVAL_MS);
      }
    }
    throw lastError instanceof Error ? lastError : new Error('desktop backend did not become healthy in time');
  };

  const attachChildLogs = (stream, prefix) => {
    if (!stream) {
      return;
    }
    stream.on('data', (chunk) => {
      const text = String(chunk ?? '')
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter(Boolean);
      for (const line of text) {
        pushLog(`[${prefix}] ${line}`);
      }
    });
  };

  const applyStoppedState = (status, errorMessage = '') => {
    runtimeState = {
      ...runtimeState,
      status,
      rendererUrl: '',
      apiBaseUrl: '',
      pid: null,
      port: null,
      stoppedAt: nowIso(),
      lastError: errorMessage
    };
  };

  const start = async () => {
    if (runtimeState.status === 'running') {
      return runtimeState;
    }
    if (startPromise) {
      return startPromise;
    }
    startPromise = (async () => {
      const backendEntry = getBackendEntry();
      const staticDir = getStaticDir();
      const dataFile = getDataFile();
      if (!fs.existsSync(backendEntry)) {
        throw new Error(`Desktop backend entry not found: ${backendEntry}`);
      }
      if (!fs.existsSync(staticDir)) {
        throw new Error(`Desktop frontend dist not found: ${staticDir}`);
      }
      fs.mkdirSync(path.dirname(dataFile), { recursive: true });

      const host = DEFAULT_HOST;
      const port = await resolveFreePort(host);
      const rendererUrl = `http://${host}:${port}`;
      const apiBaseUrl = `${rendererUrl}/api`;
      const childEnv = {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        HOST: host,
        PORT: String(port),
        DATA_FILE: dataFile,
        STATIC_DIR: staticDir
      };

      runtimeState = {
        ...runtimeState,
        status: 'starting',
        host,
        port,
        rendererUrl,
        apiBaseUrl,
        pid: null,
        startedAt: nowIso(),
        stoppedAt: null,
        dataFile,
        lastError: ''
      };
      pushLog(`[desktop-backend] starting ${backendEntry} on ${rendererUrl}`);

      child = spawn(process.execPath, [backendEntry], {
        env: childEnv,
        stdio: ['ignore', 'pipe', 'pipe']
      });
      runtimeState.pid = child.pid ?? null;
      attachChildLogs(child.stdout, 'stdout');
      attachChildLogs(child.stderr, 'stderr');
      child.once('exit', (code, signal) => {
        const stoppedByController = runtimeState.status === 'stopped';
        child = null;
        if (stoppedByController) {
          applyStoppedState('stopped');
          return;
        }
        const reason = `desktop backend exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`;
        pushLog(`[desktop-backend] ${reason}`);
        applyStoppedState(code === 0 ? 'stopped' : 'failed', reason);
      });

      try {
        await waitForHealth(`${apiBaseUrl}/health`);
        runtimeState = {
          ...runtimeState,
          status: 'running',
          lastError: ''
        };
        pushLog(`[desktop-backend] healthy ${apiBaseUrl}`);
        return runtimeState;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'desktop backend failed to start';
        pushLog(`[desktop-backend] failed ${message}`);
        await stop();
        runtimeState = {
          ...runtimeState,
          status: 'failed',
          lastError: message
        };
        throw new Error(message);
      }
    })();

    try {
      return await startPromise;
    } finally {
      startPromise = null;
    }
  };

  const stop = async () => {
    if (!child) {
      applyStoppedState('stopped', runtimeState.lastError);
      return runtimeState;
    }
    const target = child;
    child = null;
    await new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) {
          return;
        }
        settled = true;
        resolve(undefined);
      };
      target.once('exit', finish);
      try {
        target.kill('SIGTERM');
      } catch {
        finish();
      }
      setTimeout(() => {
        try {
          target.kill('SIGKILL');
        } catch {
          // ignore
        }
        finish();
      }, 4000).unref();
    });
    applyStoppedState('stopped', runtimeState.lastError);
    return runtimeState;
  };

  return {
    start,
    stop,
    getSnapshot: () => ({ ...runtimeState, logs: [...runtimeState.logs] }),
    getRendererUrl: () => runtimeState.rendererUrl,
    getApiBaseUrl: () => runtimeState.apiBaseUrl
  };
};

module.exports = {
  createDesktopBackendRuntimeController
};
