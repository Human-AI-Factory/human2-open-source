import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createDesktopBackendRuntimeController } = require('../../desktop/shell/backend-runtime-controller.cjs') as {
  createDesktopBackendRuntimeController: (input: Record<string, unknown>) => {
    start: () => Promise<Record<string, any>>;
    stop: () => Promise<Record<string, any>>;
    getSnapshot: () => Record<string, any>;
    getRendererUrl: () => string;
    getApiBaseUrl: () => string;
  };
};

test('desktop backend runtime controller should start local backend and expose renderer/api urls', async () => {
  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'human2-desktop-backend-runtime-test-'));
  const backendDistDir = path.join(tempRoot, 'backend', 'dist');
  const frontendDistDir = path.join(tempRoot, 'frontend', 'dist');
  const userDataDir = path.join(tempRoot, 'user-data');
  await fsp.mkdir(backendDistDir, { recursive: true });
  await fsp.mkdir(frontendDistDir, { recursive: true });
  await fsp.mkdir(userDataDir, { recursive: true });
  await fsp.writeFile(path.join(frontendDistDir, 'index.html'), '<!doctype html><title>desktop test</title>', 'utf8');
  await fsp.writeFile(path.join(backendDistDir, 'app.js'), 'export {};', 'utf8');

  const netCalls: Array<{ port: number; host: string }> = [];
  const spawnCalls: Array<{ command: string; args: string[]; envPort: string; envDataFile: string; envStaticDir: string }> = [];
  const requestUrls: string[] = [];
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    pid: number;
    kill: (signal: string) => boolean;
    once: (event: string, listener: (...args: any[]) => void) => any;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.pid = 43210;
  child.kill = (_signal: string) => {
    queueMicrotask(() => {
      child.emit('exit', 0, 'SIGTERM');
    });
    return true;
  };

  const controller = createDesktopBackendRuntimeController({
    app: {
      getAppPath: () => tempRoot,
      getPath: (name: string) => (name === 'userData' ? userDataDir : tempRoot)
    },
    fs,
    path,
    net: {
      createServer() {
        return {
          unref() {},
          once(_event: string, _listener: (...args: any[]) => void) {},
          listen(port: number, host: string, listener: () => void) {
            netCalls.push({ port, host });
            listener();
          },
          address() {
            return { port: 43123 };
          },
          close(listener: (error?: Error | null) => void) {
            listener(null);
          }
        };
      }
    },
    http: {
      get(url: string, listener: (response: EventEmitter & { statusCode?: number; resume: () => void }) => void) {
        requestUrls.push(url);
        const response = new EventEmitter() as EventEmitter & { statusCode?: number; resume: () => void };
        response.statusCode = 200;
        response.resume = () => {};
        queueMicrotask(() => listener(response));
        return {
          setTimeout() {},
          once() {},
          destroy() {}
        };
      }
    },
    spawn(command: string, args: string[], options: { env: Record<string, string> }) {
      spawnCalls.push({
        command,
        args,
        envPort: String(options.env.PORT),
        envDataFile: String(options.env.DATA_FILE),
        envStaticDir: String(options.env.STATIC_DIR)
      });
      return child;
    },
    nowIso: () => '2026-04-08T00:00:00.000Z'
  });

  try {
    const started = await controller.start();
    assert.equal(started.status, 'running');
    assert.equal(netCalls.length, 1);
    assert.deepEqual(netCalls[0], { port: 0, host: '127.0.0.1' });
    assert.equal(spawnCalls.length, 1);
    assert.equal(spawnCalls[0]?.command, process.execPath);
    assert.equal(spawnCalls[0]?.args[0], path.join(tempRoot, 'backend', 'dist', 'app.js'));
    assert.equal(spawnCalls[0]?.envPort, '43123');
    assert.equal(spawnCalls[0]?.envDataFile, path.join(userDataDir, 'backend', 'app.db'));
    assert.equal(spawnCalls[0]?.envStaticDir, path.join(tempRoot, 'frontend', 'dist'));
    assert.equal(requestUrls[0], 'http://127.0.0.1:43123/api/health');
    assert.equal(controller.getRendererUrl(), 'http://127.0.0.1:43123');
    assert.equal(controller.getApiBaseUrl(), 'http://127.0.0.1:43123/api');

    const stopped = await controller.stop();
    assert.equal(stopped.status, 'stopped');
    assert.equal(controller.getSnapshot().status, 'stopped');
  } finally {
    await controller.stop();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
