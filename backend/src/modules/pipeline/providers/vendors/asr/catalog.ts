import type { VendorRegistryEntry } from '../registry.js';
import type { VendorAsrAdapter } from './types.js';
import { wanAsrAdapter } from './wan.adapter.js';

export const asrVendorCatalog = [
  { adapter: wanAsrAdapter, aliases: ['wan', 'dashscope', 'paraformer'] }
] satisfies VendorRegistryEntry<VendorAsrAdapter>[];
