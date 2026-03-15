import type { VendorRegistryEntry } from '../registry.js';
import type { VendorImageAdapter } from './types.js';
import { apimartImageAdapter } from './apimart.adapter.js';
import { deepaiImageAdapter } from './deepai.adapter.js';
import { geminiImageAdapter } from './gemini.adapter.js';
import { haiperImageAdapter } from './haiper.adapter.js';
import { klingImageAdapter } from './kling.adapter.js';
import { leonardoImageAdapter } from './leonardo.adapter.js';
import { lumaImageAdapter } from './luma.adapter.js';
import { midjourneyImageAdapter } from './midjourney.adapter.js';
import { modelscopeImageAdapter } from './modelscope.adapter.js';
import { otherImageAdapter } from './other.adapter.js';
import { runninghubImageAdapter } from './runninghub.adapter.js';
import { viduImageAdapter } from './vidu.adapter.js';
import { volcengineImageAdapter } from './volcengine.adapter.js';
import { wanImageAdapter } from './wan.adapter.js';

export const imageVendorCatalog = [
  { adapter: modelscopeImageAdapter },
  { adapter: volcengineImageAdapter },
  { adapter: klingImageAdapter },
  { adapter: viduImageAdapter },
  { adapter: wanImageAdapter, aliases: ['dashscope', 'wanx'] },
  { adapter: leonardoImageAdapter, aliases: ['leonardo'] },
  { adapter: lumaImageAdapter, aliases: ['luma'] },
  { adapter: midjourneyImageAdapter, aliases: ['midjourney', 'mj'] },
  { adapter: haiperImageAdapter, aliases: ['haiper'] },
  { adapter: deepaiImageAdapter, aliases: ['deepai'] },
  { adapter: runninghubImageAdapter },
  { adapter: apimartImageAdapter },
  { adapter: geminiImageAdapter },
  { adapter: otherImageAdapter }
] satisfies VendorRegistryEntry<VendorImageAdapter>[];
