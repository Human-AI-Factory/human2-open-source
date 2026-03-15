import type { VendorRegistryEntry } from '../registry.js';
import type { VendorEmbeddingAdapter } from './types.js';
import { cohereEmbeddingAdapter } from './cohere.adapter.js';
import { wanEmbeddingAdapter } from './wan.adapter.js';

export const embeddingVendorCatalog = [
  { adapter: wanEmbeddingAdapter, aliases: ['wan', 'dashscope', 'qwen'] },
  { adapter: cohereEmbeddingAdapter, aliases: ['cohere'] }
] satisfies VendorRegistryEntry<VendorEmbeddingAdapter>[];
