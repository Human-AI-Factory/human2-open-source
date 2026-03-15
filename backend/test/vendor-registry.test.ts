import test from 'node:test';
import assert from 'node:assert/strict';
import { getAudioAdapter } from '../src/modules/pipeline/providers/vendors/audio/index.js';
import { getImageAdapter } from '../src/modules/pipeline/providers/vendors/image/index.js';
import { getTextAdapter } from '../src/modules/pipeline/providers/vendors/text/index.js';
import { getVideoAdapter } from '../src/modules/pipeline/providers/vendors/video/index.js';

test('vendor registry should resolve DashScope aliases to wan/cosyvoice adapters by modality', () => {
  assert.equal(getImageAdapter('dashscope')?.manufacturer, 'wan');
  assert.equal(getVideoAdapter('wanx')?.manufacturer, 'wan');
  assert.equal(getAudioAdapter('dashscope')?.manufacturer, 'dashscope-cosyvoice');
  assert.equal(
    getAudioAdapter('wan', 'https://dashscope.aliyuncs.com/api/v1/services/audio/tts/realtimesynthesizer')?.manufacturer,
    'dashscope-cosyvoice'
  );
});

test('vendor registry should resolve text adapters by endpoint heuristics', () => {
  assert.equal(
    getTextAdapter(undefined, 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions')?.manufacturer,
    'openai-compatible'
  );
  assert.equal(
    getTextAdapter(undefined, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent')
      ?.manufacturer,
    'gemini'
  );
});

test('vendor registry should preserve direct manufacturer resolution when no heuristic applies', () => {
  assert.equal(getTextAdapter('openai-compatible')?.manufacturer, 'openai-compatible');
  assert.equal(getImageAdapter('modelscope')?.manufacturer, 'modelscope');
  assert.equal(getVideoAdapter('apimart')?.manufacturer, 'apimart');
});
