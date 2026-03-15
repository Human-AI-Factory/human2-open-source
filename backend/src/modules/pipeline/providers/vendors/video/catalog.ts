import type { VendorRegistryEntry } from '../registry.js';
import type { VendorVideoAdapter } from './types.js';
import { apimartVideoAdapter } from './apimart.adapter.js';
import { geminiVideoAdapter } from './gemini.adapter.js';
import { haiperVideoAdapter } from './haiper.adapter.js';
import { klingVideoAdapter } from './kling.adapter.js';
import { lumaVideoAdapter } from './luma.adapter.js';
import { minimaxVideoAdapter } from './minimax.adapter.js';
import { modelscopeVideoAdapter } from './modelscope.adapter.js';
import { otherVideoAdapter } from './other.adapter.js';
import { runninghubVideoAdapter } from './runninghub.adapter.js';
import { runwayVideoAdapter } from './runway.adapter.js';
import { veoVideoAdapter } from './veo.adapter.js';
import { viduVideoAdapter } from './vidu.adapter.js';
import { volcengineVideoAdapter } from './volcengine.adapter.js';
import { wanVideoAdapter } from './wan.adapter.js';

export const videoVendorCatalog = [
  { adapter: modelscopeVideoAdapter },
  { adapter: volcengineVideoAdapter },
  { adapter: klingVideoAdapter },
  { adapter: minimaxVideoAdapter, aliases: ['minimax', 'hailuo'] },
  { adapter: viduVideoAdapter },
  { adapter: wanVideoAdapter, aliases: ['dashscope', 'wanx'] },
  { adapter: runwayVideoAdapter, aliases: ['runway'] },
  { adapter: lumaVideoAdapter, aliases: ['luma'] },
  { adapter: haiperVideoAdapter, aliases: ['haiper'] },
  { adapter: veoVideoAdapter, aliases: ['veo', 'google-veo'] },
  { adapter: runninghubVideoAdapter },
  { adapter: apimartVideoAdapter },
  { adapter: geminiVideoAdapter },
  { adapter: otherVideoAdapter }
] satisfies VendorRegistryEntry<VendorVideoAdapter>[];
