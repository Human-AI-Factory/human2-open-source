import test from 'node:test';
import assert from 'node:assert/strict';
import { getProviderOptions } from '../src/modules/pipeline/providers/vendors/video/common.js';

test('getProviderOptions should prefer global + manufacturer scoped options', () => {
  const input = {
    global: { seed: 1, style: 'base' },
    kling: { style: 'anime', cfgScale: 7.5 }
  };
  const result = getProviderOptions(input, 'kling');
  assert.deepEqual(result, {
    seed: 1,
    style: 'anime',
    cfgScale: 7.5
  });
});

test('getProviderOptions should return flat payload when no scoped keys exist', () => {
  const input = { seed: 9, negativePrompt: 'blur' };
  const result = getProviderOptions(input, 'wan');
  assert.deepEqual(result, input);
});

test('getProviderOptions should ignore non-target vendor blocks', () => {
  const input = {
    volcengine: { seed: 3 },
    vidu: { style: 'film' }
  };
  const result = getProviderOptions(input, 'wan');
  assert.deepEqual(result, {});
});
