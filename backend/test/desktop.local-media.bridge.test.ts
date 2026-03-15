import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { registerLocalMediaBridge } = require('../../desktop/local-media/bridge.cjs') as {
  registerLocalMediaBridge: (input: Record<string, unknown>) => void;
};

test('desktop local media bridge should register stable ipc channels and route through injected services', async () => {
  const handlers = new Map<string, Function>();
  const updateCalls: Array<{ dir: string; maxItems: number }> = [];
  const watchCalls: string[] = [];
  const enqueueCalls: Array<{ type: string; payload: Record<string, unknown>; source?: string }> = [];
  const revealCalls: string[] = [];

  registerLocalMediaBridge({
    ipcMain: {
      handle(channel: string, handler: Function) {
        handlers.set(channel, handler);
      }
    },
    dialog: {
      async showOpenDialog(input: { properties: string[] }) {
        if (input.properties.includes('openDirectory')) {
          return { canceled: false, filePaths: ['/tmp/resource-dir'] };
        }
        return { canceled: false, filePaths: ['/tmp/resource-dir/a.png', '/tmp/resource-dir/b.mp4'] };
      }
    },
    shell: {
      showItemInFolder(targetPath: string) {
        revealCalls.push(targetPath);
      }
    },
    mediaExtensions: new Set(['.png', '.mp4']),
    getResourceDir: () => '/tmp/resource-dir',
    updateResourceIndex: async (dir: string, maxItems: number) => {
      updateCalls.push({ dir, maxItems });
      return [{ path: `${dir}/a.png` }];
    },
    ensureResourceWatcher: (dir: string) => {
      watchCalls.push(dir);
    },
    enqueueLocalTask: async (type: string, payload: Record<string, unknown>, source?: string) => {
      enqueueCalls.push({ type, payload, source });
      return { ok: true };
    }
  });

  assert.deepEqual([...handlers.keys()].sort(), [
    'desktop:index-resource-directory',
    'desktop:pick-local-media-files',
    'desktop:pick-resource-directory',
    'desktop:reveal-path'
  ]);

  const pickedDir = await handlers.get('desktop:pick-resource-directory')?.();
  assert.equal(pickedDir, '/tmp/resource-dir');
  assert.deepEqual(updateCalls[0], { dir: '/tmp/resource-dir', maxItems: 1600 });
  assert.equal(watchCalls[0], '/tmp/resource-dir');
  assert.deepEqual(enqueueCalls[0], {
    type: 'index-resource-dir',
    payload: { dir: '/tmp/resource-dir', maxItems: 1600 },
    source: 'manual-pick'
  });

  const indexed = await handlers.get('desktop:index-resource-directory')?.(null, {
    dir: '/tmp/resource-dir',
    maxItems: 9000
  });
  assert.equal(indexed?.dir, '/tmp/resource-dir');
  assert.deepEqual(updateCalls[1], { dir: '/tmp/resource-dir', maxItems: 5000 });

  const files = await handlers.get('desktop:pick-local-media-files')?.();
  assert.deepEqual(files, ['/tmp/resource-dir/a.png', '/tmp/resource-dir/b.mp4']);
  assert.deepEqual(enqueueCalls[1], {
    type: 'ingest-local-files',
    payload: { paths: ['/tmp/resource-dir/a.png', '/tmp/resource-dir/b.mp4'] },
    source: 'manual-pick'
  });

  assert.equal(await handlers.get('desktop:reveal-path')?.(null, ''), false);
  assert.equal(await handlers.get('desktop:reveal-path')?.(null, '/tmp/resource-dir/a.png'), true);
  assert.deepEqual(revealCalls, ['/tmp/resource-dir/a.png']);
});
