#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const rootDir = path.resolve(__dirname, '..');
const cacheRoot = path.join(rootDir, '.cache');
const electronCache = path.join(cacheRoot, 'electron');
const electronBuilderCache = path.join(cacheRoot, 'electron-builder');

fs.mkdirSync(electronCache, { recursive: true });
fs.mkdirSync(electronBuilderCache, { recursive: true });

const cliPath = require.resolve('electron-builder/cli.js', { paths: [rootDir] });
const result = spawnSync(
  process.execPath,
  [cliPath, '--config', 'desktop/electron-builder.json', ...process.argv.slice(2)],
  {
    cwd: rootDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      ELECTRON_CACHE: electronCache,
      ELECTRON_BUILDER_CACHE: electronBuilderCache,
    },
  },
);

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
