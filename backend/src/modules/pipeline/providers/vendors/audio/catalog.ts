import type { VendorRegistryEntry } from '../registry.js';
import type { VendorAudioAdapter } from './types.js';
import { apimartAudioAdapter } from './apimart.adapter.js';
import { dashscopeCosyvoiceAudioAdapter } from './dashscope-cosyvoice.adapter.js';
import { elevenlabsAudioAdapter } from './elevenlabs.adapter.js';
import { geminiAudioAdapter } from './gemini.adapter.js';
import { klingAudioAdapter } from './kling.adapter.js';
import { minimaxAudioAdapter } from './minimax.adapter.js';
import { runninghubAudioAdapter } from './runninghub.adapter.js';
import { runwayAudioAdapter } from './runway.adapter.js';
import { viduAudioAdapter } from './vidu.adapter.js';
import { volcengineAudioAdapter } from './volcengine.adapter.js';
import { wanAudioAdapter } from './wan.adapter.js';

export const audioVendorCatalog = [
  {
    adapter: dashscopeCosyvoiceAudioAdapter,
    aliases: ['dashscope', 'cosyvoice', 'dashscope-cosyvoice'],
    match: (context) =>
      context.endpoint.includes('/services/audio/tts/realtimesynthesizer') ||
      (context.manufacturer === 'wan' && context.endpoint.includes('dashscope.aliyuncs.com'))
  },
  {
    adapter: minimaxAudioAdapter,
    aliases: ['minimax', 'hailuo'],
    match: (context) =>
      context.manufacturer === 'minimax' ||
      context.endpoint.includes('api.minimaxi.com')
  },
  {
    adapter: elevenlabsAudioAdapter,
    aliases: ['elevenlabs', 'eleven_labs'],
    match: (context) =>
      context.manufacturer === 'elevenlabs' ||
      context.endpoint.includes('elevenlabs')
  },
  {
    adapter: runwayAudioAdapter,
    aliases: ['runway'],
    match: (context) =>
      context.manufacturer === 'runway' ||
      context.endpoint.includes('runway')
  },
  { adapter: wanAudioAdapter, aliases: ['wanx'] },
  { adapter: volcengineAudioAdapter },
  { adapter: klingAudioAdapter },
  { adapter: viduAudioAdapter },
  { adapter: runninghubAudioAdapter },
  { adapter: apimartAudioAdapter },
  { adapter: geminiAudioAdapter }
] satisfies VendorRegistryEntry<VendorAudioAdapter>[];
